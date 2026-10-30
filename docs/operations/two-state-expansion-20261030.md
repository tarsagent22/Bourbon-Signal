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

## Runtime and publication gates

Both states use a twenty-six-minute source budget and twenty-eight-minute parent. Arizona's measured eighteen-minute grocery pass leaves room for its bounded independent-retailer siblings; California's larger sweep also fits. The workflow's run and refresh deadlines are thirty-two and thirty-five minutes; no freshness threshold or identity rule is weakened.

Targeted California publication requires the complete 433-premise resolver/query cohort, at least 330 fresh public stores, 250 genuinely new inventory premises beyond the released 78, and 1,000 public listings. Current Arizona publication preserves all 134 released premises, requires both broad and both priority searches at every selected premise, and at least three public premises beyond that cohort. Historical capture tests explicitly retain their historical query plan.

Acceptance still requires current-main CI, the sole guarded exact-head merge, an AZ/CA production refresh, immutable workflow artifact checks, canonical Feed counts, current Coverage counts and exact-premise search. No paused local job or recurring automation is resumed.
