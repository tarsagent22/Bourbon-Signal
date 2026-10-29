# Reviewed four-state on-site admission

This commit prepares WA, NM, WI and OK for customer on-site inventory, using the actual source, canary, issuer and owned-preview evidence below. It does not deploy, merge, publish a snapshot or verify production delivery. Inventory/watch alerts and every outbound delivery channel remain disabled for these cohorts. NJ/MI remain inactive; their denied hosts remain held.

The source/production collectors and their hard timeouts are unchanged from frozen source commit `3f975f896bd7c5c7f887570335c48e89cd158569`. Only reviewed lifecycle/evidence metadata, exact historical verification allowances, audit documentation and test setup change.

| State | Reviewed premises | Positive premises in latest proof | Conservative hunting premises | Latest public rows | Issuer run |
| --- | ---: | ---: | ---: | ---: | --- |
| WA | 58 | 56 | 30 | 177 | 40925309053 |
| NM | 16 | 16 | 2 | 35 | 40925312923 |
| WI | 1 | 1 | 1 | 1 | 40925317245 |
| OK | 2 | 2 | 2 | 7 | 40925321358 |
| Total | 77 | 75 | 35 | 220 | |

The conservative subset contains 67 distinct store/expression offers. Ordinary or ambiguous scarcity listings, including Crown Royal Chocolate and unspecified Parker's editions, do not inflate that headline. These are pre-release proof observations, not newly delivered production coverage or a stock hold. Earlier Oklahoma Blanton's observations were not carried into the latest snapshot after they disappeared.

## Actual evidence

Three qualifying source observations, all on frozen `3f975f89`:

- [40922494321](https://github.com/tarsagent22/Bourbon-Signal/actions/runs/40922494321), ZIP SHA-256 `7316d55213caf6eb19ce106b5d50f881323631ccac748b13d0d03aece0dd589c`.
- [40923481819](https://github.com/tarsagent22/Bourbon-Signal/actions/runs/40923481819), ZIP SHA-256 `aa5daac315dac0efd6247e95a80cd435c000beee1f63aa605351099ca48050c8`.
- [40924211193](https://github.com/tarsagent22/Bourbon-Signal/actions/runs/40924211193), ZIP SHA-256 `18372633aca1df1fc9a87e32562e418c191c704c04dc53fa10e38d24d4b81e14`.

Together they contain 555 permitted source responses, no denials, and no accepted generic Wild Turkey/Master identity pair. Reports were not trusted as stock lists: raw captures, exact premises, product/channel bindings, current full library and original clocks were reparsed. The final observation's oldest source clock is `2026-10-29T17:45:12.413Z`; replay, packaging, admission and publication do not reset it.

| State | Actual canary 1 | Actual canary 2 | Original issuer ZIP SHA-256 |
| --- | --- | --- | --- |
| WA | 40925045213 | 40925194979 | `2d4f9d27e58f6e8c7c26938e32d55074b65719cfedda228e26d4dd1741061158` |
| NM | 40925049456 | 40925202262 | `675357ee920b2b8bf293a161802af29f9fb08d9af6643fa04c4bf741ffd6cbb3` |
| WI | 40925053511 | 40925207727 | `3194afb7592efeb816f391fb07b821bb9c3afea584759ef09ec6ef67b515f77b` |
| OK | 40925057412 | 40925213213 | `105dadd393d38a4520e76547a9399fd2bb97590c1da0b3f7cbf6bf9473be6b1e` |

All eight canaries and four issuer workflows succeeded. Their ZIP digests, source Git blobs and exact issued replay bytes were checked. WA/NM issuers bind 89 files each; WI/OK bind 93. All include the new fleet row-budget/merge closure. The original issuer ZIPs are archived under `engine/data/promotion-provenance/STATE.zip`, so a later remote artifact expiry does not discard the original digest-pinned proof. Adjacent JSON receipts retain the issuer payload and archive metadata.

The owned [isolated preview](https://bourbonsignal-dk3wtqhrh-tarsagent22s-projects.vercel.app), deployment `dpl_AQyx7odW9hjNvEQEwh2BXR9AKNU8`, reached READY after its actual Next build. It is a derived coherent union of four exact canary partitions, not a claim that its complete site equals any one archive. The exact staged lifecycle was typechecked. All delivery channels were disabled, snapshot read mode was off, and no production deployment was requested.

Actual HTTPS Coverage/Stats returned 200 and the existing signed state/limit-one Feed verification returned exact counts 177/35/1/7 and stores 56/16/1/2. Finder retained its normal401 authentication guard; normal unpaid state filters returned403. Authenticated paid dashboard, saved-preference and Finder data sessions and physical devices remain unexercised. The nonpreview pipeline regressions use the committed real admission authority with explicitly mocked stock transport; they establish implementation behavior, not additional live observations.

## Staged admission and guard preservation

The existing `prepareStatePromotion` and `applyStatePromotion` transactions prepared each state separately in this isolated worktree. Each fixture and actual staged canary integration check passed. The candidate registry follows the reviewed active lifecycle instead of leaving NM/OK mislabeled discovery.

`engine/data/canary-site/four-state-20261029` is a four-state-only CI integration projection of the verified owned canary snapshot. Each state partition is byte-identical to its issued canary partition; global rows/index, reviewed locations and monitoring entries are derived from those exact inputs. It is not a runtime inventory source or production fallback. These four manifests use `awaiting_first_publication`, so the unchanged production CLI must inspect actual `out/site` data and cannot select the canary. Only `scripts/verify-active-state-integration-ci.mjs`, explicitly called by required CI, selects this reviewed CI artifact and invokes the same exported validator with the original manifests and immutable-evidence requirement. All other states retain their normal artifact/grandfathering contract. Missing/corrupt real production output fails even while the checked-in canary is valid; corrupt CI data also fails. Source clocks and preview flags remain unchanged.

The exact 28-state active array and each complete WA/NM/WI/OK entry, including actual immutable evidence, have literal historical reversals before the older reviewed reversals. Original Mississippi full-file hashes remain pinned. Missing/duplicate/altered active blocks, notification flags, proof counters/digests and changes outside these blocks remain detectable. No wildcard or new original hash was introduced.

Preparation-only zero-HTTP tests now clone an explicitly inactive lifecycle. Active-regression paths use the real committed metadata with fixture HTTP responses. Tests were run behind an operator-only remote-fetch tripwire so changed defaults could not contact retailers. The forecast check deduplicates states already active; its sample formula and every source/parent hard limit remain unchanged.

## Capacity and release limits

The 28-state parallel collection forecast remains 1,410/1,500 seconds. This is planning from three observations, not p95 or guaranteed full-job cadence. The prior accepted warm job took 32 min 10 sec end to end; measured Pennsylvania browser bootstrap had a 19 min 35.096 sec cold peak. Conditional four-hour amortization does not remove that peak. Export/fallback, verification/publication, cache/setup and queue overhead remain separate.

The fleet fix preserves admitted current rows and protected fallback partitions under its byte budget, with the >10,000-row customer regression passing. The exact original historical cause is not established: stats' `historicalSignalCount: 1045896` is a high-water measure, while the restored diagnostic pool contained 457,870 candidates. No completed comparable benchmark establishes an export speedup. The measured compact 48.8 MB payload leaves about 14.1 MB below 60 MiB; future mandatory evidence can still exceed that budget and must fail explicitly rather than silently clip premises.

The parent owns the production PR, final integrated checks, guarded merge, fresh production collection/publication and canonical exact-premise verification. Count only stores surviving those production checks as delivered expansion.
