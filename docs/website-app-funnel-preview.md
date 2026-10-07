# App funnel website preview

Preview branch only. Do not merge this branch to main or promote its deployment until the owner approves the website. Existing production customer tools are unchanged.

The owner-requested revision restores the original dark/gold website components and layout: original HeroSection → public read-only DropFeed using existing FeedRow cards/styles → unchanged HowWeHunt (The Process) → FAQ → original Footer. The rejected cream/espresso AppFunnel component and stylesheet are removed. Public navigation contains Feed, Coverage and Pricing, plus account/support/legal links and owner-only Admin. Dashboard, Sightings and Bottle Check are removed from public navigation; their pages remain behind the gated transition/continuity path.

The hero and feed CTA say Download the app. No active store link or available-now messaging appears without a verified downloadable App Store listing. No Android release or Google Play link is invented. Pricing retains existing cards/styles, removes new paid trials, and explains the same account and app experience. Coverage request code is unchanged and uses the same database/API consumed by the native admin coverage inbox.

The public feed uses anonymous production data, with an explicit allowlist of display fields. It reuses existing card visuals without detail expansion, source/evidence, photos, member contacts, posting, voting, saving, watches or filters. Missing/unavailable data never fabricates stock.

Checkout no longer offers new paid trials or creates trial_period_days. Existing webhook/history/entitlement reconciliation honors active trials. Existing Apple subscriptions are sent to Apple management; existing website subscriptions to billing settings, preventing duplicate subscriptions. No new native purchase link behavior is introduced.

Transition gate: BOURBON_WEB_TRANSITION_ENABLED=true plus BOURBON_WEB_TRANSITION_APPROVED_AT (owner approval timestamp) plus live Apple lookup verifying app ID 6804261265, bundle com.bourbonsignal.app and an HTTPS apps.apple.com link. Gate is off by default and remains off for this preview. Store lookup failure closes the gate. It runs when rendering the website/eligible page requests, cached for up to an hour; it does not publish, send messages or modify providers.

Only listed customer web pages redirect after activation. APIs, authentication, storage, jobs, billing webhooks, settings, legal/support and /admin remain intact. /web-access offers explicit continuing web access for Android and anyone unable to install, using the same identity. Its first-party continuity cookie retains access for one year and can be renewed. No automatic retirement date or Android release date is promised.

Provider activation prerequisite: audit and expire uncompleted new-trial Stripe checkout sessions, verify no Apple introductory free-trial offers, preserve active subscriptions and offer-code rewards. Preview does not change provider configuration or send emails. The legacy day-two trial campaign is suppressed by retired eligibility, and its template no longer offers a trial. Its historical campaign ID stays intact. Account emails and other retained newsletters are unchanged. No campaign was sent here.

Rollback: restore prior homepage and gate settings, or redeploy the previous website deployment. LegacyHome remains in this branch at /web-home. No member records are migrated/deleted. App/backend rollback guidance is in admin-control-room-release-677.md.

Provider audit 2026-10-07 UTC: Apple app 1.1.0 is PREPARE_FOR_SUBMISSION; public US lookup has zero results. Both monthly products are MISSING_METADATA and have no introductory offers. The pulled production Stripe key is blank, so live session/portal verification requires owner configuration.

Verification boundaries: public preview HTTP 200; public feed has 6 projected items, filters return 400, writes return 405, signed-out admin returns 401. Synthetic browser fixtures passed public layouts at 320/390/1440px and desktop admin flows at 390px. Preview uses separate Clerk/test-mode Stripe configuration; production identity configuration is unchanged. Stripe sandbox has no open trial checkouts or active trials, but its legacy $5 monthly product and absent portal configuration are not launch-price verification. Live Stripe key/configuration is still needed; no provider records were changed.


Revised browser validation: actual local Next website with preview Clerk configuration passed 320/390/1440 widths, enlarged text, no overflow/runtime errors, no buttons or inputs inside the feed, unavailable store-link suppression, continuity path, public GET 200, query filter 400 and POST 405. The website is preview-only. Production Stripe key is still blank after fresh environment inspection; live billing portal validation requires owner configuration.

The preview includes the shared subscription-management backend and latest support route from the app release. Provider route fixture tests pass with own-account Stripe routing, Apple routing independent of Stripe, and cross-account recovery rejection. No production website alias is assigned by this preview deployment.
