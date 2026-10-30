# Production source parent budget alignment

The production workflow's source-group parent was22minutes (`1320000ms`),
shorter than the existing actual-registry FIFO planning forecast for the proposed
33-state fleet. It is now30minutes (`1800000ms`):25minutes of modeled collection
plus5minutes of parent headroom. This changes no collector, query, source retry,
source timeout, state registration or four-worker concurrency.

The [bound offline comparison](../../engine/data/source-evidence/refresh-capacity-20261029/source-parent-alignment.json)
uses the actual `ALL_STATE_SOURCES` order from prior33-state admission rehearsal
`eff3f68fdfec87f494c411ccb88f761243a9352b` and its unchanged expected-runtime map.
It is FIFO, matching the source runner; the reliability check's sorted LPT order
is a different model. All33 produce worker loads1470/1500/1440/1440seconds, peak
25minutes. With the actual SC/GA disabled transport controls retained, the31
collectable states produce1350/1380/1440/1410seconds, peak24minutes. Both exceed
the previous22-minute parent. These are planning estimates, not p95 measurements
or evidence that all33 sources have collected successfully in production.

Saved actual M run40961437551 measured source collection910.757seconds, from
`2026-10-29T21:55:32.018Z` to `22:10:42.775Z`. Operational work was12.412seconds
and export147.077seconds separately. That was the28-state fleet with incomplete
WA/NM collection; it does not prove the proposed33-state fleet fits22minutes.
Its successful publication also did not establish the four-state customer repeat.

The reviewed nine-state planning values remain WA360, NM120, WI30, OK30, LA120,
AK120, MA30, CT30 and RI30seconds. Existing forecast metadata, source/merchant
caps and permissions are unchanged. The child state watchdogs still apply.

FWGS cold browser collection is a separate30-minute stage. Export/other refresh
steps retain25minutes. The entire GitHub job still has an80-minute ceiling, which
can stop a slow combined browser/source/export/setup/verification cycle; the
stage maxima are not additive guaranteed capacity or a cadence promise. PA's
25-minute whole-artifact/five-minute chunk admission and unchanged120-minute
publication ceiling still fail closed. Provider queue and relay overhead remain
outside these source-pool estimates. Actual consecutive complete source and
public customer acceptance is required before claiming unattended continuity.

The production workflow is part of immutable source provenance. This deliberate
budget change belongs in the next frozen source head before genuine v4 source
observations; no old proof equality waiver or retailer request is introduced.
The earlier source heads and their original budget/proofs remain unchanged.
