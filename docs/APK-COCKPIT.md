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

## Daily email activation — 15 October 2026

- User confirmed the APK download cockpit is working. Daily report activation is requested for **9:17 AM America/Toronto**, with previous local calendar day and lifetime counts for six apps.
- Scheduled workflow is already present on `main`: `.github/workflows/apk-counter-daily-email.yml`. It intentionally remains **OFF** until `APK_COUNTER_DAILY_EMAIL_ENABLED=true` is configured. No credential values belong in the repository.
- The report generator `build/apk-counter/daily-email.py` now reads all six apps concurrently and fails closed if any count/record request fails; no fabricated numbers or partial report are sent.
- A single secure Google Cloud Shell helper, distributed as `mail1234.txt`, is prepared for **owner-side execution**. It first validates the exact currently deployed Firestore ruleset and SHA-256, project identity, GitHub CLI auth and Gmail SMTP app password. If those pass, it creates a dedicated Firebase Email/Password reporter using an owner's Gmail plus-address, securely sets four repository Actions secrets and two variables through `gh`, and adds an exact read-only reporter UID on the counter rule. It preserves the live `/households` rule and click-create permissions.
- The helper sends **one genuine authenticated report** with the same checked-in sender and only then sets the schedule enable variable to `true`. All credentials are entered locally into Cloud Shell or generated there. Failed setup leaves scheduled sending off and reports to `mail-out.txt` without leaking credentials. Firebase and GitHub changes, if any, are recorded by the helper.
- Do not claim daily automatic email is active until `mail-out.txt` explicitly states `PASS: DAILY EMAIL ENABLED` and receipt of the actual report is verified. GH Actions schedules are best effort, not an SLA for an exact minute.

## Email status

The owner explicitly requested daily reports. A **one-time Gmail delivery test** was sent through the connected Gmail account on October 15, 2026; it contains no fabricated statistics. The proposed GitHub Actions scheduled sender is fail-closed, uses a separate Firebase read-only Email/Password reporter and personal Gmail SMTP app password, and targets the previous Toronto day. The one-step Cloud Shell activation can provision the missing reporter identity, rules and Actions credentials locally. Do not claim recurring reports are active without a successful activation report and a received genuine data summary.

## GitHub Pages recovery, 15 October 2026

- GitHub Pages run #227 succeeded for main commit `5a0ccb4`, before the cockpit files were added at `b0a4a68`. The public `/cockpit/` URL subsequently displayed the site's 404 page while the root website worked.
- Following restoration of GitHub account permissions, this documentation-only update requests a fresh branch-source Pages deployment from current `main`. It intentionally changes no website JavaScript, APK, download links, Firebase, DNS or Pages settings.
- Deployment success and `/cockpit/` public accessibility must be verified separately; do not declare the preview live solely because this commit was accepted. The preview always shows fictional sample values until an audited Firebase backend is explicitly enabled.
