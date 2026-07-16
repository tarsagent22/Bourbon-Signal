# Member weekly delivery

Weekly member intelligence has an owner-controlled delivery pipeline at `GET|POST /api/member-weekly-intelligence/deliver`. The route requires `Authorization: Bearer $WEEKLY_INTELLIGENCE_DELIVERY_SECRET` (or `CRON_SECRET`) and is dry-run unless the request includes `?live=1`.

The checked-in Vercel cron runs Thursdays at `14:00 UTC` using `?cron=v1` without `live=1`, so it only audits the cohort. It cannot send email.

## Live authorization

Live delivery requires every control below at the same time:

- request query `live=1`
- `WEEKLY_INTELLIGENCE_EMAIL_KILL_SWITCH=0`
- `WEEKLY_INTELLIGENCE_DELIVERY_ENABLED=1`
- `WEEKLY_INTELLIGENCE_LIVE_SEND_SUPPORTED=1`
- `WEEKLY_INTELLIGENCE_LIVE_SEND_AUTHORIZED=1`
- a valid route secret
- execution inside the configured weekday and local-hour window

The kill switch is active by default. Missing flags always fail closed. To authorize the scheduled workflow, the owner must intentionally add `live=1` to the cron path as a separate configuration change after setting and reviewing the environment flags.

## Cohort and safety policy

The runner enumerates Clerk users in bounded pages, sorts by stable member ID, and then applies active-paid-member eligibility, timestamped weekly opt-in, topic unsubscribe, Clerk master email suppression, Resend audience unsubscribe state, valid recipient, non-empty brief, and per-member-week dedupe checks. It composes all members from one pinned source bundle per run. A newsletter unsubscribe is POST-only and also records master suppression on the matching Clerk account.

Defaults are 25 emails per run, 1,000 enumerated members, batches of 25, 600 ms between sends, and 1 second between batches. Configure them with:

- `WEEKLY_INTELLIGENCE_MAX_EMAILS_PER_RUN`
- `WEEKLY_INTELLIGENCE_MAX_MEMBERS_PER_RUN`
- `WEEKLY_INTELLIGENCE_BATCH_SIZE`
- `WEEKLY_INTELLIGENCE_MIN_SEND_INTERVAL_MS`
- `WEEKLY_INTELLIGENCE_BATCH_PAUSE_MS`
- `WEEKLY_INTELLIGENCE_DELIVERY_TIME_ZONE`
- `WEEKLY_INTELLIGENCE_DELIVERY_WEEKDAY` (`0` Sunday through `6` Saturday)
- `WEEKLY_INTELLIGENCE_DELIVERY_START_HOUR`
- `WEEKLY_INTELLIGENCE_DELIVERY_END_HOUR`

Before a live provider call, the runner writes a `reserved` entry to `privateMetadata.weeklyIntelligenceDelivery.deliveries`. It uses the member-week hash as the Resend idempotency key and changes that entry to `delivered` only after provider success. Dry-runs never write the ledger.

## Unsubscribe behavior

Email links carry a signed purpose, version, member ID, issue time, and expiry. Opening the link only renders a confirmation page. The preference changes only after the signed form is submitted to the POST-only unsubscribe route. Replayed or concurrent POSTs derive the same `unsubscribedAt` from the signed issue time, so the operation is idempotent.

Set `WEEKLY_INTELLIGENCE_UNSUBSCRIBE_SECRET` independently in production. `NEWSLETTER_UNSUBSCRIBE_SECRET` is accepted as a compatibility fallback; provider API keys are never used as signing secrets.
