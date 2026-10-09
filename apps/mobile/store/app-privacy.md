# App privacy inventory — draft candidate

This is a working inventory for Apple’s App Privacy questionnaire. It describes the intended source behavior, not a completed audit of a final binary. Reconcile it against the final signed archive, current Apple/RevenueCat/Clerk/Expo disclosures, production API behavior, and App Store Connect answers before submission.

## Product assertions

- Tracking: No. No advertising SDK or cross-company tracking is intentionally included.
- Advertising: None.
- Payments: iOS membership purchases and restores use StoreKit through RevenueCat. Apple processes payment details; the app sends purchase/restore evidence to Bourbon Signal’s authenticated server for reconciliation and receives the authoritative membership lifecycle. The app does not collect card numbers and contains no external checkout.
- Push: Permission is requested only after a signed-in member enables Push in Radar. The authenticated account, installation identifier, Expo push token, preferences, and delivery state support immediate Radar notifications.
- Photos: Camera and selected-photo prompts only after an explicit member action to add optional sighting evidence. Denial preserves manual posting. Evidence is resized and re-encoded without embedded metadata before authenticated upload and is publicly visible only after approval.
- Location and microphone: Microphone and all location permissions remain disabled in this candidate.
- Account deletion: The native authenticated deletion flow sends an account-deletion request to Bourbon Signal. Subscription cancellation is a separate Apple action.
- Local persistence: Expo Secure Store contains Clerk session material, installation/push state, user-scoped browsing filters, contribution receipts, sighting idempotency bindings, and bounded photo retry data. The Support screen presents a selectable support address; the native deletion flow submits its own authenticated request. Membership, Radar preferences, collection data, Hunt Outcomes, Signal Points, alerts, and effective access remain server-authoritative.

## Conservative App Privacy answers

| Apple data type | Collected | Linked to identity | Purpose | Reason |
|---|---:|---:|---|---|
| Contact Info — Email Address | Yes | Yes | App Functionality; Account Management | Clerk authenticates the member account and support/deletion requests use the account identity. |
| Contact Info — Phone Number | Yes, when supplied | Yes | App Functionality; Account Security | SMS delivery is retired. Include a phone number only if current Clerk security factors or retained account fields collect it; reconcile the actual configured authentication flow before answering. |
| Identifiers — User ID | Yes | Yes | App Functionality; Fraud Prevention/Security | Clerk, RevenueCat app-user identity, and Bourbon Signal APIs bind authenticated access and purchase reconciliation to the account. |
| Identifiers — Device ID | Yes, when push is enabled | Yes | App Functionality | An installation identifier and Expo push token register the current device for Radar notifications. |
| Purchases — Purchase History | Yes | Yes | App Functionality | StoreKit/RevenueCat purchase, restore, product, offer, environment, expiration, and lifecycle status are reconciled to the account for entitlement and support. |
| Diagnostics — Other Diagnostic Data | Yes | Yes | App Functionality; Security | Authenticated mobile screen reports contain a local fingerprint and build/runtime/update identifiers, linked privately for account cleanup. Verify additional Apple, RevenueCat, Clerk and Expo disclosures against the signed archive. |
| Usage Data — Product Interaction | Yes, when used | Yes | App Functionality; Analytics | Signed-in app activity records first/recent use, platform, app version and update ID in private application storage for owner administration and support. Member-chosen Hunt Outcomes and product actions operate member features; analytics must remain first-party, allowlisted, and free of raw private identifiers. |
| Location — Precise Location | No | — | — | Members search for or enter a retailer manually; no foreground/background location permission is requested. |
| User Content — Customer Support | Yes, when submitted | Yes | App Functionality; Account Management | Support and authenticated deletion requests are linked to the member for ownership verification and resolution. |
| User Content — Other User Content | Yes, when posted | Yes | App Functionality | Sightings can include bottle, retailer, address, price, quantity, notes, and optional photo evidence. Account-linked abuse reports and member blocks support moderation and filtering; account deletion removes these records. |
| Financial Info | No | — | — | Apple processes payment instruments. Bourbon Signal receives purchase/entitlement status, not payment-card details. |

## Third-party SDK inventory

Unfinished Post and Add to My Shelf text forms are saved in account-scoped Secure Store entries on the device. They are restored only for that account and form, and cleared after successful submission or explicit discard. Form-draft persistence does not send the draft to a server. Pending photo uploads retain their separate existing retry journal. Startup recovery now offers an explicit system Share action for bounded diagnostics, including app/build/runtime/update identifiers; diagnostics are not automatically transmitted by this action.

- `@clerk/expo`: authentication and secure session lifecycle.
- `react-native-purchases`: StoreKit product presentation, purchase, restore, and RevenueCat entitlement state.
- Expo core, Router, Updates, Splash Screen, Secure Store, Linking, Constants, Status Bar, Notifications, Image Picker, Image Manipulator, and File System.
- Vercel Blob: direct authenticated optional sighting-evidence upload.
- React Native, Screens, Safe Area Context, Reanimated, and Worklets.
- Development Client is for development profiles only and must be absent from the final production archive unless explicitly justified.
- No advertising, attribution, social-login, location, or standalone mobile-analytics SDK is intentionally included.

## Final submission gates

1. Reconfirm the two configured Apple monthly products and RevenueCat default offering against the final candidate. Configuration was observed on October 5; Apple approval remains pending.
2. Produce the final signed iOS archive.
3. Inspect privacy manifests, required-reason APIs, SDK signatures, entitlements, permissions, and development-module exclusions.
4. Re-check current Apple, RevenueCat, Clerk, Expo, and Vercel disclosures.
5. Verify sandbox/TestFlight purchase, restore, offer eligibility, lifecycle transitions, push registration/revocation, photo denial/retry, support, and deletion behavior.
6. Reconcile this inventory, public Privacy Policy, and App Store Connect answers. If observed collection exceeds this draft, disclose the observed behavior rather than preserving a narrower claim.

## Automatic native screen diagnostics

Signed-in React screen errors send only a locally hashed fingerprint, standard error category, platform, build/runtime/update IDs. The authenticated server associates the report with the account for deletion, caps ten distinct groups per account/hour and one hundred repeated occurrences per group, and removes groups older than thirty days through daily cleanup. Owner Control Room shows aggregate groups without account IDs. Raw messages/stacks, signed-out provider errors, native OS crashes and offline delivery are not covered. No third-party crash SDK was added. The published linked diagnostics inventory must reflect this implementation before submission.
