# New Jersey and Michigan research handoff

Source implementation: `1667b5cb5eafa20f4e02be18e7fcad58b9f5707b`, isolated branch `codex/nj-mi-research-20261029`, based on production `6deae85a`. No main PR, production lifecycle activation, or customer delivery occurred.

Three fresh hosted source passes on that exact head independently observed the same **nine store-and-bottle matches at five premises**:

| State | Exact premise | Qualified expressions |
| --- | --- | --- |
| NJ | Gary's Madison,121 Main St | Elijah Craig Barrel Proof Rye; Heaven Hill Bottled-in-Bond7 Year |
| NJ | Gary's Bernardsville,100 Morristown Rd | Elijah Craig Barrel Proof Rye; Heaven Hill Bottled-in-Bond7 Year |
| NJ | Jersey City Super Buy Rite,575 Manila Ave | Elijah Craig Barrel Proof; Larceny Barrel Proof |
| NJ | Wayne Buy Rite,1308 NJ-23 | Elijah Craig Barrel Proof |
| MI | The Wine Garden Saint Clair Shores,22425 Harper | Elijah Craig Barrel Proof; Larceny Barrel Proof |

These are current first-party pickup offers with exact merchant, address, coordinates, product and option identity. `quantity=0` and `quantityIsExact=false` deliberately preserve unknown shelf counts. Three observations are not three additional stores. No whole-chain, whole-state, population-covered, or downloader-value claim is established.

`engine/data/source-evidence/nj-mi-research-20261029.json` contains immutable workflow/artifact IDs and digests, Git-blob implementation hashes, portable raw-body receipts, original source clocks, scope and remaining gates. The three observation runs are40896848483,40897382456,40897769504. An earlier discovery pass40895908381 additionally inspected one zero-qualifying query at Liquor Cave and the first Mega-Bev premise. Those hosts were atomically parked with their actual observation clocks; eight other Mega-Bev premises were not inspected. Zero results from one query do not establish that a retailer has no allocated stock.

The three repeated passes made only five HTTP requests each: four NJ premises and one MI premise. Their persistent journal skipped the two parked discovery hosts. No denied route was retried. The native Wine Palace Livonia Blanton variant fallback passed the existing captured product/pickup fixture, but was never requested in these hosted runs because Wine Garden qualified. Wine Palace is not counted as a fresh premise.

## Reproduce the read-only proof

Download the exact artifact named `nj-mi-research-<runId>` using `gh run download`, then run:

```powershell
node scripts/verify-nj-mi-research-captures.mjs --root=<download> --run=<runId> --commit=1667b5cb5eafa20f4e02be18e7fcad58b9f5707b
$env:NJ_MI_CAPTURE_ROOT='<download>'
node node_modules/tsx/dist/cli.mjs scripts/test-nj-mi-public-research.mts
Remove-Item Env:NJ_MI_CAPTURE_ROOT
```

The verifier checks portable path containment, raw SHA256/bytes, exact requested/final URLs, per-request clocks inside the report window, captured full Bible digest, GitHub run/head binding, and raw first-party reparse. Every observed row passes the closed five-premise predicate; identity, quantity, address and stale mutations fail. The actual artifacts also passed canonicalization→site export candidates→`normalizeDropForSite`→classification→public Feed/Coverage. Public current rows and stores correctly remain zero because production is inactive. This proves exclusion, not a positive customer preview.

## Required next gates

The source passes are saved research evidence, not a declaration that all promotion gates passed. The broader15-premise discovery configuration remains explicitly partial (`report.metadata.complete=false`). Its successful shadow-readiness metric concerns qualified observed rows, and must not be represented as an exhaustive state/store survey. Future promotion must use only the closed five-premise candidate scope and independently admit its fixtures and sealed shadow archives under the current promotion contract.

Two independent canaries **per state**, a positive isolated customer preview, workflow-issued promotion provenance and reviewed main activation are still pending. Shared collector/workflow changes during integration require fresh source observations under the established gate; this handoff grants no source-equivalence waiver. `isNjMiCanaryOnSiteSignal` is prepared as a pure closed-scope helper, with no production caller. Production confidence and lifecycle remain inactive. The next integration must supply a separately gated promoted runtime, confidence/export/public-path wiring, and source/lifecycle registration after accepted evidence.

The common shadow workflow changes overlap the WI/OK preparation branch: merge its portable receipt/provenance changes rather than overwriting them. Preserve NJ/MI incident restore after any broader research-cache restore, and always save the dedicated incident file on failure/cancellation. Default or alternate-order shadow selections must retain the same journal guarantees. The dedicated reusable workflow is invoked from the already registered `state-expansion-shadow.yml`, because GitHub cannot dispatch a new workflow absent from default branch.

Local checks:33 focused research/shadow/MS boundary tests passed, plus actual-artifact raw receipt verification and full inactive customer-path projections for all three exact-head runs. No Mississippi digest was repinned and no production access policy was weakened.
