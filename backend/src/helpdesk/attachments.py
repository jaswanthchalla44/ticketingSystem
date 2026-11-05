"""Ticket screenshots and documents. Browsers upload straight to S3 with a presigned PUT.

Key scheme: attachments/<ticket_id>/<attachment_uuid>-<safe filename>. The API role may touch only this prefix.
The presigned PUT signs the declared Content-Length, so S3 rejects any other size at upload time. Each presign is
recorded on the ticket as a pending upload (at most MAX_PENDING_UPLOADS_PER_TICKET, expiring after an hour), and every
presign counts toward MAX_PRESIGNS_PER_TICKET for the life of the ticket. Storage keys are not returned to any role. Confirm
needs a live pending record, checks the object (HEAD) for type and for the declared size, and then clears the record.
An rejected or unconfirmed object stays in the bucket if it was stored; the API role has no delete permission,
so cleanup is a manual task.
"""
import logging
from datetime import datetime, timedelta, timezone

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

from helpdesk import events, model
from helpdesk.access import load_visible
from helpdesk.errors import Conflict, NotFound, TooManyRequests, ValidationFailed
from helpdesk.store import ConditionFailed
from helpdesk.timeutil import format_iso, new_id, now_iso, parse_iso
from helpdesk.validation import Validator, invalid, is_uuid, upload_filename

log = logging.getLogger(__name__)
PREFIX = "attachments/"
PENDING_LIMIT_MESSAGE = "too many uploads are waiting to be confirmed; confirm them, or try again within an hour"
TOTAL_LIMIT_MESSAGE = "this ticket has reached its upload limit; no more files can be uploaded to it"
PENDING_WRITE_ATTEMPTS = 3
_s3_client = None


class Raw:
    """A binary response (local preview only)."""

    def __init__(self, body, content_type):
        self.body = body
        self.content_type = content_type


def presign(store, cfg, principal, ticket_id, data):
    bucket = cfg.require_attachments_bucket()
    item = load_visible(store, principal, ticket_id)
    v = Validator(data)
    content_type = v.choice("content_type", tuple(model.ATTACHMENT_TYPES))
    size = v.integer("size", minimum=1, maximum=cfg.max_upload_bytes)
    raw_name = v.text("filename", min_len=1, max_len=255)
    v.check()
    name = upload_filename(raw_name, content_type)
    if len(item.get("attachments", [])) >= model.MAX_ATTACHMENTS_PER_TICKET:
        raise Conflict(f"a ticket can have at most {model.MAX_ATTACHMENTS_PER_TICKET} attachments")

    key = f"{PREFIX}{ticket_id}/{new_id()}-{name}"
    _reserve_pending(store, ticket_id, {"key": key, "size": size, "requested_at": format_iso(_now())})
    if cfg.local:
        upload_url = f"/api/_local/s3/{key}"
    else:
        upload_url = _s3().generate_presigned_url(
            "put_object",
            # ContentLength is signed (X-Amz-SignedHeaders), so S3 rejects a PUT of any other size.
            Params={"Bucket": bucket, "Key": key, "ContentType": content_type, "ContentLength": size},
            ExpiresIn=cfg.signed_url_ttl_seconds,
            HttpMethod="PUT",
        )
    return {
        "upload_url": upload_url,
        "method": "PUT",
        "headers": {"Content-Type": content_type},
        "key": key,
        "expires_in": cfg.signed_url_ttl_seconds,
        "size": size,
    }


def confirm(store, cfg, principal, ticket_id, data):
    cfg.require_attachments_bucket()
    item = load_visible(store, principal, ticket_id)
    key = Validator(data).text("key", max_len=600)
    attachment_id, name = _parse_key(key, ticket_id)
    existing = item.get("attachments", [])
    if any(entry["id"] == attachment_id for entry in existing):
        raise Conflict("this upload is already attached")
    if len(existing) >= model.MAX_ATTACHMENTS_PER_TICKET:
        raise Conflict(f"a ticket can have at most {model.MAX_ATTACHMENTS_PER_TICKET} attachments")
    pending = next((p for p in _live(item.get("pending_uploads", []), _now()) if p["key"] == key), None)
    if pending is None:
        raise invalid("key", "this upload was not requested, or the request expired; request a new upload")

    head = _head(cfg, key)
    if head is None:
        raise invalid("key", "the upload was not found; upload the file first")
    size = int(head["ContentLength"])
    content_type = head.get("ContentType", "")
    if content_type not in model.ATTACHMENT_TYPES:
        raise invalid("key", "this file type is not allowed")
    if size != pending["size"]:
        raise invalid("key", f"the file is {size} bytes, but {pending['size']} bytes were declared")
    if size < 1 or size > cfg.max_upload_bytes:
        raise invalid("key", f"the file must be between 1 and {cfg.max_upload_bytes} bytes")

    stamp = now_iso()
    entry = {
        "id": attachment_id,
        "key": key,
        "filename": name,
        "content_type": content_type,
        "size": size,
        "uploaded_by": principal.name,
        "created_at": stamp,
    }
    try:
        store.update_ticket(ticket_id, {"attachments": existing + [entry], "updated_at": stamp})
    except ConditionFailed:
        raise NotFound("ticket not found") from None
    if not _change_pending(store, ticket_id, lambda live: [p for p in live if p["key"] != key]):
        log.warning("could not clear the pending upload for a confirmed key; it expires within the hour")
    events.record(store, ticket_id, "attachment_added", f"Attachment added: {name}", actor=principal)
    return public_entry(entry)


def public_entry(entry):
    """An attachment as the API returns it to any role. The storage key stays internal; downloads use the id."""
    return {field: value for field, value in entry.items() if field != "key"}


def download_url(store, cfg, principal, ticket_id, attachment_id):
    bucket = cfg.require_attachments_bucket()
    item = load_visible(store, principal, ticket_id)
    if not is_uuid(attachment_id):
        raise NotFound("attachment not found")
    entry = next((a for a in item.get("attachments", []) if a["id"] == attachment_id), None)
    if entry is None:
        raise NotFound("attachment not found")
    if cfg.local:
        url = f"/api/_local/s3/{entry['key']}"
    else:
        url = _s3().generate_presigned_url(
            "get_object",
            Params={
                "Bucket": bucket,
                "Key": entry["key"],
                "ResponseContentDisposition": f'attachment; filename="{entry["filename"]}"',
                "ResponseContentType": entry["content_type"],
            },
            ExpiresIn=cfg.signed_url_ttl_seconds,
        )
    return {"url": url, "expires_in": cfg.signed_url_ttl_seconds, "filename": entry["filename"]}


def local_put(cfg, key, body, content_type):
    """Local preview only. Stands in for the browser's presigned PUT so the upload flow runs offline."""
    bucket = cfg.require_attachments_bucket()
    _check_local_key(key)
    if len(body) < 1 or len(body) > cfg.max_upload_bytes:
        raise ValidationFailed([{"field": "body", "message": "file size is out of range"}])
    _s3().put_object(Bucket=bucket, Key=key, Body=body, ContentType=content_type or "application/octet-stream")
    return {"key": key, "size": len(body)}


def local_get(cfg, key):
    bucket = cfg.require_attachments_bucket()
    _check_local_key(key)
    try:
        response = _s3().get_object(Bucket=bucket, Key=key)
    except ClientError:
        raise NotFound("file not found") from None
    return Raw(response["Body"].read(), response["ContentType"])


def _now():
    return datetime.now(timezone.utc)


def _live(pending, now):
    """Pending records younger than the TTL. Expired ones stop counting and are dropped on the next write."""
    cutoff = now - timedelta(seconds=model.PENDING_UPLOAD_TTL_SECONDS)
    return [p for p in pending if parse_iso(p["requested_at"]) > cutoff]


def _reserve_pending(store, ticket_id, entry):
    """Records a presign. Both caps are checked against the ticket as read, and the write applies only if the pending
    list and the lifetime presign count are still what was read, so two presigns at once cannot both pass a cap."""
    for _ in range(PENDING_WRITE_ATTEMPTS):
        item = store.get_ticket(ticket_id)
        if item is None:
            raise NotFound("ticket not found")
        stored = item.get("pending_uploads", [])
        live = _live(stored, _now())
        if len(live) >= model.MAX_PENDING_UPLOADS_PER_TICKET:
            raise TooManyRequests(PENDING_LIMIT_MESSAGE)
        presigns = int(item.get("presign_total", 0))
        if presigns >= model.MAX_PRESIGNS_PER_TICKET:
            raise TooManyRequests(TOTAL_LIMIT_MESSAGE)
        try:
            store.add_pending_upload(ticket_id, live + [entry], len(stored), presigns)
            return
        except ConditionFailed:
            continue
    raise TooManyRequests(PENDING_LIMIT_MESSAGE)


def _change_pending(store, ticket_id, change):
    """Writes the pending list back as change(live) returns it. The write applies only if the stored list is still the
    length that was read, so two presigns at once cannot both pass the cap. Returns False after repeated races."""
    for _ in range(PENDING_WRITE_ATTEMPTS):
        item = store.get_ticket(ticket_id)
        if item is None:
            raise NotFound("ticket not found")
        stored = item.get("pending_uploads", [])
        new = change(_live(stored, _now()))
        try:
            store.replace_pending_uploads(ticket_id, new, len(stored))
            return True
        except ConditionFailed:
            continue
    return False


def _parse_key(key, ticket_id):
    prefix = f"{PREFIX}{ticket_id}/"
    if not key.startswith(prefix):
        raise invalid("key", "this key is not an upload for this ticket")
    rest = key[len(prefix):]
    attachment_id, separator, name = rest[:36], rest[36:37], rest[37:]
    if not is_uuid(attachment_id) or separator != "-" or not name:
        raise invalid("key", "this key is not an upload for this ticket")
    return attachment_id, name


def _check_local_key(key):
    if not key.startswith(PREFIX) or ".." in key or "//" in key:
        raise NotFound("file not found")


def _head(cfg, key):
    try:
        return _s3().head_object(Bucket=cfg.require_attachments_bucket(), Key=key)
    except ClientError as exc:
        if exc.response["Error"]["Code"] in ("404", "NoSuchKey", "NotFound"):
            return None
        raise


def _s3():
    global _s3_client
    if _s3_client is None:
        _s3_client = boto3.client("s3", config=Config(signature_version="s3v4"))
    return _s3_client

