# App Review notes — draft candidate

## Submission status

This draft candidate is not final and is not ready for App Review. The source implements the intended native membership, authentication, push, legal, support, and account-deletion paths, but the App Store Connect products are not configured, sandbox purchase and restore evidence is not verified, review screenshots are not captured, and a final signed build has not been produced.

Do not submit these notes as a claim that the unfinished candidate or its Apple products are operational.

## Reviewer summary

Bourbon Signal is a native bourbon-availability companion. Signed-in members can review Signals, manage Radar preferences, post member sightings, maintain Shelf data, and view account and membership status. Availability can change; the app tells members to confirm with the retailer before traveling or buying.

The intended iOS membership flow uses StoreKit through RevenueCat and reconciles every purchase or restore with Bourbon Signal’s server before paid access appears. There is no external checkout in the app.

Customer-facing memberships are:

- Free: $0 with no renewal.
- Standard: monthly or annual auto-renewing subscription.
- Barrel: monthly or annual auto-renewing subscription.
- Founder: existing lifetime access is honored but is not sold in the app.

Introductory trial presentation is disabled in this candidate. RevenueCat product offer metadata is not treated as proof that the reviewing Apple account is eligible, so the app makes no trial claim. The purchase confirmation uses Apple’s localized price and billing period.

## Intended review path

These steps describe the implemented navigation. They must be rechecked on the final signed build before submission.

1. Open Bourbon Signal. A new reviewer can choose Create a free account; for full review coverage, sign in with the dedicated App Review account supplied only in App Store Connect.
2. Review the Home tab, open a Signal's Bottle Profile, and inspect its source-backed detail.
3. Open Radar to review saved markets, watched bottles, alert channels, and the alert inbox. Push permission appears only after the member explicitly enables Push.
4. Open Post. Bottle and store are required; optional photo access is requested only after the member chooses evidence. Apple should not submit production community data unless coordinated with Bourbon Signal.
5. Open Shelf to review saved bottles. A downgrade preserves saved data; only additions above the current plan limit are blocked.
6. Open Account → Membership. Review Free, Standard, Barrel, and existing Founder presentation; monthly/annual choices; current lifecycle status; Restore purchases; and Manage subscriptions in the App Store.
7. From Membership, open Terms of Service, Privacy, Membership support, and Delete account.
8. Account → Privacy & Support → Delete account opens the native deletion flow. The same section exposes Support, Privacy policy, app information, and Sign out.

## Membership lifecycle behavior

The app maps the server-authoritative membership record into Free, purchase pending, trialing, active, grace period, billing retry, canceled at period end, expired, refunded/revoked, existing Founder, and provider unavailable states. A local StoreKit success alone never grants paid access. Existing Founder and already-active server access remain visible if the purchase provider is temporarily unavailable.

## Account deletion

A signed-in member can open Account → Privacy & Support → Request account deletion, or Membership → Delete account. The native confirmation screen submits the authenticated permanent-deletion request to Bourbon Signal. The screen explains that Apple subscription cancellation is separate and links to native App Store subscription management. This path must be exercised with a disposable account on the final candidate.

## Permissions and data

- Push permission is requested only after an explicit Radar action.
- Camera or selected-photo permission is requested only for optional sighting evidence.
- Denial preserves manual posting without a photo.
- Selected evidence is resized and re-encoded without embedded metadata before upload.
- No permission prompt runs at app launch.
- The candidate does not expose barcode matching and does not request microphone or location access.

## Review access and remaining setup

Before submission:

- configure the four subscription products and offerings in App Store Connect and RevenueCat;
- create a least-privilege review account with stable representative access;
- enter credentials and private review-contact details only in App Store Connect;
- verify monthly/annual purchase, absence of trial claims in this candidate, pending purchase, cancel, renewal, grace/billing retry, refund/revoke, restore, and Manage Subscriptions in sandbox/TestFlight;
- capture screenshots from the reviewed candidate; and
- produce and inspect the final signed build.

## Public URLs

- Support: https://www.bourbonsignal.com/support
- Privacy: https://www.bourbonsignal.com/legal/privacy
- Terms: https://www.bourbonsignal.com/legal/terms
- Marketing: https://www.bourbonsignal.com

Expo configuration declares `usesNonExemptEncryption: false`; confirm that answer against the final signed archive.
