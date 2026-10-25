# Nationwide expansion: source-first XAPI qualification

October 25, 2026 UTC. Base: `368bb45943f6253a3a5986f3f9ab940d0b08927b`. Prepared branch: `prepared/nv-xapi-store-binding-20261025`. This scheduled pass prepares reviewable work only. It performs no merge, deployment, source activation, release-lock change or monitor repair.

**Result: five source-positive prospective inventory connections across three states; zero new customer connections and zero restorations.** This advances candidate feasibility, not the five-store acceptance milestone. The earlier five Shopify hosts remain held after their 403 responses; none was retried.

## Actual prospects

| State | First-party identity | Physical premise | Strict supported source matches |
| --- | --- | --- | --- |
| NV | Albertsons 4024 | 2835 S Nellis Blvd, Las Vegas 89121 | Buffalo Trace and Bulleit, both 750 ml |
| NV | Albertsons 1059 | 5500 Boulder Hwy, Las Vegas 89122 | Buffalo Trace and Bulleit, both 750 ml |
| CA | Albertsons 745 | 655 14th St, San Diego 92101 | Buffalo Trace and Bulleit, both 750 ml |
| CA | Albertsons 707 | 7090 Broadway, Lemon Grove 91945 | Buffalo Trace and Bulleit, both 750 ml |
| AZ | Safeway 2799 | 28455 N Vistancia Blvd, Peoria 85383 | Buffalo Trace, Bulleit, Blade and Bow, Penelope; all 750 ml |

All five stock requests returned HTTP 200 with the requested `product.storeId`, positive primitive in-store flags and supported single-bottle formats/whole counts. Twelve strict prospect product observations span four canonical candidate families. These are merchant reports, not guaranteed physical shelf counts. Crown Royal Chocolate, rye and other broad lexical matches are excluded from this bourbon qualification. Current state-specific public eligibility remains unproved; lexical identity alone does not promise a Feed card.

Safeway 1207, 2300 W Hwy 89A, Sedona AZ 86336, is a separately captured **existing #827 control**. Its four products are included in the six-case compatibility fixture with zero new-store credit. Albertsons 662 was an existing Nevada access control, also receiving zero new-store/restoration credit. The other pass's recorded 45 new Arizona stores are preserved separately; they are not gains attributable to this scheduled pass.

## Premises and history

The two CA premises are already in the license directory. All five prospects have zero checked inventory-ID/physical-address matches in three hash-bound baseline windows. Safeway 2799 is also absent from #827's selected 80, prior 32 and all 333 published Arizona state signals. Its northern Peoria location adds a distinct neighborhood premise, not a new city. This is bounded prospective novelty; missing snapshots, pruned history, retailer identity gaps and unknown all-time history remain disclosed.

The NV and CA resolver captures are HTTP 206 partial directories, not whole-chain or inventory counts. Exact IDs, banners, street, city, state and ZIP were reconciled across in-store/pickup lanes; duplicates were not added as stores. Safeway 2799 uses retained first-party resolver evidence from 00:14 UTC; its inventory was captured at 03:26 UTC. The old resolver clock was not replaced by the new inventory clock. No existing selected Arizona premise was displaced and the 80-store runtime limit was not changed.

## What changed in code

The narrow Nevada repair requires the returned product store ID to equal the configured merchant ID. Present stock counts must be positive decimal safe integers; booleans, arrays, null, zero, negatives, fractions, unsafe integers and conflicting aliases fail closed. Genuinely absent quantity retains binary availability and the existing 100-plus sentinel presentation. The existing collector now passes its source merchant ID to the parser. No new source registry entries are added.

The exact same guarded parser replays the five prospective sources and the existing Arizona control. Portable derived fixtures retain 16 complete original product objects, source/resolver URLs, hashes and separate capture clocks. Raw full responses remain in the evidence archive. A derived fixture and its self-hashes cannot authenticate a provider archive on their own.

This proves **parser compatibility**, not unchanged end-to-end connector reuse. Existing Nevada generic matching rejects the Buffalo Trace stock-caveat title; the already reviewed Arizona product/UPC/title/alcohol/format mapping accepts it. That matcher dependency must be wired and reviewed explicitly. California still needs runtime source/policy integration. The saved 188-record Bible is a lexical reference, not fresh production canonical/classification authority.

The nonexecutable [onboarding manifest](evidence/xapi-five-prospects-20261025/onboarding.nonexecutable.json) and the two fixture/test generations are independently reviewed. Only the final six-case portable projection is included in this branch; earlier projections, rejected fixture line endings and failed harness checks remain in the archive. Integrated validation: 31 focused/actual-body tests, JavaScript syntax and whitespace checks pass. No production CI or release acceptance is implied.

## Actual effort and cost

Ten unique merchant GETs returned seven HTTP 200 inventory responses and three HTTP 206 directories: **2,524,332 decoded response bytes and 8,807 ms summed request elapsed time**, no retry, redirect, alternate client/egress or denial. Five of those GETs are the prospective stores' stock checks. The other requests establish controls and premises. This is observed acquisition cost, not wire bytes, ongoing operating cost or cost per connected customer store.

The first Nevada reader incorrectly passed raw Bible records to a matcher requiring a `BourbonBible` instance. Its original failed local outcome and complete successful HTTP body remain unchanged. Independent offline replay with the correct existing interface qualified that same body; it was not fetched again. The first partial resolver also stopped conservatively; the unused Reno query was never made. Subsequent calls used separately bounded plans and durable reservations.

## Original observation: concluded, not accepted

The original observer window ended at `2026-10-25T02:51:11.684Z`. It retains 258 reservations, three commit transitions, 30 unreserved slots and the original task/runner/window. There are 250 verified capture bodies; eight additional reserved outcomes are workflow metadata only. The last acquired customer response is `2026-10-24T23:53:33.276Z`, 177.640 minutes before the deadline. The 160-minute response gap, CA generation 628 HTTP 5xx and 14-slot unreserved tail remain. Continuous 24-hour acceptance is **false**.

The task remains enabled/Ready with no next run and an exhausted original repetition duration. It was not restarted or extended. No ledger/index/due time was reset. Release-not-verified ticks and the later main change are recorded separately from source failures; missing rejected health bodies limit exact causal attribution. The broad monitor cannot establish this soak. Existing CA/FL sources were not changed.

## Next implementation gate

Stop candidate hunting for this cohort. Use these five actual sources to implement one configuration-driven collection path, reusing the measured XAPI request shape, guarded parser and reviewed product matcher. Wire the market/source policies and configurations centrally, obtain fresh production canonical/classification and current/bounded-historical premise reconciliation, and prove normal serialization/public eligibility locally. Do not add a bespoke collector per store or merge this broad preparation into another release.

Before activation, require the sole authorized release lane, silent bootstrap/owned-key queue proof, genuinely due repeated source generations and matching normal customer Feed/Coverage results. Current scheduling/freshness must be demonstrated: the latest refresh visible in this pass was #827's manual run `40146906505`; a 30-minute code setting does not establish unattended publication. Do not re-enable the separately disabled broad monitors. The original soak cannot be retroactively repaired; any later observation needs its own honest bounded window and evidence.

The milestone remains unaccepted and this follow-up remains active. Ohio, POS work, business/customer contact, purchases and agreements remain excluded.

Evidence root: `C:/Users/chand/Documents/Bourbon Signal/nationwide-viability-pass-20261025T0302-evidence`. Key reports: `final-five-new-prospect-qualification.json`, `independent-az2799-prospect-review.json`, `independent-portable-v3-prospects-review.json`, `nv-xapi-store-guard-proposal/`, `xapi-five-premise-replay/portable-v3-prospects/`, and `final-original-observer-assessment.{json,md}`. Existing source captures and every superseded/failing local result are retained.
