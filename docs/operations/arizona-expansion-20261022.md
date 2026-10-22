# Arizona retailer expansion, October 22, 2026

Production baseline: refresh `39817465631`, commit `def5c720eb9283e4f498b2c71483d7fac8ff98e2`. Arizona had 98 positive inventory rows across 26 premises: 76 Safeway/Albertsons rows at 24 stores and 22 WooCommerce rows at two independent stores. The customer projection contained 38 rows across 22 stores, 11 cities and four bottles. Source rows and customer rows are different counts.

## Reachable expansion

Keep all 24 rediscovered baseline grocery stores, then select eight more with balanced city representation. Chandler Safeway 1604 and Flagstaff Safeway 1225 returned positive exact-store inventory in bounded probes. The default becomes 32 bourbon searches plus 16 rotating rare searches, preserving the existing 48-search ceiling. Rotation advances by each store's visit ordinal so every rare query family reaches every store. Smaller configured store limits remain honored.

An exact reviewed Buffalo Trace product identity adds two public rows and alert candidates in captured Chandler/Flagstaff replay. The guard binds SKU 960051942, UPC, full title, 90 proof, single 750 ml package, alcohol flag and selected store. The complete two-store captured catalogs project from three to five public rows. These are replay results; production counts require a fresh published run.

## Avoid repeated denials

All 20 baseline CityHive requests returned 403 across seven hosts. Seed the persistent AZ attempt ledger from that immutable report; its aggregate finish time is a conservative upper bound, not an invented per-host request time. A single authorized Flagstaff Liquor Shopify probe returned 429 at 17:42:56.671 UTC. Its four-hour minimum cooldown is anchored to that actual finish time.

Cooldowns survive zero-row runs, cache restoration and force refresh. The first new denial immediately stops remaining requests for that source. A ledger persistence failure stops the affected risky source group while independent WooCommerce and grocery lanes continue. Successful requests replace expired denial metadata without parking healthy sources. Mesa and Best each returned a complete 36-product page, so their pagination stays unchanged.

## Publication and acceptance

Arizona's lifecycle metadata now describes the existing selected-retailer inventory lane, with Costco observations kept as a separate source. Active-state membership and inventory alert permissions are unchanged. Customer capabilities still require fresh, eligible public inventory; stale, catalog and unproven rows do not establish availability. Arizona's default feed eligibility also reuses the reviewed engine retailer identity and accepted inventory flag, preventing positive quantities on policy-only rows from inflating current coverage. Authenticated retailer submissions retain their existing acceptance path.

Shared metadata changes use exact Arizona block reversal in the historical Mississippi verifier. The original Mississippi implementation digests remain pinned; unrelated changes and altered Arizona blocks fail the boundary tests.

The targeted AZ workflow invokes the strict Arizona verifier before publication. Acceptance checks fresh collection clocks, exact premises and products, baseline preservation, the 48-search ceiling, denied-source scheduling, real added-store public output and the current retailer coverage classification. The existing quality, state integration, customer surface and authenticated production gates remain required. Run a targeted AZ refresh on merged main; do not force a nationwide recollection for this pass.
