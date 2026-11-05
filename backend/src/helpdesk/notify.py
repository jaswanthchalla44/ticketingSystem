"""Ticket notifications on the SNS topic. A failed publish is logged and never fails the user's request."""
import json
import logging

import boto3

log = logging.getLogger(__name__)
_client = None


def publish(topic_arn, event_type, ticket_id, title, actor_name, recipient_sub=None):
    if not topic_arn or topic_arn.startswith("local://"):
        log.info("notification %s for %s not sent (no topic)", event_type, ticket_id)
        return
    if not recipient_sub:
        return
    message = {
        "type": event_type,
        "ticket_id": ticket_id,
        "title": title,
        "actor": actor_name,
        "recipient_sub": recipient_sub,
    }
    try:
        _sns().publish(
            TopicArn=topic_arn,
            Message=json.dumps(message),
            MessageAttributes={
                "type": {"DataType": "String", "StringValue": event_type},
                "recipient_sub": {"DataType": "String", "StringValue": recipient_sub},
            },
        )
    except Exception:
        log.exception("notification %s for %s failed; the request continues", event_type, ticket_id)


def _sns():
    global _client
    if _client is None:
        _client = boto3.client("sns")
    return _client
