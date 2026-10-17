# Automatic bottle assessment

Bottle Check starts with published evidence rather than member-entered prices,
personal ratings, proof-based quality guesses or placeholder points.

## Evidence

`shared/bottle-reputation.json` contains 39 explicitly matched expressions and 75
attributed rating observations checked October 16, 2026. Each observation retains
its publisher, original score and scale, consumer review count where applicable,
public source URL and check date. Most observations are Distiller expert reviews
and Distiller community averages; these are two opinion groups on one platform,
not proof of agreement across independent publishers. Wild Turkey 101 also has
a Whisky Advocate rating. Six expressions have separately checked producer facts.
The app exposes original scales, counts, check dates and links under Sources & scoring.

Only numeric facts are retained; tasting reviews are not copied. Historical batch
reviews of Rare Breed and Maker's Mark Cask Strength are excluded from their
general-expression expert groups. A Stagg Jr Batch 1 review was deliberately not
assigned to all Stagg releases. Annual releases, individual barrels and batches
can differ; matching does not cross to named batches, store picks, ages or proofs.

## Method

- Expert scores are normalized by their published scale. Consumer stars are
  explicitly converted with `value / scale * 100`; they are not presented as
  critics' original scores. The two group means contribute equally when both
  are available. A single available group stands on its own.
- Each publisher counts once per group. Consumer samples require at least 100
  reviews. Invalid, future-dated or more-than-one-year-old source checks are
  excluded. Large expert/consumer disagreement reduces the confidence label. Fewer than 500 consumer reviews or a missing opinion group retains limited confidence.
- The main FIND SCORE prioritizes supported rarity (60%), price value (25%) and
  published drinking reviews (15%). Missing components are omitted and remaining
  weights are normalized. Rarity points: regular 20, limited 50, allocated 75,
  highly allocated/unicorn 95. These are editorial weights, not measured probabilities.
- A supported, current state classification takes precedence over national evidence.
  State evidence is not represented as city-specific evidence. Missing sightings do
  not establish scarcity. Without a supported classification, any available number
  is explicitly a REVIEW SCORE with find evidence pending.
- Price value points: at/below 90% of reference 100; through 115% 90; through 130%
  70; through 160% 45; through 200% 20; above 200% 0. Above 160% the verdict warns
  of a steep price premium regardless of rarity. Optional shelf prices refine context.
- Automatic price context uses at least three distinct, exact-release stores in
  the selected state/city within seven days. Stale, future, historical, unknown,
  other-region and other-release observations are excluded. Repeated store reports
  are deduplicated. The catalog reference remains the benchmark when available;
  an expensive local median cannot erase a catalog premium. Without observations,
  the catalog reference is a clearly labeled conditional assumption, not the shelf
  price or a newly verified producer MSRP. Missing price value is omitted.
- Drinking-quality evidence appears separately with original scores and scales.
  Proof, age, awards, producer marketing, personal ratings and rarity cannot create
  a tasting rating. A find score can exist without tasting reviews, but does not
  imply a verified drinking-quality score.
- Personal ratings appear separately. The published-evidence assessment is not
  changed into the member's personal taste score.

This is an explainable editorial guide, not a statistically calibrated prediction
of personal enjoyment, an objective tasting fact, a stock guarantee or a resale
forecast. Review confidence and price assumptions stay visible separately.

## Coverage and upkeep

This release does not claim review coverage for the whole catalog. Expressions
without either supported scarcity or current drinking reviews display an em dash
and Research pending, never a default 59 or a guessed score. Missing drinking
reviews alone do not prevent a supported find score. Producer/catalog facts and price context remain
available. Add source-checked records to the registry to extend coverage; never
reuse a family rating across distinct releases or update check dates without
actually checking sources.

Run `npx tsx apps/mobile/scripts/audit-bottle-reputation.ts --output .operator/reputation-coverage.json`
to validate the registry and export the complete missing/expired research queue.
No recurring collector or external API subscription was added.
