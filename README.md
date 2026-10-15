# Cuberoot Systems — public website and APK distribution

## Cross-repository documentation index — 2026-10-15

This repository hosts the Cuberoot Systems public site and selected signed Android APKs. It is a **distribution site**, not the source of application code or Firebase data. APK publishers must accept ONLY a successful artifact from the matching application branch, verify exact GitHub run/artifact, SHA-256 and stable signing identity, and preserve last-good public downloads if verification fails. Do not rebuild APKs here, change app source or disclose raw GitHub repository links in app download buttons. Product development is frozen until explicit owner authorization; documentation updates are permitted.

| Public app | Authoritative source and platform branches | Current evidence / limitations |
|---|---|---|
| FIDUNIO | `hermes/main` web, `hermes/main-3` web parity, `hermes/ios` iOS, `hermes/Android` Fire native | Fire HD 8 ADM **direct notification receipt PASS**, 15 Oct after Firebase ID repair; full tap/PIN/correct-message and group ADM not independently accepted. See `hermes/Android/docs/ADM-LIVE.md` in its repository. |
| The Scorecard | `scorecard/main` web, `scorecard/v2` current iOS, `scorecard/android` | Apple Build 24 review package on `v2`; Fire HD 8 Android 2.30.1 device baseline owner-accepted. App Store approval not inferred. |
| Fairpot | `fairpot/main` iOS, `fairpot/android` Fire | Native APK signing/publishing and restored expense/photo verified; later backup-to-Downloads retest needs owner acceptance. Legacy `split` kept separate. |
| Wire | `balita/main` live web/news sender, `balita/android` Fire | Physical ADM receipt PASS on 0.17.58; Back touch behavior later repaired in Android source, further physical acceptance required. |
| SpendRecorder | `spendrecorder/main` iOS, `spendrecorder/android` Fire | Signed/published native 1.0.2; targeted Camera/Downloads repair built; device retest outstanding. Legacy `expense-ledger` separate. |
| Cloud Files | `cloud-files/main` web, `cloud-files/android` Fire | Owner confirmed signed Android update opened iCloud Drive externally in Silk for both upload/download entries; actual transfers untested. |

**Website wording (15 Oct):** FIDUNIO's public listing no longer calls the app “beta” or “test APK”; it accurately says `Web app · iPhone TestFlight · Signed Android APK available`. The APK manifest's internal `android-fcm-beta` channel remains a verification contract and must **not** be renamed merely to remove UI wording. Cuberoot `downloads/*-build.json` describes signed artifacts, not proof of physical device acceptance.

## Documentation boundaries

Each app’s current migration notes stay in its own repository and platform branch. This index is not a substitute for each branch's tests/README. No new repositories or cross-branch auto-merges; keep credentials/private signing files out of source and docs. Historical app records remain retained in their original branches.


## APK download cockpit (prepared, not activated)

Implementation and activation/rollback notes are in [`analytics/README.md`](analytics/README.md). Adds an APK downloads tab to the existing encrypted Publish admin and a separately authenticated Cloudflare/D1 report API for six APKs. Counts start only after Cloudflare activation; local tests do not establish live operation. No application repositories or APK publishing/signing flows change.
