# App privacy inventory

This is the working inventory for Apple’s App Privacy questionnaire. It is not a claim that the signed binary has already been inspected. Reconcile it against the final production archive and current Clerk, Expo, and API behavior before submission.

## Product assertions

- **Tracking:** No. The native app contains no advertising SDK, does not link app data with third-party advertising data, and does not use data to track members across other companies’ apps or websites.
- **Advertising:** None.
- **Device permissions:** Camera and selected-photo access are configured only for member-initiated optional sighting evidence. The policy prompts only after an explicit member action and preserves manual posting without a photo after denial. Attached photos are resized and re-encoded without embedded metadata before a direct authenticated upload. Microphone and all location permissions remain disabled.
- **Payments:** No checkout, external-purchase link, StoreKit purchase, or payment-card collection occurs in the app. Effective subscription status is read from the server for access control.
- **Persistence:** Expo Secure Store contains Clerk session tokens, the installation identifier and push-enabled marker, user-scoped contribution receipts, and user-scoped sighting idempotency bindings. A Signal-scoped timestamp suppresses repeated Hunt Outcome prompts. The user-scoped photo retry journal contains the pending sighting payload, idempotency key, sighting ID when known, upload pathname and bounded app-owned photo reference; no upload credentials are persisted. One retained JPEG per account (up to 3 MiB) lives in the app document directory; completed retries delete it and expired retries are cleaned on that account’s next load after seven days. Other accounts cannot resume or render that journal. Outcome values, Radar preferences, collection bottles, Signal Points, alerts and membership remain server-authoritative.

## Conservative App Privacy answers

| Apple data type | Collected | Linked to identity | Purpose | Why |
|---|---:|---:|---|---|
| Contact Info — Email Address | Yes | Yes | App Functionality; Account Management | Clerk authenticates the existing member account. |
| Contact Info — Phone Number | Yes, when supplied | Yes | App Functionality; Account Security | Radar collects and edits a mobile number for SMS alerts, in addition to any Clerk phone verification factor. Preserve explicit SMS enablement/consent and server entitlement checks. |
| Identifiers — User ID | Yes | Yes | App Functionality; Fraud Prevention/Security | Clerk and the API use account/session identifiers; private IDs are never rendered publicly. |
| Identifiers — Device ID | Yes, when push is enabled | Yes | App Functionality | An installation identifier and Expo push token are registered to the authenticated account for immediate Radar notifications. Online sign-out attempts device-only disable before ending the session; offline revocation, queued OS delivery and cross-account ownership remain release prerequisites, not completed guarantees. |
| Purchases — Purchase History | Yes | Yes | App Functionality | The API returns effective membership/entitlement state derived from existing billing records. No payment instrument is collected in-app. |
| Diagnostics — Other Diagnostic Data | Confirm with final SDK inventory | Potentially | App Functionality; Security | Clerk/Expo infrastructure may process device, network, or request metadata needed for authentication and update delivery. Confirm from current vendor disclosures and the signed archive. |
| Usage Data — Product Interaction | Yes, when a member chooses a Hunt Outcome | Yes | App Functionality; Analytics | The optional private response records whether the member found it, found it gone, or did not go for an expired availability Signal. Internal reporting is aggregate-only and does not rank members or stores. |
| Location — Precise Location | No | — | — | The current native app does not request foreground or background location. Members search for or enter a retailer manually. |
| User Content — Customer Support | Yes, when the member contacts support separately | Yes | App Functionality; Account Management | The app displays selectable support contact information and instructions; it does not open an email composer or submit a deletion request. The member composes an email separately. A resulting support/deletion request is linked to the sender for ownership verification. |
| User Content — Other User Content | Yes, when a member posts a Signal or attaches optional sighting evidence | Yes | App Functionality | A member can submit bottle, retailer, address, price, quantity, optional notes, and an optional evidence photo. Attached photos are resized and re-encoded without embedded metadata, stored as public sighting evidence, and linked to the authenticated account for moderation, attribution, duplicate prevention, and community display. |
| Financial Info | No | — | — | Stripe processes website billing; the mobile app receives entitlement state only. |

## Third-party SDK inventory

- `@clerk/expo`: authentication, session security, and secure token lifecycle.
- Expo core, Router, Updates, Splash Screen, Secure Store, Dev Client (development profiles only), Linking, Constants, Status Bar, Notifications, Image Picker, Image Manipulator, and File System; Vercel Blob handles direct authenticated evidence upload.
- React Native, Screens, Safe Area Context, Reanimated, and Worklets.
- No advertising, attribution, crash-reporting, social-login, location, or mobile analytics SDK is intentionally included.
- Hunt Outcome aggregation is first-party server processing; it does not add an advertising or cross-app tracking SDK.

## Final submission gates

1. Build the production iOS archive after Apple enrollment approval.
2. Inspect the archive’s privacy manifests and SDK signatures; development-client modules must not be present in the production binary unless required.
3. Re-check current Clerk and Expo privacy disclosures.
4. Reconcile App Store Connect answers with the table above and the public privacy policy.
5. If any SDK collects diagnostics or device identifiers beyond authentication/security, disclose it rather than claiming “data not collected.”
6. Record actual Radar phone/SMS consent, push registration/sign-out and support-information walkthroughs on the final archive. Reconcile the photo retry and contribution receipt inventory with the public policy. These walkthroughs and the App Store questionnaire have not been verified by local source tests.
