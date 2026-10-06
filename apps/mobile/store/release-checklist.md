# Native release checklist — unfinished candidate

This checklist separates source implementation from Apple configuration and final-candidate proof. Checked source items do not mean the app, products, screenshots, or signed binary are ready for submission.

## Source-level candidate

- [x] App version and bundle/package identifiers are defined in source.
- [x] Native sign-in, sign-out, session recovery, and authenticated account routing are implemented.
- [x] Native StoreKit/RevenueCat purchase and restore coordination is implemented for the two launch monthly products; legacy annual identifiers remain lifecycle and restore compatibility only.
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

## Apple and RevenueCat configuration — observed October 5, 2026

Configured StoreKit and RevenueCat products were inspected live: two monthly products and matching default offerings/entitlements exist. Apple product approval and final-candidate evidence remain pending.

- [x] Accept all applicable Apple agreements and verify App Store Connect organization/team access.
- [x] Create or verify the App Store Connect app record for `com.bourbonsignal.app`.
- [x] Create and configure the Standard monthly and Barrel monthly subscriptions. Preserve any existing annual product identifiers only for legacy subscriber lifecycle and restore handling; do not expose them as launch purchase options.
- [ ] Configure subscription groups, territories, pricing, tax/category data, localization, review information, and introductory offers as approved.
- [x] Configure matching RevenueCat products, entitlements, offerings, webhook/API credentials, and production environment values.
- [ ] Prove that product identifiers, eligible offerings, and localized prices returned by StoreKit exactly match source contracts.
- [ ] Add the real App Store Connect app ID to approved submit configuration after it exists.
- [ ] Configure organization-owned signing without placing credentials in the repository.
- [x] Create a least-privilege App Review account and store credentials only in App Store Connect.

Both launch products are configured and remain Prepare for Submission. Standard subscription review artwork was missing during inspection.

## Sandbox and TestFlight evidence — not complete

- [ ] Verify Standard and Barrel monthly purchase screens make no introductory-trial claim in this candidate.
- [ ] Verify localized Standard and Barrel monthly prices at the purchase boundary.
- [ ] Verify purchase success does not grant access before server reconciliation and profile refresh.
- [ ] Verify pending, canceled, interrupted, and failed purchases remain non-entitled.
- [ ] Verify restore for the same account and denial across a different account.
- [ ] Verify trialing, active, grace, billing retry, canceled-at-period-end, expired, refunded, and revoked states.
- [ ] Verify existing Founder remains available and is never purchasable.
- [ ] Verify Manage Subscriptions opens Apple’s subscription settings.
- [ ] Verify downgrade data preservation and excess-add blocking with representative account data.
- [ ] Verify push register, dedupe, deep link, disable, sign-out, and cross-account behavior on physical devices.
- [ ] Verify Terms, Privacy, Support, and permanent deletion with a disposable account.

Owner-reported evidence: the latest TestFlight candidate worked well and a sandbox purchase granted correct access. This does not establish restore, all lifecycle cases, or push receipt. Those remain unchecked.

## Final candidate — not complete

- [ ] Run the complete mobile verification suite from a clean install.
- [ ] Run Expo Doctor and production EAS configuration validation.
- [ ] Attach and inspect the final signed build. TestFlight build 14 exists; the final changed candidate still needs review and attachment.
- [ ] Inspect the archive’s privacy manifests, required-reason APIs, SDK signatures, entitlements, permissions, encryption declaration, and development-module exclusions.
- [ ] Install through TestFlight and complete physical-device QA, accessibility, text scaling, small-screen, offline/retry, and account-switch testing.
- [ ] Capture and batch-review screenshots at Apple-accepted dimensions. Screenshots have not been captured.
- [ ] Reconcile App Privacy, age rating, review notes, public URLs, and vendor disclosures against the final build.
- [ ] Confirm factual content-rights and privacy declarations with the owner before submission. Engineering and release preparation are already authorized.

## Local verification commands

    npm ci
    npm run verify
    npm run verify:release-readiness
    npx expo-doctor
    npx eas-cli config --platform ios --profile production

The owner has authorized engineering and release preparation. Record exact build/update identifiers and keep physical-device results separate from automated verification.
