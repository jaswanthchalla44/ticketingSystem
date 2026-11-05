"""The post-deploy smoke test, run against a stub HTTP server that plays the API."""
import importlib.util
import json
import os
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

import pytest

SCRIPT = os.path.join(os.path.dirname(__file__), "..", "scripts", "smoke_triage.py")


def _load_smoke():
    spec = importlib.util.spec_from_file_location("smoke_triage", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _stub_api(triage_sources):
    """Creates a ticket, then reports the given triage_source values on successive reads."""
    state = {"reads": 0, "auth": []}

    class Handler(BaseHTTPRequestHandler):
        def _send(self, status, payload):
            data = json.dumps(payload).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def do_POST(self):
            state["auth"].append(self.headers.get("Authorization"))
            self.rfile.read(int(self.headers.get("Content-Length", 0)))
            self._send(201, {"id": "11111111-1111-4111-8111-111111111111", "title": "smoke"})

        def do_GET(self):
            index = min(state["reads"], len(triage_sources) - 1)
            state["reads"] += 1
            source = triage_sources[index]
            payload = {"id": "11111111-1111-4111-8111-111111111111", "triage_source": source,
                       "category": "Network", "priority": "Low"}
            if source == "rules":
                payload["triage_error"] = "auth failed"
            self._send(200, payload)

        def log_message(self, fmt, *args):
            pass

    server = HTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server, state


@pytest.fixture
def smoke_env(monkeypatch):
    monkeypatch.setenv("SMOKE_ID_TOKEN", "test-token-value")
    smoke = _load_smoke()
    monkeypatch.setattr(smoke, "POLL_SECONDS", 0)
    return smoke, monkeypatch


def _run(smoke, monkeypatch, server):
    monkeypatch.setenv("SMOKE_BASE_URL", f"http://127.0.0.1:{server.server_address[1]}/")
    return smoke.main()


def test_passes_only_when_triage_is_ai(smoke_env):
    smoke, monkeypatch = smoke_env
    server, state = _stub_api(["ai"])
    try:
        assert _run(smoke, monkeypatch, server) == 0
        assert state["auth"] == ["Bearer test-token-value"]
    finally:
        server.shutdown()


def test_fails_when_triage_falls_back_to_rules(smoke_env, capsys):
    smoke, monkeypatch = smoke_env
    server, _ = _stub_api([None, "rules"])
    try:
        assert _run(smoke, monkeypatch, server) == 1
    finally:
        server.shutdown()
    assert "triage_source=rules" in capsys.readouterr().err


def test_missing_token_exits_with_usage_error(monkeypatch):
    monkeypatch.delenv("SMOKE_ID_TOKEN", raising=False)
    monkeypatch.setenv("SMOKE_BASE_URL", "http://127.0.0.1:9")
    smoke = _load_smoke()
    with pytest.raises(SystemExit) as info:
        smoke.main()
    assert info.value.code == 2
