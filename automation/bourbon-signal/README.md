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

## Search Events Report

Command:

```bash
npm run ops:searches -- --since=24h
```

Purpose: list recent Bottle Check and Finder searches captured in Vercel logs.

Captured fields intentionally avoid user PII:

- surface: `bottle-check` or `finder`
- query
- state
- mode
- outcome
- matched bottle name/id when applicable
- suggestion/result count
- Bottle Check score status/local score when applicable

Outputs:

- `automation/bourbon-signal/reports/search-events-latest.md`
- `automation/bourbon-signal/reports/search-events-latest.json`

Use this during tester windows to find missing Bourbon Bible/index entries and confusing low-data searches.

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
