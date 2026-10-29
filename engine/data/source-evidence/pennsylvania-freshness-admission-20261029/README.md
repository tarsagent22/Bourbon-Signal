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

The new pure policy reserves30minutes for collection/export/verification, so
reusable FWGS source evidence is at most90minutes old. Operators can lower that
limit; a configured two-hour or larger reuse limit cannot remove the reserve.
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

Capacity implications: cache reuse is shortened from120to90minutes, and source
freshness can override the old240-minute browser timer. This can increase full
FWGS refresh frequency and request cost. Product scope, store scope, concurrency,
retry count, worker capacity, and the existing30-minute FWGS browser deadline are
unchanged. The patch does not implement a cheaper six-SKU adapter or claim that
all future pipelines will finish within the reserve. PA may remain excluded from
other maintenance cohorts until the owner performs a fresh, guarded PA recovery.

Validation uses pure clock tests and the real full-wrapper/refresh CLI with
filesystem-only synthetic child collectors, never retailer or browser traffic.
Tests verify the failed111-minute case, original-clock reuse, refusal to replace
previous output with aged/future candidates, invalid configuration before child
work, explicit PA-only Ohio isolation and targeted fail-fast admission. Existing
PA matching, quantity, premises, fallback, retired-denial, alert-pipeline and
refresh-control-plane tests also pass. No existing verifier or floor was lowered.
