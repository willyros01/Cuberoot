# ATE website download tracking

Web scope approved on 12 November 2026. No editor/application binaries, scheduled email code, cron configuration or sender credentials change in this release.

## Categories and records

The shared website catalog retains seven APK categories and adds `ate-windows` (exact `/downloads/ate-windows.exe`), `ate-mac` (exact `/downloads/ate-mac.dmg`) and `ate` (exact `/downloads/ate.apk`). Tracking accepts same-origin download anchors only and preserves normal download behavior. Each best-effort create contains the category, validated build number, browser timezone and server timestamp. There is no retry, GPS prompt, visitor identifier or persistent visitor storage.

Both the homepage and `/ate/` load the tracker. The ATE page permits only the existing pinned Firebase SDK origin and Firestore connection origin in addition to its previous CSP. The private cockpit still requires the verified Google owner account. ATE cards, app/date filters and recent timezone-area details use the same catalog. Area is explicitly unverified.

Until Firebase is activated, an unauthenticated aggregate probe checks each ATE category. Owner-authenticated reads alone are insufficient: the existing owner permission can read empty collections before public writes are allowed. A public `permission-denied` result becomes **Setup pending**, never zero. The existing seven categories remain readable; combined totals stay unavailable while a selected category is pending. Other query failures still fail closed. Successful activation is detected on the next Refresh without another website change. The public `/cockpit/` preview is clearly sample data.

## Activation requires the owner's Cloud Shell session

This workspace has no authenticated Firebase administration session. The website portion can be published independently; actual ATE recording remains pending until the existing counter allowlist accepts the three names.

Run the short `atec.txt` launcher in Google Cloud Shell:

```bash
curl -fsS https://www.cuberoot-systems.com/atec.txt | bash
```

The launcher downloads the immutable reviewed helper at commit `9e97208bac042972ee36f0a93b6f661c4b918c24` and verifies its SHA-256 before execution. The helper selects `split-it-44dea`, reads the live rules using the owner's existing gcloud session, saves a private Cloud Shell backup, and inserts only three category literals into the expected seven-category `allowedApp()` function beside the counter match. It rejects unknown policy shapes, duplicate categories and concurrent rule changes. It keeps every other rule character and source file intact.

Before publishing, Firebase's Rules test API checks the candidate source for syntax/semantic errors and the created ruleset is independently read back. After release, the helper verifies all ten real lifetime/today aggregation permissions. On failure it restores the original ruleset only while the current release still points to its own candidate. It never logs access tokens, sends email or creates synthetic click records. Re-running an already activated list only verifies reads. If an unfamiliar live policy is found, it stops for review instead of replacing it.

Expected success: `PASS: ATE COUNTER CATEGORIES ACTIVATED; all ten real aggregate permissions verified`.

Following activation, verify actual click recording separately: note a platform's count, click its real download button once, then Refresh the signed-in cockpit and check the new category/timezone event. Public aggregation access alone does not prove a browser write succeeded. Earlier unrecorded ATE clicks cannot be backfilled.

## Verification

- Final main-branch browser integration run [43282988198](https://github.com/willyros01/Cuberoot/actions/runs/43282988198) passed on Chrome. Real site modules and CSP were loaded with fixture Firebase SDK responses; no live click writes were made. The test exercised the actual download event for all three platforms on both pages, one record per click, write-failure behavior, exact path/origin allowlisting, ten-category cockpit totals, pending/active states, app/date filters, Toronto bounds, timezone details and signed-out/error behavior. Screenshot counts are fixtures, not production totals.
- Five offline activation tests passed, including unchanged unrelated rules, idempotence, malformed/unknown allowlists, syntax rejection, concurrent changes, successful release flow and rollback after failed permission verification. These do not establish live Firebase activation.
- Workflow: `.github/workflows/download-web-check.yml`. Browser test: `web-check.mjs`. Tests require Playwright 1.62.1 and Chrome, installed by CI; the Firebase mocks prevent production writes.
- Pages deployment [43282988027](https://github.com/willyros01/Cuberoot/actions/runs/43282988027) passed at source `4ed43f2ee87faa05b8002a197b8b772d1f21f2c2`. Public page/module/launcher bytes were independently matched to source. Owner-activated Firebase recording is still pending; live ATE readiness returned HTTP 403. Details are in `docs/APK-COCKPIT.md`.

Email expansion to ten categories remains a separate TODO. Its existing seven-app assertions and 09:17 Toronto delivery remain intact.

The readiness test uses public aggregation with no owner Authorization header or cookies. Owner-authenticated access to an empty collection does not count as activation. Platform filtering retains each app’s five recent records even when 35 other events are newer; only the combined display is limited to twenty events.

## Owner activation checkpoint — 12 November 2026

The owner successfully ran `atec.txt`. Independent public aggregation reads now succeed for all ten categories; each ATE category initially returned zero. This supersedes the earlier pending/HTTP 403 state above. No write or email send was performed during independent verification. The next signed-in Refresh can show actual ATE counts. A real download-button click and matching timezone event still need to be observed before claiming end-to-end live write acceptance. The seven-category daily email is unchanged.
