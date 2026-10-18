# Cuberoot daily APK email — cron-job.org + Apps Script

The current implementation sends an actual Gmail email **without Google Cloud,
OAuth credentials, Gmail app passwords, GitHub tokens, or GitHub scheduling**.

## One-time account steps (only owner actions)

1. Open https://script.google.com/home/projects/create while signed in to
   **willyros01@gmail.com**, and name the script `Cuberoot Daily APK Mailer`.
2. Delete the starter code in `Code.gs`. Copy the **full contents** of
   [Cuberoot_Daily_APK_Mailer.gs](./Cuberoot_Daily_APK_Mailer.gs) into the editor
   and save. Do not copy only part of the file.
3. In the function selector above the code, select `initialize` and click
   **Run**. Review and approve Google's permissions for sending email and
   calling external URLs. Check the Execution log for `READY`.
4. Click **Deploy** → **New deployment** → gear icon **Web app**. Set
   **Execute as: Me** and **Who has access: Anyone**; then Deploy.
   This grants anonymous *invocation* only, not access to the Gmail account.
   The handler requires a long private token and sends only to the owner.
5. In the editor, select `showCronUrl` and click **Run**. Open **Execution log**,
   copy the entire `https://script.google.com/.../exec?token=...` URL privately.
   Do not paste this URL, token, or credentials into chats.
6. Sign in at https://console.cron-job.org/ and create
   `Cuberoot Daily APK Email`. Paste the full private URL from step 5,
   set **GET**, daily **09:17**, timezone **America/Toronto**, enable
   failure notifications, then save **disabled** until tested.
7. Trigger a manual cron-job.org test. Check the HTTP response (it should
   include `PASS SENT YYYY-MM-DD` or `PASS ALREADY_SENT YYYY-MM-DD`),
   confirm the email is in Inbox and Sent, and confirm seven counts and totals.
   Once verified, enable the cron job. After an actual unattended automatic
   send is confirmed, retire the old ChatGPT scheduled email task.

## Logic / boundaries

- Every run directly reads public Firebase aggregates, 14 count requests for
  seven apps: FIDUNIO, Scorecard, Fairpot, Wire, SpendRecorder, Cloud Files,
  The Marker. No GitHub Actions or separate midnight publishing prerequisite.
- Yesterday is the previous **Toronto calendar date**. UTC boundaries are
  calculated per local midnight, including 23-/25-hour DST changes.
- Send one success email per date; duplicate invocations return
  `PASS ALREADY_SENT`. A private token and Apps Script lock reduce abuse and
  races. The script never forwards email to a third party.
- An incomplete/invalid count prevents a numeric success message and triggers
  a failure-status email (once per day), when Google sending is operational.
- Owner uses Google's Apps Script built-in MailApp authorization; no app
  password, new Cloud project, OAuth refresh token, or GitHub PAT is required.
- Keep the deployment URL private. If compromised, rotate the `CRON_TOKEN`
  script property, regenerate the URL using `showCronUrl`, and update cron.
- Google services and cron-job.org can still fail; inspect the Script
  **Executions** tab and cron execution history. Do not mark as operational
  before verifying a real unattended email.

The obsolete GitHub SMTP approach was reverted and remains manual-only;
existing Firebase counting and public GitHub issue report stay unchanged.
