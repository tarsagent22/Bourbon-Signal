# Bottle Check: Signal Score

Signal Score is a **0–100 buying guide** for a confirmed catalog expression. It
answers whether the bottle is worth considering in the market where you found it.
It is separate from drinking reviews, personal shelf ratings, and availability
reports. The web and native app share version 2 of the model. The app can use its
saved browsing region, home state, an exact store report's city/state, a manually
selected region, or your current location when you choose to share it.

## What changed

| Before | Current model |
| --- | --- |
| The app weighted rarity at 80% and showed a range or no score with missing evidence. | Every identified bottle immediately has a numeric score. Evidence coverage appears beside it. |
| The website primarily scored rarity. | Web and app use the same buying score and evidence rules. |
| Entering a price changed the verdict but not the score. | Price is the largest factor. Higher shelf prices never increase the score for the same evidence. |
| An undated catalog MSRP could be used for a price comparison. | The model requires a separately sourced, correctly sized benchmark. |

## How the score works

All three factors have a fixed weight. A factor without usable evidence contributes
a neutral 50 on its own 0–100 scale. If no factor has evidence, the bottle scores
**50/100 · Limited evidence**, with guidance to verify before buying. This is an
explicit baseline, not an observed quality rating. There are no pending scores;
unknown or ambiguous labels still need an exact match before a bottle is scored.
A missing dimension never increases another dimension's weight.

| Factor | Weight | Evidence and influence |
| --- | ---: | --- |
| Price | 40% | An entered shelf price or a qualified market price is compared with an independent benchmark. At the benchmark it contributes 82 factor points. The curve goes through 65 points at 15% above, 50 at 30% above, 20 at 60% above, and 0 at twice the benchmark. It reaches 100 at 35% below. |
| Release rarity | 30% | A current, sourced state classification wins over a sourced national catalog tier, then exact researched release context. Regular = 45, limited = 65, allocated = 78, highly allocated = 90, unicorn = 95. Missing reports never increase rarity. |
| Published drinking reviews | 30% | Each publisher counts once per group. Expert and qualifying consumer averages have equal group weight when both exist. Consumer ratings require at least 100 ratings. The model pivots at 75/100 and reduces the effect of single-publisher evidence and disagreement. Raw scores are disclosed on the published scale. |

A price more than 60% above the comparison or a credible lower published anchor
caps the overall score at 54. An expensive local median cannot make an excessive
markup look like a bargain. A high number without a comparable price cannot
produce “Good buy at this price.” A strong endorsement also needs at least one
other factor. “Strong evidence” requires all three factors, multiple publishers,
an entered price, and a sourced price anchor. This is an editorial model, not a
calibrated prediction of personal enjoyment, resale value, or live stock.

## Market and source boundaries

- A store median needs at least three distinct stores within seven days. A city
  can fall back to its state, with that change disclosed. There is no nearby-state
  substitution. Prices must come from an exact ID or reviewed catalog mapping,
  explicit package size, a source-backed retailer or trusted source, an exact
  store, and a real observation time. Historical rows, board shipments,
  member posts, future dates, malformed prices, and unsupported sizes are
  excluded. Same-premise rows and conflicting simultaneous prices cannot
  manufacture a sample.
- The best independent regional comparison is used when available. A median or
  official list price is never compared with itself. A materially lower official
  state list price or manufacturer MSRP still limits how favorable a marked-up
  local price can look. A published benchmark is not evidence that anyone has a
  bottle in stock. Bottle Check does not use secondary-market prices.
- Published reviews and classifications expire after 365 days. The date and
  links are visible under **Why this score?** Maker MSRP is accepted only for
  exact, reviewed releases and expires after 730 days. State lists expire with
  their published period. Undated catalog MSRP, proof, age, favorite status,
  retailer title guesses and personal taste do not substitute for missing
  evidence.
- North Carolina and Virginia launch with a small reviewed set of ABC price
  references. Each row records the precise product code and price; the label
  indicates the benchmark size. Benchmarks beyond those lists depend on priced,
  comparable source reports or reviewed MSRP. The September 2026 Old Forester
  Birthday Bourbon uses its 700 mL edition, never a prior year's price or label.

## Validation and upkeep

Run `npm --prefix apps/mobile run test:scanner` and
`npm run test:signal-contract`. Tests cover the entire offline catalog, different
city/state outcomes, marked-up prices, duplicate premises, wrong expressions and
sizes, no self-comparisons, and expiring evidence. The native browser fixture
exercises live price changes, location selection, and limited evidence at 320 and
393 points. Physical-device validation is separate.

Run `npx tsx apps/mobile/scripts/audit-bottle-reputation.ts --output .operator/reputation-coverage.json`
to export the review coverage queue. Refresh the ABC lists with a reviewed
dated source before expiry; don't roll dates forward without checking the
source. Focus research on frequently checked expressions with no verified inputs.
A price list tells us price and product identity, not drinking quality or stock.
