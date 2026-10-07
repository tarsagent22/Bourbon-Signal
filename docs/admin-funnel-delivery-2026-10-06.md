# Admin and app-funnel delivery

## Shipped app/backend

PR #678 merged through the expected-head guard at `180324d8b1b4e583da9c153af2944026c80e66db`. All required PR checks passed; the live NC registry check passed on rerun. Production backend deployment is READY at that commit and assigned to www.bourbonsignal.com. No public website presentation changes were included in main.

Production iOS OTA: runtime `1.1.0-ios-iap-1`, group `1bed3dc0-4def-457d-abb0-2aa805f46fc5`, update `01a113e6-b560-7452-a4d8-8a225a7f682a`. Production channel and HTTP-200 device manifest matched. No new native build is required for this change. Physical-device acceptance was not performed.

Native navigation is fully visible and scrollable, with compact pending-work actions. Members browse immediately in 40-record pages with search, access/plan filters and join/sign-in sorting. Profiles separate access sources from billing, display ID-attributed contribution counts/activity, and link to review tools with back navigation. Original account, moderation, rewards, shipping, feedback, operations and history flows remain available.

Bottle review supports identity, brand/distillery, category, catalog rarity, proof, age, size, aliases and source/photo evidence. Approve-with-changes is atomic with the catalog write and receipt resolution. Draft saves create no catalog entry; stale approval rolls back. Original submissions and attribution stay in audit history. Stable IDs, shelf quantities/ratings/notes and exact historical watch aliases are preserved. Administrative changes do not issue rewards or stock notifications.

## Website preview only

Branch `preview/admin-app-funnel` includes app-focused marketing, labelled sample app screenshots, an anonymous read-only feed, shared membership comparisons, private desktop directory/catalog/submission/feedback workflows, billing-provider routing, new paid-trial retirement and explicit continuing web access for Android/unable-to-install members. It is not merged to main.

The transition remains off. Activation requires owner website approval and a verified public Apple download for the exact app ID/bundle. Current Apple app state is PREPARE_FOR_SUBMISSION; public lookup returned no listing. Existing customer tools remain operational. Backend APIs/jobs/storage/webhooks and private administration are not retired by the web-page gate.

Both Apple monthly products currently have no introductory offers and remain MISSING_METADATA. Native static plans no longer advertise trials. Website checkout/eligibility/copy retirement is prepared in preview and preserves existing trial reconciliation. Production Stripe configuration has no usable secret key, so live prices, portal configuration and uncompleted trial-session retirement remain owner-gated. The separate Stripe test environment has no active trials/open trial sessions, but has legacy pricing and no portal configuration; this is not production billing acceptance. Existing membership/account email and newsletter services were preserved. No launch announcement was sent.

## Verification and rollback

Local native full verify, typecheck and Android/iOS exports passed. Owner authorization/API tests, database reference/conflict/reward tests, member pagination/access tests and source/push delivery regressions passed. A production read-only probe saw 293 directory accounts and validated the activity query/function installation without printing personal data. Production signed-out admin APIs returned 401.

Actual native components with synthetic APIs passed browser checks at 320/390px and enlarged text. Public preview layouts passed at 320/390/1440px; desktop admin components passed directory pagination/profile, catalog editing, submission draft and feedback review at 390px. Deployed public preview/feed returned 200, feed filters 400, writes 405, signed-out admin 401. These checks are separate from physical-device acceptance and real paid-purchase acceptance.

Rollback OTA group: `2a622a5e-e9f9-4ecb-be6d-248dd8d38323`. Archive branch `archive/admin-control-room-677-20261007` retains the reviewed app history and matches the squash tree. Previous SQL definitions and release evidence are retained in `C:/Users/chand/projects/bs-admin-funnel/.operator/admin-release-678`. SQL migration is additive/function-only and deletes no member records. Website rollback is the prior deployment/LegacyHome plus inactive transition gate.

## Automation

No recurring automation was created. The existing alert delivery job (every five minutes) reads catalog aliases to keep exact renamed/merged watches matching; it writes no watch preferences, subscription changes or contribution rewards. Monitor the existing Operations health and audit history. The website checks public download identity on page requests, cached up to an hour, and changes no provider state. `scripts/retire-new-paid-trial-checkouts.mjs` is a manual operator utility: default is dry run; --apply expires only unfinished trial checkout sessions, never active subscriptions. It was not applied. The retired trial campaign fails eligibility; other retained account/newsletter delivery is unchanged.
