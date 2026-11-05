"""Input checks. Every request body and query string passes through here before it reaches storage."""
import base64
import json
import os
import re
from dataclasses import dataclass

from helpdesk import model
from helpdesk.errors import BadRequest, ValidationFailed

UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
UNSAFE_NAME_CHARS = re.compile(r"[^A-Za-z0-9._ -]")


def is_uuid(value):
    return isinstance(value, str) and UUID_RE.match(value) is not None


def invalid(field, message):
    return ValidationFailed([{"field": field, "message": message}])


def json_body(event):
    raw = event.get("body")
    if not raw:
        raise BadRequest("request body must be a JSON object")
    try:
        text = base64.b64decode(raw).decode("utf-8") if event.get("isBase64Encoded") else raw
        data = json.loads(text)
    except ValueError:
        raise BadRequest("request body must be valid JSON") from None
    if not isinstance(data, dict):
        raise BadRequest("request body must be a JSON object")
    return data


def raw_body(event):
    raw = event.get("body") or ""
    if event.get("isBase64Encoded"):
        return base64.b64decode(raw)
    return raw.encode("utf-8")


class Validator:
    """Collects every field error, so one response can list them all."""

    def __init__(self, data):
        self._data = data
        self._errors = []

    def fail(self, field, message):
        self._errors.append({"field": field, "message": message})

    def text(self, name, *, max_len, min_len=1, required=True):
        value = self._data.get(name)
        if value is None or value == "":
            if required:
                self.fail(name, "is required")
            return None
        if not isinstance(value, str):
            self.fail(name, "must be a string")
            return None
        value = value.strip()
        if not value and not required:
            return None
        if len(value) < min_len:
            self.fail(name, f"must be at least {min_len} characters")
        elif len(value) > max_len:
            self.fail(name, f"must be at most {max_len} characters")
        return value

    def choice(self, name, options, *, required=True):
        value = self._data.get(name)
        if value is None or value == "":
            if required:
                self.fail(name, "is required")
            return None
        if value not in options:
            self.fail(name, "must be one of " + ", ".join(options))
            return None
        return value

    def integer(self, name, *, minimum, maximum, required=True):
        value = self._data.get(name)
        if value is None or value == "":
            if required:
                self.fail(name, "is required")
            return None
        if isinstance(value, str) and value.strip().lstrip("-").isdigit():
            value = int(value)
        if isinstance(value, bool) or not isinstance(value, int):
            self.fail(name, "must be a whole number")
            return None
        if value < minimum or value > maximum:
            self.fail(name, f"must be between {minimum} and {maximum}")
            return None
        return value

    def uuid(self, name, *, required=True):
        value = self._data.get(name)
        if value is None or value == "":
            if required:
                self.fail(name, "is required")
            return None
        if not is_uuid(value):
            self.fail(name, "must be an id")
            return None
        return value

    def check(self):
        if self._errors:
            raise ValidationFailed(list(self._errors))


def safe_filename(raw):
    """Keeps only the final path segment and a conservative character set. No separators, no leading dots."""
    base = re.split(r"[\\/]", raw)[-1]
    base = UNSAFE_NAME_CHARS.sub("_", base)
    stem, ext = os.path.splitext(base)
    stem = re.sub(r"\s+", " ", stem).strip(" ._")[:80]
    if not stem:
        raise invalid("filename", "use letters, digits, dots, dashes or spaces")
    return stem + ext[:10]


def upload_filename(raw, content_type):
    name = safe_filename(raw)
    _, ext = os.path.splitext(name)
    if ext.lower() not in model.ATTACHMENT_TYPES[content_type]:
        raise invalid("filename", "the extension does not match the content type")
    return name


@dataclass(frozen=True)
class TicketFilters:
    status: str | None
    priority: str | None
    category: str | None
    assignee: str | None
    q: str | None
    mine: bool
    limit: int
    cursor: str | None


def ticket_filters(params):
    params = dict(params or {})
    v = Validator(params)
    status = v.choice("status", model.STATUSES, required=False)
    priority = v.choice("priority", model.PRIORITIES, required=False)
    category = v.choice("category", model.CATEGORIES, required=False)
    assignee = v.uuid("assignee", required=False)
    q = v.text("q", max_len=200, required=False)
    mine = v.choice("mine", ("true", "false"), required=False)
    limit = v.integer("limit", minimum=1, maximum=model.LIST_MAX_LIMIT, required=False)
    cursor = v.text("cursor", max_len=2000, required=False)
    v.check()
    return TicketFilters(
        status=status,
        priority=priority,
        category=category,
        assignee=assignee,
        q=q,
        mine=mine == "true",
        limit=limit or model.LIST_DEFAULT_LIMIT,
        cursor=cursor,
    )
