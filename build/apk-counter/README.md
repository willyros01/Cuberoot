# Cuberoot APK download counter — staged Spark plan

**Status: PREPARATION ONLY — NOT LIVE / NO DEPLOYMENT AUTHORIZED IN THIS PACKAGE.**

Project: `split-it-44dea` (project number `153404639150`). Owner audit: 2026-10-15; Firestore `(default)` is STANDARD/NATIVE in `northamerica-northeast2`; billing disabled. No Cloudflare, Cloud Functions, extra database or paid-plan switch.

## Isolation and unchanged production behavior

- This folder exists on the **apk-counter-spark-prep** development branch only. Nothing from this folder is linked by the Cuberoot public `index.html`, `home.js`, `/admin/` or `/cockpit/` preview.
- Existing signed APK files, manifest checks, publishing workflows, hrefs, download attributes and existing application branches must remain byte-for-byte unchanged.
- `config.example.mjs` is fail-closed (`enabled: false`, empty web configuration).
- Existing Firestore `/households/{code}/{document=**}` allowance must be preserved *exactly as it is*, even though its existing `allow read, write: if true` is broadly permissive. Treat that separate pre-existing exposure as a separate security decision; **do not tighten it during this counter work**.
- Counter-specific proposed path: `/cuberoot_apk_clicks_v1/{app}/events/{UUID}` outside `/households`. One immutable event per click, no update/delete through client SDK.
- The rules template is **not** approved for deployment. Its new collection is deny-by-default for writes; only the owner UID can read when configured. Existing rules shown in the template are semantically the same as the owner's audit; compare against a freshly fetched source before merging anything. The full file is a planning aid, **not** a file to deploy over existing rules.

## Designed behavior

`public-tracker.mjs` is an *unreferenced* independent module. When properly configured and enabled later, it observes existing same-origin `a[download]` APK clicks for exactly six app slugs, schedules a one-shot Firestore `setDoc` after the click handler returns, uses a UUID and server timestamp, never cancels/redirects download and never retries failed writes. Device timezone is browser-reported, not an accurate geographic location. This counts *click attempts*, not completed downloads/installations. Direct APK URLs and some browser behaviors are not counted.

`private-report.mjs` is an *unreferenced* owner-authenticated read module for the existing, unlocked Cuberoot Publish admin page; it is not yet wired to the UI. It signs in an owner through Firebase Auth without storing the password, queries Firestore's server-side `count()` per-app and per Toronto calendar day, and returns at most 20 recent records. Firestore rules must permit list/get for one exact owner Firebase Auth UID, no others. The existing Cuberoot encrypted vault unlock **does not** automatically authenticate to Firebase; the admin screen needs an explicit additional Firebase login UI before activation. No public read access or secrets in JS.

## Critical security / compatibility gates — DO NOT SKIP

1. Confirm all existing split-it apps that use Firestore and their Firebase App Check status. **App Check enforcement affects Firestore requests of every app in the project**, and could break legacy clients that lack tokens. Do not enable enforcement without checking metrics and migrating those clients; no enforcement was enabled by this work.
2. Without App Check enforcement, anonymous Firebase Auth plus strict create-only rules **do not prevent fraudulent clicks, quota exhaustion, or malicious client writes**. Even enforced App Check is not perfect bot protection. This is a material security limit of direct public writes on Spark with no backend. Do not claim the counter is abuse-proof. Review project-wide quota exposure before release.
3. Inspect existing Firebase Authentication providers before enabling Anonymous or Email/Password, which are project-wide settings. Record exactly one owner Auth UID and safely provision owner login. A GitHub token or GitHub vault unlock is **not** a substitute for Firebase Auth.
4. Register/review the Firebase web app and App Check reCAPTCHA v3 key, confirm allowed Cuberoot domain. Obtain the Firebase **public web app config** from the actual `split-it-44dea` project. Do not paste Firebase service-account private keys, GitHub tokens, passwords, or reCAPTCHA secret keys into GitHub.
5. Take new read-only snapshot of the **live** Firestore release/rules and compare the `/households` statement byte for byte. Never overwrite unrelated rules with a template. Test exact proposed rules in Firebase Local Emulator Suite: anonymous read denied; unauthenticated write denied; wrong app/data/UUID rejected; anonymous valid writes allowed **only after separate release decision**; update/delete denied; owner read allowed; any other signed-in account read denied; original household behavior unchanged.
6. Amend CSP for `www.gstatic.com` Firebase JS and the required Google Firebase/reCAPTCHA endpoints **only after security review**; do not weaken existing CSP indiscriminately. Update the public privacy policy *before* collecting data (the current policy explicitly states no tracking). Check availability and failure isolation on Safari and Fire HD Silk. No IP address or fingerprint collected by the counter.
7. Only after the preceding gates are individually verified: merge approved code, enable the config, and test real clicks vs authenticated reports. Never change APK files, checksums, app code or download links. Publish no inaccurate counts.

## Free plan cautions

Firestore Spark has a shared-project limit of 20,000 writes/day, 50,000 reads/day and 1 GiB storage; traffic or abuse from this counter could consume quotas used by existing split-it clients. Spark can stop the affected product when a quota is exceeded. No Firestore automatic TTL deletes without billing; plan a manual/admin retention process before collecting indefinitely. Aggregate queries are still billed against Firestore read quotas. If genuine abuse resistance and complete isolation become mandatory, a **separate backend or project** will be necessary.

## Checks completed

- JavaScript files pass Node 22 `--check` syntax parsing locally.
- All active Cuberoot code paths were inspected; none of the staged modules is referenced or deployed.
- **Not tested:** Firebase emulator, authentication, App Check, browser execution, Firestore rules, live counter, UI, quota behavior. No Firebase change has been made.

## References

- Firebase App Check enforcement (impacts all unverified Firestore requests): https://firebase.google.com/docs/app-check/enable-enforcement
- Firebase App Check metrics: https://firebase.google.com/docs/app-check/monitor-metrics
- Firebase security rules: https://firebase.google.com/docs/firestore/security/get-started
- Firebase Spark pricing/quota: https://firebase.google.com/docs/projects/billing/firebase-pricing-plans