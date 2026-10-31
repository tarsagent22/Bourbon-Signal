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
