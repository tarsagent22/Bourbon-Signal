# Account, rewards, and achievements

Account is a compact hub. Profile editing is a dedicated native page; the points card opens Rewards, the achievement card opens badge progress, and Alert preferences opens Radar settings. Support, policies, diagnostics, sign out and account deletion remain accessible.

Rewards has four sections: catalog and a selectable device-local goal; earned badges and next-tier progress; canonical earning/referral rules; and recent points/redemption activity. Recognition uses the existing server achievement profile, independently of the spendable points balance. New badges are announced when they appear after a previously seen collection. Posting a sighting links directly to achievements.

Native redemption supports physical shipping review, saved-address editing, engraving, digital age confirmation, an explicit cost review and status history. The request identity is persisted per account before submission, and retries reuse the same request after a lost response or restart. Backend inventory, membership, balance and verified-email enforcement remain authoritative. No real customer redemption was submitted during validation.

Availability updates to retailer or trusted-source episodes can earn 5 points, up to three new qualifying episodes per UTC day. Found-it and gone-when-checked updates qualify; community self-reports and did-not-go updates do not. The database locks the account when enforcing the cap. Duplicate episodes never earn twice; withdrawn updates reverse their award. This is a small participation incentive, not proof that the report was independently verified.

The 200-point coaster set remains retired/unavailable pending owner confirmation of fulfillment stock. Its existing catalog identity and normalization remain supported. Do not activate inventory or promise shipping for an unstocked reward. Paid membership remains required for redemption, clearly disclosed before earning; all members can earn achievements and points.

## Release requirements

Apply `scripts/migrate-quality-outcome-rewards.mts --apply` to the existing production reward database after the guarded merge, deploy the server, and verify the new member activity response before publishing the compatible mobile OTA. No native dependency or runtime change is required.

## Validation

- Actual mobile components rendered in a local React Native Web fixture with synthetic API/auth/storage. Checked Account navigation, achievement collection, 320px layout, shipping confirmation, final cost review, a lost-response retry retaining one redemption and a 55-point balance, and redemption history.
- Unit/API tests cover reward goal fallback, engraving costs, next-tier selection, activity adjustments, authenticated request identity and malformed responses.
- In-memory PostgreSQL tests execute the real reward schema/function and verify caps, duplicate handling, reversals, restore behavior and account isolation.
- Full mobile verification includes accessibility regressions, typecheck, security/recovery checks, and iOS/Android exports. Server build and reward/referral/outcome suites are required before merge.
- Browser fixtures and automated checks do not establish physical iPhone acceptance or real fulfillment.
