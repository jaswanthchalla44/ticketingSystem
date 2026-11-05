"""Starts moto and creates the tables and bucket for local preview and tests. Dev only; the Lambda code never imports it."""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

import boto3  # noqa: E402
from moto import mock_aws  # noqa: E402

from helpdesk import config, tables  # noqa: E402

REGION = "us-east-1"


def start(attachments_bucket=config.LOCAL_ATTACHMENTS_BUCKET):
    """Starts the mock. The caller stops it (tests use a fixture; the local server runs until exit)."""
    os.environ.setdefault("AWS_ACCESS_KEY_ID", "testing")
    os.environ.setdefault("AWS_SECRET_ACCESS_KEY", "testing")
    os.environ.setdefault("AWS_DEFAULT_REGION", REGION)
    mock = mock_aws()
    mock.start()
    create_resources(attachments_bucket)
    return mock


def create_resources(attachments_bucket):
    dynamodb = boto3.client("dynamodb", region_name=REGION)
    for spec in tables.TABLE_SPECS:
        dynamodb.create_table(**spec)
    boto3.client("s3", region_name=REGION).create_bucket(Bucket=attachments_bucket)
