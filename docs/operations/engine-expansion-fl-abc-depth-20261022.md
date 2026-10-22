# Florida ABC inventory depth — October 22, 2026

ABC's existing Searchspring collector fetched only the first 100 bourbon search results, although the public response reports 508 results across six pages. Two additional requests expose more exact-store inventory through the existing 126-store integration.

The collector now follows verified pagination for at most three pages. It retains the pinned official directory, exact store names, child SKUs, positive integer quantities below 100, product and variant identities, matching location sets, prices, and HTTPS product URLs. Additional pages may describe a subset of the registered stores; they cannot introduce another store. Duplicate product SKUs cannot inflate the output. An unavailable, denied, malformed, or mismatched continuation stops immediately, retains validated earlier pages, and records the failure without retrying.

Six bounded public Searchspring requests returned HTTP 200 between 12:06 and 12:10 UTC on October 22. The reviewed first three pages produced:

| Measure | One-page baseline | Three-page collection | Gain |
| --- | ---: | ---: | ---: |
| Policy-qualified store-product rows | 1,905 | 2,800 | 895 |
| Source products | 19 | 29 | 10 |
| Canonical bottles | 11 | 19 | 8 |
| Stores with additional inventory | — | 125 | 125 |
| Stores represented | 126 | 126 | 0 |
| Current inventory alert candidates in projection | 392 | 657 | 265 |

The eight additional canonical bottles are Old Forester 100 Proof Bourbon, Old Forester 1910 Old Fine Whisky, Yellowstone Toasted Bourbon, Evan Williams 1783 Bourbon, Green River Wheated Bourbon, Old Forester 1920 Prohibition Style, Blade and Bow Bourbon, and Penelope Four Grain Bourbon.

Later pages contain bourbon-barrel-aged wines and cigars with online-only `ONL` location identities outside the immutable store registry. The three-page cap avoids those already reviewed results and preserves the current validation contract. ABC's maximum inventory requests rise from one to three; the full Florida expansion request budget rises from 27 to 29.

Timestamped response captures, byte counts, SHA-256 hashes, source pagination, and comparison counts are saved in ignored `.operator/fl-abc-depth-20261022/summary.json`. A replay through the real collector, Florida inventory policy, public projection, and inventory-alert candidate projection is saved alongside it as `integration-replay.json`. All 2,800 projected rows retain the Florida inventory policy's required evidence. The replay uses registry-derived fixtures for the four official directory responses; it is not a fresh live-directory preflight or production refresh. Candidate projection is not notification delivery.

Validation: 25 tests pass across `florida-abc-depth.test.mjs`, `florida-abc-full-store-expansion.test.mjs`, and `florida-15-20-expansion.test.mjs`. The focused depth tests cover the request cap, additional-store subsets, SKU deduplication, immediate stop on HTTP 429, malformed pagination, forged store identity, oversized result lists, and no guessed continuation for an unpaginated source.

Source: [ABC's public Searchspring bourbon catalog](https://api.searchspring.net/api/search/search.json?siteId=p16j4k&q=bourbon&resultsFormat=native&resultsPerPage=100).
