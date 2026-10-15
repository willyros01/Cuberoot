# Simple APK cockpit

Owner scope: GitHub + Firebase only. Cuberoot's current APK hosting, links, files and publisher remain unchanged. No Cloudflare Worker, routes, D1 database or geolocation service. The earlier PR #9 Cloudflare implementation is superseded.

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

## Email status

The owner explicitly requested daily reports. A **one-time Gmail delivery test** was sent through the connected Gmail account on October 15, 2026; it contains no fabricated statistics. The proposed GitHub Actions scheduled sender is fail-closed, uses a separate Firebase read-only Email/Password reporter and personal Gmail SMTP app password, and targets the previous Toronto day. Automatic reports still require the reporter account, Firebase rule UID and GitHub Actions secrets/variable; do not claim recurring reports are active without those credentials and a received sample report.

## GitHub Pages recovery, 15 October 2026

- GitHub Pages run #227 succeeded for main commit `5a0ccb4`, before the cockpit files were added at `b0a4a68`. The public `/cockpit/` URL subsequently displayed the site's 404 page while the root website worked.
- Following restoration of GitHub account permissions, this documentation-only update requests a fresh branch-source Pages deployment from current `main`. It intentionally changes no website JavaScript, APK, download links, Firebase, DNS or Pages settings.
- Deployment success and `/cockpit/` public accessibility must be verified separately; do not declare the preview live solely because this commit was accepted. The preview always shows fictional sample values until an audited Firebase backend is explicitly enabled.
