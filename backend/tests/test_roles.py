"""Role rules: who may see, create, change and administer what."""
import pytest
from botocore.exceptions import ClientError

from helpdesk import auth, config, users
from helpdesk.errors import ConfigError
from support import (ADMIN, AGENT, AGENT_2, CUSTOMER_A, CUSTOMER_B, NO_GROUP, POOL_ID, api, call, claims_event, dev_event,
                     make_ticket)


class FakeCognito:
    """Records the cognito-idp calls that users.py makes. Sign-out raises sign_out_error when it is set."""

    def __init__(self, groups=("Agent",), sign_out_error=None):
        self.calls = []
        self.groups = list(groups)
        self.sign_out_error = sign_out_error

    def list_users(self, **kwargs):
        self.calls.append(("list_users", kwargs))
        return {"Users": [{"Username": "priya-raman"}]}

    def admin_list_groups_for_user(self, **kwargs):
        self.calls.append(("admin_list_groups_for_user", kwargs))
        return {"Groups": [{"GroupName": group} for group in self.groups]}

    def admin_add_user_to_group(self, **kwargs):
        self.calls.append(("admin_add_user_to_group", kwargs))

    def admin_remove_user_from_group(self, **kwargs):
        self.calls.append(("admin_remove_user_from_group", kwargs))

    def admin_user_global_sign_out(self, **kwargs):
        self.calls.append(("admin_user_global_sign_out", kwargs))
        if self.sign_out_error:
            raise self.sign_out_error
        return {}

    def names(self):
        return [name for name, _ in self.calls]


def test_health_needs_no_sign_in(aws):
    status, body = call({"version": "2.0", "rawPath": "/api/health", "headers": {},
                         "requestContext": {"http": {"method": "GET", "path": "/api/health"}}})
    assert status == 200
    assert body == {"status": "ok"}


def test_request_without_claims_is_unauthorized(aws):
    event = claims_event("GET", "/api/tickets", user=CUSTOMER_A)
    event["requestContext"]["authorizer"] = {"jwt": {"claims": {}}}
    status, body = call(event)
    assert status == 401
    assert body["error"]["code"] == "unauthorized"


def test_customer_sees_only_own_tickets(aws):
    mine = make_ticket(CUSTOMER_A)
    theirs = make_ticket(CUSTOMER_B, title="Second customer's printer issue")

    status, body = api("GET", "/api/tickets", user=CUSTOMER_A)
    assert status == 200
    assert [t["id"] for t in body["items"]] == [mine["id"]]

    status, body = api("GET", f"/api/tickets/{theirs['id']}", user=CUSTOMER_A)
    assert status == 404  # another customer's ticket looks missing


def test_agent_sees_every_ticket(aws):
    first = make_ticket(CUSTOMER_A)
    second = make_ticket(CUSTOMER_B)
    status, body = api("GET", "/api/tickets", user=AGENT)
    assert status == 200
    assert {t["id"] for t in body["items"]} == {first["id"], second["id"]}


def test_customer_cannot_post_internal_note(aws):
    ticket = make_ticket(CUSTOMER_A)
    status, body = api("POST", f"/api/tickets/{ticket['id']}/comments", user=CUSTOMER_A,
                       body={"body": "Trying to slip an internal note in", "visibility": "internal"})
    assert status == 403
    assert body["error"]["code"] == "forbidden"


def test_customer_can_post_public_reply(aws):
    ticket = make_ticket(CUSTOMER_A)
    status, body = api("POST", f"/api/tickets/{ticket['id']}/comments", user=CUSTOMER_A,
                       body={"body": "Still broken after the restart."})
    assert status == 201
    assert body["visibility"] == "public"


def test_other_customer_cannot_comment_on_ticket(aws):
    ticket = make_ticket(CUSTOMER_A)
    status, _ = api("POST", f"/api/tickets/{ticket['id']}/comments", user=CUSTOMER_B, body={"body": "Hello there"})
    assert status == 404


def test_customer_cannot_patch(aws):
    ticket = make_ticket(CUSTOMER_A)
    status, body = api("PATCH", f"/api/tickets/{ticket['id']}", user=CUSTOMER_A, body={"status": "Resolved"})
    assert status == 403
    assert body["error"]["code"] == "forbidden"


def test_agent_cannot_use_admin_only_routes(aws):
    for path in ("/api/dashboard", "/api/users"):
        status, _ = api("GET", path, user=AGENT)
        assert status == 403, path


def test_customer_cannot_list_agents(aws):
    status, _ = api("GET", "/api/agents", user=CUSTOMER_A)
    assert status == 403


def test_admin_can_use_dashboard_and_users(aws):
    status, body = api("GET", "/api/dashboard", user=ADMIN)
    assert status == 200
    assert body["total"] == 0
    status, body = api("GET", "/api/users", user=ADMIN)
    assert status == 200
    assert any(user["user_id"] == ADMIN["sub"] for user in body["items"])


def test_agent_can_assign_and_change_status(aws):
    ticket = make_ticket(CUSTOMER_A)
    status, body = api("PATCH", f"/api/tickets/{ticket['id']}", user=AGENT,
                       body={"status": "In Progress", "assignee_id": AGENT["sub"]})
    assert status == 200
    assert body["status"] == "In Progress"
    assert body["assignee_id"] == AGENT["sub"]
    assert body["assignee_name"] == AGENT["name"]


def test_assignee_must_be_staff(aws):
    ticket = make_ticket(CUSTOMER_A)
    status, body = api("PATCH", f"/api/tickets/{ticket['id']}", user=AGENT,
                       body={"assignee_id": CUSTOMER_B["sub"]})
    assert status == 422
    assert body["error"]["details"][0]["field"] == "assignee_id"


def test_agent_cannot_remove_own_admin_role(aws):
    status, body = api("PATCH", f"/api/users/{ADMIN['sub']}", user=ADMIN, body={"role": "Agent"})
    assert status == 409


def test_user_without_group_is_a_customer(aws):
    status, body = api("GET", "/api/me", user=NO_GROUP)
    assert status == 200
    assert body["role"] == "Customer"


def test_group_claim_text_is_parsed():
    assert auth.groups_from_claim("[Admin Agent]") == ["Admin", "Agent"]
    assert auth.groups_from_claim(["Agent"]) == ["Agent"]
    assert auth.groups_from_claim(None) == []


@pytest.mark.parametrize("groups,expected", [
    (["Customer", "Agent"], "Agent"),
    (["Agent", "Admin"], "Admin"),
    (["Unknown"], "Customer"),
    ([], "Customer"),
])
def test_highest_role_wins(groups, expected):
    assert auth.role_from_groups(groups) == expected


def test_me_reports_role_and_identity(aws):
    status, body = api("GET", "/api/me", user=ADMIN)
    assert status == 200
    assert body == {"sub": ADMIN["sub"], "email": ADMIN["email"], "name": ADMIN["name"], "role": "Admin"}


def test_customer_thread_hides_internal_notes_and_events(aws):
    ticket = make_ticket(CUSTOMER_A)
    api("PATCH", f"/api/tickets/{ticket['id']}", user=AGENT, body={"priority": "High"})
    api("POST", f"/api/tickets/{ticket['id']}/comments", user=AGENT,
        body={"body": "Checking with facilities.", "visibility": "internal"})
    api("POST", f"/api/tickets/{ticket['id']}/comments", user=AGENT, body={"body": "We are on it."})

    _, as_customer = api("GET", f"/api/tickets/{ticket['id']}", user=CUSTOMER_A)
    assert [c["body"] for c in as_customer["comments"]] == ["We are on it."]
    assert all(e["visibility"] == "public" for e in as_customer["timeline"])
    assert "priority_changed" not in [e["event_type"] for e in as_customer["timeline"]]

    _, as_agent = api("GET", f"/api/tickets/{ticket['id']}", user=AGENT)
    assert len(as_agent["comments"]) == 2
    assert "priority_changed" in [e["event_type"] for e in as_agent["timeline"]]


def test_staff_only_fields_are_hidden_from_customers(aws):
    ticket = make_ticket(CUSTOMER_A)
    api("PATCH", f"/api/tickets/{ticket['id']}", user=AGENT, body={"assignee_id": AGENT["sub"]})
    _, as_customer = api("GET", f"/api/tickets/{ticket['id']}", user=CUSTOMER_A)
    assert "assignee_id" not in as_customer
    assert "suggested_reply" not in as_customer
    assert "triage_error" not in as_customer
    _, as_agent = api("GET", f"/api/tickets/{ticket['id']}", user=AGENT)
    assert as_agent["assignee_id"] == AGENT["sub"]


def test_local_mode_is_refused_inside_lambda(aws, monkeypatch):
    monkeypatch.setenv("AUTH_MODE", "local")
    monkeypatch.setenv("AWS_LAMBDA_FUNCTION_NAME", "helpdesk-pro-prod-api")
    with pytest.raises(ConfigError):
        config.load_api()


def test_second_agent_reassignment_records_event(aws):
    api("GET", "/api/me", user=AGENT_2)  # assignees must have signed in once (the user cache row)
    ticket = make_ticket(CUSTOMER_A)
    api("PATCH", f"/api/tickets/{ticket['id']}", user=AGENT, body={"assignee_id": AGENT["sub"]})
    api("PATCH", f"/api/tickets/{ticket['id']}", user=AGENT, body={"assignee_id": AGENT_2["sub"]})
    _, body = api("GET", f"/api/tickets/{ticket['id']}", user=AGENT)
    assigned = [e["text"] for e in body["timeline"] if e["event_type"] == "assigned"]
    assert assigned[-2:] == [f"Assigned to {AGENT['name']}", f"Assigned to {AGENT_2['name']}"]


def test_demotion_signs_the_user_out_after_the_group_change(aws, monkeypatch):
    fake = FakeCognito()
    monkeypatch.setattr(users, "_cognito", fake)
    api("GET", "/api/me", user=AGENT)  # creates the cache row
    status, body = api("PATCH", f"/api/users/{AGENT['sub']}", user=ADMIN, body={"role": "Customer"})
    assert status == 200
    assert body["role"] == "Customer"
    assert fake.names()[-1] == "admin_user_global_sign_out"
    assert fake.calls[-1][1] == {"UserPoolId": POOL_ID, "Username": "priya-raman"}


def test_promotion_does_not_sign_the_user_out(aws, monkeypatch):
    fake = FakeCognito(groups=("Customer",))
    monkeypatch.setattr(users, "_cognito", fake)
    api("GET", "/api/me", user=CUSTOMER_A)
    status, _ = api("PATCH", f"/api/users/{CUSTOMER_A['sub']}", user=ADMIN, body={"role": "Agent"})
    assert status == 200
    assert "admin_user_global_sign_out" not in fake.names()


def test_a_failed_sign_out_is_logged_and_the_demotion_stands(aws, monkeypatch, caplog):
    error = ClientError({"Error": {"Code": "InternalErrorException", "Message": "boom"}}, "AdminUserGlobalSignOut")
    monkeypatch.setattr(users, "_cognito", FakeCognito(sign_out_error=error))
    api("GET", "/api/me", user=AGENT)
    status, body = api("PATCH", f"/api/users/{AGENT['sub']}", user=ADMIN, body={"role": "Customer"})
    assert status == 200
    assert body["role"] == "Customer"
    status, users_body = api("GET", "/api/users", user=ADMIN)
    assert [u["role"] for u in users_body["items"] if u["user_id"] == AGENT["sub"]] == ["Customer"]
    assert "Cognito sign-out failed" in caplog.text


def test_local_mode_role_change_makes_no_cognito_calls(local_mode, monkeypatch):
    fake = FakeCognito()
    monkeypatch.setattr(users, "_cognito", fake)
    dana, priya = auth.LOCAL_USERS[0], auth.LOCAL_USERS[1]
    call(dev_event("GET", "/api/me", user=priya))
    status, body = call(dev_event("PATCH", f"/api/users/{priya['sub']}", user=dana, body={"role": "Customer"}))
    assert status == 200
    assert body["role"] == "Customer"
    assert fake.calls == []
