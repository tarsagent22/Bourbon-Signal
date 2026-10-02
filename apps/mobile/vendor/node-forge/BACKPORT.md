# Local security backport

This is the published `node-forge` 1.4.0 Node library with the nested DigestAlgorithm element-count fix proposed in https://github.com/digitalbazaar/forge/pull/1152 applied to `lib/rsa.js`. It addresses GHSA-86w9-cpqp-85rv / CVE-2026-85393. The upstream proposal is unmerged and no patched npm release exists at implementation time.

`1.4.1-bs.1` is a private local backport version, not an upstream release. The original license, attribution and library source are retained; browser distribution/Flash artifacts and upstream development dependencies/scripts are excluded. This dependency serves Expo Node tooling, not the application runtime. No Expo SDK, native package or runtime version changes are needed.

`provenance.json` records the original published archive hash and every original file hash. `scripts/forge-security.test.cjs` verifies the complete library inventory, unchanged files, and exact minimal RSA change; reproduces the rejected malformed signature on original code; checks valid signatures; and exercises Expo certificate generation/validation. The CI mobile audit job runs these tests before the unchanged moderate-or-higher advisory gate.

CI also runs `check-forge-backport-advisories.cjs`, querying npm's advisory service for the original published 1.4.0 base after the backport tests pass. It accepts only this exact, tested fixed advisory and rejects every additional advisory or unavailable lookup. This complements the unchanged all-lockfile npm audit, which cannot certify a private backport.

Replace the local override with an official patched release once available.
