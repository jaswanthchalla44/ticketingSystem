"""API Lambda entry point (API Gateway HTTP API, payload format 2.0).

Routes on the full path (for example /api/tickets), so the local server can call this handler unchanged.
Every route except /api/health needs a verified caller; role checks are declared on the route.
"""
import base64
import json
import logging
import re
from collections import namedtuple
from dataclasses import replace

from helpdesk import attachments, auth, comments, config, metrics, tickets, users
from helpdesk.errors import ApiError, Forbidden, MethodNotAllowed, NotFound
from helpdesk.model import ROLE_ADMIN, ROLES, STAFF_ROLES
from helpdesk.store import get_store
from helpdesk.validation import Validator, json_body, raw_body, ticket_filters

log = logging.getLogger(__name__)

ADMIN = (ROLE_ADMIN,)
STAFF = STAFF_ROLES

Route = namedtuple("Route", "method pattern fn roles auth_required local_only")
Request = namedtuple("Request", "event cfg store params query principal")


def _route(method, template, fn, roles=None, auth_required=True, local_only=False):
    def named_group(match):
        name, path = match.group(1), match.group(2)
        return f"(?P<{name}>.+)" if path else f"(?P<{name}>[^/]+)"

    pattern = re.compile("^" + re.sub(r"\{(\w+)(:path)?\}", named_group, template) + "$")
    return Route(method, pattern, fn, roles, auth_required, local_only)


def health(req):
    return 200, {"status": "ok"}


def me(req):
    return 200, auth.profile(req.principal)


def tickets_list(req):
    filters = ticket_filters(req.query)
    return 200, tickets.list_tickets(req.store, req.principal, filters)


def tickets_create(req):
    return 201, tickets.create(req.store, req.cfg, req.principal, json_body(req.event))


def ticket_get(req):
    return 200, tickets.get(req.store, req.principal, req.params["id"])


def ticket_update(req):
    return 200, tickets.update(req.store, req.cfg, req.principal, req.params["id"], json_body(req.event))


def comment_create(req):
    return 201, comments.add(req.store, req.cfg, req.principal, req.params["id"], json_body(req.event))


def attachment_presign(req):
    return 200, attachments.presign(req.store, req.cfg, req.principal, req.params["id"], json_body(req.event))


def attachment_confirm(req):
    return 201, attachments.confirm(req.store, req.cfg, req.principal, req.params["id"], json_body(req.event))


def attachment_url(req):
    return 200, attachments.download_url(req.store, req.cfg, req.principal, req.params["id"],
                                         req.params["attachment_id"])


def agents_list(req):
    return 200, users.list_staff(req.store)


def dashboard_get(req):
    return 200, metrics.dashboard(req.store)


def users_list(req):
    return 200, users.list_all(req.store)


def user_update(req):
    role = Validator(json_body(req.event)).choice("role", ROLES)
    return 200, users.change_role(req.store, req.cfg, req.principal, req.params["sub"], role)


def local_s3_put(req):
    body = raw_body(req.event)
    content_type = (req.event.get("headers") or {}).get("content-type")
    return 200, attachments.local_put(req.cfg, req.params["key"], body, content_type)


def local_s3_get(req):
    return attachments.local_get(req.cfg, req.params["key"])


ROUTES = [
    _route("GET", "/api/health", health, auth_required=False),
    _route("GET", "/api/me", me),
    _route("GET", "/api/tickets", tickets_list),
    _route("POST", "/api/tickets", tickets_create),
    _route("GET", "/api/tickets/{id}", ticket_get),
    _route("PATCH", "/api/tickets/{id}", ticket_update, roles=STAFF),
    _route("POST", "/api/tickets/{id}/comments", comment_create),
    _route("POST", "/api/tickets/{id}/attachments/presign", attachment_presign),
    _route("POST", "/api/tickets/{id}/attachments/confirm", attachment_confirm),
    _route("GET", "/api/tickets/{id}/attachments/{attachment_id}/url", attachment_url),
    _route("GET", "/api/agents", agents_list, roles=STAFF),
    _route("GET", "/api/dashboard", dashboard_get, roles=ADMIN),
    _route("GET", "/api/users", users_list, roles=ADMIN),
    _route("PATCH", "/api/users/{sub}", user_update, roles=ADMIN),
    _route("PUT", "/api/_local/s3/{key:path}", local_s3_put, auth_required=False, local_only=True),
    _route("GET", "/api/_local/s3/{key:path}", local_s3_get, auth_required=False, local_only=True),
]


def handler(event, context):
    try:
        return _dispatch(event)
    except ApiError as exc:
        body = {"error": {"code": exc.code, "message": exc.message}}
        if exc.details:
            body["error"]["details"] = exc.details
        return _respond(exc.status, body)
    except Exception:
        log.exception("unhandled error")
        return _respond(500, {"error": {"code": "internal_error", "message": "Something went wrong. Try again."}})


def _dispatch(event):
    cfg = config.load_api()
    path = (event.get("rawPath") or "/").rstrip("/") or "/"
    method = event["requestContext"]["http"]["method"].upper()

    candidates = []
    for route in ROUTES:
        match = route.pattern.match(path)
        if match and (not route.local_only or cfg.local):
            candidates.append((route, match))
    if not candidates:
        raise NotFound("no such endpoint")
    matching = [(route, match) for route, match in candidates if route.method == method]
    if not matching:
        raise MethodNotAllowed("method not allowed for this endpoint")
    route, match = matching[0]

    store = get_store(cfg)
    principal = None
    if route.auth_required:
        principal = _authenticate(cfg, store, event)
        if route.roles and principal.role not in route.roles:
            raise Forbidden("your role cannot do this")
    req = Request(event=event, cfg=cfg, store=store, params=match.groupdict(),
                  query=event.get("queryStringParameters") or {}, principal=principal)
    result = route.fn(req)
    if isinstance(result, attachments.Raw):
        return _respond_raw(result)
    status, body = result
    return _respond(status, body)


def _authenticate(cfg, store, event):
    principal = auth.principal(event, cfg)
    if cfg.local:
        # In local mode the role cache is the role, so a local role change takes effect at once.
        row = store.get_user(principal.sub)
        if row:
            principal = replace(principal, role=row["role"])
    users.sync_profile(store, principal)
    return principal


def _respond(status, body):
    return {
        "statusCode": status,
        "headers": {"content-type": "application/json", "cache-control": "no-store"},
        "body": json.dumps(body, default=str),
    }


def _respond_raw(raw):
    return {
        "statusCode": 200,
        "headers": {"content-type": raw.content_type, "cache-control": "no-store"},
        "body": base64.b64encode(raw.body).decode("ascii"),
        "isBase64Encoded": True,
    }

