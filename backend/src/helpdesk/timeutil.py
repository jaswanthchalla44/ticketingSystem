"""Timestamps and ids. Timestamps are fixed-width UTC strings so they sort correctly as DynamoDB range keys."""
import uuid
from datetime import datetime, timezone

ISO_FORMAT = "%Y-%m-%dT%H:%M:%S.%fZ"


def format_iso(moment):
    return moment.astimezone(timezone.utc).strftime(ISO_FORMAT)


def now_iso():
    return format_iso(datetime.now(timezone.utc))


def parse_iso(value):
    return datetime.strptime(value, ISO_FORMAT).replace(tzinfo=timezone.utc)


def new_id():
    return str(uuid.uuid4())
