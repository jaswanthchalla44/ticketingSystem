"""Validation: field limits, enums, upload types and sizes, and filenames that try to escape their folder."""
import pytest

from helpdesk import model, validation
from helpdesk.errors import ValidationFailed
from support import CUSTOMER_A, AGENT, api, make_ticket


@pytest.mark.parametrize("payload,field", [
    ({"title": "ab", "description": "Long enough description.", "category": "Hardware"}, "title"),
    ({"title": "x" * (model.TITLE_MAX + 1), "description": "Long enough description.", "category": "Hardware"}, "title"),
    ({"title": "Valid title", "description": "short", "category": "Hardware"}, "description"),
    ({"title": "Valid title", "description": "Long enough description.", "category": "Gardening"}, "category"),
    ({"title": "Valid title", "description": "Long enough description.", "category": None}, "category"),
])
def test_ticket_fields_are_validated(aws, payload, field):
    status, body = api("POST", "/api/tickets", user=CUSTOMER_A, body=payload)
    assert status == 422
    assert field in [detail["field"] for detail in body["error"]["details"]]


def test_all_field_errors_are_reported_together(aws):
    status, body = api("POST", "/api/tickets", user=CUSTOMER_A, body={})
    assert status == 422
    assert {d["field"] for d in body["error"]["details"]} == {"title", "description", "category"}


def test_body_must_be_a_json_object(aws):
    from support import claims_event, call
    event = claims_event("POST", "/api/tickets", user=CUSTOMER_A, raw_body=b"[1, 2, 3]")
    status, body = call(event)
    assert status == 400
    event = claims_event("POST", "/api/tickets", user=CUSTOMER_A, raw_body=b"{not json")
    status, body = call(event)
    assert status == 400


def test_unknown_status_filter_is_rejected(aws):
    status, body = api("GET", "/api/tickets", user=AGENT, query={"status": "Sleeping"})
    assert status == 422
    assert body["error"]["details"][0]["field"] == "status"


def test_limit_out_of_range_is_rejected(aws):
    status, _ = api("GET", "/api/tickets", user=AGENT, query={"limit": "500"})
    assert status == 422


def test_invalid_cursor_is_rejected(aws):
    status, body = api("GET", "/api/tickets", user=AGENT, query={"cursor": "%%%not-a-cursor"})
    assert status == 422
    assert body["error"]["details"][0]["field"] == "cursor"


@pytest.mark.parametrize("raw,expected", [
    ("../../etc/passwd.png", "passwd.png"),
    ("..\\..\\windows\\system.png", "system.png"),
    ("a/b/../c.png", "c.png"),
    ("report final.pdf", "report final.pdf"),
    ("..hidden.png", "hidden.png"),
    ("screen<shot>?.png", "screen_shot.png"),
])
def test_filenames_lose_their_folders_and_odd_characters(raw, expected):
    assert validation.safe_filename(raw) == expected


@pytest.mark.parametrize("raw", ["....", "/", "../", "...", "%2e%2e%2f"])
def test_filenames_with_no_usable_name_are_rejected(raw):
    with pytest.raises(ValidationFailed):
        validation.upload_filename(raw, "image/png")


def test_extension_must_match_content_type():
    with pytest.raises(ValidationFailed):
        validation.upload_filename("payload.html", "image/png")
    assert validation.upload_filename("PHOTO.JPG", "image/jpeg") == "PHOTO.JPG"


def test_presign_rejects_disallowed_type_and_size(aws):
    ticket = make_ticket(CUSTOMER_A)
    base = f"/api/tickets/{ticket['id']}/attachments/presign"
    status, _ = api("POST", base, user=CUSTOMER_A, body={"filename": "a.html", "content_type": "text/html", "size": 10})
    assert status == 422
    status, _ = api("POST", base, user=CUSTOMER_A, body={"filename": "a.png", "content_type": "image/png", "size": 0})
    assert status == 422
    status, _ = api("POST", base, user=CUSTOMER_A,
                    body={"filename": "a.png", "content_type": "image/png", "size": 10 ** 9})
    assert status == 422


def test_presign_rejects_filename_that_does_not_match_type(aws):
    ticket = make_ticket(CUSTOMER_A)
    status, body = api("POST", f"/api/tickets/{ticket['id']}/attachments/presign", user=CUSTOMER_A,
                       body={"filename": "notes.txt", "content_type": "image/png", "size": 100})
    assert status == 422
    assert body["error"]["details"][0]["field"] == "filename"
