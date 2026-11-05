"""Seed data: 4 agents, 1 admin, 5 customers and 25 tickets, with comments and timeline events.

Idempotent. Ids are uuid5 from fixed names and timestamps are fixed, so a second run rewrites the same items.
The local server runs seed() after it creates the local tables. Against real tables, run this script with
TABLE_* set, and only with the person's approval.
"""
import os
import sys
import uuid
from datetime import datetime, timedelta, timezone
from itertools import count

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

from helpdesk import auth, config, triage_rules  # noqa: E402
from helpdesk.model import ROLE_AGENT, ROLE_CUSTOMER  # noqa: E402
from helpdesk.store import Store  # noqa: E402
from helpdesk.timeutil import format_iso  # noqa: E402

# Fixed "now" for the seed, so the data is the same on every run.
NOW = datetime(2026, 11, 5, 9, 0, tzinfo=timezone.utc)
SEED_NAMESPACE = uuid.UUID("6f1c3a2e-6b7d-4d5e-9a57-2f0c9e1b8d10")

# (title, description, requested category, status, customer index, agent index or None, hours ago, first reply minutes)
SEED_TICKETS = [
    ("Cannot log in after password reset", "I reset my password this morning but the sign-in page keeps saying the password is wrong. I have tried three times.", "Login/Access", "In Progress", 0, 0, 5, 20),
    ("Outlook keeps asking for my password", "Outlook asks for my password every few minutes on my laptop. The webmail works fine, so the account itself is fine.", "Email", "Waiting", 1, 1, 30, 45),
    ("VPN drops every 10 minutes", "The VPN disconnects roughly every ten minutes when I work from home. Reconnecting takes a while and I lose unsaved work. This is slowing me down a lot.", "Network", "In Progress", 2, 0, 3, 15),
    ("Printer on 3rd floor is offline", "The printer on the third floor shows offline for everyone in our team. Jobs queue and never print. Several people are affected.", "Hardware", "New", 3, None, 2, None),
    ("Excel crashes when opening large file", "Excel crashes every time I open the quarterly forecast workbook. The error message says it has stopped working. The file was fine last week.", "Software", "Resolved", 4, 2, 72, 60),
    ("Invoice for March shows wrong amount", "The invoice INV-20341 is charged at 1,250 but the contract says 1,025. Can someone check the price and send a corrected receipt?", "Billing", "Resolved", 0, 3, 120, 240),
    ("New laptop needs software installed", "My new laptop arrived yesterday. Please install the standard design suite and the VPN client. Thanks in advance!", "Software", "Resolved", 1, 2, 96, 90),
    ("Shared mailbox not showing in Outlook", "The support shared mailbox does not appear in my Outlook. My colleagues can see it. I need it to reply to customers today.", "Email", "In Progress", 2, 1, 8, 35),
    ("Wi-Fi drops in meeting room B", "The Wi-Fi in meeting room B keeps dropping during calls. It is broken every time we have a client meeting. Really frustrating.", "Network", "New", 3, None, 1, None),
    ("Account locked after too many attempts", "My account is locked out after a few failed logins. I need access urgently for a deadline tomorrow.", "Login/Access", "In Progress", 4, 0, 4, 10),
    ("Monitor flickers and goes black", "My second monitor flickers and turns black every hour or so. I have already replaced the cable.", "Hardware", "Waiting", 0, 2, 50, 120),
    ("Please add me to the design distribution list", "Could you add me to the design-team distribution list? Thank you.", "Email", "Resolved", 1, 3, 150, 30),
    ("Teams meetings lag and freeze", "Microsoft Teams video freezes during calls. The audio cuts out and it gets worse each week. Is there a known issue?", "Software", "New", 2, None, 6, None),
    ("Charged twice for the software subscription", "I was billed twice for the subscription this month. One charge is for last month. Please refund the duplicate.", "Billing", "New", 3, None, 9, None),
    ("Cannot access the HR portal", "Access denied when I open the HR portal. I can reach other intranet pages. Thanks for your help.", "Login/Access", "Resolved", 4, 1, 200, 50),
    ("Ransomware warning on finance share", "A warning popped up on the finance share saying files are encrypted. Several colleagues have the same problem. Possible security breach, please act now.", "Other", "In Progress", 0, 0, 0.5, 5),
    ("Screen resolution resets after reboot", "After every restart the display resolution goes back to the default and the text looks blurry.", "Hardware", "Resolved", 1, 2, 240, 300),
    ("Browser extension blocked by policy", "The company browser blocks my password manager extension. I need it to log in to client systems.", "Software", "Waiting", 2, 3, 26, 60),
    ("Email signature is missing after update", "After the latest update my email signature disappeared from new messages. Replies still show it.", "Email", "Resolved", 3, 1, 180, 100),
    ("Cannot connect to office Wi-Fi from home laptop", "My home laptop cannot connect to the office network. The internet works but the VPN fails with a connection error.", "Network", "In Progress", 4, 2, 12, 80),
    ("Request for a second 2FA device", "I lost my phone and need to register a new device for two-factor authentication. Please help me set it up.", "Login/Access", "Waiting", 0, 3, 36, 40),
    ("Refund request for conference ticket", "I paid for a conference ticket that I cannot attend. Could you check whether the purchase order allows a refund?", "Billing", "New", 1, None, 3, None),
    ("Keyboard keys stick on laptop", "Several keys on my laptop keyboard stick and sometimes repeat. It is getting frustrating.", "Hardware", "Resolved", 2, 0, 300, 180),
    ("Application license expired", "The design software says the license has expired even though we renewed it last week. Our team cannot work until this is fixed.", "Software", "In Progress", 3, 1, 7, 25),
    ("Thank you for the quick fix", "Thanks for fixing my password issue so fast. Everything works now, I appreciate the help!", "Login/Access", "Resolved", 4, 0, 400, 15),
]

REPLY_BY_STATUS = {
    "In Progress": "Thanks for the details. We are working on this now and will update you soon.",
    "Waiting": "We need a little more information before we can continue. Could you let us know?",
    "Resolved": "This should be fixed now. Please let us know if it happens again.",
}


def seed_id(name):
    return str(uuid.uuid5(SEED_NAMESPACE, name))


def seed(store):
    """Writes the seed users, tickets, comments and events. Returns the number of tickets written."""
    for user in auth.LOCAL_USERS:
        store.put_user({
            "user_id": user["sub"],
            "email": user["email"],
            "name": user["name"],
            "role": user["role"],
            "created_at": format_iso(NOW - timedelta(days=30)),
            "updated_at": format_iso(NOW),
        })
    customers = [u for u in auth.LOCAL_USERS if u["role"] == ROLE_CUSTOMER]
    agents = [u for u in auth.LOCAL_USERS if u["role"] == ROLE_AGENT]
    manager = auth.LOCAL_USERS[0]
    for number, spec in enumerate(SEED_TICKETS, start=1):
        _write_ticket(store, number, spec, customers, agents, manager)
    return len(SEED_TICKETS)


def _write_ticket(store, number, spec, customers, agents, manager):
    title, description, requested_category, status, customer_index, agent_index, hours, reply_minutes = spec
    requester = customers[customer_index]
    assignee = agents[agent_index] if agent_index is not None else None
    created = NOW - timedelta(hours=hours)
    ticket_id = seed_id(f"ticket-{number:02d}")
    stamps = [created]
    rows = []
    sequence = count(1)

    def row(moment, kind, actor, visibility, **fields):
        key = seed_id(f"{ticket_id}:{next(sequence)}")
        stamps.append(moment)
        prefix = "event" if kind == "event" else "comment"
        rows.append({
            "ticket_id": ticket_id,
            "sort_key": f"{prefix}#{format_iso(moment)}#{key}",
            "kind": kind,
            "visibility": visibility,
            "created_at": format_iso(moment),
            "actor_name": actor["name"],
            "actor_sub": actor["sub"],
            **fields,
        })

    row(created, "event", requester, "public", event_type="ticket_created", text="Ticket created",
        actor_name=requester["name"])
    if assignee:
        row(created + timedelta(minutes=5), "event", manager, "internal", event_type="assigned",
            text=f"Assigned to {assignee['name']}")
    if status != "New":
        row(created + timedelta(minutes=30), "event", manager, "public", event_type="status_changed",
            text=f"Status changed from New to {status}")
    resolved_at = None
    if reply_minutes and assignee:
        reply_at = created + timedelta(minutes=reply_minutes)
        row(reply_at, "comment", assignee, "public", body=REPLY_BY_STATUS.get(status, REPLY_BY_STATUS["In Progress"]),
            author_role=ROLE_AGENT, author_name=assignee["name"])
        row(reply_at + timedelta(minutes=10), "comment", assignee, "internal",
            body="Checked the known issues list. Nothing matching yet.", author_role=ROLE_AGENT,
            author_name=assignee["name"])
    if status == "Resolved":
        resolved_at = max(stamps)

    fields = triage_rules.apply(title, description, requester["name"])
    item = {
        "id": ticket_id,
        "title": title,
        "description": description,
        **fields,
        "category_requested": requested_category,
        "status": status,
        "requester_sub": requester["sub"],
        "requester_email": requester["email"],
        "requester_name": requester["name"],
        "attachments": [],
        "triage_source": "rules",
        "triage_model": None,
        "triaged_at": format_iso(created + timedelta(minutes=1)),
        "created_at": format_iso(created),
        "updated_at": format_iso(max(stamps)),
    }
    if assignee:
        item["assignee_id"] = assignee["sub"]
        item["assignee_name"] = assignee["name"]
    if reply_minutes and assignee:
        item["first_response_at"] = format_iso(created + timedelta(minutes=reply_minutes))
    if resolved_at:
        item["resolved_at"] = format_iso(resolved_at)

    store.put_ticket(item)
    for entry in rows:
        store.put_comment(entry)


def main():
    names = config.load_tables()
    store = Store(names.tickets_table, names.comments_table, names.users_table)
    print(f"seeded {seed(store)} tickets")


if __name__ == "__main__":
    main()
