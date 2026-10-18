#!/usr/bin/env python3
"""Cron-triggered seven-app APK report, delivered through Gmail API."""
import base64
import datetime as dt
import importlib.util
import json
import os
import pathlib
import sys
import urllib.parse
import urllib.request
from email.message import EmailMessage

SOURCE = pathlib.Path(__file__).with_name("public-report.py")
spec = importlib.util.spec_from_file_location("apk_public_report", SOURCE)
report = importlib.util.module_from_spec(spec)
spec.loader.exec_module(report)
SENDER = "willyros01@gmail.com"
MARKER = "CUBEROOT_APK_DAILY:v1"

def api(url, data=None, token=None, method=None):
    headers = {"Accept": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    if data is not None:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=None if data is None else json.dumps(data).encode(),
                                 headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=40) as response:
        payload = response.read(2000000)
        return json.loads(payload) if payload else {}

def access_token():
    fields = {
        "client_id": os.environ["CUBEROOT_GMAIL_CLIENT_ID"],
        "client_secret": os.environ["CUBEROOT_GMAIL_CLIENT_SECRET"],
        "refresh_token": os.environ["CUBEROOT_GMAIL_REFRESH_TOKEN"],
        "grant_type": "refresh_token",
    }
    req = urllib.request.Request("https://oauth2.googleapis.com/token",
                                 urllib.parse.urlencode(fields).encode(),
                                 headers={"Content-Type": "application/x-www-form-urlencoded"})
    with urllib.request.urlopen(req, timeout=40) as response:
        return json.load(response)["access_token"]

def send(token, subject, body):
    message = EmailMessage()
    message["From"] = SENDER
    message["To"] = SENDER
    message["Subject"] = subject
    message.set_content(body)
    raw = base64.urlsafe_b64encode(message.as_bytes()).decode().rstrip("=")
    result = api("https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
                 {"raw": raw}, token)
    if not result.get("id"):
        raise RuntimeError("Gmail did not confirm message ID")
    return result["id"]

def sent_already(token, day):
    # Gmail search is scoped to sent mail, matching the exact report date.
    q = urllib.parse.quote(f'in:sent from:{SENDER} to:{SENDER} subject:"Cuberoot APK clicks - {day}"')
    result = api("https://gmail.googleapis.com/gmail/v1/users/me/messages?q=" + q, token=token)
    return bool(result.get("messages"))

def main():
    day, _, _ = report.bounds()
    date = day.isoformat()
    subject = f"Cuberoot APK clicks - {date}"
    token = access_token()
    if sent_already(token, date):
        print("PASS: already sent for " + date)
        return
    try:
        actual_day, body = report.calculate()
        if actual_day != date or MARKER not in body:
            raise ValueError("Invalid report date or marker")
        # The calculator checks all seven counts and refuses partial results.
    except Exception as exc:
        print("ERROR: report unavailable: " + type(exc).__name__, file=sys.stderr)
        failure_subject = f"Cuberoot APK report FAILURE - {date}"
        send(token, failure_subject,
             f"APK report for {date} could not be verified. No counts were invented. Check GitHub Actions.")
        raise
    message_id = send(token, subject, body)
    print("PASS: Gmail message confirmed for " + date + " ID " + message_id)

if __name__ == "__main__":
    main()
