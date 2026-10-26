# Search the scarce bottle library across supported source searches

The previous release connected the catalog to bottle recognition, while many collectors still searched a permanent shortlist. This release connects retrieval to every scarce library expression as well. Source coverage remains a separate requirement: a successful matcher cannot supply inventory from a state or retailer with no active connection.

## Retrieval changes

The shared query pool contains every national or state limited, allocated, highly allocated and unicorn library expression, plus short name prefixes. Prefixes are search inputs only; they never identify inventory. Existing source request caps remain in Tennessee Grabbl, Arizona WooCommerce and grocery, South Carolina Clover/WooCommerce/Dunes, North Carolina county searches, Illinois Binny's, Utah and Montgomery County. The reviewed New York and Colorado CityHive depth lanes now allow one category request and four public searches within a 25-second source ceiling, preserving their first reviewed query.

Each source has a durable independent cursor. It advances when that source actually runs, rather than selecting terms by day or clock parity. The pool automatically includes future qualifying library additions. Library or tier edits preserve the next pending query instead of restarting the first few bottles; new entries join the continuing cycle. Search cursors restore and save independently of publication, including failed publication, so adaptive scheduling and rejected snapshots do not reset the search net. The audit distinguishes selected terms from real HTTP outcomes; neither implies stock.

Arizona grocery maintains 134 selected stores, a broad bourbon request at every store and 16 library searches within the 150-request ceiling. Both store selection for supplemental searches and the query pool now advance on actual source invocation. This does not claim every bottle at every store is checked each refresh.

Fixed candidate filters in the changed retail and North Carolina lanes now admit exact scarce library identities, including rye and new brands. New York and Colorado parsing and customer eligibility also accept exact library rye identities with a retained merchant/product/variant proof. Existing heuristic matches stay inside their previous rules. Ages, finishes, proofs, ambiguous identities, store bindings, denied routes and stock semantics remain guarded.

## Smart & Final

The connector discovers candidate products through selected-store bourbon, rye and rotating library searches. Search cards are discovery only. Each accepted product must independently publish the same SKU, title, size, exact store UUID/address, pickup mode, `available: true`, alcohol restriction and an explicit positive `plenty` or `low` stock status on its product page. A missing stock status is unknown even when a search card says available. Detail slots rotate as well, so later candidates do not remain permanently behind the same highest-ranked bottles.

The existing Buffalo Trace proof remains supported. General library product proofs carry schema version 2, discovery URL, SKU, canonical identity and premise binding through canonicalization, public export and the customer evidence gate. The source has a 90-request and three-minute ceiling. Repeated result pages stop pagination and are reported, not counted as a complete catalog. Existing source denial backoff remains authoritative.

The captured Gilbert product page independently reported Weller Full Proof 750 ml available with positive stock status at $69.99. This preflight is source evidence; the production receipt separately establishes customer visibility. Eagle Rare and Taylor search cards did not provide explicit product-page stock status and were excluded.

## Geographic limits and acceptance

Library search planning is wired to eight full-state collector lanes (AZ, TN, SC, NC, IL, UT, NY and CO) and separately Montgomery County. This describes configured source searches, not statewide premise coverage. Other existing full-catalog and broad-category collectors continue to accept safely matched library targets within their own page and source limits. Virginia and West Virginia still have reviewed product-code restrictions that require a separate catalog-discovery expansion. States without an active source remain explicit retrieval gaps in the all-state audit.

Acceptance requires the full engine regression suite, conservative identity and negative-stock tests, process-restart cursor tests, workflow cache contracts, current-main CI, a guarded exact-head merge and a fresh immutable production snapshot. Production source results, public inventory and delivered notifications must be reported separately.


## Alert admission correction

The first multi-state production candidate was retained as rejected evidence because two operational Little Book alert rows referred to retailer product IDs absent from the deduplicated public feed. Distinct retailer products had mapped to one legacy bottle family. Public inventory and the alert change path therefore selected different products/prices. Inventory change alerts now require the exact fresh public source, premise, product/variant, URL, raw title, observation, quantity and price. Canonical engine IDs and source display IDs remain separate; an overlapping family or store cannot substitute for a product binding. The existing Arizona verifier and its inventory-binding requirements remain unchanged.

Verified Arizona binary availability also participates in the current-inventory alert path using the existing Arizona source policy. Zero remains an unknown count, `quantityIsExact` stays false, and positive source availability is still required. Captured production fixtures reproduce both rejected product IDs, retain the admitted variants and Weller, and reject changed source, premise, SKU, timestamp, price or quantity.


## Quarantined source query budget

All American Liquor remains directory-only while its current inventory proof is quarantined. Its production collector makes zero catalog requests, ignores old catalog caches and emits only the configured Mauldin directory premise with inventory and watch alerts disabled. It is excluded from the library inventory search registry. A catalog listing discovered during the second rejected production candidate did not prove stock and could not satisfy the existing location-only publication contract. That contract and the inventory policy remain unchanged. Re-enabling this source requires a separate reviewed current-stock proof.


The captured second candidate also failed the separate complete-state SC baseline when replayed locally: rate-limited CityHive routes left seven required stores without current evidence (15 current inventory stores against a 22-store floor). No baseline or quality requirement is relaxed. Verify the other changed states in their targeted run, then verify the working SC Dunes connector through the existing source-scoped refresh path, which requires current exact-store inventory and customer-visible rows and marks unrequested siblings stale and non-alertable. Complete-state SC coverage remains unresolved.

Targeted South Carolina workflow dispatches now force Dunes live collection, matching the other reviewed manual SC source lanes. Its six-hour cache cannot substitute for the source-scoped verifier requirement that observations originate in this run.


## Accepted production and remaining source corrections

Workflow 40263961014 accepted snapshot `fb9c64a9ae0627af` on merge `095d9cb5a6d3d042d20e09137462f7003b988f36`. Live API verification found 585 fresh Arizona rows across 136 premises, zero newly added Arizona premises, and Weller Full Proof 750 ml at Smart & Final Gilbert #730 for $69.99. Five affected state lanes had fresh search outcomes. Colorado, Utah and Montgomery County retained explicit stale reports; those were not counted as successful fresh expansions.

The Dunes source-scoped run 40263963054 was rejected before activation. It collected fresh stock, but the SC wrapper stamped `sc:dunes` over the source's leaf routing field; the Dunes policy recognized only `retailer:sc:dunes:6178`. The policy now recognizes that exact reviewed SC route while retaining runtime 6178, SKU URL, exact premises, cart, stock, quantity, price, freshness and fulfillment requirements. Conflicting raw runtime proof fails closed. Captured replay retains three customer rows, including 1792 Full Proof at $49.99. Unknown routes, conflicting runtime, changed SKU and zero stock are rejected.

Dunes detail slots now persist their progress beyond the first result cohort. Utah retains five baseline query families and six library-rotation slots in its existing eleven-query budget. Its four detail slots per query rotate too, and duplicate product codes are fetched once per pass. The live Utah preflight found 21 distinct board aggregate rows in 36 requests under the existing 55-request maximum. These remain statewide informational aggregates with no exact-store or alert claim. Neither source correction is production-verified until its subsequent targeted publication succeeds.

Complete-state SC coverage, Montgomery County recovery, Colorado rate limits, Virginia/WV code discovery, other bounded retrieval gaps and states without active sources remain under finding #839. No quality threshold is reduced to accept a rotating cohort.


## Source acceptance and complete planned pair coverage

The follow-up source corrections were accepted on merge `6cbf743e682a1d0f7a21028d8286a8858d5e05e7`. Utah workflow 40267402037 accepted snapshot `120aaeb3df91c9a3`: 18 current aggregate rows, 10 positive, five exported aggregate drops, four customer-eligible aggregate rows and zero inventory alert candidates. Dunes workflow 40267404543 accepted snapshot `d0a890a74e0e6d1a`: eight verified source inventory rows and three public rows, including 1792 Full Proof at $49.99. Live coverage confirmed Dunes actively monitored. Overall SC coverage also contains retained earlier observations within their original freshness windows; the source receipt is not a full-state coverage claim.

A long-cycle audit then found the invocation-based Arizona grocery plan advanced its store and query positions in lockstep. With 134 stores and 350 library search terms sharing a factor of two, it visited only 23,450 of the 46,900 possible term/premise pairs. Prefixes overlap, so this is not evidence that half the bottles were missed, but the persistent pairing gap was real.

The planner now shifts the store assignment after each full query-pool cycle using a stride coprime to the selected store count. The durable source invocation counter supplies progress, including after failed publication; no clock reset is required. Tests cover every planned pair for the production dimensions, other shared-factor dimensions, small selected cohorts and a shifted query cursor. Small cohorts retain their original supplemental request budget. The default 134 broad bourbon searches plus 16 supplemental requests still total at most 150.

This proves scheduling reachability under a stable source and library, not successful HTTP execution, stock, or an observed complete store/expression sweep. The all-state audit keeps exhaustive detection false. Catalog changes, inaccessible sources, inventory freshness and request limits remain explicit constraints.
