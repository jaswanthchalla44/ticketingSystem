"""Comments and the ticket timeline. Customers see public comments and public events only."""
from helpdesk import notify
from helpdesk.access import load_visible
from helpdesk.errors import Forbidden
from helpdesk.model import COMMENT_MAX, VISIBILITIES
from helpdesk.timeutil import new_id, now_iso
from helpdesk.validation import Validator


def add(store, cfg, principal, ticket_id, data):
    item = load_visible(store, principal, ticket_id)
    v = Validator(data)
    body = v.text("body", min_len=1, max_len=COMMENT_MAX)
    visibility = v.choice("visibility", VISIBILITIES, required=False) or "public"
    v.check()
    if visibility == "internal" and not principal.is_staff:
        raise Forbidden("only agents and admins can write internal notes")

    stamp = now_iso()
    comment = {
        "ticket_id": ticket_id,
        "sort_key": f"comment#{stamp}#{new_id()}",
        "kind": "comment",
        "visibility": visibility,
        "body": body,
        "author_sub": principal.sub,
        "author_name": principal.name,
        "author_role": principal.role,
        "created_at": stamp,
    }
    store.put_comment(comment)

    changes = {"updated_at": stamp}
    first_response = visibility == "public" and principal.is_staff and not item.get("first_response_at")
    if first_response:
        changes["first_response_at"] = stamp
    store.update_ticket(ticket_id, changes)

    if visibility == "public":
        # A staff reply notifies the requester; a customer reply notifies the assignee.
        recipient = item.get("requester_sub") if principal.is_staff else item.get("assignee_id")
        notify.publish(cfg.ticket_events_topic_arn, "ticket_replied", ticket_id, item["title"], principal.name,
                       recipient)
    return _comment_view(comment)


def thread(store, principal, ticket_id):
    """Comments and timeline for one ticket, filtered by what the caller may see."""
    comment_views, timeline_views = [], []
    for row in store.timeline(ticket_id):
        if not principal.is_staff and row.get("visibility") != "public":
            continue
        if row.get("kind") == "comment":
            comment_views.append(_comment_view(row))
        else:
            timeline_views.append(_event_view(row))
    return {"comments": comment_views, "timeline": timeline_views}


def _comment_view(row):
    return {
        "id": row["sort_key"],
        "visibility": row["visibility"],
        "body": row["body"],
        "author_name": row["author_name"],
        "author_role": row["author_role"],
        "created_at": row["created_at"],
    }


def _event_view(row):
    return {
        "id": row["sort_key"],
        "event_type": row["event_type"],
        "text": row["text"],
        "visibility": row["visibility"],
        "actor_name": row["actor_name"],
        "created_at": row["created_at"],
    }

