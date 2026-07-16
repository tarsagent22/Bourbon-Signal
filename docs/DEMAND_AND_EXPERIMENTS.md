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

## Active experiment

The registry is `EXPERIMENT_REGISTRY` in `src/lib/growth-experiments.ts`. Exactly one low-risk experiment is active: authenticated Release Radar members receive a stable 50/50 assignment between the control CTA, “Follow release,” and the restrained variant, “Follow this release.”

- Baseline: the current authenticated-member “Follow release” control establishes the completion rate.
- Hypothesis: naming the object as “this release” increases successful follows without changing product behavior.
- Primary metric: `release_follow_completed`, recorded only after the existing preference save succeeds.
- Minimum sample: 100 unique exposures per variant.
- Decision floor: at least 5% relative lift and 95% confidence.
- Stop rule: decide after both variants reach the sample and confidence floors, or stop after 28 days as inconclusive.
- Rollback rule: enable the kill switch and restore control wording if follow-save failures increase, the wording misleads members, or any privacy invariant fails.

Registry validation requires at most one active experiment, exactly two positive-weight variants, an allowlisted on-site surface, an allowlisted primary metric, explicit baseline and decision rules, and no email, SMS, pricing, entitlement, or legal scope.

## Assignment and storage

Assignment hashes the experiment ID and authenticated Clerk subject key into one of 10,000 buckets. The key stays server-side and is never stored in experiment metadata, logged, or returned in API and Control Room output. Repeated assignment for the same experiment and subject is stable. Owners and retailer/vendor accounts are ineligible.

Exposure and conversion writes are accepted only through the authenticated `/api/experiments/release-radar-follow` endpoint. Each user has one bounded Clerk private-metadata record per experiment: variant plus `exposed` and `converted` booleans. Repeated writes update that same record. The record contains no timestamp, URL, page path, raw query, or event history.

The endpoint emits nothing unless the registry entry is active, the hostname is exactly `bourbonsignal.com` or `www.bourbonsignal.com`, and neither `GROWTH_EXPERIMENTS_KILL_SWITCH` nor `NEXT_PUBLIC_GROWTH_EXPERIMENTS_KILL_SWITCH` is enabled. Preview, local, test, and killed execution creates no assignment or write. No email, SMS, or customer message is sent.

## Control Room and decision contract

The owner Control Room reads one deduplicated record per eligible Clerk user and excludes owners and retailer/vendor accounts before aggregation. It suppresses variants below five exposures and never includes Clerk IDs, email addresses, per-user rows, timestamps, or raw history.

A result stays `inconclusive` until every variant reaches 100 unique exposures. The higher conversion rate becomes `winner` and the lower becomes `loser` only when relative lift is at least 5% and a two-proportion z-test reaches 95% confidence (`|z| >= 1.96`). Otherwise both remain `inconclusive`.

## Safe operation checklist

1. Keep only one reviewed registry definition active and run `npm run test:growth-experiments`.
2. Confirm the change remains wording-only and available only to eligible authenticated members.
3. Confirm the server and browser-visible kill switches both disable assignment and writes.
4. Observe only cohort-suppressed, identity-free aggregates in the owner Control Room.
5. Set the kill switch immediately for an operational or privacy rollback; change the registry status to `stopped` after the decision.

This repository work activates the on-site CTA experiment in code. It does not send messages, deploy, push, or change live schedules.
