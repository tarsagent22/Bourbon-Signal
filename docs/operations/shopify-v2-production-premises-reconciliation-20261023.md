# V2 premises reconciliation against production capture

Captured baseline: 2026-10-23T04:12:30.988Z, production commit `a86a0433c7b0b051761fdc5e3625128bbac42281`, [workflow run 39899012800](https://github.com/tarsagent22/Bourbon-Signal/actions/runs/39899012800). Root verified the GHA/ZIP binding; independent archive review was running in parallel. This local review verifies the supplied artifact bytes and reconciles its public premise fields without production or merchant requests.

All five V2 premises have **zero matching rows** in every overlap category below. This clears no-match within the captured inputs; it proves neither historical absence nor five new physical stores. No existing baseline row receives milestone credit. Net-new physical premises proven: **0**.

| V2 target | State | Prior current | Prior stale | Retained history | Directory | Ambiguous |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Remedy Liquor, Glendale | CA | 0 | 0 | 0 | 0 | 0 |
| Vino, 184 Lexington Ave | NY | 0 | 0 | 0 | 0 | 0 |
| Main Street Liquor, El Cajon | CA | 0 | 0 | 0 | 0 | 0 |
| Hot Spot, 411 Brazos St, Suite 100 | TX | 0 | 0 | 0 | 0 | 0 |
| Christie's, La Crescenta | CA | 0 | 0 | 0 | 0 | 0 |

Counts are matching captured records, not independent stores, bottles or collection attempts. Comparison used the actual V2 addresses/IDs, normalized street directions/types, state and ZIP, preserved units, and the explicit Remedy base-address-to-Suite-B review. Remedy's suite review is resolved; its collector address and V2 registry remain unchanged. [Approved alias review](remedy-glendale-premise-alias-review-20261023.json) SHA256: `6655129bd2e98be11124ca6e2587e1ad3bf915154ae0e55c6b762102cf0a652a`. This alias does not reconcile other missing units or explicit conflicting suites.

The input contains 66,571 broad rows plus 130 independent-source rows. Those are projections across current and retained snapshots, with duplicates expected. Independent current source heads are complete; independent premise identity is incomplete because `nc:board-shipments` has a `premise_identity_incomplete` gap. That shipment gap supplies no retail-stock or nationwide completeness claim. Five snapshot sets are complete (00:54:26, 01:36:50, 01:48:50, 03:24:37, 03:40:10 UTC on October 23); the requested `2026-10-23T00-45-53-498Z-13349db8859e34cc` snapshot is missing. The activation search covered only its bounded retained window. Older/pruned publications and verified-retailer premises are excluded. Registry provenance covers seven saved store-universe files (CA/FL/MS/NV/SC/TN/WV), not an exhaustive nationwide directory. A supplementary name/street-hint check within CA/NY/TX found only unrelated WB Liquors rows at Lee Trevino in El Paso, not a V2 target.

Next evidence for newness is specific: obtain a separately reviewed public-only physical-premise projection from the verified-retailer inventory lane, including retained/stale provenance and directory-vs-inventory classification; reconcile it to these exact five addresses and aliases. Recover the missing immutable snapshot only if it is still available under an authorized bounded read; otherwise record the gap. Check any available older activation/publication inventory ledger for the five identities and disclose its retention boundary. None of these steps requires customer payloads or merchant stock probes. Do not replace unavailable history with an all-time absence claim. If earlier publication cannot be reconstructed, distinguish first connection observed relative to this frozen baseline from an all-time-new premise; retain the unresolved limitation explicitly in the admission decision.

Before milestone credit, the lead must separately review novelty evidence and require scheduled positive pickup plus actual customer Feed/Coverage equality for each admitted premise. The current frozen fixtures, production baseline rows, source-directory entries and this reconciliation do not count as those new connections. No activation, collection, runtime/configuration edit, commit or production mutation occurred in this pass.

Inputs and replay:

- Supplied [baseline artifact](<C:/Users/chand/Documents/Bourbon Signal/shopify-shared-foundation-20261023-evidence/baseline/39899012800/coverage-premises-baseline.json>) SHA256: `dc10511a128a67eb4a1b9982235e6e5fc8f82e0e0060e6de1bfb0dc99d31e674`.
- V2 registry SHA256: `1f77e01ef3222ce547c01b208ab8c970c3cc89b1205aa0894e0510dd16a45731`; unchanged collector SHA256: `82ec1ede939d793f40d7a945430f49c0867fdfadf18d4004c5775c8878e39206`.
- Ignored reconciliation utility SHA256: `bd63a938b91cf10e87e262715f87e66ca43339873e4e325f1e2e9cf574b1d080`; explicit artifact, V2 registry and approved alias-review arguments used. Self-tests and actual review/capture hash verification passed before production-artifact replay.
- [Reconciliation ledger](shopify-v2-production-premises-reconciliation-20261023.json) SHA256: `69d53113b7812fb52a0381c634c90644c35bbf57e0f8c7ee526361ac91b5124c`; identical permanent copy: `C:/Users/chand/Documents/Bourbon Signal/shopify-shared-foundation-20261023-evidence/baseline/39899012800/shopify-v2-production-premises-reconciliation-20261023.json`.
- Active pointer SHA256: `8c271d3ed6c580aab38b1d36352705bb2921232ba353efdbdeaa43f8f91d8bc1`; independent statement: 04:12:21.955Z, heads SHA256: `189659c4ff895d471c3a6149f138df1d9ae16c4d9695cc45fd5663818615bcfe`.
