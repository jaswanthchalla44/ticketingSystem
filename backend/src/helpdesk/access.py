"""Who may see or change a ticket. Other customers' tickets look like missing ones (404), not forbidden."""
from helpdesk.errors import Forbidden, NotFound
from helpdesk.validation import is_uuid


def can_view(principal, item):
    return principal.is_staff or item.get("requester_sub") == principal.sub


def load_visible(store, principal, ticket_id):
    if not is_uuid(ticket_id):
        raise NotFound("ticket not found")
    item = store.get_ticket(ticket_id)
    if item is None or not can_view(principal, item):
        raise NotFound("ticket not found")
    return item


def require_staff(principal):
    if not principal.is_staff:
        raise Forbidden("only agents and admins can do this")
