"""Who is calling.

Deployed: API Gateway has already verified the Cognito ID token, so we read its claims
(requestContext.authorizer.jwt.claims). Local: X-Dev-User names a seeded user. Local mode is refused
inside Lambda by config.load_api().
"""
import re
from dataclasses import dataclass

from helpdesk.errors import Unauthorized
from helpdesk.model import ROLE_ADMIN, ROLE_AGENT, ROLE_CUSTOMER, STAFF_ROLES

POOL_ID_RE = re.compile(r"^[A-Za-z0-9-]+_[A-Za-z0-9]+$")

# Local preview identities. Fake accounts for development only, never used in deployment.
LOCAL_USERS = (
    {"sub": "00000000-0000-4000-8000-000000000001", "email": "dana.okoye@example.test", "name": "Dana Okoye", "role": ROLE_ADMIN},
    {"sub": "00000000-0000-4000-8000-000000000101", "email": "priya.raman@example.test", "name": "Priya Raman", "role": ROLE_AGENT},
    {"sub": "00000000-0000-4000-8000-000000000102", "email": "marcus.chen@example.test", "name": "Marcus Chen", "role": ROLE_AGENT},
    {"sub": "00000000-0000-4000-8000-000000000103", "email": "lena.costa@example.test", "name": "Lena Costa", "role": ROLE_AGENT},
    {"sub": "00000000-0000-4000-8000-000000000104", "email": "tomasz.nowak@example.test", "name": "Tomasz Nowak", "role": ROLE_AGENT},
    {"sub": "00000000-0000-4000-8000-000000000201", "email": "sam.okafor@example.test", "name": "Sam Okafor", "role": ROLE_CUSTOMER},
    {"sub": "00000000-0000-4000-8000-000000000202", "email": "elena.ruiz@example.test", "name": "Elena Ruiz", "role": ROLE_CUSTOMER},
    {"sub": "00000000-0000-4000-8000-000000000203", "email": "jordan.lee@example.test", "name": "Jordan Lee", "role": ROLE_CUSTOMER},
    {"sub": "00000000-0000-4000-8000-000000000204", "email": "aisha.khan@example.test", "name": "Aisha Khan", "role": ROLE_CUSTOMER},
    {"sub": "00000000-0000-4000-8000-000000000205", "email": "ben.walsh@example.test", "name": "Ben Walsh", "role": ROLE_CUSTOMER},
)
_LOCAL_BY_KEY = {key: user for user in LOCAL_USERS for key in (user["sub"], user["email"])}


@dataclass(frozen=True)
class Principal:
    sub: str
    email: str
    name: str
    role: str
    pool_id: str | None = None

    @property
    def is_staff(self):
        return self.role in STAFF_ROLES

    @property
    def is_admin(self):
        return self.role == ROLE_ADMIN


def principal(event, cfg):
    if cfg.local:
        return _local_principal(event)
    return _claims_principal(event)


def profile(principal):
    return {"sub": principal.sub, "email": principal.email, "name": principal.name, "role": principal.role}


def role_from_groups(groups):
    """Admin > Agent > Customer. A user with no group (self sign-up) is a Customer."""
    for role in (ROLE_ADMIN, ROLE_AGENT, ROLE_CUSTOMER):
        if role in groups:
            return role
    return ROLE_CUSTOMER


def groups_from_claim(value):
    """The HTTP API writes a list claim as text, for example "[Admin Agent]". Accept both shapes."""
    if not value:
        return []
    if isinstance(value, list):
        return [str(group) for group in value]
    text = str(value).strip()
    if text.startswith("[") and text.endswith("]"):
        text = text[1:-1]
    return [group for group in re.split(r"[\s,]+", text) if group]


def pool_id_from_issuer(issuer):
    if not issuer:
        return None
    candidate = issuer.rstrip("/").rsplit("/", 1)[-1]
    return candidate if POOL_ID_RE.match(candidate) else None


def _claims_principal(event):
    context = event.get("requestContext") or {}
    claims = ((context.get("authorizer") or {}).get("jwt") or {}).get("claims") or {}
    sub = claims.get("sub")
    if not sub:
        raise Unauthorized("sign in to use this API")
    email = claims.get("email") or ""
    return Principal(
        sub=sub,
        email=email,
        name=claims.get("name") or email or sub,
        role=role_from_groups(groups_from_claim(claims.get("cognito:groups"))),
        pool_id=pool_id_from_issuer(claims.get("iss")),
    )


def _local_principal(event):
    headers = {key.lower(): value for key, value in (event.get("headers") or {}).items()}
    user = _LOCAL_BY_KEY.get((headers.get("x-dev-user") or "").strip().lower())
    if user is None:
        raise Unauthorized("local mode: send X-Dev-User with a seeded user's sub or email")
    return Principal(sub=user["sub"], email=user["email"], name=user["name"], role=user["role"])
