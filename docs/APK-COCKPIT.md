## APK cockpit date range — October 2026

The date-range control is available in Publish > APK downloads. Choose inclusive From and To dates in Toronto local time, then Apply dates. Clear dates restores the original Today and All-time screen. Filtering includes six per-app totals and the activity list, with All-time counts visible for comparison. The app dropdown and Refresh remain functional.

Changed only Cuberoot cockpit JavaScript, cockpit CSS, and versioned imports. Existing downloads, email scheduling, Firestore policies, and unrelated app code were left unchanged.

Offline tests passed: Toronto DST start/end, reversed and invalid dates, six-app Firestore period queries, Apply/Refresh/Clear interactions. The GitHub Pages deployment for commit 7d72d8dc7b590bf6cb0d0cb04ba0e58c653d0189 succeeded in run 38833015253. Actual Safari owner testing is still pending.

## Live APK counts + daily Gmail — 15 October 2026

Owner approved **public read-only access to APK click event records** on 15 October 2026. NOTE: raw click records therefore expose app/build, click timestamp, and browser-reported timezone; this privacy exposure was explicitly authorized. The owner executed a one-time Cloud Shell helper and supplied its verified PASS report. The helper said:

- Project `split-it-44dea`; active ruleset `projects/split-it-44dea/rulesets/16e05720-96fa-4e6b-bbfc-a9fa4d6d899f`; proposal source SHA-256 `748011170639dfbc02ec1b6e5ff1114c1b626b0cf907a2c66b571e4a3ca04007`; backup `pub-backup-20261016-004937.txt`.
- Status `PASS: PUBLIC READ + SIX COUNTS VERIFIED`. Existing `/households` rules and APK click-write rules were preserved **exactly** per owner output.
- Actual Firestore counts for reporting date **2026-10-14 Toronto**: fidunio 0/1, scorecard 0/1, fairpot 0/2, wire 0/0, spendrecorder 0/0, cloud-files 0/0 (yesterday/lifetime respectively); total 0/4.
- Cuberoot `main` includes `build/apk-counter/public-report.py`, which queries all twelve (six yesterday/six lifetime) public Firestore aggregate counts and validates every response. `.github/workflows/apk-counter-public-report.yml` runs this reporter **daily 08:17 Toronto**, publishing validated daily numbers to a *dedicated public GitHub issue* [#10](https://github.com/willyros01/Cuberoot/issues/10). It is not designed to reveal raw event records. Any bad/missing query fails closed, leaving existing report untouched. The existing password-based GitHub Actions email workflow was **not activated**.
- The ChatGPT daily task **Cuberoot Daily APK Email** is scheduled for **09:17 Toronto**, consumes GitHub issue #10 after checking exact previous date, all six numeric rows, and totals, checks Gmail Sent for duplicates, and sends using the connected Gmail account. It MUST NOT send fake, incomplete, stale or link-only reports. The task was created and is enabled. No account/app passwords stored by Cuberoot.
- The verified **first real-count email** was sent using the connected Gmail connector from/to `willyros01@gmail.com`; subject `Cuberoot APK clicks — 2026-10-14 (Toronto)`, Gmail confirmed Sent/Inbox message ID `1a142331ade9deef`; it contained the owner's actual Firestore-verified 0 yesterday/4 lifetime, with all six app rows. GitHub issue #10 was updated and read back successfully with the same owner-verified snapshot.
- **Future daily automatic integration remains unproven until the next scheduled reporting run and actual email are observed.** GitHub Actions schedule is best-effort and may be delayed, causing ChatGPT daily task to refuse stale source data; this is safe failure, not a zero count. Verify first automatic 08:17 and 09:17 runs before claiming unattended delivery reliable.
- Do not interpret any earlier private-reporter/App Script instructions below as current requirements; they were superseded by this approved public-read reporting flow.

## Approved six-app email path — owner Firebase activation pending (October 2026)

Owner explicitly authorized public READ of six APK click-event collections, but **not any changes to existing household rules**. Event fields may include timestamps, timezone and build; this is a privacy trade-off the owner accepted to automate private email reporting.

- Secure activation helper, distributed as a short iPad-downloadable ChatGPT attachment: `pub.txt`. Owner uploads to Google Cloud Shell and types `bash pub.txt`. No GitHub login, Gmail app password, new email account, paid services, CLI copy/paste or lengthy commands.
- `pub.txt` verifies project `split-it-44dea` number `153404639150`, current active Firestore ruleset `e795cb31-c0a1-4730-898b-5e6bd7ca4cf6` and source SHA `9e9cb47886c728628bc7c3d11e4ece77d38b8a6df00607d33c9705267f02ecf1`. It replaces only `allow get, list: if isOwner();` on the APK event collection with `allow get, list: if isOwner() || allowedApp();`, limiting public read to six allowlisted app slugs. Exact household rules, public create validation, update/delete denials stay byte-identical. Immutable original ruleset and copy backup retained for rollback.
- Helper creates candidate rules, verifies content and active release, publishes, then executes **12 public unauthenticated Firestore aggregation requests** (yesterday and lifetime for all six) using only the public Firebase web API key. Output `pubout.txt` contains PASS/FAIL and true counts (no credentials). On verification failure it attempts to restore original ruleset if no concurrent Firebase deployment occurred.
- Dedicated public GitHub Issue **#10** (`https://github.com/willyros01/Cuberoot/issues/10`) is the report handoff. File `build/apk-counter/public-report.py` makes 12 unauthenticated Firestore count requests. Workflow `.github/workflows/apk-counter-public-report.yml` runs daily at **08:17 America/Toronto**, updates #10 **only if all real counts succeed** using built-in GitHub Actions `GITHUB_TOKEN`; no SMTP or Firebase passwords. On workflow source changes offline selftests run. Source includes six-app, DST and fail-closed tests.
- Scheduled ChatGPT task `Cuberoot Daily APK Email` is set for **09:17 America/Toronto**. It must verify issue #10's exact previous-day date, all six numeric counts and checksum totals and Gmail Sent mail deduplication, then send from/to owner Gmail with Gmail connector. If report unavailable, stale or invalid, **no email is sent** and task should surface failure. This architecture relies on connected GitHub and Gmail app permissions at scheduled execution. It has not been verified with a real scheduled run.
- **DEPLOYMENT STATUS: PENDING** until owner executes `pub.txt` and returns `PASS: PUBLIC READ + SIX COUNTS VERIFIED`, GitHub workflow successfully updates issue #10 with real numbers, and connected Gmail sends a real report. No private Firebase change was performed from ChatGPT. Prior `.github/workflows/apk-counter-daily-email.yml` remains inactive because `APK_COUNTER_MAIL_CONFIG` is not set; do not enable to avoid duplicate emails.
- Local automated mock tests passed for complete setup, all six counts, unchanged rules and rollback on a failed per-app read, plus Python/Bash syntax validation. **These are not live tests**; do not represent the email as active until a real test is confirmed.

## Google Apps Script no-password alternative (prepared, NOT deployed) — October 2026

The user requires one complete, tested solution rather than a sequence of partial fixes. A **proposed** Google Apps Script implementation has been created and locally tested, but it **cannot honestly be called end-to-end verified or activated** without owner Google OAuth authorization and a live Firebase IAM query.

- Proposed architecture: Apps Script `ScriptApp.getOAuthToken()` with explicit `https://www.googleapis.com/auth/datastore` OAuth scope, Firestore REST `runAggregationQuery` via existing Google IAM (not Firebase client security rules), and Google `MailApp.sendEmail`. The owner-only Firestore rules and working APK cockpit remain unchanged. No GitHub CLI, SMTP app password, dedicated Firebase Auth reporter, key file, Cloud Functions, Cloudflare, or paid billing.
- A single `activateAndTest` script function will require user OAuth consent, aggregate actual previous-Toronto-day and lifetime click counts for all six apps, send a real email, and **only after a successful send** create one daily Google Apps Script clock trigger with `.atHour(9).nearMinute(17).everyDays(1).inTimezone('America/Toronto')`. The trigger time is approximate **+/-15 minutes** per Google's documentation; never claim exact minute.
- Delivered source files in the ChatGPT workspace bundle `mail.zip`: `mail.gs`, `appsscript.json`, `INSTALL.txt`. Offline Node simulation **PASS**: syntax, manifest OAuth scopes, DST 23/25-hour Toronto calendar days, six-app aggregation, 12 query request bodies, simulated mail send and trigger installation, single-trigger idempotence, and fail-closed Firebase 403, missing/bad results, and MailApp errors.
- The Apps Script browser code editor is reported difficult or unusable on iPads. **Do not instruct the owner to use Cloud Shell copy/paste or assume that the Apps Script mobile editor works**. One-time activation in a proper desktop browser may be necessary.
- As of this documentation, there has been **NO live Apps Script deployment, OAuth owner authorization, actual Firestore query via Apps Script, Gmail email from Apps Script, or trigger registration**. Original GitHub Actions daily-email sender is disabled until owner secrets are configured. Do not represent either system as active, and avoid creating duplicate report schedules.


# Simple APK cockpit

Owner scope: GitHub + Firebase only. Cuberoot's current APK hosting, links, files and publisher remain unchanged. No Cloudflare Worker, routes, D1 database or geolocation service. The earlier PR #9 Cloudflare implementation is superseded.

## Google sign-in visibility correction — 15 October 2026

- Before Google owner authentication, Cuberoot Publish's **APK downloads** tab shows only the private Google sign-in prompt; all six APK app cards and report contents are **hidden**.
- After successful owner-only Google sign-in, the static app names and placeholder totals render immediately, then Firebase counts load in the background.
- This correction changes only `assets/js/downloads-admin.js` and the two cache-busting import references (`assets/js/admin.js`, `admin/index.html`); no APK, Firestore, scheduled Gmail or download behavior changed.
- GitHub Pages deployment of this UI update completed successfully for commit `86c8c096729d81a800c97f6bdd39892dbf94403e`.

## Paint-first performance fix — 15 October 2026

- In Cuberoot Publish's **APK downloads** tab, the heading and six app-name placeholders now render **before importing the Firebase SDK**. Firebase code starts loading on a post-paint task. The Google sign-in button becomes enabled when its code is ready; account selection still requires a real owner click.
- After successful Google owner sign-in, the cockpit displays its static headings, app cards, **em dashes instead of unverified zero totals**, and "Loading…" labels before Firestore queries begin on a post-paint task.
- All six apps' existing three Firestore query types continue to run concurrently (no query, permissions, timestamp, event count or download-route semantics changed). On a query error, the static layout remains visible and the user can tap Refresh.
- Scripts are cache-busted through `admin/index.html?admin.js=v2.1.2` and `downloads-ui.js?v=2.1.0`. GitHub Actions **APK Cockpit Paint Before Firebase Test** run `38816473947` passed, and Pages build for main `95378ec` succeeded.
- Performance has **not** been timed on the owner's browser. The change improves perceived responsiveness; it does not guarantee a particular Firebase network duration.

## Delivered UI

- `/cockpit/`: no login; explicit sample data; no API access (`connect-src 'none'`). This is a visual preview, not a bypass for real records.
- Existing `/admin/` vault: APK downloads tab with the same large-text interface. After unlocking Publish, the owner signs in with the verified Firebase Google account to request the private Firestore report.
- Summary: total and today's clicks (Toronto day), six-app breakdown, recent records. APK filter and Refresh only.
- Area: browser-reported IANA timezone; Unknown when unavailable. The representative city in a timezone is not a verified physical city. Data may be inaccurate or spoofed. Click totals are estimates, not completed transfers or installations.
- Typography: 24px body, 32px section titles, 38–60px heading, 60–76px totals. Responsive event cards and app cards.

## Download independence

`downloads-track.js` is a separate module from `home.js`. It remains disabled by its empty endpoint. The new independent `apk-firebase-track.js` also listens passively for clicks and schedules a best-effort Firebase Firestore write after normal event processing, without intercepting downloads or retrying. Failures do not change APK link behavior.

## Firebase / click counter status — 15 October 2026

The existing Firebase project is `split-it-44dea` (Standard Firestore, free Spark plan, `(default)` database). The **owner-only read rules** were deployed and verified by the owner's Cloud Shell result: ruleset `24e15913-7722-4195-9fd3-8994ab381fad`, source SHA-256 `08d5bb8f4890112551cf1ca187d78da0585e0d2eee7ea91ae7652312de4c3f72`. This preserves existing `/households` permissions. **That owner-only ruleset was later replaced on 15 October 2026 by the separately audited create-only public-click ruleset described below.**

On Cuberoot `main`, commit `0e17615` introduced `assets/js/apk-firebase-report.js`, `assets/js/apk-firebase-track.js`, owner Google sign-in in the unlocked `/admin/` APK downloads tab, privacy disclosure and narrowly expanded Content Security Policies. GitHub Pages deployment of that commit is reported **SUCCESS**. The public site observer is passive: no APK files, download link destinations, publishing workflows, or checksums were changed. The old sendBeacon counter remains disabled because `DOWNLOADS_ENDPOINT` is empty.

The public-write candidate is **create-only** in `cuberoot_apk_clicks_v1/{app}/events/{UUID}`, allows exactly six app slugs and only four validated fields (`app`, `createdAt`, `timezone`, `build`); owner-only read, no public read, update or delete. The rule emulator suite and website integration GitHub Actions passed. The owner-approved Cloud Shell script `pw1234.txt` verifies active ruleset and hash, makes an original backup and publishes the candidate only if unchanged. **Cloud Shell deployment is now confirmed by the owner-supplied `pw-out.txt` output, but the actual browser-to-Firestore click and private-report display remain UNVERIFIED until a real test click is observed.**

Firestore Standard free allowance is 20,000 document writes/day, 50,000 document reads/day and 1 GiB; it is shared with split-it. A public create rule remains open to forged clicks and deliberate quota exhaustion. The owner explicitly accepted this risk for the low-volume pilot. GitHub Pages and Firebase have independent failure paths: a Firestore rejection must never cancel or delay an APK download. Browser timezones are not verified locations. Click totals are not completed downloads or installations.

## Create-only live rules deployment — 15 October 2026

- Owner-supplied Cloud Shell result timestamp: `2026-10-15T21:27:42.242856+00:00`; `status: PASS: APK CLICK WRITES ENABLED`, `releaseChanged: true`.
- Project: `split-it-44dea`; project number `153404639150`.
- Active ruleset: `projects/split-it-44dea/rulesets/e795cb31-c0a1-4730-898b-5e6bd7ca4cf6`.
- Proposal source SHA-256: `9e9cb47886c728628bc7c3d11e4ece77d38b8a6df00607d33c9705267f02ecf1`.
- Exact previous ruleset retained for rollback: `projects/split-it-44dea/rulesets/24e15913-7722-4195-9fd3-8994ab381fad`; previous source SHA-256 `08d5bb8f4890112551cf1ca187d78da0585e0d2eee7ea91ae7652312de4c3f72`; owner backup `pw-original-20261015-212742.txt`.
- Live rule claims: public CREATE allowed only for validated records; public READ, UPDATE, DELETE denied. Original household behavior preserved.
- Pages build for commit `f0d05b6150c3fefb54cdc060e697707c2241a8ac` passed in GitHub Actions. The live website could not be independently accessed from the assistant's network to execute a click.
- **Remaining functional acceptance:** Owner opens `https://www.cuberoot-systems.com/`, taps exactly one Android APK download button, then visits `https://www.cuberoot-systems.com/admin/`, unlocks Publish, selects **APK downloads**, signs in with Google and taps Refresh. Confirm that the app's click count increased; do not count a completed installation as necessary. If report fails, diagnose that first rather than claiming success.
- Threat limit: this free-tier public CREATE endpoint permits forged click records and can consume the same Spark quota as split-it. Accepted for a low-volume trial by owner. No App Check enforcement; do not enable it globally without app compatibility testing.

## Daily email activation retry — 15 October 2026

- Owner ran the original `mail1234.txt` setup on Google Cloud Shell. Report status **FAIL**, error `Setup: Command failed: gh auth status. Check Cloud Shell authorization.`. Owner supplied `firebaseRulesChanged: false`, `scheduleEnabled: false`, `realTestEmailSent: false`; no production change occurred on this attempt.
- `mailfix.txt` is a corrective attachment prepared for Cloud Shell. It replaces the brittle `gh auth status` check with a direct authenticated GitHub `gh api user` call and account identity verification before any writes; returns actionable authentication instructions if GitHub access is missing. It prints the short status directly on-screen and still saves a safe `mail-out.txt`.
- Bash/Python syntax checks and a mocked end-to-end test passed. **No actual setup rerun has yet been verified.** User must complete manual GitHub CLI authorization if no usable token is available in Cloud Shell; do not request any credentials or tokens in chat. GitHub connector cannot set Actions secrets through its exposed commands.
- Keep `APK_COUNTER_DAILY_EMAIL_ENABLED` false unless actual Cloud Shell report confirms `PASS: DAILY EMAIL ENABLED` and a genuine summary was sent.

## Daily email activation — 15 October 2026

- User confirmed the APK download cockpit is working. Daily report activation is requested for **9:17 AM America/Toronto**, with previous local calendar day and lifetime counts for six apps.
- Scheduled workflow is already present on `main`: `.github/workflows/apk-counter-daily-email.yml`. It intentionally remains **OFF** until `APK_COUNTER_DAILY_EMAIL_ENABLED=true` is configured. No credential values belong in the repository.
- The report generator `build/apk-counter/daily-email.py` now reads all six apps concurrently and fails closed if any count/record request fails; no fabricated numbers or partial report are sent.
- A single secure Google Cloud Shell helper, distributed as `mail1234.txt`, is prepared for **owner-side execution**. It first validates the exact currently deployed Firestore ruleset and SHA-256, project identity, GitHub CLI auth and Gmail SMTP app password. If those pass, it creates a dedicated Firebase Email/Password reporter using an owner's Gmail plus-address, securely sets four repository Actions secrets and two variables through `gh`, and adds an exact read-only reporter UID on the counter rule. It preserves the live `/households` rule and click-create permissions.
- The helper sends **one genuine authenticated report** with the same checked-in sender and only then sets the schedule enable variable to `true`. All credentials are entered locally into Cloud Shell or generated there. Failed setup leaves scheduled sending off and reports to `mail-out.txt` without leaking credentials. Firebase and GitHub changes, if any, are recorded by the helper.
- Do not claim daily automatic email is active until `mail-out.txt` explicitly states `PASS: DAILY EMAIL ENABLED` and receipt of the actual report is verified. GH Actions schedules are best effort, not an SLA for an exact minute.

## Required iPad Cloud Shell procedure — 15 October 2026

These are binding requirements for this project, explicitly confirmed by the owner after repeated problems:

- **Cut and paste does not work in Google Cloud Shell on the owner's iPad.** Do not suggest long terminal commands, terminal selection, long-press copy, keyboard paste shortcuts, or further clipboard troubleshooting.
- Provide each Cloud Shell helper as an actual **downloadable TXT attachment with a short filename**. The owner uploads it and **types a short command** such as `bash em.txt`; commands must not require copying long text into Cloud Shell.
- **Short PASS/FAIL/error messages appear directly on-screen.** Do not force the owner to download a report file merely to read a short error. A supplementary diagnostic TXT file is acceptable for long outputs, especially for sharing here.
- **Secrets or long values to transfer must be captured into a separately downloadable local TXT file**, never displayed as raw values in the Cloud Shell terminal, nor pasted into ChatGPT or repository files. In the email helper, this file is `emsecret.txt`, usable through iPad Files, not terminal copy.
- The latest revised `em.txt` attachment suppresses the raw JSON secret from both terminal output and `emout.txt`, saves it to `emsecret.txt` with mode 0600, and leaves short status/errors visible. Both success and error paths were tested locally. The owner still needs to execute it in their Cloud Shell; no live activation should be claimed merely because the attachment exists.
- When asked about short results, **show them in chat/on-screen instead of asking for a downloaded error report**. The secret remains a downloadable file.

## Current daily-email setup (supersedes earlier attempts) — 15 October 2026

The approved architecture remains private: `cuberoot_apk_clicks_v1/{app}/events` is owner-read-only until a separate Firebase Auth Email/Password reporter UID is explicitly added; the existing `/households` permissions and public validated-click CREATE policy are unchanged. There is no public Firestore read. An intermediate simplified/public-read design was **reverted before any Firebase deployment**.

The blocked GitHub CLI authorization is removed from the final setup. Current checked-in private report generator `build/apk-counter/daily-email.py` takes a **single** encrypted GitHub Actions repository secret `APK_COUNTER_MAIL_CONFIG` containing three named values (`reporter_email`, `reporter_password`, `gmail_app_password`). The publicly configured Firebase web key and fixed personal Gmail sender are constants. The scheduled workflow `.github/workflows/apk-counter-daily-email.yml` uses `cron: '17 9 * * *'` with `timezone: 'America/Toronto'`. It sends only when the secret exists; absent secret: no data request, no email. No enabled variable or GitHub CLI login is needed.

One-time Google Cloud Shell helper: `build/apk-counter/activate-private-email.py`, commit `8ddae25f24ca5240b6f685934827faa79eb0b4b8`, run from that pinned raw GitHub revision. It verifies the exact previously approved active Firebase ruleset and content hash; logs into Gmail SMTP using a password entered privately in Cloud Shell, creates a separate Firebase reporter identity, backs up and surgically adds that UID for read-only APK event access, sends one **genuine** previous-day report using the checked-in production sender, and only after success prints one JSON value inside Cloud Shell for the owner to copy into `https://github.com/willyros01/Cuberoot/settings/secrets/actions/new` with the name `APK_COUNTER_MAIL_CONFIG`. **Never copy that value to this chat, issues, docs or commits.** Credentials are never embedded in repository code or written to a file. The assistant does not have GitHub Actions secrets write access.

Off-line GitHub Actions safety test `38823149544` **PASSED**, covering Python syntax, synthetic six-app counts, Toronto DST, one-secret mapping and private reporter. No actual Cloud Shell activation from this revision, live Firebase rule update, Gmail test report or secret creation is confirmed yet. Do **not** claim the daily mail is active until the real test email and one-secret GitHub setup are confirmed. GitHub scheduled workflows are best effort and can be delayed from their nominal minute.

## Email status

The owner explicitly requested daily reports. A **one-time Gmail delivery test** was sent through the connected Gmail account on October 15, 2026; it contains no fabricated statistics. The proposed GitHub Actions scheduled sender is fail-closed, uses a separate Firebase read-only Email/Password reporter and personal Gmail SMTP app password, and targets the previous Toronto day. The one-step Cloud Shell activation can provision the missing reporter identity, rules and Actions credentials locally. Do not claim recurring reports are active without a successful activation report and a received genuine data summary.

## GitHub Pages recovery, 15 October 2026

- GitHub Pages run #227 succeeded for main commit `5a0ccb4`, before the cockpit files were added at `b0a4a68`. The public `/cockpit/` URL subsequently displayed the site's 404 page while the root website worked.
- Following restoration of GitHub account permissions, this documentation-only update requests a fresh branch-source Pages deployment from current `main`. It intentionally changes no website JavaScript, APK, download links, Firebase, DNS or Pages settings.
- Deployment success and `/cockpit/` public accessibility must be verified separately; do not declare the preview live solely because this commit was accepted. The preview always shows fictional sample values until an audited Firebase backend is explicitly enabled.
