# Helpdesk Pro API

Owner: JORDAN (backend). Consumers: the React app (ALEX), the smoke test, and the local preview.

All routes live under `/api`, return JSON, and use the same origin as the app (CloudFront forwards `/api/*`).
The app calls relative paths such as `/api/tickets`.

## Authentication

- Send the Cognito **ID token** as `Authorization: Bearer <id token>`. API Gateway checks the signature, issuer,
  expiry and audience (the `helpdesk-pro-prod-web` client). An access token is refused by the gateway.
- The role comes from the Cognito group in the token: `Admin`, `Agent` or `Customer`. A user with no group
  (self sign-up) is a `Customer`. When several groups are present, the highest wins (`Admin` > `Agent` > `Customer`).
- A role change made by an admin takes effect at the user's next token refresh (up to 60 minutes).
- Local preview only (`AUTH_MODE=local`): send `X-Dev-User` with a seeded user's email or sub instead of a token.

## Errors

Every error uses the same shape:

```json
{ "error": { "code": "validation_error", "message": "request is invalid",
             "details": [ { "field": "title", "message": "must be at least 3 characters" } ] } }
```

| HTTP | `code` | When |
|---|---|---|
| 400 | `bad_request` | Body is not JSON or not a JSON object |
| 401 | `unauthorized` | No verified caller |
| 403 | `forbidden` | Caller's role may not use this route, or may not do this action (for example a customer posting an internal note) |
| 404 | `not_found` | Unknown route, or a ticket the caller may not see (a customer's other tickets look missing, not forbidden) |
| 405 | `method_not_allowed` | Path exists, method does not |
| 409 | `conflict` | Duplicate attachment, attachment limit reached, or an admin removing their own admin role |
| 429 | `too_many_requests` | Too many presigned uploads are waiting to be confirmed on this ticket (see presign) |
| 422 | `validation_error` | Field rules failed. `details` lists every field |
| 500 | `internal_error` | Unexpected. Logged; the message is generic |
| 502 | `upstream_error` | Cognito refused a role change |

## Enums

- `status`: `New`, `In Progress`, `Waiting`, `Resolved`
- `priority`: `Low`, `Medium`, `High`, `Urgent`
- `category`: `Login/Access`, `Email`, `Hardware`, `Network`, `Software`, `Billing`, `Other`
- `sentiment`: `Negative`, `Neutral`, `Positive`
- `visibility`: `public`, `internal`
- `role`: `Customer`, `Agent`, `Admin`
- `triage_source`: `ai`, `rules`. Absent means triage has not run yet.
- `triage_model`: the Anthropic model name, for example `claude-haiku-5-5`, when `triage_source` is `ai`. Otherwise `null`.
- Attachment `content_type`: `image/png`, `image/jpeg`, `image/gif`, `image/webp`, `application/pdf`

## Ticket object

Returned by create, list items, and the ticket detail (which adds `comments` and `timeline`).

| Field | Type | Who sees it | Notes |
|---|---|---|---|
| `id` | string (UUID) | all | |
| `title` | string | all | 3 to 140 characters |
| `description` | string | all | 10 to 5000 characters |
| `category` | enum | all | Set by AI or rules triage. The customer's choice is in `category_requested` |
| `category_requested` | enum | all | What the customer picked |
| `status` | enum | all | |
| `priority` | enum | all | `Medium` until triage runs |
| `sentiment` | enum | all | Set by triage |
| `summary` | string | all | One line, set by triage |
| `suggested_reply` | string | agents, admins | Draft reply from triage |
| `triage_source` | `ai` or `rules` | all | Absent while pending |
| `triage_model` | string or null | all | Model name when `triage_source` is `ai`, else `null` |
| `triage_error` | string | agents, admins | Fixed reason, present only when AI fell back to rules: `api key unavailable`, `auth failed`, `model not found`, `rate limited`, `service error`, `request rejected`, `timeout`, `network error`, `invalid model output`, `unexpected error` |
| `triaged_at` | timestamp | all | |
| `requester_sub`, `requester_email`, `requester_name` | string | all | |
| `assignee_id`, `assignee_name` | string | `assignee_id` agents and admins only | Absent when unassigned |
| `attachments` | array | all | `{id, filename, content_type, size, uploaded_by, created_at}`. No storage key |
| `created_at`, `updated_at` | timestamp | all | `updated_at` moves on any change, including a comment |
| `resolved_at` | timestamp | all | Present while `Resolved` |
| `first_response_at` | timestamp | all | First public agent reply |

Timestamps are UTC strings in the form `2026-11-05T09:00:00.000000Z`.

## Comment and timeline entries

`comments[]`: `{id, visibility, body, author_name, author_role, created_at}`

`timeline[]`: `{id, event_type, text, visibility, actor_name, created_at}`

`event_type` values: `ticket_created`, `status_changed`, `priority_changed`, `category_changed`, `assigned`,
`attachment_added`, `triage`.

Customers see only comments and events with `visibility: "public"`. Public events are `ticket_created`,
`status_changed` and `attachment_added`. Everything else (internal notes, priority and category changes,
assignments, triage) is hidden from customers.

## Routes

Role column: `any` means any signed-in user. `Staff` means Agent or Admin. `Admin` means Admin only.

### GET /api/health
Role: none (no sign-in). **200** `{"status": "ok"}`

### GET /api/me
Role: any. **200** `{"sub", "email", "name", "role"}`

### GET /api/tickets
Role: any. Customers always see only their own tickets, whatever the filters.

Query parameters (all optional):

| Name | Rule |
|---|---|
| `status`, `priority`, `category` | Enum values above |
| `assignee` | User id. For customers it only narrows their own tickets |
| `mine` | `true` or `false`. For staff: tickets assigned to the caller. Ignored for customers |
| `q` | Text, up to 200 characters. Case-insensitive match on id, title and description |
| `limit` | 1 to 100, default 25 |
| `cursor` | Opaque value from a previous `next_cursor` |

**200** `{"items": [ticket...], "next_cursor": "..." | null}`

Notes:
- Filters use the indexes `by_requester`, `by_assignee` and `by_status`. There is no ticket Scan for lists.
- With no `status`, `assignee` or `mine` filter, staff pages across all four statuses, newest first.
- `category`, `priority` and `q` filter the rows read for a page, so a page can hold fewer than `limit` rows.
  A non-null `next_cursor` means more pages may exist, so keep going until it is `null`. `q` is a filter on
  fetched rows, not full-text search; it is acceptable at this scale and would need a search index beyond it.
- An invalid or mismatched cursor returns 422.

### POST /api/tickets
Role: any. Body: `{"title", "description", "category"}`. **201** ticket object, `status: "New"`, triage pending.

Triage is queued on SQS. In local preview it runs immediately. If the queue send fails, the ticket is still
created and the failure is logged. Poll `GET /api/tickets/{id}` for `triage_source`.

### GET /api/tickets/{id}
Role: any (own tickets only for customers). **200** ticket object plus `comments` and `timeline`.

### PATCH /api/tickets/{id}
Role: Staff. Body: any of `{"status", "priority", "category", "assignee_id"}`. `assignee_id` may be `null` to
unassign. At least one field is required (422 otherwise).

- Each real change writes a timeline event. Status changes are public events; the rest are internal.
- Setting `status` to `Resolved` sets `resolved_at`. Any other status clears it.
- `assignee_id` must be a user with role Agent or Admin, and that user must have signed in at least once
  (assignment reads the user cache). Otherwise 422 on `assignee_id`.
- Assigning someone notifies them (see Notifications).
- **200** the updated ticket object.

### POST /api/tickets/{id}/comments
Role: any (own tickets only for customers). Body: `{"body", "visibility"}`, `visibility` is `public` (default) or `internal`.

- Customers cannot post `internal` (403).
- The first public reply from staff sets `first_response_at` once.
- A public reply notifies the requester (staff reply) or the assignee (customer reply).
- **201** the comment: `{id, visibility, body, author_name, author_role, created_at}`.

### POST /api/tickets/{id}/attachments/presign
Role: any (own tickets only for customers). Body: `{"filename", "content_type", "size"}`. `size` is in bytes,
1 to `MAX_UPLOAD_BYTES` (5242880). Up to 10 attachments per ticket. Each presign is recorded on the ticket as a
pending upload. A ticket can hold at most 5 pending uploads; each one holds its slot until it is confirmed or an
hour has passed. A presign over that limit returns **429** `too_many_requests` (`"too many uploads are waiting to be
confirmed; confirm them, or try again within an hour"`).

A ticket also has a lifetime limit of 20 presigns (`MAX_PRESIGNS_PER_TICKET`). Expired or confirmed uploads count
toward it and it never resets, so a presign over that limit returns **429** `too_many_requests` (`"this ticket has
reached its upload limit; no more files can be uploaded to it"`) even when no pending slot is in use.

**200** `{"upload_url", "method": "PUT", "headers": {"Content-Type": "..."}, "key", "expires_in", "size"}`

Upload the file with a `PUT` to `upload_url`, and send exactly the `headers` shown (the signature covers the
content type). The signature also covers `size`: S3 rejects a PUT of any other length. `expires_in` is 300 seconds.

The filename is cleaned: folders are removed and unusual characters become `_`. The extension must match the
content type. Confirm with the key.

### POST /api/tickets/{id}/attachments/confirm
Role: any (own tickets only for customers). Body: `{"key"}` (the `key` from presign).

The API checks the uploaded object: it must exist, be an allowed type, and be within `MAX_UPLOAD_BYTES`. The
size and type come from S3, not from the client. **201** the attachment entry
`{id, filename, content_type, size, uploaded_by, created_at}`.

The key must come from a presign on this ticket that is still pending (not yet confirmed, and less than an hour
old), and the object's size must equal the size declared at presign. A confirmed key is removed from the pending list.

Errors: 422 if the upload is missing, has the wrong type or size, or the key is not an upload for this ticket
(including a key that was never requested or whose request has expired). 409 if already attached.

### GET /api/tickets/{id}/attachments/{attachment_id}/url
Role: any (own tickets only for customers). **200** `{"url", "expires_in", "filename"}`. The URL is a presigned
GET that downloads as an attachment, valid for `expires_in` seconds (300). Request a new one when it expires.

### GET /api/agents
Role: Staff. **200** `{"items": [{"user_id", "name", "email", "role"}]}`: every Agent and Admin, for the assignee
picker.

### GET /api/dashboard
Role: Admin. **200**

```json
{ "total": 25, "open": 20, "resolved": 5,
  "by_status": {"New": 6, "In Progress": 8, "Waiting": 6, "Resolved": 5},
  "by_category": {"Login/Access": 4, "Email": 3, "Hardware": 4, "Network": 4, "Software": 4, "Billing": 3, "Other": 3},
  "by_agent": [{"agent_id", "agent_name", "assigned", "open"}],
  "unassigned": 3,
  "avg_first_response_seconds": 4500.0, "first_response_sample": 18,
  "generated_at": "...", "truncated": false, "row_limit": 5000 }
```

`by_agent` is sorted by assigned count. `avg_first_response_seconds` is `null` when no ticket has a reply yet.
The dashboard reads tickets with a bounded Scan: at most 5000 rows. If `truncated` is `true`, the numbers cover
only the first 5000 rows.

### GET /api/users
Role: Admin. **200** `{"items": [{"user_id", "name", "email", "role", "created_at"}]}`

Lists users who have signed in at least once (the user cache). A new self sign-up appears after their first request.

### PATCH /api/users/{sub}
Role: Admin. Body: `{"role": "Customer" | "Agent" | "Admin"}`. **200** the user object.

In deployment the change moves the user between Cognito groups (add the new group first, then remove the others).
A demotion also signs the user out everywhere (Cognito global sign-out), so they cannot refresh their session. The
token they already hold stays valid until it expires (60 minutes), so the old role can last that long. If the sign-out
fails, the role change still succeeds and the failure is logged.
An admin cannot remove their own admin role (409). Unknown users return 404.

## Notifications (SNS)

Published to `TICKET_EVENTS_TOPIC_ARN`. Message body (JSON):

```json
{ "type": "ticket_assigned" | "ticket_replied", "ticket_id": "...", "title": "...",
  "actor": "Cat Agent", "recipient_sub": "..." }
```

Message attributes `type` and `recipient_sub` are set for subscription filters. A failed publish is logged, and
the user's request still succeeds.

Email delivery happens only when `notification_email` is set in Terraform.

## Triage (not an HTTP route)

Triage runs on SQS message `{"ticket_id"}`. It writes the AI or rules fields, sets `triage_source`,
`triage_model`, `triaged_at` and, after a fallback, `triage_error`. It adds a timeline event: `AI triage (<model>) completed`,
`Rules triage applied`, or `Rules triage applied (AI unavailable: <reason>)`. It is idempotent: a ticket that
already has `triaged_at` is skipped.

The deployed triage calls the Anthropic Messages API (`TRIAGE_MODE=anthropic`). The API key is read from AWS Secrets
Manager (`ANTHROPIC_SECRET_ID`) once per container. Keyword mode (`TRIAGE_MODE=keyword`, the local default) never
calls the API or Secrets Manager. The AI prompt treats the title and description as untrusted data. The model reply
must be a JSON object with valid enum values, a non-empty summary and a non-empty suggested reply. Any failure falls
back to the keyword rules, so ticket creation never fails because of triage. The key is never logged or stored.

## Local preview

`python scripts/local_server.py` (see `backend/README-local.md`). It serves the same routes on
`http://127.0.0.1:8000`, with `X-Dev-User` for sign-in. Seeded users include `dana.okoye@example.test` (Admin),
`priya.raman@example.test` (Agent) and `sam.okafor@example.test` (Customer). Triage runs in keyword mode, and the preview never calls the Anthropic API.
