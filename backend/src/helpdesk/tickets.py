"""Ticket rules: creation, listing scoped by role, the staff update, and the timeline each change leaves."""
import base64
import json
from collections import Counter, namedtuple

from helpdesk import attachments, comments, events, model, notify, tables, triage, users
from helpdesk.access import load_visible, require_staff
from helpdesk.timeutil import now_iso, new_id
from helpdesk.validation import Validator, invalid

# Fields a customer never sees: the AI reply draft, the AI failure reason and the staff-only assignee id.
# triage_source and triage_model are shown to everyone, so a customer can see whether AI or rules triaged the ticket.
STAFF_ONLY_FIELDS = ("suggested_reply", "triage_error", "assignee_id")
# Internal bookkeeping for presigned uploads. Storage keys are never returned (see docs/API.md attachments).
INTERNAL_FIELDS = ("pending_uploads", "presign_total")

# One query partition: an index, its hash attribute and value, and the attribute the index sorts by.
Partition = namedtuple("Partition", "name index hash_attr hash_value range_attr")


def ticket_view(item, principal):
    view = dict(item)
    for field in INTERNAL_FIELDS:
        view.pop(field, None)
    if not principal.is_staff:
        for field in STAFF_ONLY_FIELDS:
            view.pop(field, None)
    if "attachments" in view:
        view["attachments"] = [attachments.public_entry(entry) for entry in view["attachments"]]
    return view


def create(store, cfg, principal, data):
    v = Validator(data)
    title = v.text("title", min_len=model.TITLE_MIN, max_len=model.TITLE_MAX)
    description = v.text("description", min_len=model.DESCRIPTION_MIN, max_len=model.DESCRIPTION_MAX)
    category = v.choice("category", model.CATEGORIES)
    v.check()

    stamp = now_iso()
    item = {
        "id": new_id(),
        "title": title,
        "description": description,
        "category": category,
        "category_requested": category,
        "status": "New",
        "priority": "Medium",  # placeholder until triage sets the real one
        "requester_sub": principal.sub,
        "requester_email": principal.email,
        "requester_name": principal.name,
        "attachments": [],
        "created_at": stamp,
        "updated_at": stamp,
    }
    store.create_ticket(item)
    events.record(store, item["id"], "ticket_created", "Ticket created", actor=principal)
    triage.enqueue(store, cfg, item["id"])
    return ticket_view(item, principal)


def get(store, principal, ticket_id):
    item = load_visible(store, principal, ticket_id)
    view = ticket_view(item, principal)
    view.update(comments.thread(store, principal, ticket_id))
    return view


def list_tickets(store, principal, filters):
    partitions = _partitions(principal, filters)
    by_name = {partition.name: partition for partition in partitions}
    active = _decode_cursor(filters.cursor, by_name)

    fetched = {}
    for name, start in active.items():
        partition = by_name[name]
        items, last = store.query_tickets(partition.index, partition.hash_attr, partition.hash_value,
                                          filters.limit, start)
        fetched[name] = (items, last, start)

    # Merge the partitions newest first. Only what makes it onto the page counts as consumed, so the
    # cursor never skips a ticket.
    merged = sorted(
        ((name, item) for name, (items, _, _) in fetched.items() for item in items),
        key=lambda pair: (pair[1][by_name[pair[0]].range_attr], pair[1]["id"]),
        reverse=True,
    )
    matched, consumed = [], 0
    for position, (_, item) in enumerate(merged, start=1):
        consumed = position
        if _matches(item, filters):
            matched.append(item)
            if len(matched) == filters.limit:
                break
    taken = Counter(name for name, _ in merged[:consumed])

    next_positions = {}
    for name, (items, last, start) in fetched.items():
        done = taken[name]
        if done == len(items):
            if last:
                next_positions[name] = last
        else:
            next_positions[name] = _key_of(items[done - 1], by_name[name]) if done else start

    return {
        "items": [ticket_view(item, principal) for item in matched],
        "next_cursor": _encode_cursor(next_positions) if next_positions else None,
    }


def update(store, cfg, principal, ticket_id, data):
    require_staff(principal)
    item = load_visible(store, principal, ticket_id)
    v = Validator(data)
    status = v.choice("status", model.STATUSES, required=False)
    priority = v.choice("priority", model.PRIORITIES, required=False)
    category = v.choice("category", model.CATEGORIES, required=False)
    assignee_present = "assignee_id" in data
    assignee_id = data.get("assignee_id")
    if assignee_present and assignee_id is not None and not isinstance(assignee_id, str):
        v.fail("assignee_id", "must be an id or null")
    elif assignee_present and assignee_id is not None:
        v.uuid("assignee_id")
    if status is None and priority is None and category is None and not assignee_present:
        v.fail("body", "nothing to change")
    v.check()

    stamp = now_iso()
    changes, removals, pending = {}, [], []
    if status and status != item["status"]:
        changes["status"] = status
        if status == "Resolved":
            changes["resolved_at"] = stamp
        else:
            removals.append("resolved_at")
        pending.append(("status_changed", f"Status changed from {item['status']} to {status}", None))
    if priority and priority != item["priority"]:
        changes["priority"] = priority
        pending.append(("priority_changed", f"Priority changed from {item['priority']} to {priority}", "internal"))
    if category and category != item["category"]:
        changes["category"] = category
        pending.append(("category_changed", f"Category changed from {item['category']} to {category}", "internal"))

    new_assignee = None
    if assignee_present and assignee_id != item.get("assignee_id"):
        if assignee_id is None:
            removals.extend(["assignee_id", "assignee_name"])
            pending.append(("assigned", "Unassigned", "internal"))
        else:
            new_assignee = users.staff_profile(store, assignee_id)
            changes["assignee_id"] = assignee_id
            changes["assignee_name"] = new_assignee["name"]
            pending.append(("assigned", f"Assigned to {new_assignee['name']}", "internal"))

    if not changes and not removals:
        return ticket_view(item, principal)

    changes["updated_at"] = stamp
    updated = store.update_ticket(ticket_id, changes, removals)
    for event_type, text, visibility in pending:
        events.record(store, ticket_id, event_type, text, actor=principal, visibility=visibility)
    if new_assignee:
        notify.publish(cfg.ticket_events_topic_arn, "ticket_assigned", ticket_id, item["title"], principal.name,
                       assignee_id)
    return ticket_view(updated, principal)


def _partitions(principal, f):
    if not principal.is_staff:
        return [_by_requester(principal.sub)]
    if f.assignee or f.mine:
        return [_by_assignee(f.assignee or principal.sub)]
    if f.status:
        return [_by_status(f.status)]
    return [_by_status(status) for status in model.STATUSES]


def _by_requester(sub):
    return Partition(f"{tables.BY_REQUESTER}:{sub}", tables.BY_REQUESTER, "requester_sub", sub, "created_at")


def _by_assignee(sub):
    return Partition(f"{tables.BY_ASSIGNEE}:{sub}", tables.BY_ASSIGNEE, "assignee_id", sub, "updated_at")


def _by_status(status):
    return Partition(f"{tables.BY_STATUS}:{status}", tables.BY_STATUS, "status", status, "updated_at")


def _matches(item, f):
    if f.status and item.get("status") != f.status:
        return False
    if f.priority and item.get("priority") != f.priority:
        return False
    if f.category and item.get("category") != f.category:
        return False
    if f.assignee and item.get("assignee_id") != f.assignee:
        return False
    if f.q:
        haystack = f"{item.get('id', '')} {item.get('title', '')} {item.get('description', '')}".lower()
        if f.q.lower() not in haystack:
            return False
    return True


def _key_of(item, partition):
    return {"id": item["id"], partition.hash_attr: item[partition.hash_attr],
            partition.range_attr: item[partition.range_attr]}


def _encode_cursor(positions):
    raw = json.dumps(positions, separators=(",", ":"), sort_keys=True).encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _decode_cursor(token, by_name):
    """Maps each partition still to read to its start key (None means from the beginning)."""
    if not token:
        return {name: None for name in by_name}
    try:
        padded = token + "=" * (-len(token) % 4)
        positions = json.loads(base64.urlsafe_b64decode(padded.encode("ascii")).decode("utf-8"))
    except (ValueError, TypeError):
        raise invalid("cursor", "is not valid") from None
    if not isinstance(positions, dict) or not set(positions) <= set(by_name):
        raise invalid("cursor", "does not match these filters")
    if any(value is not None and not isinstance(value, dict) for value in positions.values()):
        raise invalid("cursor", "is not valid")
    return positions

