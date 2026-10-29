# Pennsylvania publication freshness admission

Prepared from release858 commit8be5a614 in an isolated worktree. No retailer HTTP,
browser launch, production dispatch, deployment or activation was performed.

Maintenance40909963708 reused valid cached FWGS chunks at16:36:11UTC with ages
6662/6109/6021seconds. The full artifact kept its original14:45:09.517Z clock.
PA collection finished16:36:15.821Z, but the expansion verifier checked at
16:45:52.988Z,43.471seconds after the original two-hour deadline. All six reviewed
SKUs were present:1353source rows,903public rows and383stores, above800/250floors.
The strict freshness guard correctly prevented publication.

No tracked inventory-only six-SKU refresh exists. The current browser collector
always discovers catalog products and locations before requesting store pickup
inventory. A six-SKU overlay would require separate observation/provenance
handling: updating the global clock would falsely renew untouched products.
This patch deliberately chooses the narrow cache-admission fix instead.

The original4f2 preparation reserved30minutes for collection/export/verification,
allowing90-minute reuse. That only protected one publication. This follow-up
reserves95minutes, allowing whole-artifact/controller reuse at most25minutes old.
Individual chunks have a separate5-minute ceiling, so an early reused chunk does
not consume the whole margin while the remaining chunks collect. Operators can
lower either limit; larger configured values cannot remove these ceilings.
Invalid configuration fails before child collection. Actual original source
clocks must exist, be in the past, and agree with the oldest child chunk.

The full wrapper applies admission to each reusable chunk and again to its merged
candidate before atomic replacement. It retains the oldest actual chunk clock;
missing clocks no longer receive a current-time substitute. An aged, future or
incoherent candidate leaves the previous full artifact untouched.

The browser refresh decision now checks the FWGS artifact's original clock,
independently of its administrative lastBrowserRefreshAt. A240-minute browser
timer cannot keep an expiring PA cache in use. An additional refresh caused only
by PA freshness selects FWGS only. Explicit PA targeting without OH also selects
FWGS only even if a CDP session already exists. Existing Ohio-only and ordinary
full-interval behavior, explicit browser skips, disabled intervals, and targeted
cohorts excluding browser states retain their existing boundaries.

After the browser stage, an explicitly targeted PA run must still have the
reserved headroom before it starts collection/export. This also protects resumed
runs and explicit browser-skip runs. A failed PA refresh cannot quietly feed an
expiring cache into a long targeted maintenance run. Scheduled fallback/state
isolation remains independent; the two-hour final publication guard remains the
authority and can still reject an unexpectedly long pipeline.

Capacity implications: whole-artifact reuse is shortened from90to25minutes and
chunk reuse from90to5minutes. Source freshness can override the old240-minute
browser timer. Under the model below each follow-up cycle collects FWGS cold;
this increases full refresh frequency and request cost. Product scope, store scope, concurrency,
retry count, worker capacity, and the existing30-minute FWGS browser deadline are
unchanged. The120-minute publication ceiling and all store/row floors remain
unchanged. This does not implement a cheaper six-SKU adapter or claim deployed
continuity. The relay is separately prepared/default-off; no provider settings,
retailer HTTP, or workflow dispatch occurs in this preparation.

## Offline timing envelope, not a cadence guarantee

`continuity-model.json` labels every derived clock as a hypothetical timing
calculation. The measured approximately18-minute FWGS collection is used as a
planning input;30minutes after the browser reserves25minutes for state collection
plus5minutes for export/verification, and15minutes is the proposed relay wait.
These are not proven upper bounds for end-to-end production execution.

With the old90-minute allowance, first publication can reach source age120minutes,
the next controller reaches135minutes, and replacement reaches183minutes. Thus
publication admission alone leaves a63-minute gap in this envelope. The documented
historical failure and original90-minute policy fields in `failure-replay.json`
are retained unchanged; that witness did not run the new policy.

With25-minute initial reuse, replacement reaches25+30+15+18+30=118minutes, leaving
only2minutes before the unchanged120-minute deadline. Subsequent cold cycles
reach18+30+15+18+30=111minutes at replacement, leaving9minutes. The controller
requires cold FWGS collection each next cycle because the previous original
observation is already older than25minutes. No administrative clock renews it.
Five-minute chunk reuse plus18minutes remaining collection produces a23-minute
merged source age; slower collection that exceeds25minutes is rejected and the
previous complete artifact remains untouched. Even fresh all-cold collection
can fail admission if its oldest observation exceeds25minutes at completion.

This margin is thin:3minutes of extra queue/export/verification delay defeats the
worst initial case. GitHub queueing, browser/provider latency, other fleet work,
retries, actual relay availability, and publication lag remain outside this
offline proof. Actual consecutive unattended source/public acceptance is still
required before claiming continuity. Default state/browser hard timeouts remain
unchanged, and this model does not assert that their sum fits the envelope.

Validation uses pure clock tests and the real full-wrapper/refresh CLI with
filesystem-only synthetic child collectors, never retailer or browser traffic.
Tests verify the failed111-minute case, original-clock reuse, refusal to replace
previous output with aged/future candidates, invalid configuration before child
work, explicit PA-only Ohio isolation and targeted fail-fast admission. The real
wrapper additionally runs with a test-only virtual clock and filesystem-only
child:5-minute reused chunk plus18-minute cold work passes with its original
23-minute source clock;21-minute cold work fails at26minutes and preserves prior
output. No source observations or production clocks are manufactured. Existing
PA matching, quantity, premises, fallback, retired-denial, alert-pipeline and
refresh-control-plane tests also pass. No existing verifier or floor was lowered.

`nine-state-noninterference.json` records an offline comparison against frozen
source headb2f310a9. Fresh-process imports of all9actual runtime metadata, cohort
hashes and semantic config hashes remain identical with the complete4f2 policy,
browser wrapper and refresh controller overlaid. The175-file checked-in issuer
union is byte-identical and excludes all3PA files. Global fetch is disabled in
the audit. No generated evidence, provenance, clocks or frozen checkout was
modified; the separate audit checkout was restored clean. This is a static and
semantic noninterference check, not newly issued source qualification.
