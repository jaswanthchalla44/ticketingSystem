import os
import sys

import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
sys.path.insert(0, os.path.join(HERE, "..", "scripts"))

import boto3  # noqa: E402

import local_aws  # noqa: E402
from helpdesk import attachments, notify, tables, triage, users  # noqa: E402
from helpdesk.store import reset_store  # noqa: E402
from support import TEST_ATTACHMENTS_BUCKET  # noqa: E402

REGION = "us-east-1"
POOL_ID = "us-east-1_TestPool"

BASE_ENV = {
    "AUTH_MODE": "cognito",
    "TABLE_TICKETS": tables.TICKETS_TABLE,
    "TABLE_COMMENTS": tables.COMMENTS_TABLE,
    "TABLE_USERS": tables.USERS_TABLE,
    "ATTACHMENTS_BUCKET": TEST_ATTACHMENTS_BUCKET,
    "SIGNED_URL_TTL_SECONDS": "300",
    "MAX_UPLOAD_BYTES": "5242880",
    "TRIAGE_MODE": "keyword",
    "ANTHROPIC_MODEL": "claude-haiku-5-5",
    "ANTHROPIC_TIMEOUT_SECONDS": "8",
    "ANTHROPIC_SECRET_ID": "helpdesk-pro-prod-anthropic-key",
}


def _reset_clients():
    reset_store()
    notify._client = None
    users._cognito = None
    attachments._s3_client = None
    triage._api_key = None


@pytest.fixture
def aws(monkeypatch):
    """Moto with the real table layout, an attachments bucket, a triage queue and a ticket events topic."""
    monkeypatch.delenv("AWS_LAMBDA_FUNCTION_NAME", raising=False)
    for name, value in BASE_ENV.items():
        monkeypatch.setenv(name, value)
    mock = local_aws.start(TEST_ATTACHMENTS_BUCKET)
    sqs = boto3.client("sqs", region_name=REGION)
    queue_url = sqs.create_queue(QueueName="helpdesk-pro-prod-triage-queue")["QueueUrl"]
    topic_arn = boto3.client("sns", region_name=REGION).create_topic(Name="helpdesk-pro-prod-ticket-events")["TopicArn"]
    monkeypatch.setenv("TRIAGE_QUEUE_URL", queue_url)
    monkeypatch.setenv("TICKET_EVENTS_TOPIC_ARN", topic_arn)
    _reset_clients()
    yield {"queue_url": queue_url, "topic_arn": topic_arn}
    _reset_clients()
    mock.stop()


@pytest.fixture
def local_mode(aws, monkeypatch):
    monkeypatch.setenv("AUTH_MODE", "local")
    monkeypatch.setenv("TRIAGE_QUEUE_URL", "local://triage")
    monkeypatch.setenv("TICKET_EVENTS_TOPIC_ARN", "local://ticket-events")
    return aws
