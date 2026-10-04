# Earned membership months

Standard costs 150 Signal Points and Barrel Proof costs 250. One membership month may be claimed per account in any rolling 12 months, across both tiers and every billing provider. Existing reward keys and historical snapshots remain unchanged.

Free website accounts receive one calendar month of Standard access, starting at redemption. It ends automatically, requires no payment method, and never creates a renewing subscription. The database owns the grant and its expiry; Clerk metadata is a recoverable projection. Paid access always takes precedence.

Stripe subscribers receive a USD 3 Standard or USD 6 Barrel Proof customer balance credit. It reduces the next invoice, including the next annual renewal for legacy annual subscribers. The live subscription, customer, price, tier, and renewal status are verified before points are reserved. The Stripe idempotency key is the durable redemption ID.

Apple monthly subscribers receive a one-time subscription offer code for their current tier. Free iOS accounts receive a nonrenewing Standard offer. Members activate through Apple's redemption link, then restore/refresh membership. Code issuance is fulfillment of the reward, not proof of an activated subscription. Only signed Apple transactions and the existing RevenueCat reconciliation can grant Apple access. Signed offer type 3 is classified as a code offer rather than an introductory trial. Legacy Apple annual memberships and gifted/lifetime memberships cannot claim a paid monthly offer.

## Provider configuration

App Store Connect app 6804261265 has three active one-month free offers in the USA and Canada:

| Audience | Product | Offer ID | Renewal |
| --- | --- | --- | --- |
| Existing Standard subscriber | Standard monthly | 8507cd86-d510-43b6-808b-594b74bcb432 | Existing subscription renews normally after the offer |
| Existing Barrel Proof subscriber | Barrel monthly | d4ef7adf-cf4b-4f93-9948-c82be19b2707 | Existing subscription renews normally after the offer |
| New or expired subscriber | Standard monthly | 9d5e37e5-7161-4493-8188-663fe9a446ca | No automatic renewal |

On October 4, 2026, Apple accepted a sandbox code batch but rejected production batches with `OFFER_CODE_APP_STATE_INVALID` and `OFFER_CODE_SALABLE_STATE_INVALID`: the app must be active and subscriptions approved. Production Apple rewards remain unavailable until approved production codes are imported. A sandbox batch never satisfies production inventory. Do not activate a dummy code or manually grant Apple membership to bypass approval.

## Deployment and replenishment

1. Capture and verify an encrypted application backup.
2. Run `tsx scripts/migrate-membership-month.mts --apply` using the production database environment. The canonical application-storage migration also includes this additive schema.
3. Store a random 32-byte base64 `MEMBERSHIP_REWARD_CODE_ENCRYPTION_KEY` as a sensitive server environment variable. Back up that key separately from encrypted database snapshots. Never put it in an Expo public variable or Git.
4. After Apple approval, generate production one-time code batches from the offers above through App Store Connect. Save downloads outside Git. Supply their exact provider batch metadata and CSV paths to `tsx scripts/import-membership-month-codes.mts --manifest=<private-json> --apply`. Manifest fields are `tier`, `audience`, `environment`, `offerId`, `batchId`, `expirationDate`, and `csvPath`. Dry run validates/encrypts without importing. Re-importing the same batch is safe.
5. Verify production inventory by tier and audience, and perform an actual iPhone redemption/restore. Offer configuration, automated tests, and OTA publication are separate from physical StoreKit acceptance.

Code assignment and point debit occur in one database transaction, with row locks and a unique assignment. Missing/expired inventory rolls back the entire debit. Issued codes cannot be canceled or recycled. Codes are encrypted using AES-256-GCM, returned only to their authenticated redemption owner with no-store headers, and never written into redemption details, metadata, events, or local intent storage. Account deletion retains only existing anonymized financial references. Encrypted backups include the code pool.
