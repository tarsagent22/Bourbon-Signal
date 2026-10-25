# Shared grocery XAPI runtime preparation — October 25, 2026

Base main: `564012d4` (#829). Prepared branch: `prepared/nv-xapi-store-binding-20261025`. This heartbeat implements and reviews preparation only. No PR, merge, deployment, production source registration, activation, objective-lock change or monitor change occurred.

**Actual customer gains this pass: 0 new stores, 0 restored stores. Five source-positive prospective connections across three states are prepared.** These do not meet the five-store acceptance milestone.

## Current cohort and honest replacement

| State | Prospective premise | Strict source observations at capture |
| --- | --- | --- |
| NV | Albertsons #4024 — 2835 S Nellis Blvd, Las Vegas, NV 89121 | Buffalo Trace 10; Bulleit 14 |
| NV | Albertsons #1059 — 5500 Boulder Hwy, Las Vegas, NV 89122 | Buffalo Trace 5; Bulleit 4 |
| CA | Albertsons #745 — 655 14th St, San Diego, CA 92101 | Buffalo Trace 6; Bulleit 12 |
| CA | Albertsons #707 — 7090 Broadway, Lemon Grove, CA 91945 | Buffalo Trace 5; Bulleit 5 |
| AZ | Safeway #1749 — 9100 N Silverbell Rd, Tucson, AZ 85743 | Rare Breed 3; Buffalo Trace 19; Bulleit 31; Blade and Bow 4; Penelope 2 |

Thirteen bottle-store observations span five canonical candidate families. All are 750 ml single bottles; quantities are retailer reports, never shelf guarantees. Saved Bible matching is lexical evidence, not fresh production canonical or per-state rarity authority. CA/NV source clocks remain their original 03:13/03:16 UTC captures; they were not refreshed or relabeled current by replay.

Safeway #2799 is already public in #829's recorded verification, so it was removed from prospective new-store credit. It and previously released Safeway #1207 remain existing-store controls. The #829 recorded release separately reports 45 gross new physical stores, a 36-store net current gain (79→115), and 104 new public rows. Those are another release's recorded gains, not this heartbeat's gains; preflight 48/124/299 counts are not production results. #829 also records ten prior stores unavailable at publication, including 1207; a historical positive fixture does not claim recovery.

The replacement 1749 has exact in-store identity in retained first-party HTTP206 resolver evidence (03:53:47.907 UTC), zero normalized ID/address/alias matches in recorded #829 selected 128/public/state evidence, and zero checked matches in three retained baseline windows. Those windows have missing/pruned history; all-time novelty and a fresh production baseline remain unresolved. Directory membership alone received no inventory credit.

## Implemented and reviewed

One shared configuration-driven path builds the exact in-store request, requires exact returned merchant ID, rejects malformed/coercible/conflicting stock and duplicate products, verifies bottle format, reuses the reviewed AZ product matcher, and serializes normal inventory signals. Its production transport enforces one request, 12 seconds, 2 MiB decoded body and zero redirects/retries. No new per-store runtime branches were added.

The existing Nevada runtime now calls that shared path for its three already registered XAPI sources on this prepared branch. Legacy source IDs and 0.82 confidence are retained. The exact Buffalo Trace stock-caveat mapping is an explicit matcher reuse exception. Alcohol/single-package/ML metadata admission is narrower than the old NV parser; unsupported older rows may be removed. This is a correctness change requiring release review, not a claim of unchanged acceptance for every legacy SKU.

All five prospects replay the same request/parser/matcher/serializer with data changes only. Generic CA/NV public identity gates intentionally reject unregistered prospects. No source was added to the poll registry. Local runtime reuse is proven; full production connector, lifecycle and customer-path acceptance remain unproved. The [nonexecutable onboarding manifest](evidence/xapi-shared-runtime-20261025/onboarding.nonexecutable.json) lists exact configurations, clocks, bindings, reuse exceptions and remaining gates.

The response is the first 100-result bourbon search page. Runtime metadata explicitly says `completeSnapshot:false` and `absenceIsOutOfStock:false`; a missing SKU is not a retailer out-of-stock observation. The future poll path must distinguish explicit negative stock from unknown search omission and prevent stale owned rows reviving.

Independent GPT-6.1 Sol review passes 120/120 focused checks, including existing CA/FL pilot regressions. The requested ten-file core suite passes 69/69. Tests cover actual saved objects, normal serialization, unregistered-source rejection, exact premise, canonical identity, conflicting SKU/count/size, typed failure, caller cancellation with no sibling/cache write, actual fetch body/redirect limits and existing owned-partition expiry/failure/disable/backoff. This is local validation, not CI, production Feed/Coverage or unattended acceptance.

An initial broad run had 59 passes and 3 failures: two tests needed the locally generated Bible, and an old test extracted a function body instead of importing the real module. The Bible was generated offline (188 records), and the test now imports the actual collector with injected offline I/O and a complete actual 662 projection. Earlier failures and independent review findings remain in the evidence record. Review also caught swallowed cancellation and misclassified partial HTTP200 failures; both are fixed and covered.

## Actual acquisition and maintenance evidence

Only one new merchant GET was made: 1749 returned HTTP 200, 292,945 decoded bytes, 902 ms elapsed, no retries/redirects/denial. Its original raw response and fsynced create-only reservation/outcome are retained. Named hold/bootstrap/recorded attempt evidence had no applicable Safeway denial; XAPI's missing durable denial ledger remains an admission gap, not global access clearance. Held Shopify/CityHive/Indiana routes were not retried. No Ohio or POS integration work, outreach, purchases or agreements occurred.

Source qualification and integration share fixed code across stores two through five. Per-store configuration/bindings/fixtures change; current source admission, market policy and publication have not been performed. Ongoing maintenance cost and onboarding minutes per accepted customer store are not measured and remain null. The one-time 902 ms fetch is not operating-cost or release-time evidence.

## Observation and ranked next work

The original observer ended 02:51:11.684 UTC without continuous acceptance. Its final assessment hash remains `20eb61c4fc7140b1c096c428f35ccb9f91cdb5f7b5c7bb5453179fb1e524f614`: 258 reservations, 250 capture bodies, 8 metadata-only workflow outcomes, 30 unreserved slots, the long gap and CA generation 628 failure remain. No task, reservation, due time, index or deadline was reset or extended.

A finite metadata audit found scheduled refresh 40164744948 on current main at 05:13 UTC, completed 05:55, including successful activation/verification steps; manual 40167230432 completed 06:04. The eight-run census has no later run in this pass's finite metadata review despite the configured 7/37-minute schedule. That is a refresh-reliability investigation priority. Workflow completion and broad state fallback do not prove accepted source generations or this cohort's soak. No broad monitor was re-enabled or modified.

Ranked next: (1) establish current source freshness and diagnose the scheduled refresh gap using immutable source/customer artifacts; (2) integrate this shared path with reviewed per-source durable cooldown, due accounting and current state-specific canonical/public policy; (3) reconcile fresh baseline/aliases, configuration and explicit stock negatives, then normal Feed/Coverage and silent bootstrap/queue evidence; (4) use the single authorized release lane and observe genuinely due repeats. Keep CA/FL pilot and all current AZ 128 selection/budget intact. Do not hunt another platform or build per-store collectors while these concrete cohort gates remain.

The milestone is unaccepted and the follow-up stays active. No new-source release authority is inferred from this scheduled pass.

Evidence: `C:/Users/chand/Documents/Bourbon Signal/nationwide-shared-xapi-20261025T0906-evidence`; key reports: `premise-policy-audit.json`, `replacement-source-plan.json`, `safeway1749-single-request/`, `final-integrated-review.json`, `shared-xapi-maintenance-reuse-review.json`, and immutable refresh metadata. Earlier reports remain historical.
