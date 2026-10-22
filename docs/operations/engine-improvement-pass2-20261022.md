# Engine publication reliability and Illinois matching

## Publication failure and early verification

Production refreshes 39803907764 and 39809375556 collected inventory but failed the two customer-surface regression tests during the final site verification. Those tests read mutable `out/site` output as historical fixtures; a hidden lottery row changed the expected representative.

The tests now use five reduced, tracked publication representatives, preserve the original observation and publication clocks, and hydrate a coherent isolated baseline for the real exporter. A regression poisons disposable generated output and dispatch environment variables to verify isolation. Hidden events remain hidden, mixed-run baselines fail, and stale inventory cannot authorize delivery. The production surface verifier and publication gates retain their existing rules.

The refresh workflow runs these small deterministic tests before collection so a static regression fails before expensive source work. Full site verification still runs after collection.

## Persistent metro request backoff

Direct NY/CO metro requests record attempt state separately from positive inventory in `out/optimization/metro-source-attempts/{NY,CO}.json`. Each completed source attempt writes the ledger atomically before inventory quality or publication gates. The workflow restores and saves this ledger independently of the success-only collector cache, including failed publications.

- HTTP 401/403: one bounded attempt, then at least 24 hours of backoff.
- HTTP 429: one bounded attempt, then at least four hours of backoff.
- Maintenance targeting cannot override these denial cooldowns. Healthy sibling sources retain their normal cadence.
- Optional-page denial retains already accepted base rows with their original observation clocks, then stops that source.
- Missing positive inventory, a restarted process or a failed publication does not erase the attempt history.

The reviewed bootstrap contains 26 direct denials from run 39794411704 (18 NY, eight CO). Its clocks and artifact provenance are stored in `engine/data/metro-source-attempts-bootstrap.json`. Six sources with later successful runtime results in run 39809375556 are excluded. Later attempts supersede the seed; expired seed entries do not extend their own cooldowns. Supported browser artifacts continue through their existing path with unchanged observation timestamps.

## Illinois exact product expansion

Existing production collection succeeded in run 39809375556. One additional public Algolia request captured the existing bourbon page on 2026-10-22 at 16:24:04Z. No new endpoint, pagination expansion or access route was introduced.

Two reviewed Binny's identities now require the exact product SKU, full title, proof, 750ML format, unit label and official product URL:

| SKU | Canonical bottle | Additional public rows in replay |
| --- | --- | ---: |
| 982098 | Heaven Hill Bottled-in-Bond 7 Year | 46 |
| 190801 | Blanton's Original Single Barrel | 2 |

The replay traverses collection, canonicalization, JSON serialization, public export and alert-candidate projection under normal production policy. The captured subset increases from 87 to 135 public rows and candidates. Combining the saved production source rows with the two captured products increases the comparison from 231 to 279. These are matching-only offline comparisons, not claims of live publication or delivered notifications.

Unsafe generic or distinct-finish matches are rejected as well. This removes 230 source rows across five previously matched SKUs; those rows produced zero public rows in the saved comparison. Raw matched-product and inventory-row totals can therefore fall while public precision and coverage improve. Out-of-stock, missing-store, incorrect-format, wrong-proof and stale observations remain rejected.

The existing request budget is unchanged: the saved runtime used 20 product queries plus one stores query, within the existing maximum of 31 requests. Live acceptance requires the merged engine to collect and activate a verified snapshot, then confirm the canonical production API observes that snapshot.

## Local verification

`npm --prefix engine run verify:site` passes all 1,013 engine tests. The six historical MS boundary tests, MS research verification and operations workflow verification pass. Independent review also verified restored-data clock bounds, malformed metadata handling and denial-status normalization. Production verification must be recorded separately from these local checks.
