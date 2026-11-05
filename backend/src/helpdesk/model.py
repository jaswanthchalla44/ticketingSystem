"""Shared enums and limits. The frontend and docs/API.md use the same values."""

ROLE_CUSTOMER = "Customer"
ROLE_AGENT = "Agent"
ROLE_ADMIN = "Admin"
ROLES = (ROLE_CUSTOMER, ROLE_AGENT, ROLE_ADMIN)
STAFF_ROLES = (ROLE_AGENT, ROLE_ADMIN)

STATUSES = ("New", "In Progress", "Waiting", "Resolved")
PRIORITIES = ("Low", "Medium", "High", "Urgent")
SENTIMENTS = ("Negative", "Neutral", "Positive")
CATEGORIES = ("Login/Access", "Email", "Hardware", "Network", "Software", "Billing", "Other")
VISIBILITIES = ("public", "internal")
TRIAGE_SOURCES = ("ai", "rules")

# Content type -> the extensions a file of that type may carry.
ATTACHMENT_TYPES = {
    "image/png": (".png",),
    "image/jpeg": (".jpg", ".jpeg"),
    "image/gif": (".gif",),
    "image/webp": (".webp",),
    "application/pdf": (".pdf",),
}
MAX_ATTACHMENTS_PER_TICKET = 10
# Presigned uploads that were never confirmed. Each one holds a slot until it is confirmed or it expires.
MAX_PENDING_UPLOADS_PER_TICKET = 5
PENDING_UPLOAD_TTL_SECONDS = 3600
# Every presign on a ticket over its whole life, expired or confirmed. Expiry frees a pending slot, not this total.
MAX_PRESIGNS_PER_TICKET = 20

TITLE_MIN, TITLE_MAX = 3, 140
DESCRIPTION_MIN, DESCRIPTION_MAX = 10, 5000
COMMENT_MAX = 5000
SUMMARY_MAX = 200
SUGGESTED_REPLY_MAX = 1000

LIST_DEFAULT_LIMIT = 25
LIST_MAX_LIMIT = 100
DASHBOARD_ROW_LIMIT = 5000
