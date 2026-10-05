# Member numbering and paid onboarding

Live read-only Clerk audit on 2026-10-05 UTC: 291 accounts, 29 accounts numbered, all 29 using their Founder number; 262 accounts missing numbers; no duplicates. This is a snapshot, not a fixed production member count.

Permanent signup-order numbers use a PostgreSQL registry and serialized counter. Founder numbers remain a separate visible identity. Membership activation/revocation cannot overwrite the permanent number. The signup webhook assigns identity; profile, onboarding and posting recover delayed projection. Account deletion anonymizes the registry user ID while preserving its reserved number.

Local verification passed: PostgreSQL function fixtures for ordering, retry idempotence, conflicting legacy numbers, simultaneous attempts, preserved metadata, Founder display and deleted-number retention; auth/account, gift, Apple membership, Community, Founder shipping and TypeScript checks. Full mobile verification includes auth contracts, native dependency/readiness checks and Android/iOS exports. Browser fixtures use actual signup components with synthetic membership/API data: Standard onboarding uses neutral wording and continues to Home at 390px; neutral Free onboarding renders at 320px. These are not physical-iPhone or live Clerk signup tests.

Retired Bottle Check references were removed from membership cards, comparison rows, pricing copy, signup plan copy and pricing FAQs. The website's remaining Bottle Check page and catalog-search consumers are historical dependencies and were not removed by this numbering release.

Collection-stat definitions and MSRP/secondary valuation are documented as product scope. No secondary-price source or native valuation/recommendation implementation is included. The basic stats sheet no longer shows unimplemented advanced placeholders.

Production reconciliation requires a verified encrypted external Clerk-metadata snapshot, registry seeding before deployment, metadata projection after production deploy, and readback of every assigned number and unchanged Founder number. Release evidence and aggregate reconciliation results are saved outside Git. Physical-iPhone acceptance remains pending.
