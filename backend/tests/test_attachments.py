"""Attachments: presign, the browser upload (simulated with moto S3), confirm, and download links."""
import json
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qs, urlparse

import boto3
import pytest

from helpdesk import attachments, config, tables
from helpdesk.model import MAX_PENDING_UPLOADS_PER_TICKET, MAX_PRESIGNS_PER_TICKET, PENDING_UPLOAD_TTL_SECONDS
from helpdesk.store import ConditionFailed, Store
from support import ADMIN, CUSTOMER_A, CUSTOMER_B, AGENT, TEST_ATTACHMENTS_BUCKET, api, make_ticket

PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 64


def _ticket_row(ticket_id):
    return boto3.resource("dynamodb", region_name="us-east-1").Table(tables.TICKETS_TABLE).get_item(
        Key={"id": ticket_id})["Item"]


def _confirm(ticket_id, key, user=CUSTOMER_A):
    return api("POST", f"/api/tickets/{ticket_id}/attachments/confirm", user=user, body={"key": key})


def _presign(ticket_id, user, **body):
    payload = {"filename": "screenshot.png", "content_type": "image/png", "size": len(PNG)}
    payload.update(body)
    return api("POST", f"/api/tickets/{ticket_id}/attachments/presign", user=user, body=payload)


def _browser_upload(key, body, content_type):
    boto3.client("s3", region_name="us-east-1").put_object(
        Bucket=TEST_ATTACHMENTS_BUCKET, Key=key, Body=body, ContentType=content_type)


def test_presign_upload_confirm_and_download(aws):
    ticket = make_ticket(CUSTOMER_A)
    status, presigned = _presign(ticket["id"], CUSTOMER_A)
    assert status == 200
    assert presigned["key"].startswith(f"attachments/{ticket['id']}/")
    assert presigned["key"].endswith("-screenshot.png")
    assert presigned["method"] == "PUT"
    assert presigned["headers"] == {"Content-Type": "image/png"}
    assert "X-Amz-Signature" in presigned["upload_url"]

    _browser_upload(presigned["key"], PNG, "image/png")
    status, entry = api("POST", f"/api/tickets/{ticket['id']}/attachments/confirm", user=CUSTOMER_A,
                        body={"key": presigned["key"]})
    assert status == 201
    assert entry["size"] == len(PNG)
    assert entry["content_type"] == "image/png"

    status, link = api("GET", f"/api/tickets/{ticket['id']}/attachments/{entry['id']}/url", user=CUSTOMER_A)
    assert status == 200
    assert "X-Amz-Signature" in link["url"]
    assert link["expires_in"] == 300

    status, detail = api("GET", f"/api/tickets/{ticket['id']}", user=CUSTOMER_A)
    assert [a["id"] for a in detail["attachments"]] == [entry["id"]]


def test_presigned_put_binds_the_declared_size(aws, monkeypatch):
    """Moto does not enforce SigV4, so this checks what we sign: the header list, and that the signature changes with
    the declared size. Real S3 rejecting a PUT of another length can only be checked against a deployed bucket."""
    monkeypatch.setattr(attachments, "new_id", lambda: "11111111-1111-4111-8111-111111111111")
    ticket = make_ticket(CUSTOMER_A)
    _, presigned = _presign(ticket["id"], CUSTOMER_A, size=len(PNG))
    query = parse_qs(urlparse(presigned["upload_url"]).query)
    assert "content-length" in query["X-Amz-SignedHeaders"][0].split(";")
    assert presigned["size"] == len(PNG)
    _, other = _presign(ticket["id"], CUSTOMER_A, size=len(PNG) + 1)
    assert other["key"] == presigned["key"]
    assert parse_qs(urlparse(other["upload_url"]).query)["X-Amz-Signature"] != query["X-Amz-Signature"]


def test_presign_rejects_a_size_over_the_limit(aws, monkeypatch):
    monkeypatch.setenv("MAX_UPLOAD_BYTES", "32")
    ticket = make_ticket(CUSTOMER_A)
    status, _ = _presign(ticket["id"], CUSTOMER_A, size=33)
    assert status == 422


def test_confirm_twice_is_a_conflict(aws):
    ticket = make_ticket(CUSTOMER_A)
    _, presigned = _presign(ticket["id"], CUSTOMER_A)
    _browser_upload(presigned["key"], PNG, "image/png")
    assert api("POST", f"/api/tickets/{ticket['id']}/attachments/confirm", user=CUSTOMER_A,
               body={"key": presigned["key"]})[0] == 201
    status, _ = api("POST", f"/api/tickets/{ticket['id']}/attachments/confirm", user=CUSTOMER_A,
                    body={"key": presigned["key"]})
    assert status == 409


def test_confirm_without_upload_is_rejected(aws):
    ticket = make_ticket(CUSTOMER_A)
    _, presigned = _presign(ticket["id"], CUSTOMER_A)
    status, body = api("POST", f"/api/tickets/{ticket['id']}/attachments/confirm", user=CUSTOMER_A,
                       body={"key": presigned["key"]})
    assert status == 422
    assert "upload" in body["error"]["details"][0]["message"]


def test_confirm_rejects_a_wrong_content_type_on_the_object(aws):
    ticket = make_ticket(CUSTOMER_A)
    _, presigned = _presign(ticket["id"], CUSTOMER_A)
    _browser_upload(presigned["key"], b"<script>alert(1)</script>", "text/html")
    status, body = api("POST", f"/api/tickets/{ticket['id']}/attachments/confirm", user=CUSTOMER_A,
                       body={"key": presigned["key"]})
    assert status == 422
    assert "not allowed" in body["error"]["details"][0]["message"]


def test_confirm_rejects_an_oversized_object(aws, monkeypatch):
    monkeypatch.setenv("MAX_UPLOAD_BYTES", "32")
    ticket = make_ticket(CUSTOMER_A)
    _, presigned = _presign(ticket["id"], CUSTOMER_A, size=16)
    _browser_upload(presigned["key"], PNG * 2, "image/png")
    status, _ = api("POST", f"/api/tickets/{ticket['id']}/attachments/confirm", user=CUSTOMER_A,
                    body={"key": presigned["key"]})
    assert status == 422


def test_confirm_rejects_an_undersized_object(aws):
    """The object is smaller than the size the presign declared (S3 would refuse this PUT; a stale or forged upload could not pass)."""
    ticket = make_ticket(CUSTOMER_A)
    _, presigned = _presign(ticket["id"], CUSTOMER_A, size=len(PNG) + 8)
    _browser_upload(presigned["key"], PNG, "image/png")
    status, body = _confirm(ticket["id"], presigned["key"])
    assert status == 422
    assert "declared" in body["error"]["details"][0]["message"]


def test_key_must_belong_to_this_ticket(aws):
    mine = make_ticket(CUSTOMER_A)
    other = make_ticket(CUSTOMER_A, title="Another ticket for keys")
    _, presigned = _presign(other["id"], CUSTOMER_A)
    _browser_upload(presigned["key"], PNG, "image/png")
    status, body = api("POST", f"/api/tickets/{mine['id']}/attachments/confirm", user=CUSTOMER_A,
                       body={"key": presigned["key"]})
    assert status == 422
    assert body["error"]["details"][0]["field"] == "key"


def test_key_outside_attachments_prefix_is_rejected(aws):
    ticket = make_ticket(CUSTOMER_A)
    status, _ = api("POST", f"/api/tickets/{ticket['id']}/attachments/confirm", user=CUSTOMER_A,
                    body={"key": "users/secret.txt"})
    assert status == 422


def test_other_customers_cannot_presign_or_download(aws):
    ticket = make_ticket(CUSTOMER_A)
    status, _ = _presign(ticket["id"], CUSTOMER_B)
    assert status == 404
    _, presigned = _presign(ticket["id"], CUSTOMER_A)
    _browser_upload(presigned["key"], PNG, "image/png")
    _, entry = api("POST", f"/api/tickets/{ticket['id']}/attachments/confirm", user=CUSTOMER_A,
                   body={"key": presigned["key"]})
    status, _ = api("GET", f"/api/tickets/{ticket['id']}/attachments/{entry['id']}/url", user=CUSTOMER_B)
    assert status == 404


def test_staff_can_download_customer_attachment(aws):
    ticket = make_ticket(CUSTOMER_A)
    _, presigned = _presign(ticket["id"], CUSTOMER_A)
    _browser_upload(presigned["key"], PNG, "image/png")
    _, entry = api("POST", f"/api/tickets/{ticket['id']}/attachments/confirm", user=CUSTOMER_A,
                   body={"key": presigned["key"]})
    status, link = api("GET", f"/api/tickets/{ticket['id']}/attachments/{entry['id']}/url", user=AGENT)
    assert status == 200
    assert link["filename"] == "screenshot.png"


def test_attachment_count_is_capped(aws):
    ticket = make_ticket(CUSTOMER_A)
    for _ in range(10):
        _, presigned = _presign(ticket["id"], CUSTOMER_A)
        _browser_upload(presigned["key"], PNG, "image/png")
        status, _ = api("POST", f"/api/tickets/{ticket['id']}/attachments/confirm", user=CUSTOMER_A,
                        body={"key": presigned["key"]})
        assert status == 201
    status, _ = _presign(ticket["id"], CUSTOMER_A)
    assert status == 409


def test_missing_bucket_fails_only_the_attachment_routes(aws, monkeypatch, caplog):
    ticket = make_ticket(CUSTOMER_A)
    monkeypatch.delenv("ATTACHMENTS_BUCKET")
    assert api("GET", "/api/me", user=CUSTOMER_A)[0] == 200
    status, body = _presign(ticket["id"], CUSTOMER_A)
    assert status == 500
    assert body["error"]["code"] == "internal_error"
    assert "missing environment variable ATTACHMENTS_BUCKET" in caplog.text
    status, _ = api("POST", f"/api/tickets/{ticket['id']}/attachments/confirm", user=CUSTOMER_A,
                    body={"key": f"attachments/{ticket['id']}/x"})
    assert status == 500


def test_presign_records_a_pending_upload_that_customers_do_not_see(aws):
    ticket = make_ticket(CUSTOMER_A)
    _, presigned = _presign(ticket["id"], CUSTOMER_A)
    pending = _ticket_row(ticket["id"])["pending_uploads"]
    assert [(p["key"], p["size"]) for p in pending] == [(presigned["key"], len(PNG))]
    assert "pending_uploads" not in api("GET", f"/api/tickets/{ticket['id']}", user=CUSTOMER_A)[1]
    assert "pending_uploads" not in api("GET", f"/api/tickets/{ticket['id']}", user=AGENT)[1]


def test_pending_uploads_are_capped_per_ticket(aws):
    ticket = make_ticket(CUSTOMER_A)
    presigned = [_presign(ticket["id"], CUSTOMER_A)[1] for _ in range(MAX_PENDING_UPLOADS_PER_TICKET)]
    status, body = _presign(ticket["id"], CUSTOMER_A)
    assert status == 429
    assert body["error"]["code"] == "too_many_requests"
    assert body["error"]["message"] == attachments.PENDING_LIMIT_MESSAGE

    _browser_upload(presigned[0]["key"], PNG, "image/png")
    assert _confirm(ticket["id"], presigned[0]["key"])[0] == 201
    assert _presign(ticket["id"], CUSTOMER_A)[0] == 200


def test_pending_uploads_expire_after_an_hour(aws, monkeypatch):
    ticket = make_ticket(CUSTOMER_A)
    start = datetime.now(timezone.utc)
    for _ in range(MAX_PENDING_UPLOADS_PER_TICKET):
        assert _presign(ticket["id"], CUSTOMER_A)[0] == 200

    monkeypatch.setattr(attachments, "_now", lambda: start + timedelta(seconds=PENDING_UPLOAD_TTL_SECONDS - 60))
    assert _presign(ticket["id"], CUSTOMER_A)[0] == 429

    monkeypatch.setattr(attachments, "_now", lambda: start + timedelta(seconds=PENDING_UPLOAD_TTL_SECONDS + 1))
    assert _presign(ticket["id"], CUSTOMER_A)[0] == 200
    assert len(_ticket_row(ticket["id"])["pending_uploads"]) == 1


def test_confirm_after_the_pending_record_expired_is_rejected(aws, monkeypatch):
    ticket = make_ticket(CUSTOMER_A)
    start = datetime.now(timezone.utc)
    _, presigned = _presign(ticket["id"], CUSTOMER_A)
    _browser_upload(presigned["key"], PNG, "image/png")

    monkeypatch.setattr(attachments, "_now", lambda: start + timedelta(seconds=PENDING_UPLOAD_TTL_SECONDS + 1))
    status, body = _confirm(ticket["id"], presigned["key"])
    assert status == 422
    assert "not requested" in body["error"]["details"][0]["message"]


def test_confirm_without_a_presign_is_rejected(aws):
    ticket = make_ticket(CUSTOMER_A)
    key = f"{attachments.PREFIX}{ticket['id']}/22222222-2222-4222-8222-222222222222-screenshot.png"
    _browser_upload(key, PNG, "image/png")
    status, body = _confirm(ticket["id"], key)
    assert status == 422
    assert "not requested" in body["error"]["details"][0]["message"]


def test_store_refuses_a_pending_write_based_on_a_stale_read(aws):
    ticket = make_ticket(CUSTOMER_A)
    store = Store(tables.TICKETS_TABLE, tables.COMMENTS_TABLE)
    store.replace_pending_uploads(ticket["id"], [{"key": "a"}], 0)
    with pytest.raises(ConditionFailed):
        store.replace_pending_uploads(ticket["id"], [{"key": "b"}], 0)
    assert _ticket_row(ticket["id"])["pending_uploads"] == [{"key": "a"}]


def test_deployed_mode_has_no_bucket_default(aws, monkeypatch):
    monkeypatch.delenv("ATTACHMENTS_BUCKET")
    assert config.load_api().attachments_bucket is None


def test_local_mode_uses_the_local_bucket_when_none_is_set(aws, monkeypatch):
    monkeypatch.setenv("AUTH_MODE", "local")
    monkeypatch.delenv("ATTACHMENTS_BUCKET")
    assert config.load_api().attachments_bucket == "local-attachments"


def _has_key_field(value):
    if isinstance(value, dict):
        return "key" in value or any(_has_key_field(item) for item in value.values())
    if isinstance(value, list):
        return any(_has_key_field(item) for item in value)
    return False


def test_storage_keys_are_not_returned_to_any_role(aws):
    ticket = make_ticket(CUSTOMER_A)
    _, presigned = _presign(ticket["id"], CUSTOMER_A)
    _browser_upload(presigned["key"], PNG, "image/png")
    status, confirmed = _confirm(ticket["id"], presigned["key"])
    assert status == 201
    assert "key" not in confirmed

    responses = [confirmed, api("PATCH", f"/api/tickets/{ticket['id']}", user=AGENT, body={"priority": "High"})[1]]
    for user in (CUSTOMER_A, AGENT, ADMIN):
        responses.append(api("GET", f"/api/tickets/{ticket['id']}", user=user)[1])
        responses.append(api("GET", "/api/tickets", user=user)[1])
    for body in responses:
        assert not _has_key_field(body)
        assert presigned["key"] not in json.dumps(body)
    assert api("GET", f"/api/tickets/{ticket['id']}", user=CUSTOMER_A)[1]["attachments"][0]["id"] == confirmed["id"]


def test_presigns_are_capped_over_the_life_of_a_ticket(aws, monkeypatch):
    ticket = make_ticket(CUSTOMER_A)
    clock = {"now": datetime.now(timezone.utc)}
    monkeypatch.setattr(attachments, "_now", lambda: clock["now"])
    for _ in range(MAX_PRESIGNS_PER_TICKET // MAX_PENDING_UPLOADS_PER_TICKET):
        for _ in range(MAX_PENDING_UPLOADS_PER_TICKET):
            assert _presign(ticket["id"], CUSTOMER_A)[0] == 200
        # Every pending record expires, so only the lifetime count can stop the next presign.
        clock["now"] += timedelta(seconds=PENDING_UPLOAD_TTL_SECONDS + 1)

    status, body = _presign(ticket["id"], CUSTOMER_A)
    assert status == 429
    assert body["error"]["code"] == "too_many_requests"
    assert body["error"]["message"] == attachments.TOTAL_LIMIT_MESSAGE
    assert _ticket_row(ticket["id"])["presign_total"] == MAX_PRESIGNS_PER_TICKET
    assert "presign_total" not in api("GET", f"/api/tickets/{ticket['id']}", user=AGENT)[1]
