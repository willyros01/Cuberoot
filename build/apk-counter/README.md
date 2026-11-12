# Current Cuberoot download-click email

The active production sender is `resend-daily.py`, importing its ten-category catalog and Firestore aggregation function from `public-report.py`. Older SMTP and Google Apps Script files in this directory are historical alternatives, not the current daily service.

- Existing cron-job.org job: **Cuberoot Daily APK Email**, daily **09:17 America/Toronto**.
- Existing canonical target: `https://api.github.com/repos/willyros01/Cuberoot/actions/workflows/386014186/dispatches`, POST `{"ref":"main"}` with the existing private scheduler authorization. Do not replace the endpoint or create a new token.
- Existing workflow file/ID stays `.github/workflows/apk-counter-daily-email.yml` / `386014186`. Its legacy display name stays compatible with operational history.
- Existing Resend secret/sender domain and recipient stay in use: `CUBEROOT_RESEND_API_KEY`, `onboarding@resend.dev`, owner `willyros01@gmail.com`. Display name is now Cuberoot Download Report.
- Subject: **Cuberoot Download Clicks - YYYY-MM-DD**.
- Seven original rows plus **ATE Windows**, **ATE Mac Universal**, **ATE Android**. Total row is **ALL APPS**. Plain text and HTML both require all ten verified categories and matching totals.
- Reporting period remains previous-day 09:17 through current-day 09:17 Toronto, exclusive end; lifetime is frozen at that same cutoff. DST windows can be 23 or 25 hours. Delayed dispatch does not extend the cutoff.
- The existing date-specific daily idempotency key is deliberately preserved. A manual test has a separate run-specific key and `(TEST)` subject; it does not consume the daily key or resend the normal report.
- Font sizes remain unchanged: 19px table, 28px heading and readable period text. Mobile/tablet browser layout checks use explicitly synthetic sample numbers and send no email.
- Location remains in the private cockpit. The daily email reports counts; it does not claim geographic verification or completed installations.

## Verification and explicit test sending

Offline checks:

```bash
python3 build/apk-counter/public-report.py --self-test
python3 build/apk-counter/resend-daily.py --self-test
```

`download-email-acceptance.yml` verifies formatting, then only on an explicit main-branch manual run or `[download-acceptance]` commit performs **three real browser download clicks** and sends one owner test email. The real browser uses the published website and actual Firebase SDK without mock writes. Each file checksum and matching new timestamp/build/timezone record must pass before mail is sent. These are real verification clicks and remain included in the counters; the test never fabricates event documents or deletes records.

`send-test.py` uses the latest completed 09:17 reporting period. Tests after today's cutoff can correctly show zero for new ATE rows even after afternoon verification clicks; those clicks belong to tomorrow's scheduled report. A service acceptance ID is not proof of Inbox delivery: verify the owner's Gmail message separately.

The existing reusable `apk-report-resend-test.yml` now calls the same current `send-test.py` instead of stale seven-app/font assertions. Public issue reporting also uses all ten categories, while retaining its historical previous-calendar-day window. That issue snapshot is separate from the email's continuous 09:17 window.

Rollout status and actual email/click verification evidence are recorded in `docs/APK-COCKPIT.md`.
