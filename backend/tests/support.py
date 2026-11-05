"""Builds API Gateway HTTP API (v2) events for the tests, the way API Gateway would send them."""
import base64
import json

from helpdesk import api_handler

POOL_ID = "us-east-1_TestPool"
# Same shape as the deployed name in infra/locals.tf, with a fake account id.
TEST_ATTACHMENTS_BUCKET = "helpdesk-pro-prod-attachments-123456789012"

CUSTOMER_A = {"sub": "a0000000-0000-4000-8000-00000000000a", "email": "ann@example.test", "name": "Ann Customer", "groups": ["Customer"]}
CUSTOMER_B = {"sub": "b0000000-0000-4000-8000-00000000000b", "email": "bob@example.test", "name": "Bob Customer", "groups": ["Customer"]}
AGENT = {"sub": "c0000000-0000-4000-8000-00000000000c", "email": "cat@example.test", "name": "Cat Agent", "groups": ["Agent"]}
AGENT_2 = {"sub": "d0000000-0000-4000-8000-00000000000d", "email": "dan@example.test", "name": "Dan Agent", "groups": ["Agent"]}
ADMIN = {"sub": "e0000000-0000-4000-8000-00000000000e", "email": "eve@example.test", "name": "Eve Admin", "groups": ["Admin", "Agent"]}
NO_GROUP = {"sub": "f0000000-0000-4000-8000-00000000000f", "email": "fay@example.test", "name": "Fay Signup", "groups": []}


def claims_event(method, path, user=None, body=None, query=None, raw_body=None):
    claims = {"sub": user["sub"], "email": user["email"], "name": user["name"], "iss": f"https://cognito-idp.us-east-1.amazonaws.com/{POOL_ID}"}
    if user.get("groups"):
        # The HTTP API renders a list claim as text, e.g. "[Admin Agent]".
        claims["cognito:groups"] = "[" + " ".join(user["groups"]) + "]"
    event = _base(method, path, query, body, raw_body)
    event["requestContext"]["authorizer"] = {"jwt": {"claims": claims}}
    return event


def dev_event(method, path, user=None, body=None, query=None, raw_body=None):
    event = _base(method, path, query, body, raw_body)
    if user is not None:
        event["headers"]["x-dev-user"] = user["email"]
    return event


def _base(method, path, query, body, raw_body):
    encoded = None
    if raw_body is not None:
        encoded = base64.b64encode(raw_body).decode("ascii")
    elif body is not None:
        encoded = base64.b64encode(json.dumps(body).encode("utf-8")).decode("ascii")
    return {
        "version": "2.0",
        "rawPath": path,
        "queryStringParameters": query,
        "headers": {"content-type": "application/json"},
        "body": encoded,
        "isBase64Encoded": encoded is not None,
        "requestContext": {"http": {"method": method, "path": path}},
    }


def call(event):
    """Runs the handler and returns (status, parsed body). Raw (binary) responses return (status, bytes)."""
    result = api_handler.handler(event, None)
    if result.get("isBase64Encoded"):
        return result["statusCode"], base64.b64decode(result["body"])
    return result["statusCode"], json.loads(result["body"]) if result["body"] else None


def api(method, path, user=None, body=None, query=None):
    return call(claims_event(method, path, user=user, body=body, query=query))


def make_ticket(user=None, **overrides):
    payload = {
        "title": "Printer on floor two is offline",
        "description": "The printer shows offline for the whole team since this morning.",
        "category": "Hardware",
    }
    payload.update(overrides)
    status, body = api("POST", "/api/tickets", user=user or CUSTOMER_A, body=payload)
    assert status == 201, body
    return body
