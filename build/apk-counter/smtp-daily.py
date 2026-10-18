#!/usr/bin/env python3
"""Daily Cuberoot seven-app summary via personal Gmail SMTP + IMAP.

Triggered by cron-job.org through GitHub Actions workflow_dispatch.
Only one secret is required: CUBEROOT_GMAIL_APP_PASSWORD.
No Google Cloud project, OAuth client or Firebase login is needed.
"""
from __future__ import annotations

import datetime as dt
import email
from email.message import EmailMessage
import imaplib
import importlib.util
import os
from pathlib import Path
import re
import smtplib
import ssl
import sys

SENDER = "willyros01@gmail.com"
SCRIPT = Path(__file__).with_name("public-report.py")
spec = importlib.util.spec_from_file_location("cuberoot_public_report", SCRIPT)
public_report = importlib.util.module_from_spec(spec)
spec.loader.exec_module(public_report)

def app_password():
    value = "".join(os.environ.get("CUBEROOT_GMAIL_APP_PASSWORD", "").split())
    if not re.fullmatch(r"[A-Za-z0-9]{16}", value):
        raise ValueError("CUBEROOT_GMAIL_APP_PASSWORD must be a Gmail 16-character app password")
    return value

def in_sent_mail(subject: str, password: str) -> bool:
    """Fail closed if Sent cannot be checked, to avoid duplicate delivery."""
    with imaplib.IMAP4_SSL("imap.gmail.com", 993, timeout=30) as box:
        box.login(SENDER, password)
        status, _ = box.select('"[Gmail]/Sent Mail"', readonly=True)
        if status != "OK":
            raise RuntimeError("Cannot inspect Gmail Sent for duplicate prevention")
        status, results = box.search(None, "HEADER", "Subject", '"' + subject + '"')
        if status != "OK" or len(results) != 1:
            raise RuntimeError("Gmail Sent search did not complete")
        for number in results[0].split():
            status, items = box.fetch(number, "(BODY.PEEK[HEADER.FIELDS (SUBJECT)])")
            if status != "OK":
                raise RuntimeError("Cannot verify Gmail Sent subject")
            for item in items:
                if isinstance(item, tuple):
                    headers = email.message_from_bytes(item[1])
                    if str(headers.get("Subject", "")) == subject:
                        return True
        return False

def deliver(subject: str, body: str, password: str):
    message = EmailMessage()
    message["From"] = SENDER
    message["To"] = SENDER
    message["Subject"] = subject
    message.set_content(body)
    with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=30,
                          context=ssl.create_default_context()) as server:
        server.login(SENDER, password)
        server.send_message(message)

def execute():
    password = app_password()
    day, _, _ = public_report.bounds()
    date = day.isoformat()
    subject = "Cuberoot APK clicks - " + date
    if in_sent_mail(subject, password):
        print("PASS: report already emailed for " + date + "; no duplicate")
        return
    try:
        verified_date, body = public_report.calculate()
        if verified_date != date or "<!-- CUBEROOT_APK_DAILY:v1 -->" not in body:
            raise ValueError("APK report date or marker inconsistent")
        if len(public_report.APPS) != 7:
            raise ValueError("Seven apps were not included")
        body = body.replace("<!-- CUBEROOT_APK_DAILY:v1 -->\n", "", 1)
    except Exception as ex:
        failure_subject = "Cuberoot APK report FAILURE - " + date
        if not in_sent_mail(failure_subject, password):
            deliver(failure_subject,
                    "The APK click report for " + date +
                    " could not be verified. No download counts were invented. " +
                    "Check the GitHub Actions workflow for details.\n", password)
        print("FAIL: Seven-app count unavailable: " + type(ex).__name__, file=sys.stderr)
        raise RuntimeError("Report could not be verified") from None
    deliver(subject, body, password)
    print("PASS: seven-app daily email submitted to Gmail SMTP for " + date)

def selftest():
    assert len(public_report.APPS) == 7
    assert len(set(name for name, _ in public_report.APPS)) == 7
    from unittest.mock import patch
    with patch.dict(os.environ, {"CUBEROOT_GMAIL_APP_PASSWORD": "abcd efgh ijkl mnop"}):
        assert app_password() == "abcdefghijklmnop"
    with patch.dict(os.environ, {"CUBEROOT_GMAIL_APP_PASSWORD": "invalid"}):
        try:
            app_password()
            raise AssertionError("Accepted invalid password")
        except ValueError:
            pass
    print("PASS: email sender offline validation")

if __name__ == "__main__":
    if "--self-test" in sys.argv:
        selftest()
    else:
        try:
            execute()
        except Exception:
            print("FAILED: Email delivery not confirmed. Verify GitHub Actions and Gmail settings.",
                  file=sys.stderr)
            sys.exit(1)
