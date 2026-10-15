#!/usr/bin/env python3
"""Disabled-by-default scheduled owner email: Firestore REST + Gmail SMTP.

Needs a dedicated Firebase Email/Password user whose *exact UID* has read-only
access to cuberoot_apk_clicks_v1 in reviewed Firestore rules. This script
does not bypass Security Rules, mutate Firestore, or download APKs.
"""
from __future__ import annotations

import datetime as dt
import json
import os
import re
import smtplib
import ssl
import sys
import urllib.error
import urllib.parse
import urllib.request
from email.message import EmailMessage
from zoneinfo import ZoneInfo

PROJECT = "split-it-44dea"
TZ = ZoneInfo("America/Toronto")
APPS = (
    ("fidunio", "FIDUNIO"),
    ("scorecard", "The Scorecard"),
    ("fairpot", "Fairpot"),
    ("wire", "Wire"),
    ("spendrecorder", "SpendRecorder"),
    ("cloud-files", "Cloud Files"),
)
ROOT = f"projects/{PROJECT}/databases/(default)/documents"
MAX_RECENT_PER_APP = 2
TIMEOUT_SECONDS = 25


def required(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise ValueError(f"Missing required setting: {name}")
    return value


def api_post(url: str, payload: dict, bearer: str = ""):
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    if bearer:
        headers["Authorization"] = "Bearer " + bearer
    data = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    request = urllib.request.Request(url, data=data, headers=headers, method="POST")
    with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
        result = response.read(2_000_000)
    return json.loads(result)


def firebase_id_token(api_key: str, email: str, password: str) -> str:
    url = ("https://identitytoolkit.googleapis.com/v1/accounts:"
           "signInWithPassword?key=" + urllib.parse.quote(api_key, safe=""))
    result = api_post(url, {
        "email": email, "password": password, "returnSecureToken": True
    })
    token = result.get("idToken", "")
    if not isinstance(token, str) or not token:
        raise ValueError("Firebase Authentication did not return a token")
    return token


def firestore_query(app: str, kind: str, body: dict, token: str):
    if app not in dict(APPS) or kind not in ("runQuery", "runAggregationQuery"):
        raise ValueError("Unexpected Firestore request")
    parent = f"{ROOT}/cuberoot_apk_clicks_v1/{app}"
    url = "https://firestore.googleapis.com/v1/" + parent + ":" + kind
    return api_post(url, body, token)


def firestore_count(app: str, token: str, start: dt.datetime | None = None,
                    end: dt.datetime | None = None) -> int:
    filters = []
    for operator, instant in (("GREATER_THAN_OR_EQUAL", start), ("LESS_THAN", end)):
        if instant is not None:
            filters.append({"fieldFilter": {
                "field": {"fieldPath": "createdAt"},
                "op": operator,
                "value": {"timestampValue": instant.isoformat().replace("+00:00", "Z")}
            }})
    q = {"from": [{"collectionId": "events"}]}
    if filters:
        q["where"] = ({"compositeFilter": {"op": "AND", "filters": filters}}
                      if len(filters) > 1 else filters[0])
    response = firestore_query(app, "runAggregationQuery", {
        "structuredAggregationQuery": {
            "structuredQuery": q,
            "aggregations": [{"alias": "clicks", "count": {}}]
        }
    }, token)
    if not isinstance(response, list):
        raise ValueError("Malformed Firestore count response")
    values = [x["result"]["aggregateFields"]["clicks"]["integerValue"]
              for x in response if "result" in x]
    if len(values) != 1:
        raise ValueError("Missing or ambiguous Firestore count")
    n = int(values[0])
    if n < 0:
        raise ValueError("Negative click count")
    return n


def firestore_recent(app: str, token: str) -> list[dict]:
    response = firestore_query(app, "runQuery", {
        "structuredQuery": {
            "from": [{"collectionId": "events"}],
            "orderBy": [{"field": {"fieldPath": "createdAt"}, "direction": "DESCENDING"}],
            "limit": MAX_RECENT_PER_APP
        }
    }, token)
    if not isinstance(response, list):
        raise ValueError("Malformed recent activity response")
    result = []
    for row in response:
        document = row.get("document")
        if not document:
            continue
        fields = document.get("fields", {})
        stamp = fields.get("createdAt", {}).get("timestampValue")
        timezone = fields.get("timezone", {}).get("stringValue", "Unknown")
        if not isinstance(stamp, str):
            raise ValueError("Invalid recorded activity timestamp")
        try:
            when = dt.datetime.fromisoformat(stamp.replace("Z", "+00:00")).astimezone(TZ)
        except (ValueError, TypeError) as exc:
            raise ValueError("Invalid event timestamp") from exc
        result.append({
            "app": app,
            "at": when,
            "timezone": timezone if isinstance(timezone, str) else "Unknown",
        })
    if len(result) > MAX_RECENT_PER_APP:
        raise ValueError("Recent activity was not bounded")
    return result


def toronto_day_bounds(now: dt.datetime | None = None):
    current = (now or dt.datetime.now(dt.timezone.utc)).astimezone(TZ)
    report_day = current.date() - dt.timedelta(days=1)
    start = dt.datetime.combine(report_day, dt.time.min, tzinfo=TZ)
    end = dt.datetime.combine(current.date(), dt.time.min, tzinfo=TZ)
    return report_day, start.astimezone(dt.timezone.utc), end.astimezone(dt.timezone.utc)


def create_summary(token: str, now: dt.datetime | None = None) -> tuple[str, str]:
    day, start, end = toronto_day_bounds(now)
    counts = {}
    recent = []
    for app, _ in APPS:
        previous_day = firestore_count(app, token, start, end)
        all_time = firestore_count(app, token)
        if previous_day > all_time:
            raise ValueError("Inconsistent totals, refusing to send")
        counts[app] = (previous_day, all_time)
        recent.extend(firestore_recent(app, token))
    recent.sort(key=lambda event: event["at"], reverse=True)
    recent = recent[:10]
    daily = sum(v[0] for v in counts.values())
    lifetime = sum(v[1] for v in counts.values())
    subject = f"Cuberoot APK clicks — {day.isoformat()} (Toronto)"
    lines = [
        "CUBEROOT APK DOWNLOAD COCKPIT",
        f"Reporting day: {day.isoformat()} (America/Toronto)",
        "",
        f"Recorded clicks yesterday: {daily:,}",
        f"All recorded clicks since tracking began: {lifetime:,}",
        "",
        "APP                         YESTERDAY    ALL TIME",
    ]
    for slug, label in APPS:
        yesterday, total = counts[slug]
        lines.append(f"{label:<27} {yesterday:>9,} {total:>11,}")
    lines.extend(["", "MOST RECENT RECORDED CLICKS (Toronto time)"])
    for event in recent:
        name = dict(APPS)[event["app"]]
        stamp = event["at"].strftime("%Y-%m-%d %I:%M %p %Z")
        lines.append(f"{stamp} — {name} — browser timezone: {event['timezone']}")
    if not recent:
        lines.append("No recent recorded clicks.")
    lines.extend([
        "",
        "These figures count recorded APK-link clicks, NOT verified",
        "completed downloads or installations. Counts can be missed",
        "or fabricated; browser timezones are not physical locations.",
        "",
        "Private summary for the configured Gmail account.",
        "Source: Cuberoot APK counter / split-it-44dea.",
    ])
    return subject, "\n".join(lines) + "\n"


def send_email(gmail_address: str, app_password: str, subject: str, body: str):
    # Deliver only to the sending Gmail account; never forward to arbitrary addresses.
    if not re.fullmatch(r"[A-Za-z0-9._%+-]+@(?:gmail|googlemail)\.com",
                        gmail_address, re.IGNORECASE):
        raise ValueError("Expected a valid personal Gmail address")
    secret = "".join(app_password.split())
    if len(secret) != 16 or not secret.isascii():
        raise ValueError("Expected a 16-character Gmail app password")
    message = EmailMessage()
    message["From"] = gmail_address
    message["To"] = gmail_address
    message["Subject"] = subject
    message.set_content(body)
    with smtplib.SMTP_SSL("smtp.gmail.com", 465,
                          context=ssl.create_default_context(), timeout=TIMEOUT_SECONDS) as smtp:
        smtp.login(gmail_address, secret)
        smtp.send_message(message)


def main():
    # Double fail-closed: GitHub workflow gate AND runtime gate.
    if os.environ.get("APK_COUNTER_DAILY_EMAIL_ENABLED", "") != "true":
        print("Daily email disabled; no Firestore request or email.")
        return
    api_key = required("APK_COUNTER_FIREBASE_WEB_API_KEY")
    reporter_email = required("APK_COUNTER_REPORTER_EMAIL")
    reporter_password = required("APK_COUNTER_REPORTER_PASSWORD")
    gmail_address = required("APK_COUNTER_GMAIL_ADDRESS")
    gmail_password = required("APK_COUNTER_GMAIL_APP_PASSWORD")
    token = firebase_id_token(api_key, reporter_email, reporter_password)
    subject, body = create_summary(token)
    send_email(gmail_address, gmail_password, subject, body)
    print("Daily cockpit summary sent. No credentials or private records logged.")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        # Avoid exposing Firebase ID tokens, API responses, or SMTP secrets in CI logs.
        print("Daily report NOT SENT: configuration, authentication, query or mail failed.",
              file=sys.stderr)
        sys.exit(1)
