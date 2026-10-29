# Measured refresh capacity audit, October 29

The four-state addition is **not ready for capacity admission under an honest conservative forecast**. The current configured model omits substantial Arizona and Florida runtime and excludes the browser, exports, fallback exports, and workflow overhead. No runtime metadata, hard timeout, lifecycle, promotion manifest, or historical Mississippi digest was changed by this audit.

The machine-readable [observations and model outputs](../../engine/data/source-evidence/refresh-capacity-20261029/observed-capacity.json) bind the extracted source files by SHA-256 and identify their GitHub run/artifact metadata. GitHub-reported ZIP digests are recorded separately; these ZIP bytes were not independently rehashed for this timing audit.

## Parallel collection forecast

All calculations use the existing four workers, 30-minute interval, and five-minute reserve. They retain the reviewed four-state expected values: WA 720 seconds, NM 300, WI 150, and OK 240. These forecast values are not additional retailer requests and do not change source or parent timeouts.

| Scenario | Projected collection | Available collection | Result |
| --- | ---: | ---: | --- |
| Configured 24 active states | 13 min | 25 min | Passes the existing model |
| Configured 24 plus WA/NM/WI/OK | 19 min 30 sec | 25 min | Underestimates the existing fleet |
| Five proposed corrections below, plus four states | 23 min 30 sec | 25 min | Still omits AZ/FL measurements |
| Five corrections plus only observed AZ/FL floors | 26 min | 25 min | Fails |
| Five corrections plus conservative AZ/FL estimates | 27 min | 25 min | Fails, 108% utilization |

The following are **recommendations not applied**, because applying just the first five would produce a misleading green expansion check:

| State | Current forecast | Accepted run 40907316461 | Proposed forecast |
| --- | ---: | ---: | ---: |
| VA | 240 sec | 777.152 sec | 1,140 sec |
| CA | 90 sec default | 219.181 sec | 300 sec |
| NV | 90 sec default | 176.190 sec | 240 sec |
| ID | 90 sec default | 112.511 sec | 180 sec |
| TX | 420 sec | 1.365 sec, with legacy leaf parked | 90 sec |
| AZ | 90 sec default | 733.370 sec | 900 sec |
| FL | 90 sec default | 121.699 sec | 180 sec |

The full JSON also records all 24 state observations. A successful workflow is not proof that every source was current: OH retained stale browser evidence; NC and NY reported partial fallback. TX's fast observation depends on the explicit legacy-source suspension and does not justify retrying denied hosts.

## Actual end-to-end warm run

[Accepted automatic run 40907316461](https://github.com/tarsagent22/Bourbon-Signal/actions/runs/40907316461), source commit `6deae85aaa1b78900cb5eafab03570613c95a8d7`, took **32 min 10 sec from job start to completion**:

- `site-refresh-status.json` refresh stage: 20 min 22.088 sec.
- Inside that stage, parallel source group: 14 min 58.283 sec; site export: 4 min 59.812 sec; remaining work: 23.993 sec.
- A later scheduled-state fallback step rebuilt the export for another 4 min 56 sec.
- The remaining job time includes checkout, cache restore/save, source/contract audits, activation, and production verification. Production verification alone took 2 min 3 sec.

Browser collection was not due. The status reports a 240-minute browser refresh interval and last successful browser refresh at `2026-10-29T14:55:51.257Z`. The source group estimate therefore does not cover a cold browser cycle.

These measurements precede the pending fleet selection/dedup repair. Its potential export improvement is unmeasured and cannot be subtracted from this audit.

## Pennsylvania browser peak and conditional amortization

[Manual IL/ID/PA run 40891992716](https://github.com/tarsagent22/Bourbon-Signal/actions/runs/40891992716) took 26 min 10.005 sec in its refresh stage. This whole duration must not be called Pennsylvania collection time. Its exact `site-refresh-status.json` steps show:

- `src/fwgs-browser-full.mjs`: **19 min 35.096 sec**, from `14:36:16.161Z` to `14:55:51.257Z`.
- Parallel state collection after browser bootstrap: 1 min 54.308 sec. PA's own cached-artifact state body was 1.592 sec in the earlier timing audit.
- Export: 4 min 19.325 sec; remaining work: 21.276 sec.

This manual run forced browser collection with `browserRefreshMinutes: 0`. Under the current scheduled 240-minute interval, allocating one identical successful 1,175.096-second bootstrap across eight 30-minute cycles gives **146.887 seconds per cycle**. This is conditional arithmetic, not an observed average, guaranteed cadence, or a reduced cold-cycle peak. Failure, retry, queue, and cache behavior can change it.

## Admission consequence

Keep the four states inactive. Re-measure an accepted full-fleet warm cycle and a browser-due cycle after the export repair. Account for collection, export/fallback rebuilding, verification/publication, cache/setup, and browser peak separately. Then choose a reviewed scheduling/capacity change or supported footprint that actually satisfies the existing guards. Do not lower the reserve, extend inventory freshness, weaken evidence, or retain the five-field-only forecast to obtain a green admission result.
