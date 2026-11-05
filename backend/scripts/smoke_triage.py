"""Post-deploy smoke test: creates a ticket through the live API and waits for AI triage.

Environment:
  SMOKE_BASE_URL   the deployed site root, for example https://dxxxx.cloudfront.net (no trailing /api)
  SMOKE_ID_TOKEN   a Cognito ID token for a smoke-test customer. Never printed, never stored.

Exits 0 only when the ticket's triage_source is "ai". Standard library only, so the workflow needs no pip step.
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

POLL_SECONDS = 5
TIMEOUT_SECONDS = 240


def _require(name):
    value = os.environ.get(name, "").strip()
    if not value:
        print(f"smoke: missing environment variable {name}", file=sys.stderr)
        sys.exit(2)
    return value


def _call(method, url, token, payload=None):
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    request = urllib.request.Request(url, data=data, method=method)
    request.add_header("Authorization", f"Bearer {token}")
    if payload is not None:
        request.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return response.status, json.loads(response.read() or b"{}")
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read().decode("utf-8", "replace")[:300]


def main():
    base = _require("SMOKE_BASE_URL").rstrip("/")
    token = _require("SMOKE_ID_TOKEN")
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

    status, body = _call("POST", f"{base}/api/tickets", token, {
        "title": f"[smoke test] AI triage check {stamp}",
        "description": "Automated post-deploy check. The laptop will not connect to the office Wi-Fi after an update.",
        "category": "Network",
    })
    if status != 201:
        print(f"smoke: creating the ticket failed with HTTP {status}: {body}", file=sys.stderr)
        return 1
    ticket_id = body["id"]
    print(f"smoke: created ticket {ticket_id}, waiting for triage")

    deadline = time.monotonic() + TIMEOUT_SECONDS
    ticket = body
    while not ticket.get("triage_source") and time.monotonic() < deadline:
        time.sleep(POLL_SECONDS)
        status, ticket = _call("GET", f"{base}/api/tickets/{ticket_id}", token)
        if status != 200:
            print(f"smoke: reading the ticket failed with HTTP {status}: {ticket}", file=sys.stderr)
            return 1

    source = ticket.get("triage_source")
    if source == "ai":
        print(f"smoke: PASS, triage_source=ai, category={ticket.get('category')}, priority={ticket.get('priority')}")
        return 0
    if source is None:
        print("smoke: FAIL, triage did not finish in time", file=sys.stderr)
    else:
        print(f"smoke: FAIL, triage_source={source}, triage_error={ticket.get('triage_error')}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
