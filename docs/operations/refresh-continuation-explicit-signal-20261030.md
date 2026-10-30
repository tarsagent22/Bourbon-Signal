# Explicit completion signals: prepared, not live qualified

The first live harmless smoke delivered one owner seed, one relay and one
bot-dispatched child. The child succeeded, but another `workflow_run` relay had
not appeared during the observation window. This is consistent with GitHub's
restrictions on recursive events; it does not establish that suppression was the
exclusive cause. Explicit `workflow_dispatch` with the existing `GITHUB_TOKEN`
is the documented supported path. No PAT, new credential or external scheduler
is introduced. This change remains default-off and requires a new real smoke.

## Authority and timing

A final producer step runs only after earlier verification/artifact work succeeds.
It dispatches its corresponding relay once and stores the returned **actual relay
run ID** in a small producer signal artifact. The producer is still running at
that point. Its receipt explicitly says that completion is not yet known.

An explicitly dispatched relay accepts only a bot signal and the exact trusted
main workflow/source SHA/first attempt. It waits at most 120 seconds for the
producer's actual final successful conclusion, then verifies the source artifact's
origin and ZIP digest and requires its own exact run ID in that receipt. A
successful individual step, raw bot-supplied run ID, arbitrary workflow, fork,
rerun, failed/cancelled producer, wrong receiver or unknown POST cannot authorize
continuation. Artifact absence/corruption fails closed. Evaluation uses the clock
after the wait; original source clocks are never rewritten.

Production autosignals require either a trusted scheduled producer or the existing
independently verified own relay receipt whose target is this producer and whose
inputs are exactly empty states/sources/VA, force false and recovery zero. A normal
manual full-fleet run cannot attest to its own acceptance. The existing separate
owner bootstrap still requires its successful accepted run and explicit public
full-fleet attestation. Targeted scopes cannot seed continuation.

Smoke autosignals recheck the existing owner seed or exact hash-bound prior relay
receipt, marker, chain and cycle. The bounds remain five immediate producers/four
dispatching relays plus a terminal stop, and two paced producers/one dispatching
relay plus a terminal stop. The environment wait remains 15 minutes for production
and paced smoke. A fresh live chain is required; local models do not prove it.

## Duplicate and failure behavior

`workflow_run` remains a fallback for legacy successful producers without a signal.
A valid immutable signal reserves the exact explicitly dispatched receiver. Any
corresponding fallback emits `explicit_signal_receiver_reserved` and skips POST.
An intended/unknown signal outcome cannot be reinterpreted as fallback permission.
The existing current-main, active/queued/newer-run checks and refresh concurrency
remain in place. There is still no atomic GitHub check/dispatch transaction.

Signal POST occurs once, after local intent. The artifact is uploaded afterward;
it is not a remote transaction committed before POST. An unknown result halts
without resend, and reruns fail the first-attempt guard. A hard kill without a
usable receiver-bound artifact grants no explicit continuation authority.

Only the optional signal step has `continue-on-error`, so a signal transport failure
does not turn an already accepted publication into a failed publication. An unknown
receipt still cannot authorize a relay. Other verification/collection/artifact
failures retain their existing behavior; the relay requires final workflow success.

The GitHub client's 60-call per-process bound, three-minute relay jobs, existing
collector budgets, lease/TTL/denial policies and source permissions are unchanged.
The producer signal adds no retailer request. The production refresh YAML and six
relay/helper/test dependencies are explicitly included in future nine-state source
provenance. Integration therefore needs fresh source qualification; existing
accepted evidence is not relabeled or waived.

## Verification and next operator step

Offline tests cover the actual signal handler, exact own lineage and scope,
source completion wait, receiver-bound ZIP, failed/unknown/mismatched cases,
manual bootstrap separation and bounded smoke decisions. The ignored updated QA
runner binds `signal.targetRelayRunId`, verifies four/one dispatched receivers and
terminal stop, and permits only separately verified non-posting fallback relays.
Its injected graph includes such fallback NOOPs. It makes no live-provider claim.

After guarded merge, keep production continuation off. Run new immediate and paced
harmless smokes on exact merged main using a new chain and evidence directory.
Preserve failed/unknown outcomes; never blindly retry. Enable production only
after actual smokes and the accepted public full-fleet bootstrap are verified by
the operator. Existing source holds and maintenance controls remain authoritative.

Primary reference: [GitHub workflow triggers and recursive-event restrictions](https://docs.github.com/en/actions/how-tos/writing-workflows/choosing-when-your-workflow-runs/triggering-a-workflow).
