# App Review notes

## Reviewer summary

Bourbon Signal is a focused native companion for existing members. It presents the canonical Signal Feed and exact Signal details, plus distinct Radar, Post, Cellar, and HQ destinations backed by the same server-authoritative member account. It is not a web wrapper.

- no in-app purchase;
- no external checkout link or payment steering;
- no account registration inside the app;
- push notification permission is requested only when a signed-in member explicitly enables Push in Radar; the device token is used only for immediate, freshness-qualified Radar matches;
- camera or selected-photo access is permitted only after a member explicitly chooses bottle or shelf evidence; optional foreground location is permitted only after choosing nearby-retailer suggestions or Trip Mode, and no permission prompt runs at app launch;
- denial always preserves manual posting or destination entry; this candidate does not upload evidence photos or expose barcode matching, and it does not request microphone or background location;
- manual Signal posting is available only to entitled members and uses durable idempotency plus server review for manually entered bottles or stores.

Existing website subscribers sign in and receive server-authoritative access from the same account. Availability can change and the UI tells members to confirm with the retailer.

## Review access

Before submission, create a dedicated review account with stable full-feed access and no owner/admin privileges. Enter its credentials only in App Store Connect’s App Review Information. Never commit or paste them into repository files, CI logs, EAS variables, issue bodies, or PR comments.

Reviewer path:

1. Open Bourbon Signal.
2. Sign in with the App Review account.
3. Complete the supplied verification factor if the account requires one. Configure the review account so Apple can complete this without contacting a private individual.
4. Review the Home tab, open a Signal's Bottle Profile, and continue loading the feed.
5. Open Radar to see saved alert markets, watched bottles, alert channels, and the alert inbox.
6. Open Post and review the required bottle/store fields. A submitted review Signal affects production community data, so Apple should not submit a test sighting unless coordinated with Bourbon Signal.
7. Open Cellar to see the review account's collection.
8. Open Account to see membership, Signal Points, rewards, Alerts, Profile, and Privacy & Support. Expand Privacy & Support for Support, Privacy policy, Account deletion help, app information, and Sign out.

## Account deletion

The app is sign-in-only and does not create accounts. A signed-in member can still initiate deletion from **Account → Privacy & Support → Account deletion help**. This opens the native Support flow for a deletion request to `support@bourbonsignal.com`. Support verifies ownership, removes the account from active systems, and confirms any billing, fraud-prevention, dispute, or legal records that must be retained. Subscription cancellation and account deletion are separate actions.

## Encryption

The app uses standard HTTPS/TLS and secure authentication. Expo configuration declares `usesNonExemptEncryption: false`. Reconfirm the export-compliance answer against the final signed binary.

## Contact and URLs

- Support: https://www.bourbonsignal.com/support
- Privacy: https://www.bourbonsignal.com/legal/privacy
- Marketing: https://www.bourbonsignal.com

Private review-contact details must be entered directly in App Store Connect after enrollment approval.
