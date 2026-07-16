# Demand investment and controlled experiments

This layer turns existing Sprint 4 signals into safer investment decisions and provides an inert-by-default framework for measured on-site product changes.

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

## Experiment registry and assignment

The registry is `EXPERIMENT_REGISTRY` in `src/lib/growth-experiments.ts`. It is empty, so no experiment is active by default. Registry validation requires:

- at most one active experiment;
- exactly two positive-weight variants;
- an on-site product surface from the allowlist;
- a declared primary metric in the metric allowlist;
- sample and relative-lift floors;
- no email, SMS, pricing, entitlement, or legal scope.

Assignment hashes the experiment ID and a bounded stable subject key into one of 10,000 buckets. The subject key is never returned in telemetry. Repeated assignment for the same experiment and subject is stable.

## Production telemetry contract

Exposure and metric builders return `null` unless all conditions hold:

- registry status is active;
- hostname is exactly `bourbonsignal.com` or `www.bourbonsignal.com`;
- assignment belongs to the experiment and a registered variant;
- metric is declared by the experiment;
- neither `GROWTH_EXPERIMENTS_KILL_SWITCH` nor its browser-visible equivalent `NEXT_PUBLIC_GROWTH_EXPERIMENTS_KILL_SWITCH` is `1`, `true`, `yes`, or `on`.

The resulting Sprint 4 growth event properties contain experiment key, variant, on-site surface, and (for metrics) metric key only. Preview, local, test, and killed execution emits nothing.

## Decision contract

Owner aggregates suppress variants below five exposures and never include raw events. A result stays `inconclusive` until every variant reaches the experiment’s sample floor. For a two-variant result, the higher conversion rate becomes `winner` and the lower becomes `loser` only when relative lift clears the declared floor and a two-proportion z-test reaches 95% confidence (`|z| >= 1.96`). Otherwise both remain `inconclusive`.

## Safe activation checklist

1. Add one reviewed definition as `draft` and run `npm run test:growth-experiments`.
2. Verify its surface and metrics are already production growth events and contain no customer content or identifiers.
3. Confirm no other registry entry is active and the global kill switch works.
4. Change only that definition to `active` in a reviewed commit.
5. Observe owner-only, cohort-suppressed aggregates in the Control Room.
6. Set the kill switch immediately for unexpected behavior; use `stopped` after the decision.

This repository work does not send messages, deploy, push, change live schedules, or activate an experiment.
