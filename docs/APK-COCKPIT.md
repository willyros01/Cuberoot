# Simple APK cockpit

Owner scope: GitHub + Firebase only. Cuberoot's current APK hosting, links, files and publisher remain unchanged. No Cloudflare Worker, routes, D1 database or geolocation service. The earlier PR #9 Cloudflare implementation is superseded.

## Delivered UI

- `/cockpit/`: no login; explicit sample data; no API access (`connect-src 'none'`). This is a visual preview, not a bypass for real records.
- Existing `/admin/` vault: APK downloads tab; same large-text interface. Reports are not fetched until an endpoint and encrypted admin key are configured.
- Summary: total and today's clicks (Toronto day), six-app breakdown, recent records. APK filter and Refresh only.
- Area: browser-reported IANA timezone; Unknown when unavailable. The representative city in a timezone is not a verified physical city. Data may be inaccurate or spoofed. Click totals are estimates, not completed transfers or installations.
- Typography: 24px body, 32px section titles, 38–60px heading, 60–76px totals. Responsive event cards and app cards.

## Download independence

`downloads-track.js` is a separate module from `home.js`. It listens passively to existing download anchors. It never calls preventDefault, changes href/download attributes, redirects, waits, or retries. Work is deferred with a timer and a best-effort sendBeacon. All tracking exceptions are swallowed. Module load failure does not affect the existing home module or anchor action. Empty endpoint disables tracking entirely.

## Firebase connection outstanding

Owner selected the existing split-it Firebase project on 15 October 2026. Its exact project ID and Firestore edition still need authenticated confirmation. Firebase CLI is available but the read-only database-list request returned an authentication error. No database, rules, function or app backend has been changed. Do not claim live counting.

Before backend implementation, identify the owner-selected project and Firestore edition, inspect existing configuration/rules, and snapshot before targeted deployment. Use a dedicated function/codebase and collection namespace, avoiding changes to existing app functions. Use a short named .txt Cloud Shell script for owner-run deployment, without pasted commands.

One HTTPS function will accept small validated POST click records and serve authorized GET reports. The public caller must never be able to read, update or delete records. Backend timestamps determine reporting dates. Validate six-app allowlist, UUID event IDs, bounded build/timezone strings and request size; duplicate IDs are idempotent. Origin checks are supplemental, not authentication or bot protection. Use bounded function instances and conservative ingestion limits; never retry from the browser. Return aggregate totals and a bounded recent list. Authenticate every report request with a strong key held in Secret Manager and the existing encrypted admin vault. Never place the key in public JS. Firestore direct-client access to this collection must be denied; inspect broad existing wildcard grants before adding rules. No raw IP/browser fingerprint is required.

Report contract: `{counts:{fidunio:{total:0,today:0},...},events:[{app:'fidunio',at:'ISO timestamp',timezone:'America/Toronto'}]}`. Include all six apps. GET summaries are authoritative; the UI must never calculate all-time totals from a capped recent list. Configure CORS and add only the exact deployed HTTPS endpoint origin to public/admin CSP connect-src. Publish accurate privacy disclosure before turning on the endpoint.

After deployment: configure the key inside encrypted admin state, set the public endpoint, then verify a real click and private report. Test with blocked network/failed Firebase, compare APK SHA256, test normal/download/middle-click behavior on Safari and Fire Silk, lock/unlock, timezone handling, duplicate records and unauthorized reads. Direct URL and middle-click downloads may not generate records; do not intercept them to improve counting.

Rollback: set endpoint empty/remove the standalone tracking script. Existing downloads continue independently. Do not delete app files or alter publishing.

Read-only owner audit: download `build/ca.txt`, run `bash ca.txt` in Google Cloud Shell, and return `ca-out.txt`. The script resolves the exact split-it project by display name or exact ID and captures database metadata, existing rule source, function inventory and billing status without resource mutations or secret values.

## GitHub Pages recovery, 15 October 2026

- GitHub Pages run #227 succeeded for main commit `5a0ccb4`, before the cockpit files were added at `b0a4a68`. The public `/cockpit/` URL subsequently displayed the site's 404 page while the root website worked.
- Following restoration of GitHub account permissions, this documentation-only update requests a fresh branch-source Pages deployment from current `main`. It intentionally changes no website JavaScript, APK, download links, Firebase, DNS or Pages settings.
- Deployment success and `/cockpit/` public accessibility must be verified separately; do not declare the preview live solely because this commit was accepted. The preview always shows fictional sample values until an audited Firebase backend is explicitly enabled.
