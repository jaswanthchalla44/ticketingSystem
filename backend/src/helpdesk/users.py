"""Users: the profile cache in DynamoDB, staff lookup for assignment, and the Admin role change.

In deployment a role is a Cognito group. Authorization reads the groups in the caller's token, so a role
change reaches a user at their next token refresh (up to 60 minutes). A demotion also signs the user out, which
stops their refresh tokens; it does not revoke the token they already hold, so the old role can last until that
token expires. In local mode the cache is the role.
"""
import logging

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from helpdesk.errors import ConfigError, Conflict, NotFound, UpstreamError
from helpdesk.model import ROLE_ADMIN, ROLE_AGENT, ROLES, STAFF_ROLES
from helpdesk.timeutil import now_iso
from helpdesk.validation import invalid, is_uuid

log = logging.getLogger(__name__)
_cognito = None


def sync_profile(store, principal):
    """Keeps the cache row in step with the caller's name and email. The role is set only when the row is new."""
    row = store.get_user(principal.sub)
    stamp = now_iso()
    if row is None:
        store.put_user({
            "user_id": principal.sub,
            "email": principal.email,
            "name": principal.name,
            "role": principal.role,
            "created_at": stamp,
            "updated_at": stamp,
        })
    elif row.get("email") != principal.email or row.get("name") != principal.name:
        store.update_user(principal.sub, {"email": principal.email, "name": principal.name, "updated_at": stamp})


def staff_profile(store, sub):
    row = store.get_user(sub)
    if row is None or row.get("role") not in STAFF_ROLES:
        raise invalid("assignee_id", "must be an agent or an admin")
    return row


def list_staff(store):
    rows = store.users_by_role(ROLE_AGENT) + store.users_by_role(ROLE_ADMIN)
    return {"items": sorted((_view(row) for row in rows), key=lambda user: user["name"].lower())}


def list_all(store):
    rows = [row for role in ROLES for row in store.users_by_role(role)]
    return {"items": sorted((_view(row) for row in rows), key=lambda user: user["name"].lower())}


def change_role(store, cfg, principal, sub, role):
    if not is_uuid(sub):
        raise NotFound("user not found")
    if sub == principal.sub and role != ROLE_ADMIN:
        raise Conflict("you cannot remove your own admin role")
    row = store.get_user(sub)
    if row is None:
        raise NotFound("user not found")
    if row["role"] != role:
        if not cfg.local:
            username = _set_cognito_group(principal.pool_id, sub, role)
            if ROLES.index(role) < ROLES.index(row["role"]):
                _sign_out(principal.pool_id, sub, username)
        row = store.update_user(sub, {"role": role, "updated_at": now_iso()})
    return _view(row)


def _view(row):
    return {key: row[key] for key in ("user_id", "name", "email", "role", "created_at") if key in row}


def _set_cognito_group(pool_id, sub, role):
    """Moves the user into exactly one role group. Adds the new group before removing the others. Returns the username."""
    if not pool_id:
        raise ConfigError("cannot find the user pool for this token")
    client = _cognito_client()
    try:
        username = _username_for(client, pool_id, sub)
        current = [group["GroupName"] for group in
                   client.admin_list_groups_for_user(UserPoolId=pool_id, Username=username)["Groups"]]
        if role not in current:
            client.admin_add_user_to_group(UserPoolId=pool_id, Username=username, GroupName=role)
        for group in current:
            if group in ROLES and group != role:
                client.admin_remove_user_from_group(UserPoolId=pool_id, Username=username, GroupName=group)
    except ClientError:
        log.exception("Cognito group change failed for %s", sub)
        raise UpstreamError("the identity provider could not change the role") from None
    return username


def _username_for(client, pool_id, sub):
    matches = client.list_users(UserPoolId=pool_id, Filter=f'sub = "{sub}"', Limit=1)["Users"]
    if not matches:
        raise NotFound("user not found")
    return matches[0]["Username"]


def _sign_out(pool_id, sub, username):
    """Ends the demoted user's sessions so they cannot refresh. Best effort: a failure is logged and the role change
    stands. Tokens already issued stay valid until they expire (60 minutes), so this does not end the window."""
    try:
        _cognito_client().admin_user_global_sign_out(UserPoolId=pool_id, Username=username)
    except (ClientError, BotoCoreError):
        log.exception("Cognito sign-out failed for %s after a demotion", sub)


def _cognito_client():
    global _cognito
    if _cognito is None:
        _cognito = boto3.client("cognito-idp")
    return _cognito

