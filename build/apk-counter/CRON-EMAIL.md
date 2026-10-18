# Cuberoot daily APK email — cron-job.org setup

This uses no Google Cloud project. cron-job.org triggers the GitHub
`workflow_dispatch` endpoint; GitHub Actions reads the public Firestore
aggregates for all seven apps and sends Gmail-to-Gmail over SMTP.

## Owner one-time setup

1. Open https://myaccount.google.com/security and enable **2-Step Verification**
   for `willyros01@gmail.com` if it is not already enabled.
2. Open https://myaccount.google.com/apppasswords and create an app password
   with label `Cuberoot Daily APK`. Copy the 16-character password privately.
   App passwords may be unavailable for managed accounts, Advanced Protection,
   or 2FA configured with security keys only.
3. Open https://github.com/willyros01/Cuberoot/settings/secrets/actions and add
   a repository Actions secret named `CUBEROOT_GMAIL_APP_PASSWORD` with the
   16-character Gmail app password. Do not place secrets in code or chat.
4. Open https://github.com/settings/personal-access-tokens/new; create a
   fine-grained token named `Cuberoot APK cron`, restricted to the Cuberoot
   repository, with Actions **Read and write**. Track its expiration.
5. In https://console.cron-job.org/ create `Cuberoot Daily APK Email`.
   - URL: `https://api.github.com/repos/willyros01/Cuberoot/actions/workflows/apk-counter-daily-email.yml/dispatches`
   - Method: POST
   - Request headers:
     `Accept: application/vnd.github+json`
     `Content-Type: application/json`
     `Authorization: Bearer <YOUR_GITHUB_TOKEN>`
   - Raw request body: `{"ref":"main"}`
   - Daily at 09:17 **America/Toronto** if the scheduler supports that time zone.
     Otherwise use 13:17 UTC in daylight saving time, 14:17 UTC in winter,
     with seasonal adjustment.
   - Enable failed-request notifications and save DISABLED until tested.
6. Manually test the cron-job; GitHub returns HTTP 204 for accepted dispatch.
   Check https://github.com/willyros01/Cuberoot/actions for successful
   `Cuberoot APK Daily Gmail Summary` and check actual Gmail Inbox and Sent.
7. Once the end-to-end test passes, enable cron-job.org, verify one unattended
   scheduled delivery, then retire the old ChatGPT Gmail scheduled task.

## Logic

- Calculate yesterday using America/Toronto calendar day and daylight-saving
  boundaries, not UTC calendar day.
- Read the existing public Firebase count aggregates for FIDUNIO, Scorecard,
  Fairpot, Wire, SpendRecorder, Cloud Files, and The Marker (no Firebase changes).
- Every success email includes seven daily and lifetime counts, including zeros.
- Refuse incomplete, negative or inconsistent counts.
- Check Gmail Sent via IMAP before SMTP submission to avoid duplicates.
  Requires Gmail app-password access to SMTP and IMAP; if IMAP is disabled,
  the run fails safely rather than risking duplicate delivery.
- If counts cannot be verified, send a failure-status email rather than inventing
  counts, and fail the GitHub job.
- The workflow is **not scheduled on GitHub**. A separate push-triggered
  offline verification job tests source changes but never sends email.

## Diagnostics

- HTTP 401/403 cron: check GitHub token and Actions permission.
- HTTP 404 cron: verify URL, token repo access, and workflow filename.
- HTTP 204 but no email: inspect GitHub Actions, not cron-job.org.
- GitHub error on password: confirm repository secret and Gmail app password.
- GitHub error on IMAP: enable Gmail IMAP access if available for the account.
- If a token or app password is revoked or expires, renew it in the service
  and update the corresponding secret/header directly.
- Do not disable the existing ChatGPT email task until a new unattended
  delivery has been verified.
