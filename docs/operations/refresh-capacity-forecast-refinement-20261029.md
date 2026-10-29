# Collection forecast refinement from three observations

This supplements the [measured fleet audit](refresh-capacity-audit-20261029.md). The earlier conservative forecast used maximum timeout values as the four new states' expected durations. Those hard source and parent limits remain unchanged. Planning estimates now use one rule across all four states:

`forecast milliseconds = ceil(2 × max(three actual collector elapsed times) / 30,000) × 30,000`

| State | Run 40909152248 | Run 40910295232 | Run 40911087234 | Twice maximum | Forecast rounded up to 30 seconds |
| --- | ---: | ---: | ---: | ---: | ---: |
| WA | 166.026 sec | 155.657 sec | 167.607 sec | 335.214 sec | 360 sec |
| NM | 53.426 sec | 53.139 sec | 56.119 sec | 112.238 sec | 120 sec |
| WI | 7.780 sec | 7.624 sec | 7.284 sec | 15.560 sec | 30 sec |
| OK | 14.918 sec | 14.824 sec | 14.971 sec | 29.942 sec | 30 sec |

All three observations qualified, used source commit `e08c698e44c710297c9c9c84987200a4148485e8`, and retained their original collector timestamps. The [refinement evidence](../../engine/data/source-evidence/refresh-capacity-20261029/forecast-refinement.json) records every report hash, archive digest, original timing, and request count. No new retailer requests or rewritten source clocks were used to derive these estimates.

The seven existing-state revisions also remain conservative against the latest accepted full-fleet observations: VA 1,140 seconds, CA 300, NV 240, ID 180, TX 90, AZ 900, and FL 180. TX's estimate assumes the reviewed legacy-source suspension remains in effect.

With all seven existing-state revisions and the four measured estimates, the existing four-worker collection model projects **23 min 30 sec against 25 available collection minutes**, 94% utilization. The four-state increment changes that model from 21 min 30 sec to 23 min 30 sec. This is a collection-only planning estimate from three research samples, not a p95, measured full28-state job, wall-clock overlap result, or guaranteed cadence.

The original fleet audit's other observations still apply. The accepted 24-state warm job took 32 min 10 sec end to end. Pennsylvania browser bootstrap alone took 19 min 35.096 sec on the measured cold/forced cycle; conditional allocation at one identical run every four hours is 2 min 26.887 sec per half-hour, while the cold peak remains 19 min 35.096 sec. Exports, fallback exports, verifier/publication, cache/setup and queue overhead remain separate. The pending export repair must be benchmarked rather than assigned an assumed speedup.

Only `reliabilityPolicy.stateExpectedRunMs` changes in the authoritative JSON and generated TypeScript. The complete reviewed map has an exact literal historical reversal before the prior inactive-state reversals. Original Mississippi digests remain pinned; altered, missing or duplicated forecast fields and changes outside the map remain detectable. Source/parent hard caps, four-state manifest semantics, lifecycle statuses and alert permissions are unchanged. All four states remain inactive pending the separate admission process and fresh integrated proof.
