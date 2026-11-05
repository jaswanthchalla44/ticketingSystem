"""Keyword rules, used when triage runs in keyword mode or when the AI path fails. Pure functions, no AWS.

The lists are plain words matched on word boundaries, so "download" does not count as "down".
"""
import re

CATEGORY_KEYWORDS = {
    "Login/Access": ("password", "log in", "login", "sign in", "signin", "locked out", "account locked",
                     "2fa", "mfa", "access denied", "permission", "reset my"),
    "Email": ("email", "e-mail", "outlook", "inbox", "mailbox", "smtp", "distribution list", "shared mailbox"),
    "Hardware": ("laptop", "desktop", "monitor", "keyboard", "mouse", "printer", "battery", "docking station",
                 "dock", "headset", "screen", "hardware"),
    "Network": ("wifi", "wi-fi", "network", "vpn", "internet", "ethernet", "dns", "proxy", "connection", "offline"),
    "Software": ("install", "application", "software", "crash", "update", "license", "excel", "teams", "zoom",
                 "error message", "bug"),
    "Billing": ("invoice", "billing", "charge", "payment", "subscription", "refund", "purchase order", "receipt",
                "price"),
}
DEFAULT_CATEGORY = "Other"

URGENT_WORDS = ("down", "outage", "cannot work", "can't work", "cannot log in", "security breach", "breach",
                "ransomware", "phishing", "hacked", "data loss", "all users", "whole team", "entire team",
                "entire office", "production")
HIGH_WORDS = ("urgent", "asap", "blocked", "deadline", "immediately", "critical", "important")
NEGATIVE_WORDS = ("broken", "fail", "failed", "failing", "failure", "error", "not working", "doesn't work",
                  "does not work", "wrong", "frustrat", "angry", "annoy", "terrible", "awful", "worst", "useless",
                  "again", "hate", "crash", "slow", "stuck", "unacceptable", "ridiculous")
POSITIVE_WORDS = ("thank", "thanks", "great", "appreciate", "works now", "working now", "resolved", "happy",
                  "love", "awesome", "helpful", "perfect")

REPLY_TEMPLATES = {
    "Login/Access": "We're looking into the sign-in problem. Could you tell us which account you are using and "
                    "whether the error appears on every device? Please don't send us your password.",
    "Email": "Thanks for reporting the email issue. Could you tell us whether messages are missing, delayed or "
             "failing to send, and whether the problem also happens in the web app?",
    "Hardware": "Thanks for letting us know about the hardware problem. Could you tell us the asset tag of the "
                "device and what happens when you try to use it?",
    "Network": "We're sorry you're having connection trouble. Could you tell us where you are working from and "
               "whether other people nearby are affected?",
    "Software": "Thanks for reporting this. Could you tell us the software version and the exact error message? "
                "A screenshot helps.",
    "Billing": "Thanks for contacting us about billing. We'll check the account and come back to you. If you have "
               "it, please share the invoice number.",
    "Other": "Thanks for contacting IT support. We have received your request and an agent will review it shortly.",
}


def _patterns(words):
    return [re.compile(r"\b" + re.escape(word) + r"\b") for word in words]


_CATEGORY_PATTERNS = {cat: _patterns(words) for cat, words in CATEGORY_KEYWORDS.items()}
_URGENT = _patterns(URGENT_WORDS)
_HIGH = _patterns(HIGH_WORDS)
_NEGATIVE = _patterns(NEGATIVE_WORDS)
_POSITIVE = _patterns(POSITIVE_WORDS)


def _hits(patterns, text):
    return sum(1 for pattern in patterns if pattern.search(text))


def category(text):
    scores = {cat: _hits(patterns, text) for cat, patterns in _CATEGORY_PATTERNS.items()}
    best = max(scores, key=scores.get)  # on a tie the first category in the list wins
    return best if scores[best] else DEFAULT_CATEGORY


def sentiment(text):
    negative = _hits(_NEGATIVE, text)
    positive = _hits(_POSITIVE, text)
    if negative > positive:
        return "Negative"
    if positive > negative:
        return "Positive"
    return "Neutral"


def priority(text, sentiment_value):
    if _hits(_URGENT, text):
        return "Urgent"
    if _hits(_HIGH, text):
        return "High"
    if sentiment_value == "Negative":
        return "Medium"
    return "Low"


def summary(title, description):
    text = (description or "").strip() or title
    first = re.split(r"(?<=[.!?])\s|\n", text, maxsplit=1)[0].strip()
    if not first:
        first = title.strip()
    if len(first) > 160:
        first = first[:157].rstrip() + "..."
    return first


def suggested_reply(category_value, requester_name):
    first_name = (requester_name or "").split()[0] if requester_name and "@" not in requester_name else ""
    greeting = f"Hi {first_name}," if first_name else "Hello,"
    return f"{greeting} {REPLY_TEMPLATES[category_value]}"


def apply(title, description, requester_name=None):
    """Returns the triage fields the keyword rules produce for one ticket."""
    text = f"{title}\n{description or ''}".lower()
    category_value = category(text)
    sentiment_value = sentiment(text)
    return {
        "category": category_value,
        "priority": priority(text, sentiment_value),
        "sentiment": sentiment_value,
        "summary": summary(title, description),
        "suggested_reply": suggested_reply(category_value, requester_name),
    }
