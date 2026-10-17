# Signal Score and bottle research

Bottle Check uses **Signal Score** for find potential. It never presents a drinking
review average as that score. Drinking reviews retain their original scales in a
separate compact section. An unresearched result has a small explanation, without
a large empty ring or invented number. Sources and methodology stay collapsed.

## Evidence coverage

The registry contains 83 exact expressions and 154 attributed rating observations,
checked October 16, 2026. These match 100 entries in the 1,156-entry offline catalog.
The previous release had 39 expressions, 75 observations and 48 matched entries.
35 expressions (40 catalog entries) now also have researched release context.
This is expanded coverage, not a claim to have researched the complete catalog.

Most reviews come from Distiller expert reviews and community averages. These are
opinion groups on one platform, not independent publisher consensus. The Wild
Turkey 101 profile also includes Whisky Advocate. Sources retain the original
score/scale, sample count, public URL and check date. Only numeric facts and short
original factual summaries are stored; tasting prose is not copied.

New profiles include Blanton's Gold and Straight From the Barrel, 1792 Full Proof
and Bottled in Bond, Henry McKenna, Four Roses Small Batch, Jack Daniel's Bonded and
Triple Mash, Green River, Bardstown Origin, Michter's rye/American whiskey,
Rittenhouse, Pikesville, Wild Turkey rye, Still Austin, Weller Single Barrel and
Van Winkle expressions. Separate batches, annual editions, proofs and named
store picks never inherit a loosely matched brand rating. A 2020 Jack Daniel's
special rye release, batch-numbered Penelope Architect reviews and age-specific
Knob Creek 18 reviews were excluded from generic expression matches.

## Method

- Signal Score weights: release rarity/context 60%, observed price value 25%,
  published drinking reviews 15%. Missing components are omitted and remaining
  weights normalized. A current release classification is required for a score.
- Rarity/context points are editorial: standard 40, limited 65, allocated 80,
  highly allocated/unicorn 95. They express find potential, not drinking quality
  or a measured probability of finding stock. A supported state classification
  takes precedence over a reviewed national catalog classification; researched
  release context is the fallback. National context is labeled visibly.
- A standard expression in a producer's range does not establish regular local
  stock. Release context is a separate, sourced assessment and does not change
  owner-approved catalog rarity or state allocation records. Limited/annual
  release statements are supported by producer releases or original publisher
  reporting. Source links and check dates appear in the disclosure.
- A catalog price is only a benchmark. It never becomes an assumed shelf price
  and never earns price-value points by being compared with itself. Observed
  prices come from optional shelf input or at least three distinct current stores.
  An observed median without a separate catalog benchmark is not scored against
  itself. An entered shelf price may be compared with that median.
- City evidence falls back to the selected state's observations when the city
  sample is insufficient. Both the state basis and missing city sample are
  labeled. No state sample means catalog/national reference only; other states
  are not substituted. Missing sightings never establish scarcity.
- Observations must match the exact expression and selected state, be no more
  than seven days old, be non-historical and have reported availability. Repeated
  stores are deduplicated. The catalog benchmark remains available even when
  local prices are expensive.
- Price-value points: <=90% of reference 100; <=115% 90; <=130% 70; <=160% 45;
  <=200% 20; above 200% 0. A price above 160% gets a steep-premium verdict.
- Expert and consumer groups contribute equally inside the review component.
  Consumer stars are explicitly converted by value/scale, while their displayed
  rating stays on the original scale. Each publisher counts once per group;
  consumer samples need at least 100 ratings. Source checks expire after a year.
  Invalid/future dates and small samples are excluded. Disagreement is disclosed.
- Personal shelf ratings, proof, age and marketing awards do not supply missing
  quality points. Personal taste notes remain separate from public evidence.

This is a transparent editorial guide, not a calibrated prediction of personal
enjoyment, a live-stock guarantee or a resale forecast.

## Validation and upkeep

Run `npx tsx apps/mobile/scripts/audit-bottle-reputation.ts --output .operator/reputation-coverage.json`
to validate the registry and export the complete missing/expired research queue.
Do not renew a check date without actually checking the cited source. No recurring
collector, external API subscription or unverified family-score fallback is added.

Regression checks cover the owner screenshot expressions, absent-price value,
median self-comparison, city/state fallback, conflicting producer facts, personal
rating independence, source freshness and release boundaries. Actual-source
browser fixtures cover 320/393-point layouts, disclosure, price clearing, missing
research and the scanner. Production OTA checks do not establish physical-device
acceptance.
