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
import html
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


def current_day_window(now=None):
    """Continuous reporting day: previous 09:17 to current 09:17 Toronto."""
    now_utc = now or dt.datetime.now(dt.timezone.utc)
    if now_utc.tzinfo is None:
        raise ValueError("Timestamp must be timezone-aware")
    now_utc = now_utc.astimezone(dt.timezone.utc)
    local = now_utc.astimezone(counts.TZ)
    day = local.date()
    # Daily windows abut exactly at the same Toronto wall-clock time;
    # no afternoon, evening, or overnight click is ever omitted.
    previous_day = day - dt.timedelta(days=1)
    start = dt.datetime.combine(previous_day, dt.time(9, 17), tzinfo=counts.TZ).astimezone(dt.timezone.utc)
    scheduled_cutoff = dt.datetime.combine(day, dt.time(9, 17), tzinfo=counts.TZ)
    end = min(now_utc, scheduled_cutoff.astimezone(dt.timezone.utc))
    return day, start, end, end.astimezone(counts.TZ)


def build_report(now=None):
    day, start, end, local = current_day_window(now)
    if len(counts.APPS) != 7 or len({slug for slug, _ in counts.APPS}) != 7:
        raise ValueError("Seven unique applications required")
    lines = [
        "CUBEROOT APK DOWNLOADS",
        "Reporting date: " + day.isoformat() + " (America/Toronto)",
        "Period: since yesterday 09:17 AM Toronto through " + local.strftime("%I:%M %p %Z") + " today",
        "",
        f"{'APP':<27} {'SINCE LAST REPORT':>17} {'LIFETIME':>11}",
    ]
    day_total = lifetime_total = 0
    for slug, label in counts.APPS:
        today = counts.count(slug, start, end)
        lifetime = counts.count(slug, None, end)
        if any(type(value) is not int or value < 0 or value > 2**53-1
               for value in (today, lifetime)) or today > lifetime:
            raise ValueError("Invalid count for " + slug)
        day_total += today
        lifetime_total += lifetime
        lines.append(f"{label:<27} {today:>17,} {lifetime:>11,}")
    if max(day_total, lifetime_total) > 2**53-1:
        raise ValueError("Totals exceed safe integer range")
    lines.extend([
        f"{'ALL SEVEN':<27} {day_total:>17,} {lifetime_total:>11,}",
        "",
        "Each report covers the full reporting day ending at 09:17 AM Toronto.",
        "The count window includes the previous afternoon, evening, and overnight.",
        "Counts show download clicks, not necessarily completed downloads.",
        "Lifetime counts are also frozen at the 09:17 AM Toronto cutoff.",
        "Source: Cuberoot / split-it-44dea Firebase public aggregates.",
    ])
    return day.isoformat(), "\n".join(lines) + "\n"


def build_html_report(body):
    """Responsive, large-print HTML; values are taken from validated text report."""
    import re
    rows = []
    for line in body.splitlines():
        match = re.match(r"^(FIDUNIO|Scorecard|Fairpot|Wire|SpendRecorder|Cloud Files|The Marker|ALL SEVEN)\s+([\d,]+)\s+([\d,]+)$", line)
        if match:
            rows.append((match.group(1), match.group(2), match.group(3)))
    if len(rows) != 8 or [r[0] for r in rows] != [label for _, label in counts.APPS] + ["ALL SEVEN"]:
        raise ValueError("HTML table requires exactly seven apps and matching totals")
    # Reject incomplete or internally inconsistent reports before HTML/email delivery.
    numbers = [(int(d.replace(",", "")), int(l.replace(",", ""))) for _, d, l in rows]
    if any(d > l for d, l in numbers):
        raise ValueError("HTML table contains a daily count above its lifetime count")
    if (sum(d for d, _ in numbers[:7]), sum(l for _, l in numbers[:7])) != numbers[7]:
        raise ValueError("HTML table ALL SEVEN totals do not equal the seven app sums")
    date = re.search(r"Reporting date: (\d{4}-\d{2}-\d{2})", body)
    if not date:
        raise ValueError("Missing reporting date")
    trs = []
    for i, (name, daily, lifetime) in enumerate(rows):
        bg = "#e5f1ff" if i == 7 else ("#f3f6fa" if i % 2 else "#ffffff")
        weight = "700" if i == 7 else "500"
        trs.append(
            f'<tr style="background:{bg};font-weight:{weight}">'
            f'<td style="padding:15px 8px;border-bottom:1px solid #d8dfe8;word-break:normal">{html.escape(name)}</td>'
            f'<td align="right" style="padding:15px 8px;border-bottom:1px solid #d8dfe8;white-space:nowrap">{daily}</td>'
            f'<td align="right" style="padding:15px 8px;border-bottom:1px solid #d8dfe8;white-space:nowrap">{lifetime}</td></tr>')
    return (
        '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head>'
        '<body style="margin:0;padding:16px 10px;background:#fff;color:#17212f;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;text-size-adjust:100%">'
        '<main style="max-width:680px;margin:auto">'
        '<h1 style="font-size:28px;line-height:1.2;margin:8px 0 12px">Cuberoot APK Downloads</h1>'
        f'<p style="font-size:21px;margin:0 0 12px;font-weight:bold">{date.group(1)} · Toronto</p>'
        '<p style="font-size:18px;line-height:1.5;margin:0 0 20px">Reporting period: yesterday 9:17 AM to today 9:17 AM Toronto time.</p>'
        '<table role="table" width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;table-layout:fixed;font-size:19px;line-height:1.3">'
        '<thead><tr style="background:#183452;color:#fff;font-size:16px">'
        '<th align="left" style="width:45%;padding:14px 8px">App</th>'
        '<th align="right" style="width:27%;padding:14px 5px">Period*</th>'
        '<th align="right" style="width:28%;padding:14px 8px">Lifetime</th></tr></thead>'
        '<tbody>' + "".join(trs) + '</tbody></table>'
        '<p style="font-size:16px;line-height:1.4;color:#687384;margin:10px 0 0;-webkit-text-size-adjust:none!important;text-size-adjust:none!important>*9:17 AM to 9:17 AM Toronto reporting window (23 or 25 hours on daylight-saving changes).</p>'
        '<p style="font-size:15px;line-height:1.4;color:#687384;margin:5px 0 0;-webkit-text-size-adjust:none!important;text-size-adjust:none!important>Counts show download clicks, not necessarily completed downloads.</p>'
        '</main></body></html>'
    )


def send_email(api_key, subject, body, idempotency_key, pause=time.sleep, html_body=None):
    message = {"from": FROM_EMAIL, "to": [TO_EMAIL], "subject": subject, "text": body}
    if html_body is not None:
        message["html"] = html_body
    payload = json.dumps(message, separators=(",", ":")).encode("utf-8")
    for attempt in range(4):
        request = urllib.request.Request(RESEND_URL, data=payload, method="POST",
            headers={
                "Authorization": "Bearer " + api_key,
                "Content-Type": "application/json",
                "Accept": "application/json",
                "User-Agent": "Cuberoot-APK-Reporter/1.0",
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
    now = dt.datetime.now(dt.timezone.utc)
    day, start, cutoff, local_cutoff = current_day_window(now)
    date = day.isoformat()
    # An early cron trigger must not send a partial report or consume today's
    # idempotency key. Only start at/after 09:17 Toronto local time.
    if now.astimezone(counts.TZ).time() < dt.time(9, 17):
        raise RuntimeError("Too early: daily report requires at least 09:17 Toronto time")
    try:
        report_date, report_body = build_report(now)
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
    # V2 is deliberately separate from the previously delivered incorrect
    # same-day-only email; each corrected reporting day is still duplicate-safe.
    accepted = send_email(key, "Cuberoot APK Downloads - " + date,
                          report_body, "cuberoot-apk-daily-v3-" + date, html_body=build_html_report(report_body))
    print("PASS: Resend accepted " + date + " email ID=" + accepted)
    print("API acceptance is not proof of final inbox delivery.")


def selftest():
    from unittest.mock import patch
    now = dt.datetime.fromisoformat("2026-10-18T13:30:00+00:00")
    current, start, end, local = current_day_window(now)
    assert current.isoformat() == "2026-10-18"
    assert start == dt.datetime.fromisoformat("2026-10-17T13:17:00+00:00")
    assert end == dt.datetime.fromisoformat("2026-10-18T13:17:00+00:00")
    assert local.hour == 9 and local.minute == 17
    early = current_day_window(dt.datetime.fromisoformat("2026-10-18T13:00:00+00:00"))
    assert early[2] == dt.datetime.fromisoformat("2026-10-18T13:00:00+00:00")
    # The previous day's 09:17 endpoint is exactly this day's start.
    previous = current_day_window(dt.datetime.fromisoformat("2026-10-17T21:00:00+00:00"))
    assert previous[2] == start
    late = current_day_window(dt.datetime.fromisoformat("2026-10-18T22:00:00+00:00"))
    assert late[2] == end
    fall = current_day_window(dt.datetime.fromisoformat("2026-11-01T15:00:00+00:00"))
    assert fall[1] == dt.datetime.fromisoformat("2026-10-31T13:17:00+00:00")
    assert fall[2] == dt.datetime.fromisoformat("2026-11-01T14:17:00+00:00")
    assert (fall[2] - fall[1]).total_seconds() == 25 * 3600
    spring = current_day_window(dt.datetime.fromisoformat("2026-03-08T15:00:00+00:00"))
    assert spring[1] == dt.datetime.fromisoformat("2026-03-07T14:17:00+00:00")
    assert spring[2] == dt.datetime.fromisoformat("2026-03-08T13:17:00+00:00")
    assert (spring[2] - spring[1]).total_seconds() == 23 * 3600
    with patch.object(counts, "count", side_effect=[2, 12] * 7) as calls:
        day, body = build_report(now)
        assert day == "2026-10-18" and calls.call_count == 14
        assert "since yesterday 09:17 AM Toronto through 09:17 AM EDT today" in body
        for call in calls.call_args_list:
            assert call.args[-1] == end
        assert calls.call_args_list[0].args == ("fidunio", start, end)
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
    with patch.object(counts, "count", side_effect=[0, 0] * 7):
        _, sample = build_report(now)
        rendered = build_html_report(sample)
        assert rendered.split("<tbody>", 1)[1].split("</tbody>", 1)[0].count("<tr style=") == 8
        assert "The Marker" in rendered and "ALL SEVEN" in rendered
        assert "Cuberoot APK Downloads" in rendered
        assert "Counts show download clicks, not necessarily completed downloads." in rendered
        assert "23 or 25 hours on daylight-saving changes" in rendered
        assert ">Period*</th>" in rendered
        assert "2026-10-18" in rendered
        for corrupted in (__import__("re").sub(r"(?m)^(ALL SEVEN\s+)0(\s+0)$", r"\g<1>1\g<2>", sample),
                          sample.replace("The Marker", "The Missing App")):
            try: build_html_report(corrupted)
            except ValueError: pass
            else: raise AssertionError("Malformed HTML report was accepted")
    class MockResponse:
        def __enter__(self): return self
        def __exit__(self, *args): return False
        def read(self, *args): return b'{"id":"accepted-email-id"}'
    with patch("urllib.request.urlopen", return_value=MockResponse()) as request:
        assert send_email("re_test", "test", "body", "test-unique") == "accepted-email-id"
        assert request.call_args.args[0].get_header("Idempotency-key") == "test-unique"
    print("PASS: seven apps / continuous 09:17-to-09:17 Toronto day / DST / zero / totals / fail-closed / idempotency tests")


if __name__ == "__main__":
    if "--self-test" in sys.argv:
        selftest()
    else:
        try: main()
        except Exception as exc:
            print("FAILED: " + type(exc).__name__ + ": " + str(exc)[:200],
                  file=sys.stderr)
            sys.exit(1)
