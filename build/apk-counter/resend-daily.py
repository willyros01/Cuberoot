#!/usr/bin/env python3
"""Cuberoot: verified seven-app APK email via Resend, invoked by cron-job.org.

No Google Cloud, Gmail password, Google Apps Script, SMTP, or custom sender domain.
The default Resend testing sender may send only to the Resend account owner's email;
register Resend using the exact destination willyros01@gmail.com.
"""
from __future__ import annotations

import datetime as dt
import importlib.util
import json
import os
from pathlib import Path
import sys
import time
import urllib.error
import urllib.request

SOURCE = Path(__file__).with_name("public-report.py")
spec = importlib.util.spec_from_file_location("cuberoot_public_counts", SOURCE)
counts = importlib.util.module_from_spec(spec)
spec.loader.exec_module(counts)

TO_EMAIL = "willyros01@gmail.com"
FROM_EMAIL = "Cuberoot APK Report <onboarding@resend.dev>"
RESEND_URL = "https://api.resend.com/emails"


def build_report(now=None):
    day, start, end = counts.bounds(now)
    if len(counts.APPS) != 7 or len({slug for slug, _ in counts.APPS}) != 7:
        raise ValueError("Seven unique applications required")
    lines = [
        "CUBEROOT APK DOWNLOAD REPORT",
        "Reporting day: " + day.isoformat() + " (America/Toronto)",
        "",
        f"{'APP':<27} {'YESTERDAY':>10} {'LIFETIME':>11}",
    ]
    day_total = lifetime_total = 0
    for slug, label in counts.APPS:
        yesterday = counts.count(slug, start, end)
        lifetime = counts.count(slug)
        if any(type(value) is not int or value < 0 or value > 2**53-1
               for value in (yesterday, lifetime)) or yesterday > lifetime:
            raise ValueError("Invalid count for " + slug)
        day_total += yesterday
        lifetime_total += lifetime
        lines.append(f"{label:<27} {yesterday:>10,} {lifetime:>11,}")
    if max(day_total, lifetime_total) > 2**53-1:
        raise ValueError("Totals exceed safe integer range")
    lines.extend([
        f"{'ALL SEVEN':<27} {day_total:>10,} {lifetime_total:>11,}",
        "",
        "Recorded APK-link clicks, not confirmed downloads or installations.",
        "All-time counts are measured when this report is prepared.",
        "Source: Cuberoot / split-it-44dea Firebase public aggregates.",
    ])
    return day.isoformat(), "\n".join(lines) + "\n"


def send_email(api_key, subject, body, idempotency_key, pause=time.sleep):
    payload = json.dumps({
        "from": FROM_EMAIL, "to": [TO_EMAIL], "subject": subject, "text": body
    }, separators=(",", ":")).encode("utf-8")
    for attempt in range(4):
        request = urllib.request.Request(RESEND_URL, data=payload, method="POST",
            headers={
                "Authorization": "Bearer " + api_key,
                "Content-Type": "application/json",
                "Accept": "application/json",
                "Idempotency-Key": idempotency_key,
            })
        try:
            with urllib.request.urlopen(request, timeout=35) as response:
                result = json.loads(response.read(10000))
            email_id = result.get("id")
            if not isinstance(email_id, str) or not email_id:
                raise ValueError("Resend did not confirm an email ID")
            return email_id
        except urllib.error.HTTPError as exc:
            if exc.code == 409:
                # Two possible 409s: already sent with a different payload or
                # still processing concurrently. Never blindly claim success.
                body_response = exc.read(4096).decode("utf-8", "replace")
                try:
                    code = json.loads(body_response).get("name") or json.loads(body_response).get("error", {}).get("name")
                except (ValueError, AttributeError):
                    code = None
                if code == "invalid_idempotent_request":
                    # The service reports a different body was previously
                    # submitted with this key. Do NOT mark it as a success.
                    raise RuntimeError("A report with this date key already exists with different content; check Resend delivery history") from None
                if code == "concurrent_idempotent_requests" and attempt < 3:
                    pause(2 ** (attempt + 1))
                    continue
                raise RuntimeError("Resend returned conflict; verify existing delivery") from None
            if exc.code not in (408, 425, 429, 500, 502, 503, 504):
                # Show only the provider's short public error category/message.
                # Never log the Authorization header or secret.
                details = ""
                try:
                    error_data = json.loads(exc.read(4096))
                    category = str(error_data.get("name", ""))[:80]
                    message = str(error_data.get("message", ""))[:240]
                    details = (" (" + category + ": " + message + ")") if category or message else ""
                except (ValueError, AttributeError, TypeError):
                    pass
                raise RuntimeError("Resend rejected request: HTTP " + str(exc.code) + details) from None
            last_error = "Resend temporarily unavailable: HTTP " + str(exc.code)
        except (urllib.error.URLError, TimeoutError):
            last_error = "Resend connection timeout"
        if attempt == 3:
            raise RuntimeError(last_error + " after four attempts")
        pause(2 ** (attempt + 1))
    raise RuntimeError("Resend acceptance not confirmed")


def main():
    key = os.environ.get("CUBEROOT_RESEND_API_KEY", "").strip()
    if not key.startswith("re_"):
        raise ValueError("Missing or invalid CUBEROOT_RESEND_API_KEY GitHub secret")
    date = counts.bounds()[0].isoformat()
    try:
        report_date, report_body = build_report()
        if report_date != date:
            raise ValueError("Toronto date changed during report calculation")
    except Exception:
        try:
            accepted = send_email(
                key, "Cuberoot APK report FAILURE - " + date,
                "Seven-app APK data could not be verified for " + date +
                ". No figures were invented. Review GitHub Actions.",
                "cuberoot-apk-failure-" + date)
            print("Failure-status message accepted by Resend ID=" + accepted)
        except Exception as exc:
            print("Failure-status email also failed: " + type(exc).__name__, file=sys.stderr)
        raise RuntimeError("Verified report could not be created") from None
    accepted = send_email(key, "Cuberoot APK clicks - " + date,
                          report_body, "cuberoot-apk-daily-" + date)
    print("PASS: Resend accepted " + date + " email ID=" + accepted)
    print("API acceptance is not proof of final inbox delivery.")


def selftest():
    from unittest.mock import patch
    now = dt.datetime.fromisoformat("2026-10-18T13:30:00+00:00")
    with patch.object(counts, "count", side_effect=[2, 12] * 7) as calls:
        day, body = build_report(now)
        assert day == "2026-10-17" and calls.call_count == 14
        assert body.count("\n") >= 14 and "ALL SEVEN" in body
        assert "14" in body and "84" in body
        assert all(label in body for _, label in counts.APPS)
    with patch.object(counts, "count", side_effect=[0, 0] * 7):
        _, body = build_report(now)
        assert "ALL SEVEN" in body and "0" in body
    with patch.object(counts, "count", side_effect=[5, 4] * 7):
        try: build_report(now)
        except ValueError: pass
        else: raise AssertionError("Inconsistent count was accepted")
    with patch.object(counts, "count", side_effect=[0, 0] * 6 + [ValueError("403")]):
        try: build_report(now)
        except ValueError: pass
        else: raise AssertionError("Incomplete count was accepted")
    class MockResponse:
        def __enter__(self): return self
        def __exit__(self, *args): return False
        def read(self, *args): return b'{"id":"accepted-email-id"}'
    with patch("urllib.request.urlopen", return_value=MockResponse()) as request:
        assert send_email("re_test", "test", "body", "test-unique") == "accepted-email-id"
        assert request.call_args.args[0].get_header("Idempotency-key") == "test-unique"
    print("PASS: seven apps / date / zero / totals / fail-closed / idempotency tests")


if __name__ == "__main__":
    if "--self-test" in sys.argv:
        selftest()
    else:
        try: main()
        except Exception as exc:
            print("FAILED: " + type(exc).__name__ + ": " + str(exc)[:200],
                  file=sys.stderr)
            sys.exit(1)
