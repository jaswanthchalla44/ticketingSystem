"""Timeline entries. They live in the comments table with sort_key "event#<timestamp>#<uuid>" and kind "event",
so one Query per ticket returns comments and events in order.
"""
from helpdesk.timeutil import new_id, now_iso

# Events a customer may see. Everything else is internal and hidden from customers.
PUBLIC_EVENTS = frozenset({"ticket_created", "status_changed", "attachment_added"})


def record(store, ticket_id, event_type, text, actor=None, visibility=None):
    stamp = now_iso()
    item = {
        "ticket_id": ticket_id,
        "sort_key": f"event#{stamp}#{new_id()}",
        "kind": "event",
        "event_type": event_type,
        "text": text,
        "visibility": visibility or ("public" if event_type in PUBLIC_EVENTS else "internal"),
        "actor_sub": actor.sub if actor else "system",
        "actor_name": actor.name if actor else "Triage",
        "created_at": stamp,
    }
    store.put_comment(item)
    return item
