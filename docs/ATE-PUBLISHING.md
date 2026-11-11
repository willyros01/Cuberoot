# ATE publication checkpoint

ATE app page: https://www.cuberoot-systems.com/ate/ . Home app card and public documentation index are registered under ate. Quick Start (5 pages) and full User Guide (11 pages) are available as large-print HTML and PDF. Page includes approved icon, Android logo, invitation-only iOS TestFlight note and future Mac/Windows installer notices.

Android source: willyros01/clear-page, android branch. Release compilation passed in run 42980450400; permanent signing is blocked until the owner saves the private ATE_ANDROID_SIGNING repository secret. No installable APK has been published yet. Home/landing buttons remain hidden until the publisher writes verified metadata.

Automatic publisher: .github/workflows/publish-ate-apk.yml, five-minute cron plus manual/push triggers. It verifies successful source report, exact artifact, signature, package, version and app label, then atomically commits APK, checksum and provenance. Expected public signing certificate SHA-256 is ef654829950fdf9d59f061c7b0fdc80358373a619fc02fa10480816e0665d6e4. No private signing data belongs in this repo.

Initial publisher run 42981595988 succeeded with no signed report present and correctly left downloads unchanged. Pages deployment 42981595820 succeeded. Live app/home/guide UI was checked; APK URL gating was tested with valid metadata locally. Physical Android installation/behavior acceptance is pending.
