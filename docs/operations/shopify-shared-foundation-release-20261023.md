# Shared Shopify foundation and five-store preparation

Prepared for [822](https://github.com/tarsagent22/Bourbon-Signal/issues/822), supporting the still-open [five-store milestone 820](https://github.com/tarsagent22/Bourbon-Signal/issues/820). This release adds reusable infrastructure and corrects customer presentation. **The production Shopify cohort registry is empty. No candidate is admitted, enabled, scheduled or counted.** Existing pilot identities/configuration remain unchanged.

## What is implemented

One shared platform predicate binds code/config/catalog review, exact runtime source, host/product/pickup URL, merchant, canonical identity, store/product/variant tuple, premises and pickup proof. Ownership remains separate so invalid old stock can be vetoed. Canonical catalog tier and state customer tier are independent authorities: both must remain eligible, and public rows/candidates use the current state tier. Explicit missing state policy, regular bottles, changed canonical identity, stale stamps, disablement, quarantine and clock expiry fail closed.

The scheduler has explicit generic dispatch and rejects unknown kinds before the Ohio artifact probe. Disabled descriptor flags survive registry assembly. Disabled ownership is retained without making unscheduled sources unhealthy; global shutdown also suppresses generic partitions. Generic projections use existing SQL lease fencing, silent bootstrap and episode identities. One latest explicit observation and last-positive seed per admitted tuple survive empty negative results. Reconfirmation stays quiet, a real negative-to-positive opens one restock identity, and failure/recovery does not invent restock. Old/equal/future observation clocks and incomplete identity/schema reject before commit. No migration or new scheduler is required.

Two customer defects were found by executing actual processing/rendering:

- Feed applied current bottle classification while Coverage did not. Both now use `classifyPublicDrop`, so a regular bottle cannot create Coverage that the normal Feed excludes.
- Expanded cards labeled the source's retail offer `MSRP` and rounded its cents. They now show `Listed price` with cents. The independently labeled catalog MSRP reference remains separate.

The manual main-only premises baseline workflow reads four hash-verified encrypted public exports and a bounded, sanitized independent-source projection. One read-only SQL statement captures current/retained public identity with source head provenance. Authentication and exact query guards prevent this path from invoking collection or rescue. Pointer/live release identity are rechecked around the capture. Full historical absence remains unproven; raw/private/customer payloads are excluded. See `shopify-cohort-baseline-plan.md` for limits.

## Five feasible fixture configurations across three states

The original Buffalo Trace configurations remain unchanged as regular-bottle exclusion regressions. The **v2 candidate plan** is `engine/data/shopify-pickup-onboarding-cohort-v2.json`; it substitutes only two reviewed product seeds. It is never imported by the production registry.

| Physical candidate | State | V2 seed | Source offer | Current customer tier |
| --- | --- | --- | --- | --- |
| Remedy, 1700 W Glenoaks Blvd., Glendale | CA | Elijah Craig Barrel Proof 750 ml | $55.99 | limited |
| Main Street, 120 South Mollison Ave., Unit 100, El Cajon | CA | Eagle Rare 10 Year 750 ml | $44.99 | allocated |
| Christie's, 3040 Foothill Blvd., La Crescenta | CA | Booker's Bourbon 750 ml; retailer batch retained | $99.99 | limited |
| Vino, 184 Lexington Ave., New York | NY | Weller Single Barrel 750 ml | $750.00 | allocated |
| Hot Spot, 411 Brazos St., Suite 100, Austin | TX | Booker's Bourbon 750 ml | $134.99 | limited |

All five offline pairs pass the unchanged collector SHA `82ec1ede939d793f40d7a945430f49c0867fdfadf18d4004c5775c8878e39206`, real 188-record catalog, state classification, shared projection builder and normal Feed/Coverage processing. They represent five prospective addresses, three states and four canonical families, not five current production connections. Subsequent configurations reuse the same code and two supported Shopify section families. Remedy's explicit title mapping uses the existing strict contract; no alias, unsafe reason or parser branch was added. Pickup is binary orderability with unknown shelf quantity, not a reservation.

The replacement research used eight bounded successful HTTP requests total, no retries or access bypass. Four new pair captures retain exact raw bytes and SHA-256 receipts under `engine/test/fixtures/shopify-variant-pickup/v2`. Original captures remain intact. The five-pair payload model is about 30,111 bytes per round / 10 requests; at 30-minute cadence this estimates 480 requests and roughly 1.38 MiB payload per day, excluding headers, operational traffic and future growth. These are fixture measurements and estimates, not production cost or permission to override cadence.

## Verification and remaining work

`npm run test:shopify-cohort-foundation` is required by engine dependability CI. It exercises the actual collector, descriptor admission, shared policy, saved scheduler with fixture transport/mock SQL, source SQL in PGlite, authenticated read route, verified encrypted snapshot reader, actual Coverage assembly and expanded card SSR. Synthetic admissions in tests are explicitly fixtures. Meaningful cases cover bootstrap, stable confirmation, negative/restock, failure, fencing, denial/Retry-After, strict clocks, state/canonical/policy loss, current-market tiers, global off, sibling ownership, unknown quantities and correct source prices. Existing pilot, source-freshness, coverage/depth, classification/performance, TypeScript and production build checks remain required.

After guarded release, verify the exact production identity and normal customer responses, run the reviewed read-only baseline capture, and retain immutable artifact provenance. Any observer commit rebind must preserve its original start/deadline/reservations/history and record the release transition and gaps; it is a multi-release observation, not a single-commit soak. The 24-hour window has not elapsed at preparation time.

Then reconcile candidate addresses, aliases, Remedy's suite B and all relevant retained history against the frozen public baseline. Missing history remains unknown. Only evidence-qualified sources may be admitted/enabled through the sole release lane, followed by genuinely due repeated collection and matching customer/queue results. The milestone remains five net-new physical inventory connections across at least three states, subject to feasibility. Repairs, directory reuse and recovered premises are separate metrics. No businesses were contacted, no access was purchased and no agreement was entered.
