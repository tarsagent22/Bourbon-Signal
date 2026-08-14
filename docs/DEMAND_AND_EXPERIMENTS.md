# Demand investment and controlled experiments

This layer turns existing Sprint 4 signals into safer investment decisions and provides a guarded framework for measured on-site product changes.

## Demand contract

Demand uses two bounded inputs:

1. Owner-only Control Room aggregation of member preferences.
   - Tracked bottle: weight 4.
   - Collection bottle marked “would buy again”: weight 3.
   - Other collection bottle: weight 1.
   - Active-state preference: weight 2.
   - A member contributes at most once to a bottle or state cohort; the highest applicable bottle weight wins.
2. Operator-invoked search reporting.
   - Accepted catalog-resolved search: weight 1.
   - Only canonical bottle IDs/names from the current engine bottle export and state codes from the active lifecycle allowlist survive.
   - Search counts are events, not distinct people; no subject identifier or per-user history is collected.

Member-preference and experiment output retain a minimum distinct-subject cohort of five. Search output uses a minimum of five events only as a reporting threshold and never presents that threshold as distinct-person evidence. Output never contains member IDs, email addresses, phone numbers, URLs, raw queries, per-member rows, event timestamps, or raw history. Search capture never logs query text or other arbitrary free text; legacy sensitive-shaped log events are rejected again during reporting.

`npm run ops:demand -- --since=24h` builds the search aggregate manually. It does not install a cron or send anything. `npm run ops:source-roi` consumes the latest aggregate if available and adds canonical-bottle plus approved-state demand to the existing source value/repair score. Without that file, source ROI remains operational-only.

## Experiment status

The registry is `EXPERIMENT_REGISTRY` in `src/lib/growth-experiments.ts`. It is currently empty, so no experiment is active and no production assignment, exposure, or conversion write is generated. The retired release-follow experiment and its authenticated API endpoint have been removed.

The reusable framework still validates that any future reviewed experiment has at most one active definition, exactly two positive-weight variants, an allowlisted on-site surface, an allowlisted primary metric, explicit baseline and decision rules, and no email, SMS, pricing, entitlement, or legal scope.

## Assignment and privacy guardrails

For a future active experiment, assignment hashes the experiment ID and an authenticated subject key into one of 10,000 buckets. The subject key stays server-side and is not stored in experiment metadata, logged, or returned in aggregate output. Owners and retailer/vendor accounts remain ineligible.

Event builders fail closed unless a reviewed registry entry is active, the hostname is exactly `bourbonsignal.com` or `www.bourbonsignal.com`, and neither `GROWTH_EXPERIMENTS_KILL_SWITCH` nor `NEXT_PUBLIC_GROWTH_EXPERIMENTS_KILL_SWITCH` is enabled. Preview, local, test, killed, and empty-registry execution emits no experiment telemetry.

## Decision contract

The aggregation framework deduplicates eligible subjects before reporting and suppresses variants below five exposures. A result stays `inconclusive` until every variant reaches its configured sample floor. A higher conversion rate becomes `winner` only when it also clears the configured relative-lift threshold and a two-proportion z-test reaches 95% confidence (`|z| >= 1.96`).

## Safe operation checklist

1. Keep the registry empty until a separately reviewed on-site experiment is approved.
2. Before activation, run `npm run test:growth-experiments` and verify the surface, metric, sample, stop, rollback, privacy, and kill-switch contracts.
3. Confirm the experiment introduces no email, SMS, pricing, entitlement, or legal scope.
4. Observe only cohort-suppressed, identity-free aggregates in the owner Control Room.
5. Use the kill switch immediately for an operational or privacy rollback.

The current repository state retires the prior experiment in code. It does not send messages, deploy, push, or change live schedules.
