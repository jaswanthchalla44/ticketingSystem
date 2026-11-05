"""Dashboard math, seed idempotency, and the full local-mode flow (presign through PUT, confirm and GET)."""
import boto3
import pytest

from helpdesk import auth, metrics, tables
from helpdesk.store import get_store
from support import ADMIN, AGENT, CUSTOMER_A, api, dev_event, call, make_ticket
from helpdesk import config

import seed as seed_module


# Dashboard math on fixed rows

ROWS = [
    {"id": "1", "status": "New", "category": "Email", "assignee_id": None,
     "created_at": "2026-11-01T10:00:00.000000Z", "first_response_at": None},
    {"id": "2", "status": "In Progress", "category": "Network", "assignee_id": "a1", "assignee_name": "Ada",
     "created_at": "2026-11-01T10:00:00.000000Z", "first_response_at": "2026-11-01T10:30:00.000000Z"},
    {"id": "3", "status": "Resolved", "category": "Network", "assignee_id": "a1", "assignee_name": "Ada",
     "created_at": "2026-11-02T08:00:00.000000Z", "first_response_at": "2026-11-02T10:00:00.000000Z"},
    {"id": "4", "status": "Waiting", "category": "Billing", "assignee_id": "a2", "assignee_name": "Ben",
     "created_at": "2026-11-03T08:00:00.000000Z", "first_response_at": None},
]


def test_counts_open_and_resolved_with_fixed_rows():
    result = metrics.compute(ROWS)
    assert result["total"] == 4
    assert result["open"] == 3
    assert result["resolved"] == 1
    assert result["by_status"]["In Progress"] == 1
    assert result["by_category"]["Network"] == 2
    assert result["by_category"]["Hardware"] == 0


def test_tickets_per_agent_and_unassigned():
    result = metrics.compute(ROWS)
    assert result["unassigned"] == 1
    assert result["by_agent"][0] == {"agent_id": "a1", "agent_name": "Ada", "assigned": 2, "open": 1}
    assert result["by_agent"][1]["agent_name"] == "Ben"


def test_average_first_response_uses_only_answered_tickets():
    result = metrics.compute(ROWS)
    # 30 minutes (1800 s) and 2 hours (7200 s): the average is 4500 s.
    assert result["avg_first_response_seconds"] == 4500.0
    assert result["first_response_sample"] == 2


def test_no_answers_gives_null_average():
    assert metrics.compute([ROWS[0]])["avg_first_response_seconds"] is None


def test_dashboard_endpoint_computes_from_real_tickets(aws):
    ticket = make_ticket(CUSTOMER_A, category="Billing")
    api("PATCH", f"/api/tickets/{ticket['id']}", user=AGENT, body={"assignee_id": AGENT["sub"]})
    api("POST", f"/api/tickets/{ticket['id']}/comments", user=AGENT, body={"body": "Looking into it."})
    status, body = api("GET", "/api/dashboard", user=ADMIN)
    assert status == 200
    assert body["total"] == 1
    assert body["open"] == 1
    assert body["by_agent"][0]["agent_id"] == AGENT["sub"]
    assert body["first_response_sample"] == 1
    assert body["truncated"] is False


def test_dashboard_scan_stops_at_the_row_limit(aws):
    for n in range(3):
        make_ticket(CUSTOMER_A, title=f"Dashboard row limit {n}")
    store = get_store(config.load_api())
    rows, truncated = store.scan_tickets(2, metrics.PROJECTION)
    assert len(rows) == 2
    assert truncated is True


# Seed

def _count(table_name):
    client = boto3.client("dynamodb", region_name="us-east-1")
    return client.scan(TableName=table_name, Select="COUNT")["Count"]


def test_seed_is_idempotent_and_has_the_agreed_shape(aws):
    store = get_store(config.load_api())
    assert seed_module.seed(store) == 25
    first = (_count(tables.TICKETS_TABLE), _count(tables.COMMENTS_TABLE), _count(tables.USERS_TABLE))
    assert seed_module.seed(store) == 25
    second = (_count(tables.TICKETS_TABLE), _count(tables.COMMENTS_TABLE), _count(tables.USERS_TABLE))
    assert first == second
    assert first[0] == 25
    assert first[2] == len(auth.LOCAL_USERS) == 10


def test_seed_mixes_statuses_and_priorities(aws):
    store = get_store(config.load_api())
    seed_module.seed(store)
    rows, _ = store.scan_tickets(100, ("status", "priority", "triage_source", "assignee_id"))
    assert len({row["status"] for row in rows}) == 4
    assert len({row["priority"] for row in rows}) >= 3
    assert {row["triage_source"] for row in rows} == {"rules"}
    roles = [user["role"] for user in auth.LOCAL_USERS]
    assert roles.count("Agent") == 4
    assert roles.count("Customer") == 5


# Local mode, end to end, through the same handler

@pytest.fixture
def local(local_mode):
    store = get_store(config.load_api())
    seed_module.seed(store)
    return local_mode


def _as(user, method, path, **kwargs):
    return call(dev_event(method, path, user=user, **kwargs))


def test_local_flow_create_triage_upload_confirm_download(local):
    status, ticket = _as(auth.LOCAL_USERS[5], "POST", "/api/tickets",
                         body={"title": "Email not sending today", "description": "Outbound mail is stuck. Urgent deadline.",
                               "category": "Other"})
    assert status == 201
    # Local mode runs triage in-process, so the ticket is already triaged here.
    status, detail = _as(auth.LOCAL_USERS[1], "GET", f"/api/tickets/{ticket['id']}")  # an agent sees triage fields
    assert detail["triage_source"] == "rules"
    assert detail["category"] == "Email"
    assert detail["priority"] == "High"

    status, presigned = _as(auth.LOCAL_USERS[5], "POST", f"/api/tickets/{ticket['id']}/attachments/presign",
                            body={"filename": "error.png", "content_type": "image/png", "size": 13})
    assert status == 200
    assert presigned["upload_url"] == f"/api/_local/s3/{presigned['key']}"

    upload = dev_event("PUT", presigned["upload_url"], raw_body=b"\x89PNG-fake-png", user=None)
    upload["headers"]["content-type"] = "image/png"
    status, _ = call(upload)
    assert status == 200

    status, entry = _as(auth.LOCAL_USERS[5], "POST", f"/api/tickets/{ticket['id']}/attachments/confirm",
                        body={"key": presigned["key"]})
    assert status == 201

    status, link = _as(auth.LOCAL_USERS[5], "GET", f"/api/tickets/{ticket['id']}/attachments/{entry['id']}/url")
    assert status == 200
    status, raw = call(dev_event("GET", link["url"]))
    assert status == 200
    assert raw == b"\x89PNG-fake-png"


def test_local_role_change_applies_at_once(local):
    status, body = _as(ADMIN_LOCAL, "PATCH", f"/api/users/{auth.LOCAL_USERS[9]['sub']}", body={"role": "Agent"})
    assert status == 200
    assert body["role"] == "Agent"
    status, me = _as(auth.LOCAL_USERS[9], "GET", "/api/me")
    assert me["role"] == "Agent"


def test_local_routes_are_hidden_in_cognito_mode(aws):
    status, _ = call(dev_event("PUT", "/api/_local/s3/attachments/x/y", raw_body=b"x"))
    assert status == 404


def test_unknown_dev_user_is_unauthorized(local):
    status, body = call(dev_event("GET", "/api/tickets", user={"email": "nobody@example.test", "sub": "x"}))
    assert status == 401


def test_method_and_path_errors(aws):
    assert api("DELETE", "/api/tickets", user=CUSTOMER_A)[0] == 405
    assert api("GET", "/api/nothing-here", user=CUSTOMER_A)[0] == 404


ADMIN_LOCAL = auth.LOCAL_USERS[0]
