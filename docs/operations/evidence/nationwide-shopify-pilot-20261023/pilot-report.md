# Verified Shopify collection pilot

The bounded pilot passed at **2026-10-23T01:15:29.588Z**: five genuinely scheduled accepted collections, with the latest source generation, store, canonical bottle, product, variant and confirmation time matching both normal customer pipelines. Further source activation remains paused for operational maintenance review. This is completion of the two-source collection pilot, not a nationwide coverage completion claim.

The lead coordinated three initial read-only investigations and separated implementation and verification tasks using GPT-6.1 Sol subagents. Only the lead integrated shared changes, merged and released production. [PR 817](https://github.com/tarsagent22/Bourbon-Signal/pull/817) delivered the source changes; [objective 816](https://github.com/tarsagent22/Bourbon-Signal/issues/816) tracks the pilot. [Finding 818](https://github.com/tarsagent22/Bourbon-Signal/issues/818) records the remaining cached-feed maintenance work.

## Outcome and geographic usefulness

| Measurement | Verified result |
| --- | --- |
| Existing physical premises | 2: San Diego, California; Miami, Florida |
| Demonstrated new physical stores | 0 |
| New independent scheduled connection | 1: Jensen's existing Miami premise |
| Functioning retailer-availability connections | 2 |
| Exact variant pickup proof | 1 premise / 1 canonical bottle pair: Jensen's |
| General pickup-policy availability | 1 premise / 3 canonical bottle pairs: Mission Trails |
| Current distinct canonical bottles | 4 |
| Current store / canonical bottle pairs | 4 |
| Genuinely scheduled accepted runs | 2 California; 3 Jensen's |

The geographic benefit is local to those two reviewed premises. No state-wide, chain-wide, population-radius or net new store coverage is inferred. Both stores were already present in coverage before this work. Jensen's now has an independent refresh and correctly matched Elijah Craig 18 Year; the pilot does not establish complete ingestion of its catalog or its chain.

Mission Trails is at 8181 Mission Gorge Rd, Ste A, San Diego, CA 92120. Its canonical bottles are Maker's Mark Cellar Aged, Heaven Hill Bottled-in-Bond 7 Year and Parker's Heritage Collection. Its positive variant orderability plus separately fetched general pickup policy is weaker than exact variant pickup proof. Bottle volume is not uniformly published; no universal 750 ml claim is made for California.

Jensen's is at 1646 SW 27th Ave, Miami, FL 33145. The reviewed product / variant is 15414448390218 / 67703590977610, Elijah Craig 18 Year, with explicit 750 ml metadata and an exact pickup offer naming that premise. Pickup is usually ready within 24 hours; this is not an immediate shelf-stock promise. Buffalo Trace product 7793267081290 is 375 ml despite an unsized title and remains excluded from the pilot. Both connections report binary availability with unknown quantity, not an exact shelf count.

## Actual scheduled collection and cost

| Source | Generation | Started UTC | Requests | Bytes | Measured seconds | Retained projected candidates |
| --- | --- | --- | --- | --- | --- | --- |
| FL | 1 | 2026-10-23T00:00:21.304Z | 2 | 11,112 | 1.764 | 0 |
| CA | 563 | 2026-10-23T00:30:20.757Z | 4 | 3,970,983 | 6.480 | 3 |
| FL | 2 | 2026-10-23T00:35:20.404Z | 2 | 11,112 | 1.562 | 0 |
| CA | 564 | 2026-10-23T01:05:20.509Z | 4 | 3,970,983 | 3.922 | 3 |
| FL | 3 | 2026-10-23T01:10:20.718Z | 2 | 11,112 | 1.575 | 0 |

The actual accepted collection intervals are approximately 35 minutes. The configured source cadence is 30 minutes, with completion time and the five-minute cron tick determining the next accepted start. Due-to-start lag was approximately five minutes for later runs. Current observation ages at final evaluation were about 10 minutes for California and 5 minutes for Jensen's, within the one-hour expiry.

California's full-catalog pull used about 3.79 MiB per observed run, while Jensen's targeted product and exact pickup collection used about 11 KiB. These are successful-run transfer and wall-clock measurements. Provider billing, long-term maintenance labor and all legacy failure costs were not audited. Prefer targeted product and exact pickup evidence when evaluating the next premise; do not scale the heavier catalog pattern unchanged.

## Customer and alert evidence

The [final normal receipt artifact](https://github.com/tarsagent22/Bourbon-Signal/actions/runs/39882874962/artifacts/12470783283), captured at 01:14:56 UTC, contains California generation 564 and Jensen generation 3 in both feed and Coverage. All three California identities and the Jensen identity match their exact durable source observations. The signed receipt uses the normal preparation, policy, eligibility and freshness paths and returns public inventory identities only. The final independent SELECT corroborated the same accepted source generations with zero failures.

Earlier artifacts preserve Jensen generations 1 and 2 and California generation 563. The evaluation requires advancing due clocks and generations, genuinely scheduled origin and no manual due reset. The verification workflows themselves were lead-dispatched read checks; they do not count as the unattended collections. Those collections came from the Vercel scheduler and durable source ledger. The GitHub monitor workflow is active with a configured ten-minute schedule; the observed run history does not establish punctual execution at that cadence.

Signed-out browser checks found both stores at the correct addresses with current-availability coverage, and the public bottle feed showed Elijah Craig 18 Year at Jensen's Miami location. Paid member details, retailer price display, physical phones and shelf counts were not exercised. The existing homepage headline of 4,468 stores monitored is an observed display, not an independently reconciled count of physical stores with current inventory connections.

Jensen's bootstrap and repeat runs produced zero projected candidates. California retained three projected candidates with unchanged availability identities; that is not three new emissions. Separate frozen mappings for generations 563 and 564 cover all nine stable / legacy query keys. The SELECT-only whole-window audit observed **zero surviving new queue rows and zero recorded delivery attempts** from **2026-10-23T00:30:20.757Z through 2026-10-23T01:11:27.219Z**, including the cadence gap. No member records, candidate IDs, provider IDs or payloads were selected. These zero counts do not extend to later receipts, deleted rows, unrecorded provider calls, other identities, future attempts or phone display.

## Cache boundary and scaling decision

The first final-check artifact at [01:11:58 UTC](https://github.com/tarsagent22/Bourbon-Signal/actions/runs/39882576570/artifacts/12471510379) showed the previous feed generations, while Coverage and durable jobs had already advanced. Acceptance correctly remained pending. The subsequent ordinary request after cache revalidation returned the current generations; no include-all mode, special preparation bypass, manual collector or due reset was used. The failed evaluation and original artifact are retained alongside the later passing result.

The normal feed has a fifteen-second process cache above a Next stale-while-revalidate cache containing the mutable source overlay. An idle cache can serve an older still-fresh generation on its first request. The observations establish ordinary convergence, not a hard fifteen-second end-to-end latency bound or immediate cached failure / disable invalidation. Runtime isolation and expiry regression tests do not establish instantaneous invalidation of every cached response. Finding 818 must be addressed before broader platform scale; applying mutable source policy after immutable base caching or invalidating both layers on effective source state are candidate approaches.

## Release, tests and production health

The sole production PR passed [required CI](https://github.com/tarsagent22/Bourbon-Signal/actions/runs/39874034699), independent review and the expected-head merge guard. Reviewed source head 941324e737057c0ab8989bf41cd27050b2c7f2be and production merge be8ad383b04d08882fe753958a95be2e118dd707 have the same Git tree. The merged commit also passed [CI](https://github.com/tarsagent22/Bourbon-Signal/actions/runs/39875195855). Production identity is deployment dpl_5tSH8dKgvMwkAxyuufueCETny1tF at that merge. No mobile binary change or OTA was required.

Checks passed: 135 focused implementation tests, TypeScript, production build, coverage tests and the engine data-plane suite. Required CI exercised actual SQL lease functions and source policy / wrapper regressions for isolation, expiry, disable, backoff and rollback. No production disable experiment was performed. The supplementary verifier has 24 current-state, 9 frozen-mapping and 19 whole-window offline checks. Synthetic tests are not counted as production observations.

Final health returned HTTP 200 with healthy release identity and alert cron. A fresh broad snapshot was observed during the soak: engine generation 2026-10-23T00:50:04.705Z, freshness stage healthy. The global engine remained **degraded**, with 11 degraded states and 4 stale states. Earlier rollback and freshness incidents were recorded separately. This does not establish nationwide health; global recovery and regional gaps remain operational work.

## Audit baseline and follow-on work

At 23:30:54 UTC on October 22, the retained production contract reported 729 current inventory store identities across eight states and 430 state / city pairs, 1,270 observed identities including 541 stale, and 5,575 directory entries. The export had 24 configured states and 188 canonical bottles. These are historical contract counts, not a physical-premises census or a current nationwide functioning-connection total. Directory entries, discovery candidates, catalogs, shipments, online availability and exact variant pickup remain separate classes.

Discovery fingerprints, platform and chain opportunities, direct retailer submissions and official-system gaps are recorded in the source research and initial audit. CityHive routes with denials remain behind their recorded cooldowns and access proof. Bottlecapps / BottlePOS and chain feeds remain partnership research. Broader scale is paused for cached-feed invalidation, monitor cadence review and regional health work; any later source pilot should add at most one exact-pickup Shopify premise through the same serialized release lane and evidence gates. The legacy Florida size-extraction limitation outside the new Jensen partition remains recorded.

No businesses were contacted, no access was purchased and no agreement was entered. Unrelated work was preserved. Raw captures, hashes, immutable queue proof references, the passing evaluation, measured metrics and verbatim verification source archives are retained in this evidence branch and the local project evidence folder. GitHub Actions retention is thirty days; the committed copies preserve the reviewed evidence beyond those artifacts' retention.

## Release lane cleanup

Objective 816 was resolved and closed through the shared writer-lock wrapper after acceptance. The exact reviewed source head 941324e737057c0ab8989bf41cd27050b2c7f2be is preserved on archive/nationwide-shopify-pilot-20261022-941324e7 and in a verified local Git bundle; its tree matches production main. The temporary operator remote and local branches and the preparation/release worktrees were removed. The objective lock is absent and no production PR is open. Evidence is retained separately; unrelated work was preserved. See release-cleanup.json and operator-release.log.

Physical cleanup qualification: Git unregistered both temporary source worktrees and removed their source files, but dependency residue remains in their node_modules directories. Automatic approval review rejected deletion with the stated reason blocked by policy. No alternative deletion was attempted. The clean evidence checkout is retained for review. This residue does not occupy the production release lane.
