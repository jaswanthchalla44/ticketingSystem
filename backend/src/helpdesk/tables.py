"""Table and index names. They must match infra/ (Terraform). The local server and the tests create
matching tables in moto from TABLE_SPECS, so a mismatch shows up in tests before a deploy.
The attachments bucket is not here: its name includes the AWS account id, and Terraform passes it as ATTACHMENTS_BUCKET.
"""

TICKETS_TABLE = "helpdesk-pro-prod-tickets"
COMMENTS_TABLE = "helpdesk-pro-prod-comments"
USERS_TABLE = "helpdesk-pro-prod-users"

BY_REQUESTER = "by_requester"  # tickets: requester_sub, created_at
BY_ASSIGNEE = "by_assignee"  # tickets: assignee_id, updated_at
BY_STATUS = "by_status"  # tickets: status, updated_at
BY_ROLE = "by_role"  # users: role, user_id


def _key(hash_attr, range_attr=None):
    schema = [{"AttributeName": hash_attr, "KeyType": "HASH"}]
    if range_attr:
        schema.append({"AttributeName": range_attr, "KeyType": "RANGE"})
    return schema


def _attr(name):
    return {"AttributeName": name, "AttributeType": "S"}


def _index(name, hash_attr, range_attr):
    return {
        "IndexName": name,
        "KeySchema": _key(hash_attr, range_attr),
        "Projection": {"ProjectionType": "ALL"},
    }


TABLE_SPECS = [
    {
        "TableName": TICKETS_TABLE,
        "KeySchema": _key("id"),
        "AttributeDefinitions": [
            _attr("id"),
            _attr("requester_sub"),
            _attr("created_at"),
            _attr("assignee_id"),
            _attr("updated_at"),
            _attr("status"),
        ],
        "GlobalSecondaryIndexes": [
            _index(BY_REQUESTER, "requester_sub", "created_at"),
            _index(BY_ASSIGNEE, "assignee_id", "updated_at"),
            _index(BY_STATUS, "status", "updated_at"),
        ],
        "BillingMode": "PAY_PER_REQUEST",
    },
    {
        "TableName": COMMENTS_TABLE,
        "KeySchema": _key("ticket_id", "sort_key"),
        "AttributeDefinitions": [_attr("ticket_id"), _attr("sort_key")],
        "BillingMode": "PAY_PER_REQUEST",
    },
    {
        "TableName": USERS_TABLE,
        "KeySchema": _key("user_id"),
        "AttributeDefinitions": [_attr("user_id"), _attr("role")],
        "GlobalSecondaryIndexes": [_index(BY_ROLE, "role", "user_id")],
        "BillingMode": "PAY_PER_REQUEST",
    },
]
