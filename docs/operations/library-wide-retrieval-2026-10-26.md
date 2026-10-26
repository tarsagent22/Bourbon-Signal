# Search the scarce bottle library across supported source searches

The previous release connected the catalog to bottle recognition, while many collectors still searched a permanent shortlist. This release connects retrieval to every scarce library expression as well. Source coverage remains a separate requirement: a successful matcher cannot supply inventory from a state or retailer with no active connection.

## Retrieval changes

The shared query pool contains every national or state limited, allocated, highly allocated and unicorn library expression, plus short name prefixes. Prefixes are search inputs only; they never identify inventory. Existing source request caps remain in Tennessee Grabbl, Arizona WooCommerce and grocery, South Carolina Clover/WooCommerce/Dunes, North Carolina county searches, Illinois Binny's, Utah and Montgomery County. The reviewed New York and Colorado CityHive depth lanes now allow one category request and four public searches within a 25-second source ceiling, preserving their first reviewed query.

Each source has a durable independent cursor. It advances when that source actually runs, rather than selecting terms by day or clock parity. The pool automatically includes future qualifying library additions. Search cursors restore and save independently of publication, including failed publication, so adaptive scheduling and rejected snapshots do not reset the search net. The audit distinguishes selected terms from real HTTP outcomes; neither implies stock.

Arizona grocery maintains 134 selected stores, a broad bourbon request at every store and 16 library searches within the 150-request ceiling. Both store selection for supplemental searches and the query pool now advance on actual source invocation. This does not claim every bottle at every store is checked each refresh.

Fixed candidate filters in the changed retail and North Carolina lanes now admit exact scarce library identities, including rye and new brands. Existing heuristic matches stay inside their previous rules. Ages, finishes, proofs, ambiguous identities, store bindings, denied routes and stock semantics remain guarded.

## Smart & Final

The connector discovers candidate products through selected-store bourbon, rye and rotating library searches. Search cards are discovery only. Each accepted product must independently publish the same SKU, title, size, exact store UUID/address, pickup mode, `available: true`, alcohol restriction and an explicit positive `plenty` or `low` stock status on its product page. A missing stock status is unknown even when a search card says available. Detail slots rotate as well, so later candidates do not remain permanently behind the same highest-ranked bottles.

The existing Buffalo Trace proof remains supported. General library product proofs carry schema version 2, discovery URL, SKU, canonical identity and premise binding through canonicalization, public export and the customer evidence gate. The source has a 90-request and three-minute ceiling. Repeated result pages stop pagination and are reported, not counted as a complete catalog. Existing source denial backoff remains authoritative.

The captured Gilbert product page independently reported Weller Full Proof 750 ml available with positive stock status at $69.99. This preflight is source evidence; the production receipt separately establishes customer visibility. Eagle Rare and Taylor search cards did not provide explicit product-page stock status and were excluded.

## Geographic limits and acceptance

Library search planning is wired to eight full-state collector lanes (AZ, TN, SC, NC, IL, UT, NY and CO) and separately Montgomery County. This describes configured source searches, not statewide premise coverage. Other existing full-catalog and broad-category collectors continue to accept safely matched library targets within their own page and source limits. Virginia and West Virginia still have reviewed product-code restrictions that require a separate catalog-discovery expansion. States without an active source remain explicit retrieval gaps in the all-state audit.

Acceptance requires the full engine regression suite, conservative identity and negative-stock tests, process-restart cursor tests, workflow cache contracts, current-main CI, a guarded exact-head merge and a fresh immutable production snapshot. Production source results, public inventory and delivered notifications must be reported separately.
