# Android Google Play launch readiness

Owner-authorized Android work, tracked by issue #690. Website design remains on its preview branch.

## Membership behavior

- Free remains available. Existing Stripe, Apple, Founder, gifted and earned access use the same Clerk member identity on Android.
- Android store products: `com.bourbonsignal.app.standard.monthly` ($3 USD/month) and `com.bourbonsignal.app.barrel.monthly` ($6 USD/month). Base plan ID `monthly`, auto-renewing; no introductory or free-trial offers.
- Android explicitly purchases the paid base SubscriptionOption rather than RevenueCat's default offer. Upgrades replace the verified existing Google product.
- Manage membership opens the original provider: Stripe portal, Apple subscriptions, or the app-scoped Google Play subscriptions screen. An existing external subscription blocks a second store purchase.
- Google paid membership credit rewards remain unavailable until a Google-compatible fulfillment method is configured. Other rewards and already granted access remain intact; points are not spent on an unavailable credit.

## Provider configuration and release gate

Use the existing RevenueCat project `a79b27cf`; do not create a second member system or alias transfers. Add the Google Play app `com.bourbonsignal.app`, connect app-scoped Google service credentials and RTDN, attach the two products to the existing Standard/Barrel entitlements and current offering. Verify actual Play product prices and no offers before setting the policy flag.

Backend environment:

- Existing `REVENUECAT_SERVER_API_KEY` and exact `REVENUECAT_WEBHOOK_SECRET` authorization header value.
- `REVENUECAT_GOOGLE_PRODUCT_IDS`: the two canonical product IDs above, comma separated.
- `REVENUECAT_GOOGLE_TRIAL_POLICY=intro_offers_disabled` only after provider verification.
- `GOOGLE_PLAY_SANDBOX_USER_IDS`: explicit Clerk IDs of license testers. Sandbox access never grants other accounts membership.
- `GOOGLE_PLAY_BILLING_ENABLED`: leave unset/false until acceptance; true activates production purchase readiness.

Native environment: RevenueCat's Google public SDK key in `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY`. Firebase Android configuration and EAS FCM V1 credentials are required to validate Android Radar push. They require a new signed Android native build. Do not rebuild iOS solely for Android configuration.

Server verification fetches the authenticated Clerk subscriber from RevenueCat, requires the matching original user, Google store, supported SKU/base plan and Google order identity, then applies an ownership-bound, replay-safe Google ledger. Webhooks choose the store ledger and refetch server authority. They never directly grant the event's claimed tier. Sensitive order identifiers remain server-side.

## Schema and rollback

The first configured Google repository use performs idempotent additive table/index creation from `google-membership-schema.sql`. A failed bootstrap can retry; it does not modify Apple records. This is request-driven initialization, not a scheduled or recurring automation. Monitor API/RevenueCat webhook failures in Vercel and transactions in Play Console/RevenueCat.

Disable the public activation flag to stop new purchases. Existing verified metadata continues to honor paid-through access. Webhook verification remains available independently of the purchase activation flag. Re-enable the verified configuration for in-app restore if needed; do not remove the Google ledger or webhook route during rollback. Existing Stripe/Apple paths remain available. Restore a prior compatible OTA only when its entitlement enforcement supports existing Google members; do not downgrade to a version that ignores Google access.

## Store preparation

Play app ID: `4972388654542435177`; organization developer account verified. App remains Draft. Merchant profile exists; bank verification was pending on inspection. Console requires a signed bundle before subscriptions can be created. A bootstrap bundle is for draft upload only, never rollout. Final release must contain completed provider/Firebase configuration and the current reviewed source.

Suggested store copy for owner review:

- App name: Bourbon Signal
- Short description: Track bourbon drops, share local sightings, and build your whiskey collection.
- Full description: Bourbon Signal brings bottle signals, member sightings, and your collection together. Browse the Drop Feed, contribute sightings from your area, organize bottles in My Shelf, and earn Signal Points for contributions. Paid membership adds full feed access and push alerts; Barrel Proof adds advanced filters and collection intelligence. Coverage varies by state and source, and signals do not guarantee shelf availability. Sign in with your existing Bourbon Signal account to retain membership and contributions. Subscriptions renew through the provider where you purchased and can be managed from Account. No new paid free trial is offered.
- Support: https://www.bourbonsignal.com/support
- Privacy: https://www.bourbonsignal.com/privacy
- Account deletion: use the existing website/app deletion path; validate the public URL before entering it in Console.

Owner must review legally binding app-content/data-safety declarations against actual processors (Clerk, RevenueCat, Stripe, Google/Apple, Neon, Vercel, Expo), public user contributions, optional photos, purchase data, diagnostics and account deletion. Do not assert undisclosed location collection or advertising. No launch announcement is authorized.

## Acceptance remaining

1. RevenueCat permission to add/manage app configuration; authenticated provider connection and product inspection.
2. Google Cloud first-use legal agreement and narrowly scoped service credentials/RTDN permissions.
3. Firebase/FCM native configuration and final signed AAB; Play Store-enabled test environment, preserving the existing desktop AVD.
4. Play license tester sign-in and Free test member; sandbox purchase, upgrade, cancellation, renewal, restore, expiration/refund and push receipt.
5. Store screenshots/listing and owner app-content declarations; internal test release, review and public download prerequisites.

Local unit tests, exports, signed compilation, backend deployment, published OTA, Play internal release and physical-device acceptance are separate evidence layers. None is proof of the others.
