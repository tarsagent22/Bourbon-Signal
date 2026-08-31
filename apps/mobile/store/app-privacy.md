# App privacy inventory

This is the working inventory for Apple’s App Privacy questionnaire. It is not a claim that the signed binary has already been inspected. Reconcile it against the final production archive and current Clerk, Expo, and API behavior before submission.

## Product assertions

- **Tracking:** No. The native app contains no advertising SDK, does not link app data with third-party advertising data, and does not use data to track members across other companies’ apps or websites.
- **Advertising:** None.
- **Device permissions:** Camera and selected-photo access are configured only for a member-initiated bottle or shelf evidence action; foreground location is configured only for member-initiated nearby-retailer suggestions or Trip Mode. The policy prompts only after an explicit member action, preserves manual posting or destination entry after denial, and does not upload evidence photos. Microphone and background location remain disabled.
- **Payments:** No checkout, external-purchase link, StoreKit purchase, or payment-card collection occurs in the app. Effective subscription status is read from the server for access control.
- **Persistence:** Clerk session tokens plus the non-secret idempotency key and SHA-256 fingerprint for a pending sighting draft use Expo Secure Store. A Signal-scoped timestamp also suppresses repeated Hunt Outcome prompts. Raw draft fields and outcome values are not stored in Secure Store. Radar preferences, collection bottles, Signal Points, alerts, sighting content, Hunt Outcome values, and payment details remain server-authoritative.

## Conservative App Privacy answers

| Apple data type | Collected | Linked to identity | Purpose | Why |
|---|---:|---:|---|---|
| Contact Info — Email Address | Yes | Yes | App Functionality; Account Management | Clerk authenticates the existing member account. |
| Contact Info — Phone Number | Conditional | Yes | App Functionality; Account Security | Used only when the member’s Clerk account uses a verified phone factor. The app does not solicit a new phone number. |
| Identifiers — User ID | Yes | Yes | App Functionality; Fraud Prevention/Security | Clerk and the API use account/session identifiers; private IDs are never rendered publicly. |
| Purchases — Purchase History | Yes | Yes | App Functionality | The API returns effective membership/entitlement state derived from existing billing records. No payment instrument is collected in-app. |
| Diagnostics — Other Diagnostic Data | Confirm with final SDK inventory | Potentially | App Functionality; Security | Clerk/Expo infrastructure may process device, network, or request metadata needed for authentication and update delivery. Confirm from current vendor disclosures and the signed archive. |
| Usage Data — Product Interaction | Yes, when a member chooses a Hunt Outcome | Yes | App Functionality; Analytics | The optional private response records whether the member found it, found it gone, or did not go for an expired availability Signal. Internal reporting is aggregate-only and does not rank members or stores. |
| Location — Precise Location | No collection by the current native contract | — | — | Optional foreground location may be used on-device for nearby-retailer suggestions or Trip Mode after an explicit member action. It is not sent to the backend, background location is disabled, and manual destination entry remains available. |
| User Content — Customer Support | Yes, when the member chooses to contact support or request deletion | Yes | App Functionality; Account Management | The app opens a member-composed email to Bourbon Signal support. The resulting support/deletion request is linked to the sender so ownership can be verified and the request completed. |
| User Content — Other User Content | Yes, when a member posts a Signal | Yes | App Functionality | A member can submit bottle, retailer, address, price, quantity, and optional notes. These fields are attached to the authenticated account for moderation, attribution, duplicate prevention, and community display. The current native contract does not attach or upload evidence photos. |
| Financial Info | No | — | — | Stripe processes website billing; the mobile app receives entitlement state only. |

## Third-party SDK inventory

- `@clerk/expo`: authentication, session security, and secure token lifecycle.
- Expo core, Router, Updates, Splash Screen, Secure Store, Dev Client (development profiles only), Linking, Constants, Status Bar, Camera, Image Picker, and Location.
- React Native, Screens, Safe Area Context, Reanimated, and Worklets.
- No advertising, attribution, crash-reporting, social-login, or mobile analytics SDK is intentionally included. Expo Location is limited by policy and native config to optional foreground use.
- Hunt Outcome aggregation is first-party server processing; it does not add an advertising or cross-app tracking SDK.

## Final submission gates

1. Build the production iOS archive after Apple enrollment approval.
2. Inspect the archive’s privacy manifests and SDK signatures; development-client modules must not be present in the production binary unless required.
3. Re-check current Clerk and Expo privacy disclosures.
4. Reconcile App Store Connect answers with the table above and the public privacy policy.
5. If any SDK collects diagnostics or device identifiers beyond authentication/security, disclose it rather than claiming “data not collected.”
