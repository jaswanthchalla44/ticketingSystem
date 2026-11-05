"""Ticket lists, paging, filters, status and assignment changes, and first-response tracking."""
from helpdesk import notify
from support import AGENT, CUSTOMER_A, CUSTOMER_B, api, make_ticket


def _drain(path_query, user):
    """Follows next_cursor until it runs out. Returns every ticket id seen, in order."""
    seen, cursor = [], None
    for _ in range(100):
        query = dict(path_query)
        if cursor:
            query["cursor"] = cursor
        status, body = api("GET", "/api/tickets", user=user, query=query)
        assert status == 200, body
        seen.extend(item["id"] for item in body["items"])
        cursor = body["next_cursor"]
        if not cursor:
            return seen
    raise AssertionError("cursor never ended")


def test_paging_visits_every_ticket_once_across_statuses(aws):
    created = [make_ticket(CUSTOMER_A, title=f"Paging check ticket {n:02d}") for n in range(12)]
    # Spread the tickets over every status so the agent view has to merge four partitions.
    statuses = ["New", "In Progress", "Waiting", "Resolved"]
    for n, ticket in enumerate(created):
        api("PATCH", f"/api/tickets/{ticket['id']}", user=AGENT, body={"status": statuses[n % 4]})

    seen = _drain({"limit": "3"}, AGENT)
    assert len(seen) == len(set(seen)) == 12
    assert set(seen) == {t["id"] for t in created}


def test_paging_for_a_customer_covers_only_their_tickets(aws):
    mine = [make_ticket(CUSTOMER_A, title=f"Customer paging {n:02d}") for n in range(5)]
    make_ticket(CUSTOMER_B, title="Someone else entirely")
    seen = _drain({"limit": "2"}, CUSTOMER_A)
    assert set(seen) == {t["id"] for t in mine}


def test_status_filter_and_mine_filter(aws):
    first = make_ticket(CUSTOMER_A, title="Filter check, resolved one")
    make_ticket(CUSTOMER_A, title="Filter check, still new")
    api("PATCH", f"/api/tickets/{first['id']}", user=AGENT,
        body={"status": "Resolved", "assignee_id": AGENT["sub"]})

    _, resolved = api("GET", "/api/tickets", user=AGENT, query={"status": "Resolved"})
    assert [t["id"] for t in resolved["items"]] == [first["id"]]

    _, mine = api("GET", "/api/tickets", user=AGENT, query={"mine": "true"})
    assert [t["id"] for t in mine["items"]] == [first["id"]]


def test_category_priority_and_text_filters(aws):
    hardware = make_ticket(CUSTOMER_A, title="Keyboard keys stick", category="Hardware")
    make_ticket(CUSTOMER_A, title="Invoice amount is wrong", description="Please check the invoice total.",
                category="Billing")

    _, by_category = api("GET", "/api/tickets", user=AGENT, query={"category": "Hardware"})
    assert [t["id"] for t in by_category["items"]] == [hardware["id"]]

    _, by_text = api("GET", "/api/tickets", user=AGENT, query={"q": "KEYBOARD"})
    assert [t["id"] for t in by_text["items"]] == [hardware["id"]]


def test_status_change_sets_and_clears_resolved_at(aws):
    ticket = make_ticket(CUSTOMER_A)
    _, resolved = api("PATCH", f"/api/tickets/{ticket['id']}", user=AGENT, body={"status": "Resolved"})
    assert resolved["resolved_at"]
    _, reopened = api("PATCH", f"/api/tickets/{ticket['id']}", user=AGENT, body={"status": "In Progress"})
    assert "resolved_at" not in reopened


def test_each_change_writes_a_timeline_event(aws):
    ticket = make_ticket(CUSTOMER_A)
    api("PATCH", f"/api/tickets/{ticket['id']}", user=AGENT,
        body={"status": "Waiting", "priority": "High", "category": "Network", "assignee_id": AGENT["sub"]})
    _, detail = api("GET", f"/api/tickets/{ticket['id']}", user=AGENT)
    texts = [e["text"] for e in detail["timeline"]]
    assert "Status changed from New to Waiting" in texts
    assert "Priority changed from Medium to High" in texts
    assert "Category changed from Hardware to Network" in texts
    assert f"Assigned to {AGENT['name']}" in texts


def test_patch_with_nothing_to_change_is_rejected(aws):
    ticket = make_ticket(CUSTOMER_A)
    status, body = api("PATCH", f"/api/tickets/{ticket['id']}", user=AGENT, body={})
    assert status == 422
    assert body["error"]["details"][0]["field"] == "body"


def test_unassigning_clears_the_assignee(aws):
    ticket = make_ticket(CUSTOMER_A)
    api("PATCH", f"/api/tickets/{ticket['id']}", user=AGENT, body={"assignee_id": AGENT["sub"]})
    _, body = api("PATCH", f"/api/tickets/{ticket['id']}", user=AGENT, body={"assignee_id": None})
    assert "assignee_id" not in body
    assert "assignee_name" not in body


def test_first_public_staff_reply_sets_first_response_once(aws):
    ticket = make_ticket(CUSTOMER_A)
    api("POST", f"/api/tickets/{ticket['id']}/comments", user=CUSTOMER_A, body={"body": "Any update?"})
    api("POST", f"/api/tickets/{ticket['id']}/comments", user=AGENT, body={"body": "Internal only", "visibility": "internal"})
    _, body = api("GET", f"/api/tickets/{ticket['id']}", user=AGENT)
    assert "first_response_at" not in body

    api("POST", f"/api/tickets/{ticket['id']}/comments", user=AGENT, body={"body": "Looking into it."})
    _, first = api("GET", f"/api/tickets/{ticket['id']}", user=AGENT)
    stamp = first["first_response_at"]
    api("POST", f"/api/tickets/{ticket['id']}/comments", user=AGENT, body={"body": "Still looking."})
    _, second = api("GET", f"/api/tickets/{ticket['id']}", user=AGENT)
    assert second["first_response_at"] == stamp


def test_a_failed_notification_does_not_fail_the_request(aws, monkeypatch):
    class BrokenSns:
        def publish(self, **kwargs):
            raise RuntimeError("SNS is down")

    monkeypatch.setattr(notify, "_client", BrokenSns())
    ticket = make_ticket(CUSTOMER_A)
    status, body = api("PATCH", f"/api/tickets/{ticket['id']}", user=AGENT, body={"assignee_id": AGENT["sub"]})
    assert status == 200
    assert body["assignee_id"] == AGENT["sub"]
    status, _ = api("POST", f"/api/tickets/{ticket['id']}/comments", user=AGENT, body={"body": "Public reply here."})
    assert status == 201


def test_new_ticket_is_queued_for_triage(aws):
    import json
    import boto3

    make_ticket(CUSTOMER_A)
    sqs = boto3.client("sqs", region_name="us-east-1")
    messages = sqs.receive_message(QueueUrl=aws["queue_url"], MaxNumberOfMessages=10).get("Messages", [])
    assert len(messages) == 1
    assert json.loads(messages[0]["Body"])["ticket_id"]


def test_ticket_create_returns_pending_triage(aws):
    ticket = make_ticket(CUSTOMER_A)
    assert ticket["status"] == "New"
    assert ticket["category_requested"] == ticket["category"] == "Hardware"
    assert "triage_source" not in ticket
