# Native release checklist — unfinished candidate

This checklist separates source implementation from Apple configuration and final-candidate proof. Checked source items do not mean the app, products, screenshots, or signed binary are ready for submission.

## Source-level candidate

- [x] App version and bundle/package identifiers are defined in source.
- [x] Native sign-in, sign-out, session recovery, and authenticated account routing are implemented.
- [x] Native StoreKit/RevenueCat purchase and restore coordination is implemented for four approved product identifiers.
- [x] Purchase and restore results reconcile with the authenticated Bourbon Signal server before paid access appears.
- [x] Customer membership names are Free, Standard, Barrel, and Founder while internal compatibility identifiers remain intact.
- [x] Free shows $0 and no renewal; Founder is honored but not sold through Apple.
- [x] Trial presentation is disabled in this build because product offer metadata is not per-Apple-account eligibility; no paywall or review copy claims a trial.
- [x] The purchase boundary uses StoreKit localized price and billing period.
- [x] Membership UI covers Free, purchase pending, trialing, active, grace period, billing retry, canceled at period end, expired, refunded/revoked, existing Founder, and provider unavailable.
- [x] Downgrade copy and access rules preserve saved data and block only additions above the current plan limit.
- [x] Account and Membership expose native Restore purchases, Manage subscriptions in the App Store, Terms, Privacy, Support, and Delete account navigation without external checkout.
- [x] Push permission is requested only after an explicit signed-in Radar action.
- [x] Camera and selected-photo evidence prompts follow explicit member action, preserve metadata-stripping, and allow manual posting without a photo after denial.
- [x] Draft store copy, privacy inventory, reviewer path, release gates, and screenshot specification are version-controlled.

## Apple and RevenueCat configuration — not complete

Configured StoreKit and RevenueCat products are required and remain unverified.

- [ ] Accept all applicable Apple agreements and verify App Store Connect organization/team access.
- [ ] Create or verify the App Store Connect app record for `com.bourbonsignal.app`.
- [ ] Create and configure Standard monthly, Standard annual, Barrel monthly, and Barrel annual subscriptions.
- [ ] Configure subscription groups, territories, pricing, tax/category data, localization, review information, and introductory offers as approved.
- [ ] Configure matching RevenueCat products, entitlements, offerings, webhook/API credentials, and production environment values.
- [ ] Prove that product identifiers, eligible offerings, and localized prices returned by StoreKit exactly match source contracts.
- [ ] Add the real App Store Connect app ID to approved submit configuration after it exists.
- [ ] Configure organization-owned signing without placing credentials in the repository.
- [ ] Create a least-privilege App Review account and store credentials only in App Store Connect.

Products are not configured or verified by this source pass.

## Sandbox and TestFlight evidence — not complete

- [ ] Verify monthly and annual purchase screens make no introductory-trial claim in this candidate.
- [ ] Verify localized Standard and Barrel monthly/annual prices at the purchase boundary.
- [ ] Verify purchase success does not grant access before server reconciliation and profile refresh.
- [ ] Verify pending, canceled, interrupted, and failed purchases remain non-entitled.
- [ ] Verify restore for the same account and denial across a different account.
- [ ] Verify trialing, active, grace, billing retry, canceled-at-period-end, expired, refunded, and revoked states.
- [ ] Verify existing Founder remains available and is never purchasable.
- [ ] Verify Manage Subscriptions opens Apple’s subscription settings.
- [ ] Verify downgrade data preservation and excess-add blocking with representative account data.
- [ ] Verify push register, dedupe, deep link, disable, sign-out, and cross-account behavior on physical devices.
- [ ] Verify Terms, Privacy, Support, and permanent deletion with a disposable account.

Sandbox purchase and restore evidence has not been verified.

## Final candidate — not complete

- [ ] Run the complete mobile verification suite from a clean install.
- [ ] Run Expo Doctor and production EAS configuration validation.
- [ ] Produce the final signed iOS build. No final signed build has been produced by this pass.
- [ ] Inspect the archive’s privacy manifests, required-reason APIs, SDK signatures, entitlements, permissions, encryption declaration, and development-module exclusions.
- [ ] Install through TestFlight and complete physical-device QA, accessibility, text scaling, small-screen, offline/retry, and account-switch testing.
- [ ] Capture and batch-review screenshots at Apple-accepted dimensions. Screenshots have not been captured.
- [ ] Reconcile App Privacy, age rating, review notes, public URLs, and vendor disclosures against the final build.
- [ ] Obtain owner approval before TestFlight distribution or App Review submission.

## Local verification commands

    npm ci
    npm run verify
    npm run verify:release-readiness
    npx expo-doctor
    npx eas-cli config --platform ios --profile production

Do not run a signed production build or submit from an implementation-worker pass unless explicitly authorized.
