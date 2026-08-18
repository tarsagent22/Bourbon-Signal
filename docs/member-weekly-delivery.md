# Member weekly delivery

Weekly member intelligence has an owner-controlled delivery pipeline at `GET|POST /api/member-weekly-intelligence/deliver`. The route requires `Authorization: Bearer $WEEKLY_INTELLIGENCE_DELIVERY_SECRET` (or `CRON_SECRET`) and is dry-run unless the request includes `?live=1`.

The Thursday `14:00 UTC` cron using `?cron=v1` remains a dry-run audit. A separate daily `14:00 UTC` paid-member rescue cron requests live mode. That rescue route still fails closed unless every live-send flag, explicit member opt-in, provider suppression check, local daytime window, and route secret passes.

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

The weekly audit enumerates oldest-first; rescue enumerates newest-first so first-week members cannot be starved by the bounded scan. The runner then sorts by stable member ID and applies active-paid-member eligibility, timestamped weekly opt-in, topic unsubscribe, Clerk master email suppression, Resend audience unsubscribe state, valid recipient, non-empty brief, and dedupe checks. It composes all members from one pinned source bundle per run. A newsletter unsubscribe is POST-only and also records master suppression on the matching Clerk account.

Defaults are 25 emails per run, 1,000 enumerated members, batches of 25, 600 ms between sends, and 1 second between batches. Configure them with:

- `WEEKLY_INTELLIGENCE_MAX_EMAILS_PER_RUN`
- `WEEKLY_INTELLIGENCE_MAX_MEMBERS_PER_RUN`
- `WEEKLY_INTELLIGENCE_BATCH_SIZE`
- `WEEKLY_INTELLIGENCE_MIN_SEND_INTERVAL_MS`
- `WEEKLY_INTELLIGENCE_BATCH_PAUSE_MS`
- `WEEKLY_INTELLIGENCE_MEMBER_COOLDOWN_HOURS` (default `144`)
- `WEEKLY_INTELLIGENCE_DELIVERY_TIME_ZONE`
- `WEEKLY_INTELLIGENCE_DELIVERY_WEEKDAY` (`0` Sunday through `6` Saturday)
- `WEEKLY_INTELLIGENCE_DELIVERY_START_HOUR`
- `WEEKLY_INTELLIGENCE_DELIVERY_END_HOUR`

Before a live provider call, the runner writes a `reserved` entry to `privateMetadata.weeklyIntelligenceDelivery.deliveries`. Weekly delivery uses the member-week hash as the Resend idempotency key. Rescue uses a one-time purpose-specific key, and all member lifecycle sends share a rolling six-day cooldown so a week boundary cannot produce back-to-back mail. The ledger changes an entry to `delivered` only after provider success. Dry-runs never write the ledger.

## Unsubscribe behavior

Email links carry a signed purpose, version, member ID, issue time, and expiry. Opening the link only renders a confirmation page. The preference changes only after the signed form is submitted to the POST-only unsubscribe route. Replayed or concurrent POSTs derive the same `unsubscribedAt` from the signed issue time, so the operation is idempotent.

Set `WEEKLY_INTELLIGENCE_UNSUBSCRIBE_SECRET` independently in production. `NEWSLETTER_UNSUBSCRIBE_SECRET` is accepted as a compatibility fallback; provider API keys are never used as signing secrets.
