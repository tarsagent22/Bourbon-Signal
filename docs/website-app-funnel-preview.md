# App funnel website preview

Preview branch only. Do not merge this branch to main or promote its deployment until the owner approves the website. Existing production customer tools are unchanged.

The homepage presents app screen previews with synthetic example activity, a minimal anonymous read-only drop feed, shared plan comparisons, honest coverage information, support and account links. The public feed is fetched without session cookies and projects only bottle, state and public observation date. It has no filters, posting, comments, saving or watches. Empty and unavailable states do not fabricate stock.

Checkout no longer offers new paid trials or creates trial_period_days. Existing webhook/history/entitlement reconciliation honors active trials. Existing Apple subscriptions are sent to Apple management; existing website subscriptions to billing settings, preventing duplicate subscriptions. No new native purchase link behavior is introduced.

Transition gate: BOURBON_WEB_TRANSITION_ENABLED=true plus BOURBON_WEB_TRANSITION_APPROVED_AT (owner approval timestamp) plus live Apple lookup verifying app ID 6804261265, bundle com.bourbonsignal.app and an HTTPS apps.apple.com link. Gate is off by default and remains off for this preview. Store lookup failure closes the gate. It runs when rendering the website/eligible page requests, cached for up to an hour; it does not publish, send messages or modify providers.

Only listed customer web pages redirect after activation. APIs, authentication, storage, jobs, billing webhooks, settings, legal/support and /admin remain intact. /web-access offers explicit continuing web access for Android and anyone unable to install, using the same identity. Its first-party continuity cookie retains access for one year and can be renewed. No automatic retirement date or Android release date is promised.

Provider activation prerequisite: audit and expire uncompleted new-trial Stripe checkout sessions, verify no Apple introductory free-trial offers, preserve active subscriptions and offer-code rewards. Preview does not change provider configuration or send emails. The legacy day-two trial campaign is suppressed by retired eligibility, and its template no longer offers a trial. Its historical campaign ID stays intact. Account emails and other retained newsletters are unchanged. No campaign was sent here.

Rollback: restore prior homepage and gate settings, or redeploy the previous website deployment. LegacyHome remains in this branch at /web-home. No member records are migrated/deleted. App/backend rollback guidance is in admin-control-room-release-677.md.

Provider audit 2026-10-07 UTC: Apple app 1.1.0 is PREPARE_FOR_SUBMISSION; public US lookup has zero results. Both monthly products are MISSING_METADATA and have no introductory offers. The pulled production Stripe key is blank, so live session/portal verification requires owner configuration.
