# Signal Score and bottle research

Bottle Check uses **Signal Score** for find potential. It never presents a drinking
review average as that score. Drinking reviews retain their original scales in a
separate compact section. An unresearched result has a small explanation, without
a large empty ring or invented number. Sources and methodology stay collapsed.

## Evidence coverage

The registry contains 83 exact expressions and 154 attributed rating observations,
checked October 16, 2026. These match 100 entries in the 1,156-entry offline catalog.
The previous release had 39 expressions, 75 observations and 48 matched entries.
55 expressions (70 catalog entries) now also have researched release context.
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

- Signal Score has fixed weights: release rarity/context 80%, published drinking
  reviews 20%. Price has a separate buying verdict. Missing price data never
  reweights the score. A current classification and published review evidence are
  required for a precise score. Classification without reviews produces the
  possible score range; missing classification leaves the number unavailable.
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
  sample is insufficient. The median is labeled with the state; the missing city
  sample is explained in the disclosure. No state sample means national reference only; other states
  are not substituted. Missing sightings never establish scarcity.
- Observations must match the exact expression and selected state, be no more
  than seven days old, be non-historical and have reported availability. Repeated
  stores are deduplicated. The catalog benchmark remains available even when
  local prices are expensive.
- Price comparisons remain separate from Signal Score. At or below 115% of
  reference, a bottle with published review average >=75 receives a good-buy
  verdict. Prices above 160% get a steep-premium verdict. The reference and
  percentage difference are visible. This is a benchmark comparison, not a
  prediction of resale value or a claim of local stock.
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

## Concise repeat checks

The result header goes back to the prior scan/search without closing the modal.
That path preserves the price for a corrected match. The fixed bottom action
starts a fresh scan, clears the price/query/matches, increments the scanner
session and returns the list to the top. Region selection persists. Android's
hardware back uses the same correction path. Async profile/report effects are
cancelled when the selected bottle changes.

The default result contains the bottle, find verdict, Signal Score, context label,
optional shelf price and compact published reviews. Reasons, source dates,
confidence and methodology are under **Why this score?** Coverage requests,
regional alert setup and repeated explanations are removed. Watch, post sighting
and details are secondary actions.

## October 16 core-release research

Twenty additional exact expressions now have sourced release context. The new
standard/core classifications describe their place in the producer's portfolio,
not the frequency of stock in a state or store. Some are editorial interpretations
of the producer's portfolio grouping; they never overwrite approved rarity.
In particular, Michter's US1 range is separate from its limited-release collection,
but the producer also describes US1 production as limited quantities. That alone
does not establish a rare or allocated release. Barrel, proof and named-pick
boundaries remain in place. Ratings and sample counts are unchanged.

Source URLs and concise evidence summaries are attached to each added record in
`shared/bottle-reputation.json`: Buffalo Trace, Elijah Craig Small Batch, Larceny,
1792 Small Batch, Russell's Reserve 10 and standard Single Barrel, Evan Williams
Bottled-in-Bond, Michter's US1 bourbon/rye/American whiskey, Angel's Envy port finish,
Bulleit bourbon/rye, New Riff bonded bourbon/rye, Old Grand-Dad 114, Redwood Empire
Pipe Dream, Still Austin The Musician/Cask Strength Bourbon and High West Double Rye.
