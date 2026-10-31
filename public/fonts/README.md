# Self-hosted app fonts

These16 WOFF2 resources are the exact existing Fraunces, Plus Jakarta Sans and JetBrains Mono files referenced by the successful Google Fonts CSS captured on2026-10-31. `sources.json` records each original URL, size and SHA-256. The corresponding original face declarations are preserved under `docs/source-evidence/local-fonts-20261031`.

The app keeps every original weight, style, Unicode range, `display:swap`, the four Latin preloads, existing CSS variables and Next15.5.28 fallback metrics. Only the resource location changes. Files have content hashes and immutable cache headers. All three SIL Open Font Licenses and copyright notices are retained here.

This removes a deployment dependency on Google's stylesheet responses: Next's Google loader repeatedly failed on an extensionless resource URL before the app could compile. `node scripts/verify-local-fonts.mjs` checks the assets and face declarations without contacting a provider.
