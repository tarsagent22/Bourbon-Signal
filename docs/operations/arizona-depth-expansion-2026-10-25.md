# Arizona bottle depth and Smart & Final expansion

Baseline: current main 7731ccb592cc3b70d681ba356ebd4b7bbbcd92ad, workflow 40205447406, snapshot run 645ddec3ca79f1d2. The customer Coverage API had 127 current stores, 51 cities and 305 fresh public listings. Compare genuinely new grocery stores against the entire previously selected 128-premise cohort.

## Qualified scope

- Preserve all 128 released grocery premises and select all 134 currently discovered premises. Every store still needs fresh resolver evidence.
- Increase a single bounded search response from 100 to 120 products; a live request for 200 returned only 120. Keep one bourbon query per premise and 16 rotating rare queries, at most 150 searches.
- Add exact source-specific matches for Heaven Hill Bottled-in-Bond 7 Year, WhistlePig PiggyBack 6 Year Bourbon and E.H. Taylor Small Batch. Require simultaneous SKU, UPC, full title, 50% ABV, alcohol flag, single 750 ml package and selected store identity. Do not alter global bottle aliases or accept conflicting strengths.
- Add Smart & Final selected-store pickup inventory for seven current Arizona premises. The collector makes one discovery request and at most seven store requests, sequentially, with six-second request timeouts and persistent denial backoff. Only a selected current Arizona pickup premise, exact Buffalo Trace 750 ml SKU, available flag and positive stock status can publish. Stock status does not imply an exact shelf count.

## Live preflight

Capture window 2026-10-25T16:10:06.137Z to 2026-10-25T16:15:20.674Z. Original response bodies remain in the local evidence archive and are hashed in engine/data/source-evidence/arizona-expansion-20261025-depth/preflight.json. Final parser replay preserves original timestamps and successful request evidence.

The grocery and Smart & Final lanes project **585 eligible public listings at 136 stores**, with **nine genuinely new premises** (six grocery and three Smart & Final). The existing independent-retailer lanes were not included in this preflight, so these figures are not the final statewide total. The three new reviewed families contribute 260 public rows: E.H. Taylor 76, Heaven Hill 81, WhistlePig bourbon 103. Every quantity remains the actual reported quantity or unknown.

## Delivery gates

Strict AZ verification requires 134 selected premises, all 128 protected IDs, at least four genuinely new public grocery stores, 450 public rows, 120 rows from the reviewed identities and two public Smart & Final premises. The verifier checks current source clocks, unique identities, bounded request ledgers, original source/store/product binding, public export and alert provenance.

A guarded current-main merge and targeted production refresh are still required. Preflight, tests and merged code alone are not delivered coverage. Verify the immutable workflow artifact against canonical Stats, Coverage and health APIs and actual store search after publication.

Fry's and BevMo returned 403; Target fulfillment returned 435. These routes were stopped. The unchanged CityHive denial cooldowns remain in effect. Recurring scheduler gaps were observed before this work and are not resolved by this collector expansion.
