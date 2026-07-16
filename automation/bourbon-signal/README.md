# Bourbon Signal Operator Automations

These automations are for keeping Bourbon Signal reliable and improving the engine backbone. They do **not** monitor email, send email, reply to users, or perform support/inbox work.

## Daily Reliability Pass

Command:

```bash
npm run ops:daily
```

Purpose: answer **“Is Bourbon Signal working and trustworthy today?”**

Checks:

1. Production smoke
   - Homepage loads
   - Signup shows 21+ age confirmation
   - Dashboard redirects signed-out users to signup
   - Stats API works
   - Drops API is capped for anonymous users
   - Protected APIs remain protected
   - Legal pages load
2. Engine/source health
   - Site export freshness
   - Source-health freshness
   - Failed/degraded/stale states
   - Required tester/customer states still produce data
3. Alert candidate sanity
   - Candidate count
   - Flags informational/catalog/watch/shipment-style candidates that should not be urgent inventory alerts
4. Timestamp/data trust
   - Flags missing timestamp basis
   - Flags repeated inventory surfacing as false-fresh
   - Flags shipment rows without source event dates
5. Source drift watch
   - Uses source-health and browser preflight failures as drift signals

Outputs:

- `automation/bourbon-signal/reports/daily-reliability-latest.md`
- `automation/bourbon-signal/reports/daily-reliability-latest.json`
- Timestamped report copies in the same folder

Exit codes:

- `0` healthy/watch only
- `1` warnings
- `2` critical failures

## Weekly Engine Improvement Brief

Command:

```bash
npm run ops:weekly
```

Purpose: answer **“What should we improve next in the engine?”**

Inputs:

- `engine/out/site/stats.json`
- `engine/out/source-health.json`
- `engine/out/site/drops.json`
- `engine/out/site/alerts.json`

Ranks work using:

- Core state health: NC, VA, PA
- Tester-state health: NC, VA, TX, IL, TN, IN
- Roadblocks
- Actionable inventory availability
- Timestamp/data trust risks
- Alert candidate risks
- Browser/source preflight failures

Outputs:

- `automation/bourbon-signal/reports/weekly-engine-brief-latest.md`
- `automation/bourbon-signal/reports/weekly-engine-brief-latest.json`
- Timestamped report copies in the same folder

## Privacy-safe Search Demand Report

Command:

```bash
npm run ops:searches -- --since=24h
# equivalent operator alias
npm run ops:demand -- --since=24h
```

Purpose: turn recent Bottle Check and Finder searches into demand aggregates. This is an operator-invoked report, not a cron.

The capture boundary rejects email-, phone-, and URL-shaped values. The report then keeps only:

- catalog-resolved canonical bottle ID/name counts
- state codes present in the active state lifecycle allowlist
- cohort-suppressed counts and demand weights

Outputs:

- `automation/bourbon-signal/reports/search-events-latest.md`
- `automation/bourbon-signal/reports/search-events-latest.json`
- `automation/bourbon-signal/reports/search-demand-latest.json` (source ROI input)

Raw queries, event timestamps, member identifiers, and timestamped event-history files are not written. Cohorts below five are omitted. Use the aggregate to rank bottle coverage and approved geography investment without reconstructing individual behavior.

## Demand-weighted Source ROI

`npm run ops:source-roi` reads `search-demand-latest.json` when present. The existing operational value, alert, store-level, coverage, and roadblock score is extended with approved state demand and canonical bottles served by each source. If no privacy-safe demand snapshot exists, the ranker stays operational-only and labels that condition in its output.

Member preference demand is computed independently for the owner-only Control Room. It deduplicates each member's watchlist, collection, and active-state selections in memory, excludes owner/retailer accounts, suppresses cohorts below five, and returns aggregate rows only.

## Engine Coding Loop

When Chandler approves an improvement from the weekly brief:

1. Pick one improvement.
2. Inspect the source behavior.
3. Define what the source honestly means:
   - live inventory
   - shipment
   - catalog
   - release watch
   - informational only
4. Make the smallest safe engine change.
5. Run engine checks:
   - affected collector/state run when practical
   - `npm run export:site`
   - `npm run quality`
   - `npm test`
   - state-specific verify when available
6. Inspect generated public drops:
   - labels
   - caveats
   - `dataLane`
   - `informationalOnly`
   - `eventAt` / `firstSeenAt` / `lastConfirmedAt` / `timestampBasis`
7. Run site checks:
   - `npm run build`
   - smoke key APIs/pages
8. Deploy only if clean.
9. Verify production.
10. Summarize what changed, how it was verified, and remaining risk.

## Hard boundaries

Do not include in these automations unless Chandler separately asks:

- Email monitoring
- Sending emails
- Support inbox triage
- Auto-replying to users
- Public posts
- Pricing/legal changes without approval
- Alert-readiness scoring
- Treating catalog/watch/shipment data as live inventory

## Structured operator backbone

Daily reliability, weekly engine, and source ROI JSON reports also contain a bounded canonical `findings` array. Radar findings, the aggregate-only company scorecard, the exact-section daily company brief, the weekly strategy review, GitHub backlog operations, and the single-objective lock/branch policy are documented in [`docs/OPERATOR_BACKBONE.md`](../../docs/OPERATOR_BACKBONE.md).

All new artifact and mutation commands are dry-run by default. `--apply` is required to write generated artifacts, mutate GitHub issues, or create/release an objective lock and branch. None of these commands sends, deploys, publishes, changes production, or changes a cron.
