# Shopify exact variant pickup onboarding (preparation only)

Latest review: use the V2 fixtures and `nationwide-review-pass-20261023T0940.md`. The five-premise physical context now includes the independently reviewed exact Hot Spot alias; inventory/newness/admission remain pending. #824 is the sole draft for serving-cost and verified-retailer baseline repairs. The conservative street/punctuation fixes in that draft supersede the prior prepared retailer module.

Current checkpoint, 08:36 UTC: the shared infrastructure described here is released by #823, with an empty production admission registry. Use the v2 manifest `shopify-pickup-onboarding-cohort-v2.json` and its current classification fixtures; the historical v1 Buffalo Trace pairs below remain exclusion controls. Directory context exists for all five candidates: four exact address matches and one ambiguous Hot Spot APT100/Suite100 match. Their prospective inventory-connection delta, retailer/history gaps and reviewed Remedy Suite B alias are documented in `shopify-v2-historical-identity-audit-20261023T0836.md`; do not interpret directory membership as inventory or the local tests as admission. New retailer/directory baseline tooling in this scheduled pass remains preparation only.

This family collects a small reviewed list of product variants at independently named physical premises. It does not scan a catalog, activate sources, write state, or send alerts. The existing Jensen runtime collector and released CA/FL pilot are unchanged. The candidate manifest is not imported by the runtime registry or scheduler.

## Reuse contract

`engine/src/collectors/shopify-variant-pickup.mjs` exposes:

- `validateShopifyVariantSource(config)`: validate and freeze reviewed JSON configuration without I/O.
- `describeShopifyVariantSource(config, { collectorSha256 })`: produce a preparation plan with the exact request URLs, configuration hash, supplied reviewed collector file hash, reuse family, exceptions, and budget ceilings. This function makes no requests.
- `collectShopifyVariantPickup(bible, config, { observedAt?, signal?, fetchText? })`: explicitly execute collection. `fetchText(url, options)` returns `{ ok, status, url, text, retryAfterSeconds? }`; `url` must equal the requested URL. The default transport is the existing engine fetcher. Importing this module does not collect.

Each product costs exactly two sequential requests on a successful check: the full product `.json`, followed by its exact numeric variant section endpoint on the same reviewed HTTPS origin. Maximums are two products, five premises, six requests, 50 seconds total, 12 seconds per request, 2 MiB per response and 4 MiB total. There are no retries. Configuration may lower ceilings. An injected transport that ignores abort is still bounded by the collector timeout race.

The product, handle, title, selected variant, and variant-to-product binding must agree with the reviewed seed. The full metadata must prove one explicit bottle size above 375 mL and at most 1750 mL. Missing sizes, conflicting sizes, excluded sizes hidden in body text, unsafe package formats, and invalid prices fail closed. Body text contributes size evidence only; tasting notes do not classify the bottle. The existing Shopify format gate and safe Bottle Bible matcher are reused. The raw product title must independently resolve to the selected real canonical. When the strict raw matcher returns no match, an exact `titleMapping` must bind the raw title, canonical name, and concrete review reason; every canonical identity token must still exist in the raw title and the safe modifier checks still apply. Only the explicitly reviewed wheated-marketing exception is supported. A raw match to a different canonical always fails, even with a mapping. No new Bottle Bible aliases are added.

Only published `pickup-availability` and `store-availability` section IDs are supported. The first parser reads the Dawn premises list; the second reads independently addressed store rows inside Shopify drawers/tooltips. Both require the configured product heading, exact pickup name, and complete address including suite/unit. No arbitrary CSS selectors, paths, additional hosts, or retailer-specific code branches are configurable. A reviewed `variant_title` heading exception is supported when the theme publishes that exact variant title with an explicit size, while numeric JSON/product/variant/URL binding and exact named premises remain mandatory. An endpoint alone is insufficient.

Every configured premise must appear exactly once for each reviewed product. Missing, duplicate, unknown, conflicting or malformed premises/status rows fail the complete check. Hidden, inert, template, aria-hidden, and explicitly display-none evidence fails closed; script/style/comment text is excluded. A real explicit pickup-unavailable row, including the published wording “Pickup currently unavailable,” is a healthy negative. JSON `available: true` never establishes pickup; explicit `available: false` conflicts with positive pickup and fails closed. HTTP 401/403/429 stop at the failing request without retry; typed errors preserve the supplied Retry-After seconds for the scheduler to enforce. This collector does not own durable cooldown storage or scheduling.

Positive signals carry stable source/store/variant identity, the exact pickup URL binding, quantity `0` with `quantityIsExact: false`, and `binary_retailer_orderable_no_exact_count` semantics. They prove retailer-published pickup orderability, not an exact shelf count, sale completion, shipping inventory, or physical stock verification. `observations` includes explicit positive and negative product/premise results. `accounting.completeSnapshot` and `metadata.completeSnapshot` become true only after every configured product and premise succeeds. Exceptions retain incomplete accounting and successful request receipts; callers must not accept accumulated partial signals. Receipts contain URLs, actual response hashes, bytes, and response clocks. The default signal clock is taken after that product's pickup fetch; an explicit `observedAt` is available for controlled callers and tests.

## Candidate manifest and evidence

`engine/data/shopify-pickup-onboarding-candidates.json` contains five preparation configurations from public source captures on 2026-10-23. These are candidates, not five delivered stores or scheduled runtime sources. Existing coverage baseline queries were provisional and do not establish deduplicated net-new production coverage.

| Candidate | State | Reviewed physical premises | Product mapping | Reuse exception |
| --- | --- | --- | --- | --- |
| Remedy Glendale | CA | 1700 W Glenoaks Blvd., Glendale CA 91201 | Buffalo Trace Bourbon, product 7687049674980 / variant 43038323638500 | Pickup name is the published street line; full address independently matches. |
| Vino Lexington | NY | 184 Lexington Ave, New York NY 10016 | Weller Single Barrel, product 8204164661380 / variant 44700008808580 | Product title explicitly identifies Weller Single Barrel; not Special Reserve or Full Proof. |
| Main Street El Cajon | CA | 120 South Mollison Avenue **100**, El Cajon CA 92020 | Buffalo Trace Bourbon, product 6860137562249 / variant 40199925563529 | Published `store-availability` tooltip, product heading preserved. Unit 100 is required. |
| Hot Spot Austin | TX | 411 Brazos Street **Suite 100**, Austin TX 78701 | Booker's Bourbon, product 15264836976800 / variant 53124475551904 | Product heading is empty; published `750mL` variant title is required with exact endpoint binding. |
| Christie's La Crescenta | CA | 3040 Foothill Boulevard, La Crescenta CA 91214 | Booker's Bourbon, product 9252461445359 / variant 47839390040303 | Raw title retains Batch 2020-03. Canonical mapping is the existing Booker's family; this does not create or claim a distinct canonical batch record. |

Raw public product/pickup fixtures and capture metadata are under `engine/test/fixtures/shopify-variant-pickup/`. Each manifest URL, timestamp, body byte count, and SHA-256 is checked offline. The product and pickup capture URL/hash/clock/status are also required in each configuration. Reviewed capture hashes are provenance, not permanent expected runtime hashes: prices and status may change, while identity and schema remain checked on every execution. Public phone numbers and original theme markup are retained so fixture bytes match the source evidence; nothing is executed from captured HTML.

The exact unchanged collector passes five hosts across CA/NY/TX against the actual current complete Bottle Bible build (188 records), not a matcher fabricated from the configuration. `current-bourbon-bible.json`, its provenance file, and `readiness.json` preserve the current builder/input hashes, full catalog SHA-256, collector SHA-256, actual canonical IDs/tiers/confidence, explicit mapping exceptions, exact response hashes, and per-source costs. The current catalog SHA-256 is `e5883ec9034802bff14dcae918fba4abc7d9baf2f5cc069c6013469e027e82be`. Tests verify input and code hashes so stale snapshots fail. The builder was executed unchanged apart from redirecting filesystem output to memory; no runtime artifact was replaced.

| Canonical from actual catalog | ID | Tier | Canonical lookup confidence |
| --- | --- | --- | --- |
| Buffalo Trace Bourbon | `bb_317836b9e64a7620` | allocated | 1.0 |
| Weller Single Barrel | `bb_1fd1f694742e0a1e` | unicorn | 1.0 |
| Booker's Bourbon | `bb_8b9546b93a7fbe72` | limited | 1.0 |

Remedy and Main Street resolve directly from raw titles. Vino, Hot Spot, and Christie's need the exact reviewed title mappings in the manifest; their raw title matcher returns no match. The confidence above describes canonical lookup, not a claim that raw fuzzy matching succeeded. Christie's is only a Booker's family mapping with the retailer's batch text preserved. Offline replay consumed two requests per source and 29,760 captured bytes total. Replay elapsed time and receipt clocks measure local fixture execution, not live network latency or a new retailer observation. These checks establish preparation compatibility only; current live source checks, deduplicated coverage admission, scheduling, and repeated production acceptance remain pending. The same test suite covers unhealthy inputs, cross-bottle mapping rejection, negative statuses, cooldown propagation, redirect rejection, partial/hidden/malformed rows, and hard resource limits. Mutated failure fixtures are safety tests and add no source/store coverage count.

The Barrel Tap remains an unsupported reserve: its positive C925 section lacks both product and variant headings. The retained B524 response is explicitly unavailable, useful evidence that the endpoint is not merely a static pickup policy, but it does not meet this collector's heading contract. Liquor Cave returned an empty section and remains unsupported. Do not change to an endpoint-only fallback to inflate the ready cohort.

## Reviewed configuration template

Use actual capture facts. Placeholder values below intentionally do not validate.

```json
{
  "id": "reviewed-premises-slug",
  "runtimeId": "state:reviewed-premises-slug",
  "state": "STATE",
  "chain": "reviewed-chain",
  "merchantId": "reviewed-merchant-shopify",
  "sourceLabel": "Reviewed merchant Shopify pickup inventory",
  "baseUrl": "https://reviewed-public-host",
  "sectionId": "pickup-availability",
  "headingIdentity": "product_title",
  "stores": [{
    "id": "reviewed-chain:physical-premise",
    "name": "Reviewed public display name",
    "pickupName": "Exact name in the pickup section",
    "address": "Exact street, unit, city, state ZIP",
    "city": "Reviewed city",
    "zip": "ZIP"
  }],
  "products": [{
    "productId": "NUMERIC_PRODUCT_ID",
    "variantId": "NUMERIC_VARIANT_ID",
    "handle": "exact-reviewed-handle",
    "title": "Exact reviewed product title",
    "canonicalName": "Existing exact Bottle Bible canonical",
    "evidence": {
      "product": {"url": "EXACT_PRODUCT_JSON_URL", "sha256": "CAPTURE_SHA256", "capturedAt": "ISO_CLOCK", "status": 200},
      "pickup": {"url": "EXACT_VARIANT_SECTION_URL", "sha256": "CAPTURE_SHA256", "capturedAt": "ISO_CLOCK", "status": 200}
    }
  }]
}
```

For the reviewed variant-heading exception, set `headingIdentity` to `variant_title` and add `variantTitle` plus a concrete `headingException` explanation to each product. Do not infer aliases or omit units to force a match. A theme change requiring another parser is a reviewed collector change, with new offline fixtures and tests.

When a raw title fails the strict matcher but independently preserves the canonical identity, add `titleMapping: { "rawTitle": "EXACT REVIEWED TITLE", "canonicalName": "EXACT CANONICAL", "reason": "CONCRETE IDENTITY REVIEW", "allowedUnsafeReasons": [] }`. This binds only that exact reviewed title/canonical pair. The Vino configuration's explicit wheated-marketing reason is the sole supported nonempty unsafe-reason exception. Missing canonical tokens, a conflicting raw match, other unsafe modifiers, or a changed title still fail. Future canonical distinctions such as individual Booker's batches require separate catalog review, not a generic alias or title-mapping shortcut.

## Local verification and future integration

Run `node --test engine/test/shopify-variant-pickup.test.mjs`. Compute the collector code hash from the final reviewed bytes, for example `Get-FileHash engine/src/collectors/shopify-variant-pickup.mjs -Algorithm SHA256`, and pass the lowercase hash to `describeShopifyVariantSource`. Record that hash, the returned config hash, code version, reuse family, exceptions, request plan, observed requests/bytes/elapsed time, and exact physical identity per candidate. The dry-run utility trusts the supplied file hash; the operator must compare it to the reviewed file. Recompute after any source change.

Before production onboarding, independently deduplicate premises against the current registry (including chain/address aliases), review canonical mappings and source access policy, verify a fresh allowed source check with the same collector, then add runtime configuration through the shared scheduler and policy path. Preserve source-owned exact product/variant partitioning, disable/failure/expiry vetoes, durable cooldown and attempt accounting, first-seen bootstrap suppression, and repeated scheduled execution evidence. Adding adapters, scheduler registrations, production activation, or delivery is outside this preparation change. Preserve the existing Jensen/CA pilot and keep this work separate from the feed freshness release.
