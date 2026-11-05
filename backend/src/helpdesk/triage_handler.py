"""Triage Lambda entry point (SQS batch, one message per invocation).

A message that cannot be parsed is logged and dropped: it would never succeed. A message that fails for any
other reason is returned as a batch item failure, so SQS retries it and then moves it to the DLQ.
"""
import json
import logging

from helpdesk import config, triage
from helpdesk.store import get_store

log = logging.getLogger(__name__)


def handler(event, context):
    cfg = config.load_triage()
    store = get_store(cfg)
    failures = []
    for record in event.get("Records", []):
        message_id = record.get("messageId", "")
        try:
            ticket_id = json.loads(record["body"])["ticket_id"]
            if not isinstance(ticket_id, str) or not ticket_id:
                raise ValueError("ticket_id must be a non-empty string")
        except (KeyError, TypeError, ValueError):
            log.error("dropping malformed triage message %s", message_id)
            continue
        try:
            outcome = triage.process(store, cfg, ticket_id)
            log.info("triage %s: %s", ticket_id, outcome)
        except Exception:
            log.exception("triage failed for %s", ticket_id)
            failures.append({"itemIdentifier": message_id})
    return {"batchItemFailures": failures}
