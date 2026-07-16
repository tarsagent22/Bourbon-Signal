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

The capture boundary does not log query text or any other arbitrary free text. The report keeps only:

- catalog-resolved canonical bottle ID/name counts
- state codes present in the active state lifecycle allowlist
- event-thresholded counts and demand weights

Outputs:

- `automation/bourbon-signal/reports/search-events-latest.md`
- `automation/bourbon-signal/reports/search-events-latest.json`
- `automation/bourbon-signal/reports/search-demand-latest.json` (source ROI input)

Raw queries, event timestamps, member identifiers, and timestamped event-history files are not written. Event buckets below five are omitted. Counts are searches, not distinct people, and no per-user history or subject evidence is collected. Use the aggregate to rank bottle coverage and approved geography investment without reconstructing individual behavior.

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

## Release Radar Silent Scout

Command:

```bash
npm run ops:radar-scout -- --input=path/to/candidates.json --draft-pr=path/to/draft.md
```

The scout accepts local structured candidate data, writes a machine-readable review artifact, and can prepare a draft pull-request body. It is silent unless `--print` is supplied. It does not fetch live sources, change public Radar data, open a pull request, or run on a schedule. Every candidate remains `announcement_only`, is ineligible for alert-grade availability, and requires human review.

Candidate input uses `{ "candidates": [...] }`. Each candidate can include `title`, `kind`, `sourceUrl`, `sourceType`, `datePrecision`, `startDate`, market codes, canonical bottle relations, and related Radar slugs. Missing or invalid evidence is preserved as a review issue rather than promoted.

## Script-first automation registry and cost telemetry

`automation-registry.json` is the canonical checked-in inventory for every active GitHub workflow and known Bourbon Signal Hermes job. It declares the owner layer, execution class, expected frequency, agent model, bounded external API class, mutation/deployment capabilities, silence policy, kill switch, and artifact output. Verify it whenever a workflow or job changes:

```bash
npm run verify:automation
```

`npm run ops:automation-cost -- --input path/to/sanitized-run-events.json --apply` reduces known-job run counters into an aggregate-only cost report. It accepts only registered job IDs and keeps deterministic and agent classes separate. Prompts, member data, raw searches, URLs, timestamps, and tool logs are not copied into the report. The owner Control Room reads only a similarly sanitized `BOURBON_SIGNAL_AUTOMATION_COST_REPORT` JSON value; absent or invalid telemetry is shown as unavailable.

## Token-free source and Radar collection

The source-expansion collector is a bounded wrapper around engine discovery and probe artifacts. It does not activate a state, change lifecycle config, publish a snapshot, or send an alert:

```bash
npm run ops:source-expansion -- --states=CO,MA --apply
npm run ops:source-expansion -- --states=CO,MA --execute --apply
```

`--execute` calls the engine's `discover:sources` and `probe:sources` commands after they are available; each run is capped at five states. Its report is an input to source ROI and the existing canonical findings system, not a separate operator backlog.

Release Radar has an equally constrained lead lane:

```bash
npm run ops:radar-leads -- --input path/to/search-results.json --apply
npm run ops:radar-leads -- --execute --apply
npm run ops:radar-scout -- --lead-ledger automation/bourbon-signal/reports/release-radar-leads-latest.json
```

The collector uses direct Brave only with `--execute` and `BRAVE_SEARCH_API_KEY`, caps query count, deduplicates canonical HTTPS URLs, and writes unverified announcement-only leads. It cannot publish, open a PR, create alerts, or alter public Radar records. The scout keeps unverified leads in a review-required draft lane.

## Autonomous expansion threshold

`autonomy-threshold-contract.json` makes the boundary executable. A state may enter the safe autonomous lane only with an official/first-party public source, clear terms, no authentication, exact store identity, honest availability semantics, a complete customer vertical slice, at least three shadow and two canary runs, budget headroom, reversibility, and no outbound, pricing, entitlement, or legal-policy change. Anything else is `approval_required`, including anti-bot/terms ambiguity, login, identity ambiguity, non-reversible work, or a communication change. The contract classifies readiness only; it does not itself promote a state.

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
- Installing the Release Radar scout as a live cron or automatic publishing job

## Structured operator backbone

Daily reliability, weekly engine, and source ROI JSON reports also contain a bounded canonical `findings` array. Radar findings, the aggregate-only company scorecard, the exact-section daily company brief, the weekly strategy review, GitHub backlog operations, and the single-objective lock/branch policy are documented in [`docs/OPERATOR_BACKBONE.md`](../../docs/OPERATOR_BACKBONE.md).

Live scorecard reads use only `COMPANY_SCORECARD_READ_SECRET` and an exact HTTPS origin allowlist. They never fall back to `CRON_SECRET`. The documented `ops:scorecard:fetch` and cron commands reject HTTP, paths, redirects, and unlisted hosts before attaching credentials.

All new artifact and mutation commands are dry-run by default. `--apply` is required to write generated artifacts, mutate GitHub issues, or create/release an objective lock and branch. None of these commands sends, deploys, publishes, changes production, or changes a cron.
