"""Dashboard numbers, computed from ticket rows. compute() is pure, so tests use fixed fixtures."""
from helpdesk.model import CATEGORIES, DASHBOARD_ROW_LIMIT, STATUSES
from helpdesk.timeutil import now_iso, parse_iso

PROJECTION = ("id", "status", "category", "assignee_id", "assignee_name", "created_at", "first_response_at")


def dashboard(store, row_limit=DASHBOARD_ROW_LIMIT):
    rows, truncated = store.scan_tickets(row_limit, PROJECTION)
    result = compute(rows)
    result.update({"generated_at": now_iso(), "truncated": truncated, "row_limit": row_limit})
    return result


def compute(rows):
    by_status = {status: 0 for status in STATUSES}
    by_category = {category: 0 for category in CATEGORIES}
    agents = {}
    unassigned = 0
    open_count = 0
    response_seconds = []

    for row in rows:
        status = row.get("status")
        by_status[status] = by_status.get(status, 0) + 1
        category = row.get("category") or "Other"
        by_category[category] = by_category.get(category, 0) + 1
        is_open = status != "Resolved"
        open_count += is_open

        agent_id = row.get("assignee_id")
        if agent_id is None:
            unassigned += 1
        else:
            entry = agents.setdefault(agent_id, {
                "agent_id": agent_id,
                "agent_name": row.get("assignee_name") or agent_id,
                "assigned": 0,
                "open": 0,
            })
            entry["assigned"] += 1
            entry["open"] += is_open

        if row.get("first_response_at") and row.get("created_at"):
            delta = parse_iso(row["first_response_at"]) - parse_iso(row["created_at"])
            response_seconds.append(delta.total_seconds())

    return {
        "total": len(rows),
        "open": open_count,
        "resolved": len(rows) - open_count,
        "by_status": by_status,
        "by_category": by_category,
        "by_agent": sorted(agents.values(), key=lambda agent: (-agent["assigned"], agent["agent_name"])),
        "unassigned": unassigned,
        "avg_first_response_seconds": round(sum(response_seconds) / len(response_seconds), 1) if response_seconds else None,
        "first_response_sample": len(response_seconds),
    }
