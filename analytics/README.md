# APK download cockpit — 15 October 2026

Status: implementation prepared; **Cloudflare activation and live end-to-end validation are outstanding**. No historical records exist. Dashboard belongs to the existing Publish admin at `/admin/`, behind the same vault unlock; the API also requires its own private bearer key on every read.

## Scope

Six existing APK URLs: FIDUNIO, The Scorecard, Fairpot, Wire, SpendRecorder, Cloud Files. No app repositories, signing, publishing workflows, APK bytes, download links or badge dimensions change.

The new APK downloads tab uses 24px body/table/control text and larger headings. It shows totals per app, UTC day, country and paginated event records. Events display date/time in America/Toronto, app, requested build (if present), approximate city/region/country, and broad device/browser category. Filters use UTC dates, with an exclusive upper date. Default is the last 30 UTC calendar dates including today. Maximum query span is 366 days; records are retained for 90 days by a daily scheduled cleanup.

Counts are estimates of successful starting GET requests (HTTP 200 or 206), not completed transfers, installations, unique people or authenticated users. HEAD availability checks, nonzero/suffix ranges, known bots and prefetch requests are excluded. A keyed digest of the app, connection IP, full user agent and fixed 30-minute UTC bucket collapses retries in the same bucket. Raw IP and full user agent are not persisted. Shared networks can undercount; bucket boundaries and unrecognized bots can overcount. A supplied build query is recorded as requested; it does not independently establish artifact identity.

Location comes from Cloudflare's incoming request metadata, not client-supplied location headers. It may be missing or reflect a VPN/mobile provider. No latitude, longitude or postal code is stored. Database and private API responses must never be published to GitHub.

## Activation handoff

Cloudflare access is not connected in this working session. Do not describe this feature as live until these steps and the checks below pass.

1. Read-only audit of the Cuberoot Cloudflare zone: confirm account, current apex and www DNS targets/proxy status, TLS mode, redirects and existing Worker routes. Save a rollback snapshot of those records/routes and the current GitHub main commit. Do not touch Wire's existing Worker, email DNS, unrelated routes or application Firebase projects.
2. Confirm both HTTPS hosts reach the intended GitHub Pages site. Worker Routes require proxied DNS; do not blindly change proxy/TLS settings. If proxying is not already active, prepare and validate that separately before activation.
3. In that account create D1 database `cuberoot-apk-count`, replace the placeholder ID in `wrangler.jsonc`, and apply `schema.sql` remotely. Never bind another app's database.
4. Generate 32 cryptographically random bytes encoded as 64 lowercase hex characters. Configure it as Worker secret `DOWNLOAD_ADMIN_KEY`; keep it out of source, screenshots, logs and public files. Add it in the cockpit connection field only after the admin vault unlock, which saves it encrypted using the existing vault mechanism. The key grants only download-report reads, not document access.
5. Deploy this Worker/config with the existing Pages site as origin. Routes are HTTPS-only, limited to six APK paths and `/api/apk-downloads` on the two named hosts. Use route mode, not a custom domain that would replace the site origin. Retain the exact prior route snapshot for rollback. Workers/dev and preview URLs are disabled.
6. Merge/publish the site changes and privacy disclosure, then connect the cockpit. Counting must not be activated without the disclosure being public. Use a short named `.txt` Cloud Shell script for any owner-run activation work; no pasted commands or secrets in Cloud Shell. Build that script against the actual audited account rather than guessing identifiers.

## Required live checks

- Locked admin reveals no dashboard data; API without key and with a wrong key returns 401. Admin API responses are never cached. Plaintext keys never enter repository contents.
- Connect through vault, refresh/unlock again, verify encrypted key persistence; lock clears UI/session through existing page reload.
- Compare one APK checksum before/after proxy activation; verify Content-Type, disposition if present, content length, download filename and range support. Both domain variants preserve their established redirect/download behavior.
- HEAD/manifest checks add zero records. One actual starting download yields one matching record; retry in the same bucket stays one. Nonzero range resume adds zero. Confirm actual location is plausible and optional missing fields read Unknown.
- Verify all six APKs; date/app filters, next/newest page, country/day totals and Toronto time. Simulate API/database unavailability: downloading still works; cockpit reports unavailable without fabricated zeros.
- Test actual Safari and Fire Silk with large text, portrait/landscape, keyboard focus, horizontal table scrolling and lock. Local browser visual verification was not available because Chromium is not installed in this runtime.
- Verify D1 cleanup schedule, review Cloudflare usage and confirm free-plan capacity against real traffic. No pricing claims made without checking the account.

## Local checks completed

`node --test analytics/worker.test.mjs`: six tests pass (filtering, input validation, access control, bounded reports, unchanged APK response with write failure, retention). Native SQLite schema/unique-fingerprint deduplication passes. JavaScript syntax checks pass. These do not replace live Cloudflare routing/D1/device validation.

## Rollback

Remove only the new APK/report routes or restore their audited previous assignments; GitHub Pages then serves the existing APK URLs directly. Revert the site feature commit to remove the tab/disclosure if desired. Preserve D1 for investigation unless the owner explicitly requests deletion. Do not delete or change app artifacts, signing secrets, app code or other Workers.

## References

- https://developers.cloudflare.com/workers/configuration/routing/routes/
- https://developers.cloudflare.com/workers/runtime-apis/request/
- https://developers.cloudflare.com/d1/tutorials/build-an-api-to-access-d1/
