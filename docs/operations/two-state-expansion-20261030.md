# Arizona and California inventory expansion

The released baseline is workflow 41131627756, snapshot `d9b3f0bdca37fd7e`: Arizona has 139 current stores and 767 public listings; California has 78 current stores and 327 listings. Expansion counts exclude all previously selected grocery premises, including quiet stores.

## Scope and source evidence

Arizona preserves the complete 134-premise released grocery cohort and selects 138 freshly resolved premises. The additions are Safeway 1706 in Casa Grande, Safeway 239 in Winslow, and Albertsons 4 and 25 in Phoenix. Each addition has matching first-party local-page address and coordinates. One-digit merchant 4 still requires the original numeric store, banner, address, product, and stock binding.

Each Arizona premise receives bourbon, whiskey, and two rotating priority searches, alongside 48 independent library searches. The eight priority terms cover Weller, Eagle Rare, E.H. Taylor, Elijah Craig, Booker's, Old Fitzgerald, Larceny, and Michter's. The bounded ceiling is 600 inventory searches plus 45 resolver requests. Four planned passes visit all priority terms at every premise without reducing the library rotation.

California expands its closed grocery registry from 78 to 433 premises in 238 cities. All 355 additions have matching current resolver and first-party local-page evidence. Safeway, Albertsons, Vons, and Pavilions continue to require exact source/product/store/UPC/strength/package/channel proof. Unknown stock counts stay unknown. Forty resolver calls, two inventory searches per premise and eight library searches fit the 914-request ceiling. Persisted host denials still stop subsequent requests.

## Preflight acceptance

The original source observation window begins at 22:12 UTC on October 30. Captures and successful original timestamps were reused for the small Arizona selection follow-up and California's missing tail after its initial twenty-minute research deadline. These are one combined observation window, not independent repeat runs. Successful captures were not fetched again or assigned newer observation clocks. Production runs the whole revised cohort live.

| State | Selected grocery premises | Current public grocery stores | Public grocery listings | New inventory premises | Listings at new premises |
| --- | ---: | ---: | ---: | ---: | ---: |
| Arizona | 138 | 137 | 773 | 4 | 23 |
| California | 433 | 423 | 2,014 | 347 | 1,695 |

These are preflight results, not production delivery. Arizona also adds one store-and-bottle pair at an existing store. California's eight other added premises had no eligible inventory and are not counted as gains.

The actual customer Feed, Coverage, pagination, and store-search paths retain California's 2,014 observations at 423 stores. Wrong store/product/host proof, stale original clocks, unavailable stock, disabled output, and blocked/degraded health remain rejected. Reduced original fixtures cover all four Arizona additions and all four California banners.

The server-provided California city menu expands from 29 to all 238 reviewed cities. Existing mobile clients consume that directory. Source projection, saved filters, actual mobile Feed/store/location routes, Radar scope matching, welcome previews and nearby-store ranking are checked in Los Angeles, San Francisco, Sacramento, Fresno, Eureka and Redding.

Historical Mississippi implementation hashes remain unchanged. A literal two-file city-menu reversal restores the previously reviewed California metadata before the older verifier runs. Tests reject altered cities, state status, alert flags, refinement policy and duplicate boundaries; all original metadata evidence remains intact.

## Runtime and publication gates

Both states use a twenty-six-minute source budget and twenty-eight-minute parent. Arizona's measured eighteen-minute grocery pass leaves room for its bounded independent-retailer siblings; California's larger sweep also fits. The workflow's run and refresh deadlines are thirty-two and thirty-five minutes; no freshness threshold or identity rule is weakened.

Targeted California publication requires the complete 433-premise resolver/query cohort, at least 330 fresh public stores, 250 genuinely new inventory premises beyond the released 78, and 1,000 public listings. Current Arizona publication preserves all 134 released premises, requires both broad and both priority searches at every selected premise, and at least three public premises beyond that cohort. Historical capture tests explicitly retain their historical query plan.

Acceptance still requires current-main CI, the sole guarded exact-head merge, an AZ/CA production refresh, immutable workflow artifact checks, canonical Feed counts, current Coverage counts and exact-premise search. No paused local job or recurring automation is resumed.

Production artifacts preserve the exact Arizona and California public partitions and the signed canonical Feed count verification log. Their plaintext hashes can be checked against the active immutable manifest without exporting the snapshot encryption key.

The first production sweep, workflow 41143285321, verified all 433 California premises but one Vons 2111 bourbon request returned a transport failure. The full-cohort gate correctly blocked publication. California permits one retry for a transient request, capped at eight additional requests per run. Access denials and rate limits still persist immediately and never retry; long Retry-After responses, aborts and schema failures remain excluded. Retried successes retain the original observation clock and must still pass all 433-premise completeness and public-inventory floors.

Workflow 41147680540 attempt 2 completed without failed requests but its broad resolver omitted 19 Lancaster/Santa Clarita region premises, leaving 414 verified. A fresh first-party 93534 response returned all 19 with exact matching frozen addresses. California now supplements a healthy but incomplete resolver cohort with at most 16 lookups using still-missing premises' own ZIP codes. A ZIP is supplemented at most once per run, including one recheck when it was an original broad seed. Current address conflicts remain excluded. The nominal 914-request plan plus eight transient retries and sixteen supplemental resolver requests has a hard 938-request ceiling, retaining the existing 26-minute source and 28-minute parent budgets. The all-433 publication requirement is unchanged.
