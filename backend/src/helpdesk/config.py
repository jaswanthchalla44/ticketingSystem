"""Environment contract for the API and triage Lambdas (names match infra/lambda.tf).

Nothing here has a fallback for a value that Terraform must set. Local mode is refused inside Lambda.
"""
import logging
import os
from dataclasses import dataclass

from helpdesk.errors import ConfigError

log = logging.getLogger(__name__)

AUTH_MODES = ("cognito", "local")
TRIAGE_MODES = ("anthropic", "keyword")
DEFAULT_ANTHROPIC_TIMEOUT_SECONDS = 8
# Local preview only. Deployed mode has no default: Terraform names the bucket with the account id.
LOCAL_ATTACHMENTS_BUCKET = "local-attachments"


def _env(name, required=True):
    value = os.environ.get(name, "").strip()
    if not value:
        if required:
            raise ConfigError(f"missing environment variable {name}")
        return None
    return value


def _in(name, options):
    value = _env(name)
    if value not in options:
        raise ConfigError(f"{name} must be one of {', '.join(options)}")
    return value


def _int(name, *, required=True, minimum=1, maximum=None):
    raw = _env(name, required=required)
    if raw is None:
        return None
    try:
        value = int(raw)
    except ValueError:
        raise ConfigError(f"{name} must be a whole number") from None
    if value < minimum or (maximum is not None and value > maximum):
        raise ConfigError(f"{name} is out of range")
    return value


@dataclass(frozen=True)
class ApiConfig:
    auth_mode: str
    tickets_table: str
    comments_table: str
    users_table: str
    attachments_bucket: str
    triage_queue_url: str
    ticket_events_topic_arn: str
    signed_url_ttl_seconds: int
    max_upload_bytes: int

    @property
    def local(self):
        return self.auth_mode == "local"

    def require_attachments_bucket(self):
        """Attachment routes call this. A missing bucket is a configuration error, not a client error."""
        if not self.attachments_bucket:
            raise ConfigError("missing environment variable ATTACHMENTS_BUCKET")
        return self.attachments_bucket


@dataclass(frozen=True)
class TriageConfig:
    triage_mode: str
    tickets_table: str
    comments_table: str
    anthropic_model: str | None = None
    anthropic_timeout_seconds: int | None = None
    anthropic_secret_id: str | None = None


@dataclass(frozen=True)
class TableNames:
    tickets_table: str
    comments_table: str
    users_table: str


def _attachments_bucket(local):
    # Not required here: load_api runs on every request, and only the attachment routes need the bucket.
    value = _env("ATTACHMENTS_BUCKET", required=False)
    if value is None and local:
        return LOCAL_ATTACHMENTS_BUCKET
    return value


def load_api():
    auth_mode = _in("AUTH_MODE", AUTH_MODES)
    if auth_mode == "local" and os.environ.get("AWS_LAMBDA_FUNCTION_NAME"):
        raise ConfigError("AUTH_MODE=local is refused inside Lambda")
    return ApiConfig(
        auth_mode=auth_mode,
        tickets_table=_env("TABLE_TICKETS"),
        comments_table=_env("TABLE_COMMENTS"),
        users_table=_env("TABLE_USERS"),
        attachments_bucket=_attachments_bucket(auth_mode == "local"),
        triage_queue_url=_env("TRIAGE_QUEUE_URL"),
        ticket_events_topic_arn=_env("TICKET_EVENTS_TOPIC_ARN"),
        signed_url_ttl_seconds=_int("SIGNED_URL_TTL_SECONDS", minimum=60, maximum=3600),
        max_upload_bytes=_int("MAX_UPLOAD_BYTES", maximum=25 * 1024 * 1024),
    )


def load_triage():
    mode = _env("TRIAGE_MODE")
    if mode is None:
        raise ConfigError("missing environment variable TRIAGE_MODE")
    if mode not in TRIAGE_MODES:
        # An unknown value must not stop triage: log it and use the keyword rules.
        log.error("TRIAGE_MODE must be one of %s; using keyword", ", ".join(TRIAGE_MODES))
        mode = "keyword"
    anthropic = mode == "anthropic"
    return TriageConfig(
        triage_mode=mode,
        tickets_table=_env("TABLE_TICKETS"),
        comments_table=_env("TABLE_COMMENTS"),
        anthropic_model=_env("ANTHROPIC_MODEL", required=anthropic),
        anthropic_timeout_seconds=_int("ANTHROPIC_TIMEOUT_SECONDS", required=False, maximum=20)
        or DEFAULT_ANTHROPIC_TIMEOUT_SECONDS,
        anthropic_secret_id=_env("ANTHROPIC_SECRET_ID", required=anthropic),
    )


def load_tables():
    """Table names only, for the seed script."""
    return TableNames(
        tickets_table=_env("TABLE_TICKETS"),
        comments_table=_env("TABLE_COMMENTS"),
        users_table=_env("TABLE_USERS"),
    )
