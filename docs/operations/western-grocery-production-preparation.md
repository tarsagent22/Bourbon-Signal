# Washington and New Mexico production preparation

Both states remain inactive. This change registers their closed grocery source
cohorts and adds inactive lifecycle metadata without promotion counters or
customer-delivery claims. Direct state collection, forced collection and cached
observations all produce zero requests and zero rows until authoritative active
status, initial on-site-only flags and immutable promotion evidence admit the
current manifest and exact cohort hash. Disabled or quarantined states also stop
before any request.

The source is the same strict resolver/product parser used in research. It
ignores arbitrary source URLs supplied in state configuration and accepts only
the frozen premises. It cannot inherit Costco, catalog, shipping or neighboring
state data. The initial output is real on-site availability with every inventory
alert, watch, delivery, email and SMS flag explicitly false. Binary availability
keeps quantity zero and `quantityIsExact=false`; an exact count is never invented.
The normal operational, public export, app normalization, Feed, Coverage and
Finder service paths retain this evidence without a canary-only preview flag.

Complete cohort caches live under `engine/out/browser/` for at most 30 minutes
from the original source observation. Reuse does not advance the observation or
last-good time. Wrong cohort, malformed stock proof, future clocks or stale rows
cannot reuse a cache. The current full library is reapplied on each reuse, so a
disabled or newly ordinary bottle cannot inherit an older scarcity label.
Incomplete observations cannot replace a complete inventory cache.

Access incidents live independently under
`engine/out/source-incidents/western-grocery/`. The runtime verifies that this
journal can be written before HTTP, persists denials before another request, and
keeps incidents outside abort-aware inventory publication. Active cooldowns stop
forced runs and cache reuse. Failure to persist a newly observed denial retains
the actual HTTP status and storage-failure detail. The refresh workflow restores
this journal separately and saves it with `always()`, including failed collection
or publication. Inventory cache writes remain abort-aware and atomic.

| State | Source ceiling | Parent ceiling |
| --- | --- | --- |
| WA | 600 seconds | 720 seconds |
| NM | 180 seconds | 300 seconds |

The source runner allows only one attempt and caps any requested timeout at the
reviewed ceiling. The parent timeout includes cleanup room. At the repaired
24-state candidate baseline, adding both states projects 1050 seconds across four
workers against 1500 seconds available in the 30-minute interval with its existing
five-minute margin. This is a capacity forecast, not activation or delivery.

`engine/test/western-grocery-production.test.mjs` exercises blocked authority,
cohort cache validity, original clocks, current library changes, cache expiry,
denial persistence after cancellation, failed journal storage and source timeout.
`scripts/test-western-grocery-production-path.mjs` uses explicitly synthetic
promotion schemas and mocked source responses, then the actual collector,
operational export, normalization, classification, Feed/Coverage and Finder
services. These tests never provide real promotion evidence or source coverage.

Before activation, reconcile the exact implementation with accepted current
main, obtain fresh integrated source/shadow/canary/provenance bindings, and
complete the existing guarded promotion requirements. Earlier research artifacts
and previews retain their original source SHA and cannot authorize a changed
production implementation. Authenticated Finder, dashboard and saved preference
sessions remain separately unexercised; they are not represented as live UI passes.
