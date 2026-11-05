"""Local preview server for the API. Dev only: runs api_handler in one process against moto-backed DynamoDB and S3.

Run:   cd backend && .venv/bin/python scripts/local_server.py          (LOCAL_API_PORT defaults to 8000)
Stop:  Ctrl-C, or kill the process. Data lives in memory and is re-seeded at every start.
Binds to 127.0.0.1 only. Local mode is refused inside Lambda, so this file never runs in deployment.
"""
import base64
import logging
import os
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qsl, urlsplit

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "src"))

import local_aws  # noqa: E402
import seed  # noqa: E402
from helpdesk import api_handler, config, tables  # noqa: E402
from helpdesk.store import get_store  # noqa: E402

log = logging.getLogger("local_server")

# Forced: local auth, and keyword triage so a preview never calls Anthropic. The rest may be overridden.
FORCED_ENV = {"AUTH_MODE": "local", "TRIAGE_MODE": "keyword"}
DEFAULT_ENV = {
    "TABLE_TICKETS": tables.TICKETS_TABLE,
    "TABLE_COMMENTS": tables.COMMENTS_TABLE,
    "TABLE_USERS": tables.USERS_TABLE,
    "TRIAGE_QUEUE_URL": "local://triage",
    "TICKET_EVENTS_TOPIC_ARN": "local://ticket-events",
    "SIGNED_URL_TTL_SECONDS": "300",
    "MAX_UPLOAD_BYTES": "5242880",
}


class Handler(BaseHTTPRequestHandler):
    def _handle(self):
        parts = urlsplit(self.path)
        length = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(length) if length else b""
        event = {
            "version": "2.0",
            "rawPath": parts.path,
            "rawQueryString": parts.query,
            "queryStringParameters": dict(parse_qsl(parts.query)) or None,
            "headers": {key.lower(): value for key, value in self.headers.items()},
            "body": base64.b64encode(body).decode("ascii") if body else None,
            "isBase64Encoded": bool(body),
            "requestContext": {"http": {"method": self.command.upper(), "path": parts.path}},
        }
        result = api_handler.handler(event, None)
        data = base64.b64decode(result["body"]) if result.get("isBase64Encoded") else result["body"].encode("utf-8")
        self.send_response(result["statusCode"])
        for name, value in result["headers"].items():
            self.send_header(name, value)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    do_GET = do_POST = do_PATCH = do_PUT = do_DELETE = _handle

    def log_message(self, fmt, *args):
        log.info("%s %s", self.command, self.path.split("?")[0])


def main():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    for name, value in DEFAULT_ENV.items():
        os.environ.setdefault(name, value)
    os.environ.update(FORCED_ENV)
    api_cfg = config.load_api()  # fails early if the environment is incomplete
    local_aws.start(api_cfg.attachments_bucket)
    seeded = seed.seed(get_store(api_cfg))
    port = int(os.environ.get("LOCAL_API_PORT", "8000"))
    server = HTTPServer(("127.0.0.1", port), Handler)
    print(f"local API on http://127.0.0.1:{port} ({seeded} seeded tickets)", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
