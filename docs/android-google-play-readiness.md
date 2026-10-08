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

Play app ID: `4972388654542435177`; organization developer account verified. App remains Draft. Merchant profile exists; bank verification was pending on the earlier inspection and must be rechecked before launch. Signed version 6 is saved as an internal-test draft, never for rollout. Both US monthly subscriptions are active at $3/$6 with no offers. Final release must contain completed provider/Firebase configuration and the current reviewed source.

Provider setup verified October 7, 2026:

- RevenueCat Play app `app4bff1b83fc` uses the existing membership project, Standard/Barrel entitlements and default monthly packages. Both Google base plans were imported as `<product_id>:monthly` without changing their iOS counterparts.
- The dedicated Google Cloud/Firebase project is `glowing-baton-510922-f6`. RevenueCat's service identity has app-only Play catalog/order/subscription/store access, plus Cloud Pub/Sub Editor and Monitoring Viewer. Google Play's official notification publisher can publish only to `bourbon-signal-play-subscriptions`.
- A Play test event was received by RevenueCat. Catalog and base-plan credential checks passed; purchase verification still reports package not found while the app has no rolled-out internal-test release.
- Firebase Android app `com.bourbonsignal.app` is registered, FCM V1 is enabled, and Analytics is off. `google-services.json` contains public app identifiers, not a service-account private key. Private service keys remain outside tracked source.
- The Android public RevenueCat SDK key is configured in EAS production/preview. Remote versionCode is 6 so the next auto-incremented build exceeds the bootstrap draft.
- The signed-in emulator account is included in the Play license-testing list. This does not grant the app's Founder member purchase eligibility.
- The existing RevenueCat backend webhook still selects the Apple app; expand its app filter only after the Google handler is deployed and configured.

Suggested store copy for owner review:

- App name: Bourbon Signal
- Short description: Track bourbon drops, share local sightings, and build your whiskey collection.
- Full description: Bourbon Signal brings bottle signals, member sightings, and your collection together. Browse the Drop Feed, contribute sightings from your area, organize bottles in My Shelf, and earn Signal Points for contributions. Paid membership adds full feed access and push alerts; Barrel Proof adds advanced filters and collection intelligence. Coverage varies by state and source, and signals do not guarantee shelf availability. Sign in with your existing Bourbon Signal account to retain membership and contributions. Subscriptions renew through the provider where you purchased and can be managed from Account. No new paid free trial is offered.
- Support: https://www.bourbonsignal.com/support
- Privacy: https://www.bourbonsignal.com/privacy
- Account deletion: use the existing website/app deletion path; validate the public URL before entering it in Console.

Owner must review legally binding app-content/data-safety declarations against actual processors (Clerk, RevenueCat, Stripe, Google/Apple, Neon, Vercel, Expo), public user contributions, optional photos, purchase data, diagnostics and account deletion. Do not assert undisclosed location collection or advertising. No launch announcement is authorized.

## Acceptance remaining

1. Deploy/configure the Google backend handler, expand the authenticated webhook app filter and complete Play purchase credential validation.
2. Configure the separate, messaging-only Expo FCM service credential. A verified subscription test event does not prove Android device push receipt.
3. Final signed AAB and internal tester track; preserve the existing desktop AVD and isolate the Android Play runtime from iOS.
4. Free test member; sandbox purchase, upgrade, cancellation, renewal, restore, expiration/refund and Android push receipt.
5. Store screenshots/listing and owner app-content declarations; internal test release, review and public download prerequisites.

Local unit tests, exports, signed compilation, backend deployment, published OTA, Play internal release and physical-device acceptance are separate evidence layers. None is proof of the others.
