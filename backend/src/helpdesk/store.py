"""DynamoDB access. Business code calls Store only; it never touches boto3 directly.

Ticket lists come from the by_requester, by_assignee and by_status indexes. There is no ticket Scan
except the dashboard, which is bounded by DASHBOARD_ROW_LIMIT.
"""
from decimal import Decimal

import boto3
from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError

from helpdesk import tables
from helpdesk.errors import ConfigError

SCAN_PAGE = 500
TIMELINE_LIMIT = 1000
USER_PAGE_LIMIT = 1000


class ConditionFailed(Exception):
    """A conditional write did not apply (the item is missing, or a required-absent attribute exists)."""


class Store:
    def __init__(self, tickets_table, comments_table, users_table=None, resource=None):
        dynamodb = resource or boto3.resource("dynamodb")
        self._tickets = dynamodb.Table(tickets_table)
        self._comments = dynamodb.Table(comments_table)
        self._users = dynamodb.Table(users_table) if users_table else None

    def _users_table(self):
        if self._users is None:
            raise ConfigError("the users table is not configured for this component")
        return self._users

    # Tickets

    def get_ticket(self, ticket_id):
        response = self._tickets.get_item(Key={"id": ticket_id}, ConsistentRead=True)
        return _plain(response.get("Item"))

    def create_ticket(self, item):
        self._tickets.put_item(Item=item, ConditionExpression="attribute_not_exists(id)")

    def put_ticket(self, item):
        """Unconditional write. Only the seed script uses it, so re-running the seed overwrites the same items."""
        self._tickets.put_item(Item=item)

    def update_ticket(self, ticket_id, set_values, remove=(), require_absent=None):
        names = {"#id": "id"}
        values = {}
        condition = "attribute_exists(#id)"
        if require_absent:
            names["#absent"] = require_absent
            condition += " AND attribute_not_exists(#absent)"
        expression = _update_expression(set_values, remove, names, values)
        kwargs = {
            "Key": {"id": ticket_id},
            "UpdateExpression": expression,
            "ConditionExpression": condition,
            "ExpressionAttributeNames": names,
            "ReturnValues": "ALL_NEW",
        }
        if values:
            kwargs["ExpressionAttributeValues"] = values
        try:
            response = self._tickets.update_item(**kwargs)
        except ClientError as exc:
            if exc.response["Error"]["Code"] == "ConditionalCheckFailedException":
                raise ConditionFailed(ticket_id) from None
            raise
        return _plain(response["Attributes"])

    def replace_pending_uploads(self, ticket_id, pending, expected_count):
        """Sets pending_uploads only if the stored list still has expected_count entries (the length the caller read).
        Raises ConditionFailed if another request changed the list in between."""
        names = {"#id": "id", "#p": "pending_uploads"}
        try:
            self._tickets.update_item(
                Key={"id": ticket_id},
                UpdateExpression="SET #p = :p",
                ConditionExpression="attribute_exists(#id) AND (attribute_not_exists(#p) OR size(#p) = :n)",
                ExpressionAttributeNames=names,
                ExpressionAttributeValues={":p": pending, ":n": expected_count},
            )
        except ClientError as exc:
            if exc.response["Error"]["Code"] == "ConditionalCheckFailedException":
                raise ConditionFailed(ticket_id) from None
            raise

    def add_pending_upload(self, ticket_id, pending, expected_count, expected_presigns):
        """Presign only: sets pending_uploads and counts one more presign on the ticket's lifetime total. Applies only
        if the pending list length and the total are still what the caller read. Raises ConditionFailed otherwise."""
        names = {"#id": "id", "#p": "pending_uploads", "#t": "presign_total"}
        try:
            self._tickets.update_item(
                Key={"id": ticket_id},
                UpdateExpression="SET #p = :p ADD #t :one",
                ConditionExpression="attribute_exists(#id) AND (attribute_not_exists(#p) OR size(#p) = :n)"
                                    " AND (attribute_not_exists(#t) OR #t = :t)",
                ExpressionAttributeNames=names,
                ExpressionAttributeValues={":p": pending, ":n": expected_count, ":t": expected_presigns, ":one": 1},
            )
        except ClientError as exc:
            if exc.response["Error"]["Code"] == "ConditionalCheckFailedException":
                raise ConditionFailed(ticket_id) from None
            raise

    def query_tickets(self, index, hash_attr, hash_value, limit, start_key=None):
        kwargs = {
            "IndexName": index,
            "KeyConditionExpression": Key(hash_attr).eq(hash_value),
            "Limit": limit,
            "ScanIndexForward": False,
        }
        if start_key:
            kwargs["ExclusiveStartKey"] = start_key
        response = self._tickets.query(**kwargs)
        return _plain_list(response["Items"]), _plain(response.get("LastEvaluatedKey"))

    def scan_tickets(self, max_rows, attrs):
        """Dashboard only. Returns (rows, truncated). Stops at max_rows."""
        names = {f"#a{i}": attr for i, attr in enumerate(attrs)}
        kwargs = {"ProjectionExpression": ", ".join(names), "ExpressionAttributeNames": names}
        items = []
        while True:
            response = self._tickets.scan(Limit=min(SCAN_PAGE, max_rows - len(items)), **kwargs)
            items.extend(response["Items"])
            last = response.get("LastEvaluatedKey")
            if not last:
                return _plain_list(items), False
            if len(items) >= max_rows:
                return _plain_list(items), True
            kwargs["ExclusiveStartKey"] = last

    # Comments and timeline (one partition per ticket)

    def put_comment(self, item):
        self._comments.put_item(Item=item)

    def timeline(self, ticket_id):
        items = []
        kwargs = {"KeyConditionExpression": Key("ticket_id").eq(ticket_id), "ScanIndexForward": True}
        while True:
            response = self._comments.query(**kwargs)
            items.extend(response["Items"])
            last = response.get("LastEvaluatedKey")
            if not last or len(items) >= TIMELINE_LIMIT:
                return _plain_list(items)
            kwargs["ExclusiveStartKey"] = last

    # Users

    def get_user(self, sub):
        response = self._users_table().get_item(Key={"user_id": sub}, ConsistentRead=True)
        return _plain(response.get("Item"))

    def put_user(self, item):
        self._users_table().put_item(Item=item)

    def update_user(self, sub, set_values):
        names = {"#id": "user_id"}
        values = {}
        expression = _update_expression(set_values, (), names, values)
        try:
            response = self._users_table().update_item(
                Key={"user_id": sub},
                UpdateExpression=expression,
                ConditionExpression="attribute_exists(#id)",
                ExpressionAttributeNames=names,
                ExpressionAttributeValues=values,
                ReturnValues="ALL_NEW",
            )
        except ClientError as exc:
            if exc.response["Error"]["Code"] == "ConditionalCheckFailedException":
                raise ConditionFailed(sub) from None
            raise
        return _plain(response["Attributes"])

    def users_by_role(self, role):
        items = []
        kwargs = {"IndexName": tables.BY_ROLE, "KeyConditionExpression": Key("role").eq(role)}
        while True:
            response = self._users_table().query(**kwargs)
            items.extend(response["Items"])
            last = response.get("LastEvaluatedKey")
            if not last or len(items) >= USER_PAGE_LIMIT:
                return _plain_list(items)
            kwargs["ExclusiveStartKey"] = last


def _update_expression(set_values, remove, names, values):
    sets = []
    for i, (attr, value) in enumerate(set_values.items()):
        names[f"#s{i}"] = attr
        values[f":s{i}"] = value
        sets.append(f"#s{i} = :s{i}")
    removes = []
    for i, attr in enumerate(remove):
        names[f"#r{i}"] = attr
        removes.append(f"#r{i}")
    parts = []
    if sets:
        parts.append("SET " + ", ".join(sets))
    if removes:
        parts.append("REMOVE " + ", ".join(removes))
    return " ".join(parts)


def _plain(value):
    """DynamoDB returns numbers as Decimal. Convert them so the rest of the code and JSON can use them."""
    if isinstance(value, Decimal):
        return int(value) if value == value.to_integral_value() else float(value)
    if isinstance(value, dict):
        return {k: _plain(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_plain(v) for v in value]
    return value


def _plain_list(items):
    return [_plain(item) for item in items]


_store = None


def get_store(cfg):
    """One Store per process. Lambda reuses it between invocations."""
    global _store
    if _store is None:
        _store = Store(cfg.tickets_table, cfg.comments_table, getattr(cfg, "users_table", None))
    return _store


def reset_store():
    global _store
    _store = None
