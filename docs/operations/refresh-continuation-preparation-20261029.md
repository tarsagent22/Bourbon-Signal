# Default-off production refresh continuation

Prepared from main `9a6e0ec0`. No environment, variable, workflow dispatch,
retailer HTTP, production publication or paused job was changed during preparation.
`refresh-feed.yml`, root package and all nine-state source/provenance files remain
unchanged. This relay only requests the existing guarded adaptive refresh.

## Controls and precise guarantees

Production requires both repository variables:

- `BOURBON_SIGNAL_REFRESH_CONTINUATION_ENABLED=1` (missing means off).
- `BOURBON_SIGNAL_CONTINUATION_MAINTENANCE=0` (missing means maintenance).

Smoke instead requires `BOURBON_SIGNAL_CONTINUATION_SMOKE_ENABLED=1`, also off by
default, and the same explicit maintenance value. Registry `active:true` means a
classified workflow file exists; it does not enable these feature gates.

Only exact repository/main, workflow ID `311991230` and path, current main SHA,
first attempts, successful schedule or verified own receipt lineage qualify.
Any failure/cancellation/timeout stops. Unknown dispatch scope and targeted
recovery runs cannot seed another request. No failure fingerprint or retry is
invented. A manual bootstrap is an owner attestation that a successful current-main
full-fleet snapshot passed actual public acceptance with all currently admitted customer-active states
accounted for. It does **not** assert positive inventory in every admitted state:
legitimate zero, degraded, quarantined and disabled states add no current-store claims.

Every dispatch has exactly empty `states`, `sources`, Virginia store IDs,
`force_all_states=false`, `recovery_attempt=0`, and an own-lineage incident key.
No target inputs are copied. Existing source holds, publication guards and
adaptive scheduling remain authoritative. There are no collector credentials,
engine imports, source HTTP or snapshot activation in these new workflows.

The helper verifies workflow active states and current main before and after
the wait; it checks all active/queued/waiting statuses and newer refreshes.
Relay concurrency and those API checks are **best-effort deduplication**, not
an atomic transaction with cron, watchdog or human dispatch. Existing production
concurrency serializes collection; it can still queue a request created in the
check/POST race. No simultaneous-collection or duplicate-free cadence claim is
made by this relay. A newer targeted run can conservatively stop the chain.

One POST follows a local intent file. The intent/receipt is uploaded afterward
using `always()` and explicit hidden-file inclusion. It is **not** remotely
committed before dispatch. Attempt-one guards reject reruns; unknown outcomes
never resend. A hard runner kill before upload can lose that local evidence;
the resulting missing/unverified lineage halts continuation. Inspect provider
runs and resume explicitly rather than replaying a failed request.

Repository variables are workflow-context snapshots. For an immediate stop of
an already-waiting run, disable the relay workflow (and target refresh if needed),
which is rechecked live after the wait. Do not assume changing a variable alone
instantly cancels a waiting run. No command automatically enables disabled jobs.

## Future owner setup, only after guarded merge

Keep production feature off while configuring/testing. Use the existing owner
GitHub connection; no PAT, purchase or new automation is needed. Create these
dedicated environments, restricted to main, without changing Production/Preview:

| Exact environment | Wait timer |
| --- | ---: |
| `inventory-refresh-continuation-smoke-zero` | 0 / no wait rule |
| `inventory-refresh-continuation-smoke-paced` | 15 minutes |
| `inventory-refresh-continuation-paced` | 15 minutes |

Verify each environment with `gh api repos/tarsagent22/Bourbon-Signal/environments/NAME`.
Missing environments or wrong timers fail before an environment job is entered.
No auto-created unprotected environment is accepted. Environment wait time is
[nonbillable](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments#wait-timer).
`deployment:false` avoids deployment-history noise while preserving the timer.

With only smoke enabled and maintenance explicitly zero, generate a fresh
32-character lowercase hex identifier, then run the following **harmless** seed:

```text
gh workflow run refresh-continuation-smoke.yml --ref main -f chain_id=HEX32 -f cycle=1 -f pacing=immediate -f confirm_smoke_only=true
```

Require five actual successful producer runs linked by four successful
`workflow_run` relays and `workflow_dispatch` receipts, then a terminal relay
plan with `reason=bounded_smoke_completed`, `completedCycles=5` and no sixth
dispatch. Each subsequent producer validates its actual issuer's immutable
artifact ZIP digest, current source SHA, chain/cycle and exact dispatch receipt.
Offline modeled cycles are not this provider proof. GitHub documents a
[three-level limit](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_run)
for pure `workflow_run` chaining; the mixed-loop behavior is unproven until this
actual smoke succeeds. Stop and preserve evidence if it does not.

Run a second fresh chain with `pacing=paced`. It ends after two producers and
one 15-minute hop. Inspect `refresh-continuation-plan-RUNID` and
`refresh-continuation-receipt-RUNID`: original plannedAt, elapsedWaitMs at least
900000, exact paced environment/timer, current main, source/target run IDs and
GitHub-created timestamps must agree. Its terminal plan reports two completed
cycles; no third dispatch. Neither smoke path can dispatch production ID311991230.

Artifacts can be read with `gh run download RUNID --name ARTIFACT_NAME --dir NEWDIR`;
bind them to the API artifact digest and issuer/run/head metadata before counting.
Preserve both chains and their final terminal plans for review. No real smoke
has been dispatched or claimed in this preparation.

Only after both actual smokes and real full-fleet/public acceptance, enable the
production flag and explicitly bootstrap:

```text
gh workflow run refresh-continuation.yml --ref main -f accepted_run_id=ACCEPTED_FULL_FLEET_RUN -f accepted_full_fleet_snapshot=true
```

Inspect the first real continuation/publication and source holds before calling
it unattended progress. Retain cron as fallback. Disable smoke afterward; keep
its evidence. Disabling continuation preserves the existing collectors and jobs.

## Cost, checks and limitations

The helper permits at most 60 GitHub HTTP calls per invocation, one POST, no
automatic HTTP retry, 15-second request timeouts and a three-minute job limit.
Each relay uses two small runner jobs (at most 120 helper calls), with a server
environment wait between them; checkout/artifact action overhead is additional.
It does not install dependencies or run a collector. A healthy cycle is prior
refresh duration + 15 minutes + provider queue/relay overhead, not a fixed
30-minute delivery guarantee. It does not repair source TTL or collector capacity.

`node --test scripts/test-refresh-continuation.mjs`, automation registry and Ops
checks cover default-off behavior, unknown/fork/ref/workflow/clock, failure,
scope, current-main, timer and duplicate negatives; single-POST unknown outcomes;
hash-bound ZIP lineage; and bounded no-production smoke. CI invokes these tests
explicitly without modifying the root package command. The new workflow/helper
and CI/Ops classification changes are outside the current fixed source-proof
file list; no proof-equality waiver is introduced.
