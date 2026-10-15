# Simple APK cockpit

Owner scope: GitHub + Firebase only. Cuberoot's current APK hosting, links, files and publisher remain unchanged. No Cloudflare Worker, routes, D1 database or geolocation service. The earlier PR #9 Cloudflare implementation is superseded.

## Delivered UI

- `/cockpit/`: no login; explicit sample data; no API access (`connect-src 'none'`). This is a visual preview, not a bypass for real records.
- Existing `/admin/` vault: APK downloads tab; same large-text interface. Reports are not fetched until an endpoint and encrypted admin key are configured.
- Summary: total and today's clicks (Toronto day), six-app breakdown, recent records. APK filter and Refresh only.
- Area: browser-reported IANA timezone; Unknown when unavailable. The representative city in a timezone is not a verified physical city. Data may be inaccurate or spoofed. Click totals are estimates, not completed transfers or installations.
- Typography: 24px body, 32px section titles, 38–60px heading, 60–76px totals. Responsive event cards and app cards.

## Download independence

`downloads-track.js` is a separate module from `home.js`. It remains disabled by its empty endpoint. The new independent `apk-firebase-track.js` also listens passively for clicks and schedules a best-effort Firebase Firestore write after normal event processing, without intercepting downloads or retrying. Failures do not change APK link behavior.

## Firebase / click counter status — 15 October 2026

The existing Firebase project is `split-it-44dea` (Standard Firestore, free Spark plan, `(default)` database). The **owner-only read rules** were deployed and verified by the owner's Cloud Shell result: ruleset `24e15913-7722-4195-9fd3-8994ab381fad`, source SHA-256 `08d5bb8f4890112551cf1ca187d78da0585e0d2eee7ea91ae7652312de4c3f72`. This preserves existing `/households` permissions. Public writes are **still denied** under those rules.

On Cuberoot `main`, commit `0e17615` introduced `assets/js/apk-firebase-report.js`, `assets/js/apk-firebase-track.js`, owner Google sign-in in the unlocked `/admin/` APK downloads tab, privacy disclosure and narrowly expanded Content Security Policies. GitHub Pages deployment of that commit is reported **SUCCESS**. The public site observer is passive: no APK files, download link destinations, publishing workflows, or checksums were changed. The old sendBeacon counter remains disabled because `DOWNLOADS_ENDPOINT` is empty.

The public-write candidate is **create-only** in `cuberoot_apk_clicks_v1/{app}/events/{UUID}`, allows exactly six app slugs and only four validated fields (`app`, `createdAt`, `timezone`, `build`); owner-only read, no public read, update or delete. The rule emulator suite and website integration GitHub Actions passed. The owner-approved Cloud Shell script `pw1234.txt` verifies active ruleset and hash, makes an original backup and publishes the candidate only if unchanged. **Do not claim real recording is enabled until `pw-out.txt` confirms a deployment PASS and one actual download-button click appears in the private cockpit.**

Firestore Standard free allowance is 20,000 document writes/day, 50,000 document reads/day and 1 GiB; it is shared with split-it. A public create rule remains open to forged clicks and deliberate quota exhaustion. The owner explicitly accepted this risk for the low-volume pilot. GitHub Pages and Firebase have independent failure paths: a Firestore rejection must never cancel or delay an APK download. Browser timezones are not verified locations. Click totals are not completed downloads or installations.

## Email status

The owner explicitly requested daily reports. A **one-time Gmail delivery test** was sent through the connected Gmail account on October 15, 2026; it contains no fabricated statistics. The proposed GitHub Actions scheduled sender is fail-closed, uses a separate Firebase read-only Email/Password reporter and personal Gmail SMTP app password, and targets the previous Toronto day. Automatic reports still require the reporter account, Firebase rule UID and GitHub Actions secrets/variable; do not claim recurring reports are active without those credentials and a received sample report.

## GitHub Pages recovery, 15 October 2026

- GitHub Pages run #227 succeeded for main commit `5a0ccb4`, before the cockpit files were added at `b0a4a68`. The public `/cockpit/` URL subsequently displayed the site's 404 page while the root website worked.
- Following restoration of GitHub account permissions, this documentation-only update requests a fresh branch-source Pages deployment from current `main`. It intentionally changes no website JavaScript, APK, download links, Firebase, DNS or Pages settings.
- Deployment success and `/cockpit/` public accessibility must be verified separately; do not declare the preview live solely because this commit was accepted. The preview always shows fictional sample values until an audited Firebase backend is explicitly enabled.
