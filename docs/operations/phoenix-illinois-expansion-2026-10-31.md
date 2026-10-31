# Phoenix and Illinois expansion - 2026-10-31

This pass prepares 180 exact Jewel-Osco premises in Illinois and one new Phoenix retailer, Virginia Market at 702 E Virginia Ave. All premises have current first-party address evidence. These are local preflight results; delivery requires a fresh production publication and canonical customer-API reconciliation.

## Measured source value

| Cohort | Reviewed premises | Positive public-store candidates | Eligible listings | Allocated or unicorn listings | Stores with allocated or unicorn listings |
| --- | ---: | ---: | ---: | ---: | ---: |
| Illinois Jewel-Osco | 180 | 173 | 1,029 | 485 | 163 |
| Virginia Market Phoenix | 1 | 1 | 4 | 2 | 1 |

Illinois observations span 02:43-03:13 UTC. The initial 175-store sweep returned 1,155 source rows; public classification and exact product policy retain fewer. Five additional premises and two bounded source rechecks preserve their own observation timestamps. Seven reviewed Illinois premises had no eligible positive listing and do not count as gains.

The Illinois queries beyond the first bourbon/whiskey page found 41 additional eligible listings across 25 stores, including 20 allocated listings. The eight core families, up to three broad pages, and independent 48-query library rotation are retained. A shared 500 ms request-start gate limits two store workers to 2,700 total requests, including at most eight one-shot retries for recovered transport/server failures. Denials and schema failures never retry. Exact expression, UPC, strength, package, in-store channel, price and premise guards remain in effect. Binary availability never becomes an exact quantity.

A larger Arizona grocery experiment inspected 138 released premises with 1,910 requests. It found zero eligible listings beyond the existing query plan in that same capture set. That added request load was removed before release. Arizona retains its 600-search budget, existing priority rotation, all 138 released grocery premises, and independent retailers. Virginia Market adds the actual new Phoenix premise. Unchanged denied CityHive, Fry's, BevMo and Target routes were not retried. Directory, shipping-only, restaurant-pour and marketplace catalog prospects do not count as stock.

## Runtime and customer checks

Illinois's new grocery source runs independently from the existing Binny's/independent source. Its cache retains original observation times and cannot reactivate after a later access denial. HTTP denials persist immediately. Captured Illinois HTTP 200 GR204 minimal empty responses and terminal pages are accepted only as healthy zero; they cannot establish stock or a positive store.

The grocery source has a 40-minute deadline, Illinois's parent has 43 minutes, the refresh subprocess has 47 minutes, and its outer step has 50 minutes within the existing 80-minute workflow. Arizona retains its existing 26-minute source and 28-minute parent ceilings. Targeted Illinois publication additionally verifies the complete 180-premise plan, strict public product bindings, at least 150 fresh grocery stores, 700 eligible listings and 120 stores with allocated/unicorn listings.

The backend supplies 126 Illinois city choices. Six city replays exercise actual Feed/drop routes, existing mobile filters, city monitoring scopes, alert labels, welcome preview, store directory and nearby maps; all 180 premise addresses remain selectable. These are synthetic route tests, not production or physical-device acceptance.

The prerequisite dependency repair was delivered separately in PR873 (merge0184eac9). This expansion changes backend data and collection behavior; it does not require a mobile binary or OTA.

## Production collection and bounded-export follow-up

PR875 merged as d59034a5. Production run41166891464 collected both states, including173 Illinois grocery stores with1,029 eligible listings and485 allocated listings, but activated no snapshot: the required current fleet exceeded the60MiB export budget. These captures are not delivered gains.

A replay of all14,837 captured public rows measured63,301,761 bytes before compaction and50,908,559 bytes after omitting empty top-level optional placeholders. Every row, nonempty field, false/zero value, nested proof and original clock survives. Customer normalization, classification, surface capabilities and eligibility are identical. Legacy nullable chronology/caveat fields remain explicit for retained-partition compatibility. The60MiB export budget and64MiB reader/decompression bounds are unchanged.

The54-ZIP resolver diagnostic also identified Springfield62701's exact HTTP200 in-store SR-0003 no-store response: count0, ack1, one404 error and no stores array. This exact Illinois-only shape is healthy zero, never premise or stock proof. All180 selected premises still require matching positive resolver records from other responses and complete inventory searches. Unknown shapes, denials, conflicting premises and positive-looking mutations remain rejected. The original incomplete production receipt is preserved; delivery requires another fresh production run after this repair.

Production run41170956614 then completed collection and bounded export, with Illinois complete and62701 recorded as healthy zero, but activated no snapshot. Arizona's historical verifier still compared its new-store floor against the now-expanded138-premise released cohort, making the old three-new-grocery assertion impossible. The correction preserves that floor against its actual four October30 premises as continuity and continues requiring all138 released premises selected. It does not count them again as gains.

The one-time expansion dispatch uses `require_phoenix_expansion=true` to additionally require at least four current exact-store Virginia Market listings, including two allocated/unicorn listings. Ordinary refreshes can later report that retailer sold out without blocking unrelated grocery inventory. A compressed real collection/export fixture covers the full138-premise request ledger and793 public inventory rows; removing Phoenix stock, allocation, premise proof, original clocks or required released-store continuity fails verification.
