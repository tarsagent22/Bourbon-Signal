# App privacy inventory

This is the working inventory for Apple’s App Privacy questionnaire. It is not a claim that the signed binary has already been inspected. Reconcile it against the final production archive and current Clerk, Expo, and API behavior before submission.

## Product assertions

- **Tracking:** No. The native app contains no advertising SDK, does not link app data with third-party advertising data, and does not use data to track members across other companies’ apps or websites.
- **Advertising:** None.
- **Device permissions:** No camera, photo library, contacts, microphone, Bluetooth, or device-location permission is requested by this release.
- **Payments:** No checkout, external-purchase link, StoreKit purchase, or payment-card collection occurs in the app. Effective subscription status is read from the server for access control.
- **Persistence:** Clerk session tokens use Expo Secure Store. The app does not persist email addresses, Clerk IDs, database IDs, Signal records, or payment details in its own storage.

## Conservative App Privacy answers

| Apple data type | Collected | Linked to identity | Purpose | Why |
|---|---:|---:|---|---|
| Contact Info — Email Address | Yes | Yes | App Functionality; Account Management | Clerk authenticates the existing member account. |
| Contact Info — Phone Number | Conditional | Yes | App Functionality; Account Security | Used only when the member’s Clerk account uses a verified phone factor. The app does not solicit a new phone number. |
| Identifiers — User ID | Yes | Yes | App Functionality; Fraud Prevention/Security | Clerk and the API use account/session identifiers; private IDs are never rendered publicly. |
| Purchases — Purchase History | Yes | Yes | App Functionality | The API returns effective membership/entitlement state derived from existing billing records. No payment instrument is collected in-app. |
| Diagnostics — Other Diagnostic Data | Confirm with final SDK inventory | Potentially | App Functionality; Security | Clerk/Expo infrastructure may process device, network, or request metadata needed for authentication and update delivery. Confirm from current vendor disclosures and the signed archive. |
| Usage Data | No first-party mobile analytics in this release | — | — | The app does not include a mobile analytics package. Reassess if one is added. |
| Location | No device location | — | — | Store locations shown in Signals are product content, not the member’s device location. |
| User Content — Customer Support | Yes, when the member chooses to contact support or request deletion | Yes | App Functionality; Account Management | The app opens a member-composed email to Bourbon Signal support. The resulting support/deletion request is linked to the sender so ownership can be verified and the request completed. |
| User Content — Other User Content | No collection through this release | — | — | The thin slice reads Signals but does not provide a native Signal submission composer. |
| Financial Info | No | — | — | Stripe processes website billing; the mobile app receives entitlement state only. |

## Third-party SDK inventory

- `@clerk/expo`: authentication, session security, and secure token lifecycle.
- Expo core, Router, Updates, Splash Screen, Secure Store, Dev Client (development profiles only), Linking, Constants, Status Bar.
- React Native, Screens, Safe Area Context, Reanimated, and Worklets.
- No advertising, attribution, location, crash-reporting, social-login, or mobile analytics SDK is intentionally included.

## Final submission gates

1. Build the production iOS archive after Apple enrollment approval.
2. Inspect the archive’s privacy manifests and SDK signatures; development-client modules must not be present in the production binary unless required.
3. Re-check current Clerk and Expo privacy disclosures.
4. Reconcile App Store Connect answers with the table above and the public privacy policy.
5. If any SDK collects diagnostics or device identifiers beyond authentication/security, disclose it rather than claiming “data not collected.”
