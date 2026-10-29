# Washington and New Mexico promotion preparation

This path remains isolated research. It does not activate collection, publish a
production snapshot, send alerts, or establish customer coverage. Local fixture
and replay passes do not count as workflow shadow or canary runs.

The closed registry contains 58 Washington and 16 New Mexico premises. The
authoritative production lifecycle remains unchanged. The research overlay is
used only by the shadow collector and isolated preview builder.

## Workflow-issued shadow evidence

Run the existing shadow workflow on the reviewed research ref, sequentially so
the shared concurrency group cannot replace a pending run:

```sh
gh workflow run state-expansion-shadow.yml --ref codex/nationwide-grocery-proof-20261029 -f states=WA,NM -f limit=2
```

Require three actual qualifying successful runs per state. Inspect their report
and evidence artifacts; a successful job with partial collection or zero usable
rows does not qualify. Preserve denial journals and stop unchanged denied routes.

The first issued run, 40879665665 at source commit 30185332, produced WA 180 rows
and NM 36 rows. Artifact 12900246068 has ZIP SHA256
`6a81c7215ae9f02c96ca6fdc0b7479e623c5df18f25303bdd59ad3b00d357e6d`.
These are historical observations, not an assertion of current shelf stock or
current production delivery. Never reuse them beyond their original source age.

## Actual canary workflow

After reviewing and pushing the bridge code to the same research ref, dispatch
two actual successful canaries per state, each against an available successful
shadow run whose observations remain less than two hours old:

```sh
gh workflow run state-expansion-canary.yml --ref codex/nationwide-grocery-proof-20261029 -f state=WA -f candidate_drops=data/canary-inputs/WA.json -f shadow_run_id=ACTUAL_FRESH_SHADOW_RUN_ID -f deploy_preview=false
gh workflow run state-expansion-canary.yml --ref codex/nationwide-grocery-proof-20261029 -f state=NM -f candidate_drops=data/canary-inputs/NM.json -f shadow_run_id=ACTUAL_FRESH_SHADOW_RUN_ID -f deploy_preview=false
```

The workflow verifies the successful workflow path/repository, exact artifact
name, unexpired GitHub artifact digest and source-equivalent commit ancestry.
It reparses all original HTTP bodies against the current strict source policy
and current full app library. Each premise must have current exact resolver
identity and both broad inventory captures. Report row lists are not trusted.
Source clocks are never replaced with replay/publication time. Stale or changed
source code requires fresh collection. Only narrow canary/fixture/manifest
preparation changes may reuse a prior source commit.

The baseline comes read-only from the cache saved after a successful production
publication. Missing baseline files fail the job. The generated canary input and
research lifecycle override are artifacts; neither is committed as fresh data.

The deployment option creates an isolated preview with all delivery channels
disabled and `ENGINE_SNAPSHOT_READ_MODE=off`, so the preview reads its bundled
candidate snapshot rather than a project's production snapshot configuration.
`BOURBON_SIGNAL_CANARY_PREVIEW=1` selects a visible `canary-site-export/`
staging directory and a narrow per-route tracing closure. Generated engine output
is ignored by the uploader and must not be assumed present in a serverless
function. The staged files must match the actual canary artifact digests.
The app projection check requires real current public output, exact source-proof
mutation rejection and separate zero-quantity binary semantics with every alert
and delivery flag disabled. Preview Finder locations come only from exact current
resolver-verified premises; store breadth and current bottle availability remain
separate counts.
Preview deployment remains an explicit operator dispatch. Do not apply promotion
based on an undeployed canary alone. Exercise Coverage, the authenticated state
Feed and Finder, preferences and dashboard using the real preview URL. Preserve
any authentication gates; an unauthenticated401/402 is not a successful paid Feed
test. Exact quantity and binary availability remain distinct; neither fixture nor
preview flags create delivery authority.

## Workflow-issued immutable provenance

```sh
gh workflow run state-promotion-provenance.yml --ref codex/nationwide-grocery-proof-20261029 -f state=WA -f candidate_drops=data/canary-inputs/WA.json -f shadow_run_id=ACTUAL_FRESH_SHADOW_RUN_ID
```

Repeat for NM. This workflow repeats verified source replay and canary checks,
then binds candidate input, strict parser/policy, registry, fixture execution,
canary code, actual source artifact provenance and generated preview partition.
Preserve the actual issued bundle and GitHub artifact digest. Only after three
qualifying shadows, two actual canaries, verified live isolated customer paths
and immutable provenance should the parent prepare a separate guarded promotion.
Activation and current customer API acceptance remain separate outstanding work.
