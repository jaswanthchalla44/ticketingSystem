# Backend: local run

Python 3.12. Dev dependencies are pinned in `requirements-dev.txt`. Runtime needs no packages (boto3 comes
with the Lambda runtime).

```bash
cd /home/ubuntu/app/backend
python3.12 -m venv .venv            # .venv is git-ignored
.venv/bin/pip install -r requirements-dev.txt
```

## Tests

```bash
.venv/bin/python -m pytest -q
.venv/bin/python -m compileall -q src scripts
```

Tests use moto, so no AWS account is needed. They create the same tables and indexes as `src/helpdesk/tables.py`.

## Local API (preview)

```bash
LOCAL_API_PORT=8000 .venv/bin/python scripts/local_server.py
```

Then, for example:

```bash
curl http://127.0.0.1:8000/api/health
curl -H "X-Dev-User: priya.raman@example.test" http://127.0.0.1:8000/api/tickets
```

- The server binds to 127.0.0.1 only. It uses moto, so data lives in memory and is re-seeded at each start.
- Triage runs in keyword mode, in process, when a ticket is created.
- Uploads go to `/api/_local/s3/...` instead of S3. This route exists only in local mode.
- Local mode is refused inside Lambda (`AUTH_MODE=local` raises a config error there).

Seeded users (use the email as `X-Dev-User`): `dana.okoye@example.test` (Admin), `priya.raman@example.test`,
`marcus.chen@example.test`, `lena.costa@example.test`, `tomasz.nowak@example.test` (Agents),
`sam.okafor@example.test`, `elena.ruiz@example.test`, `jordan.lee@example.test`, `aisha.khan@example.test`,
`ben.walsh@example.test` (Customers).

## Seed

`scripts/seed.py` writes 25 tickets, comments and timeline events. It is idempotent. In local mode the server
runs it at start. Against real tables it needs `TABLE_TICKETS`, `TABLE_COMMENTS` and `TABLE_USERS`, and it must
only be run with the owner's approval.

## Triage settings

| Variable | Value |
|----------|-------|
| `TRIAGE_MODE` | `anthropic` (deployed default) or `keyword` (local). Any other value logs an error and uses `keyword`. |
| `ANTHROPIC_MODEL` | Model name, required in `anthropic` mode. No default in code. Terraform sets `claude-haiku-5-5`. |
| `ANTHROPIC_TIMEOUT_SECONDS` | Per-request timeout, 1 to 20. Defaults to 8. |
| `ANTHROPIC_SECRET_ID` | Secrets Manager secret holding the API key, required in `anthropic` mode. Deployed: `helpdesk-pro-prod-anthropic-key`. |

The key is read from the secret, never from an environment variable. Tests use a placeholder value in moto and a fake
HTTP transport, so no test needs the network or a real key. The local server forces `TRIAGE_MODE=keyword`.

## Smoke test (deployed only)

`scripts/smoke_triage.py` needs `SMOKE_BASE_URL` and `SMOKE_ID_TOKEN`. It creates a ticket and passes only when
`triage_source` is `ai`. It uses the standard library only.
