# Arizona expansion into northern and eastern markets

Expand the grocery selection from 80 to 128 exact premises. Protect the complete 80-store selection from published run d8f638dd54b1231d before balancing additions across cities. The 79 customer-visible stores, 39 cities and 190 listings from that release form the public baseline. Two independent retailers remain in the full collector and are excluded from grocery expansion claims.

## Source evidence

A fresh sweep across 32 ZIPs returned 134 exact Arizona premises in 53 cities. Added discovery seeds cover Globe, Payson, Show Low, Springerville, Douglas, Nogales, Cottonwood, Sedona, Kingman, Wickenburg, Thatcher, Green Valley, Page and Chinle. Resolver presence alone never creates inventory.

Live preflight from 2026-10-25T03:54:59.305Z to 2026-10-25T03:59:47.439Z returned 492 source rows across 125 grocery stores and 299 eligible public rows across 124 grocery stores. 48 public stores and 114 rows are beyond the prior 80-store selection. Reduced original captures cover Globe, Payson, Show Low and Page through collector, canonical serialization, export and alert-policy tests.

## Limits and acceptance

The sequential collector keeps its existing request pace, one bounded ten-minute source attempt, 16 rotating rare searches and immediate per-host denial stops. The ceiling becomes 144 searches: one bourbon query at each of 128 selected premises plus 16 rare queries. All per-source denial cooldowns and exact quantity and bottle identity checks remain enforced. No ambiguous bottle match is loosened to inflate coverage.

The current-main restoration run 40159855934 exposed a parent watchdog mismatch: Arizona still inherited the generic 180-second state limit and correctly retained stale non-alertable fallback when its fresh collection exceeded that limit. Add an explicit twelve-minute Arizona parent budget above the ten-minute source attempt. Regression checks load the actual runner policy without executing collection, verify the nested budgets and confirm explicit overrides and other states remain independent.

Publication requires all 80 prior selected premises, 48 genuinely new selected premises, at least 32 genuinely new public stores, at least 110 positive grocery stores and at least 190 distinct public inventory rows. Earlier fixtures continue to use their historical baseline.

The prior state and source cadence caps remain in effect. The new pass also observed a gap in GitHub scheduled refresh execution despite active workflow definitions; configured cadence is not proof that the scheduler ran. A bounded current-main refresh restores existing coverage while this release is prepared. This change does not claim to repair external scheduling reliability.

Production acceptance requires the guarded merge, an Arizona-only refresh on merged current main, the immutable artifact verifier and canonical customer API and new-city search checks. Preflight counts alone are not production delivery.
