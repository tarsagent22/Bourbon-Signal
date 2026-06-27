# Bourbon Signal Launch Membership Plan

Working branch: `launch/membership-pricing-stripe`
Target separation window: keep all pricing, Stripe checkout, entitlement gates, and launch-day page/copy changes off `main` until July 1 or Chandler explicitly approves promotion. The testing phase ends June 30; nothing launch/payment-related should go live before July 1.

## Product call: tackle entitlements first

The first implementation pass should define a single membership/entitlement contract before redesigning pages or wiring more Stripe behavior. Pricing pages are easy to make look good, but they become expensive to unwind if tier names, limits, and gates are scattered through components.

## Launch-day tier model

### Free / anonymous
- Public homepage and limited live feed preview.
- Show newest 5 feed items with an upgrade CTA.
- No full Member Sightings access.
- Can see enough product value to understand coverage and freshness.

### Free / signed-in
- Dashboard access with strong upgrade prompts.
- 3 Bottle Checks, then upgrade prompt.
- No alert/preference setup access.
- During the 3 Bottle Checks, show a conversion CTA such as `Get alerted when this drops in your area.`
- Read-only/limited surfaces should be explicit, not silently broken.

### Standard — `$4.99/mo` or `$39.99/yr`
- 5 alert areas.
- 15 tracked bottles.
- State-only filters.
- Full Bottle Check.
- Read and submit Member Sightings.

### Barrel — `$4.99/mo` or `$49.99/yr`
- Effectively unlimited alert areas and tracked bottles.
- Advanced filters.
- Sightings alerts included at launch, with honest copy that participation improves coverage over time.
- Early/beta access.

### Bottled-in-Bond Founder — `$49.99` one-time lifetime
- Lifetime access to all current and future paid member features.
- Capped at 100 total spots; after all 100 sell, no more will ever be available.
- Founder-style positioning and optional numbered goodies.
- No priority/fast-alert promise unless the system can actually support it.

## Entitlement contract to implement

Create one shared source of truth, then import it everywhere:

- Canonical tier IDs: `free`, `standard`, `barrel`, `bottled-in-bond`.
- Billing plan IDs separate from tier IDs: `standard_monthly`, `standard_annual`, `barrel_monthly`, `barrel_annual`, `bib_lifetime`.
- Feature flags/limits:
  - `feedPreviewLimit`
  - `bottleCheckLimit`
  - `alertAreaLimit`
  - `trackedBottleLimit`
  - `canUseStateFilters`
  - `canUseAdvancedFilters`
  - `canReadSightings`
  - `canSubmitSightings`
  - `canReceiveSightingsAlerts`
  - `hasBetaAccess`
  - `founderSpotLimit`
  - `founderSpotsRemaining`

## Stripe launch account values

Saved locally in ignored `.env.local` and not committed:

- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_PRICE_STANDARD_MONTHLY`
- `STRIPE_PRICE_STANDARD_ANNUAL`
- `STRIPE_PRICE_BARREL_MONTHLY`
- `STRIPE_PRICE_BARREL_ANNUAL`
- `STRIPE_PRICE_BIB_LIFETIME`

Still needed before Stripe webhooks can be rebuilt:

- `STRIPE_WEBHOOK_SECRET`

Do not paste secrets into committed files, PR bodies, screenshots, or chat summaries. Use Vercel environment variables for preview/production when ready.

## Launch branch guardrails

1. Keep `src/lib/site-mode.ts` on `main` in tester mode until launch.
2. Preserve the existing hidden pricing page structure, formatting, and aesthetic. Do not delete the pricing surfaces; update their copy, tier data, and CTAs for the new launch offer.
3. On this branch, add a separate launch mode path rather than mutating scattered tester copy.
4. Do not commit unrelated engine export churn into launch UI/payment commits unless the branch specifically needs a refreshed preview artifact.
5. Stripe should use new account environment variables for price IDs; never hardcode price IDs in UI components.
6. Webhook metadata should store canonical tier and plan names, not generic `monthly` / `annual` labels.
7. Downgrades/cancellations must be accounted for before launch, even if the first implementation is conservative.
8. All gated features should fail closed with clear upgrade copy, not expose half-working premium controls.
9. Preview PR stays draft until the launch build is reviewed; do not merge to `main` or move production aliases before July 1.
10. Treat any old Stripe checkout/webhook routes as invalid after the new Stripe account migration; rebuild them from the new account's product/price/webhook details.

## Suggested build order

1. Entitlement model and helper functions.
2. Update auth/membership reading to normalize old metadata into canonical launch tiers.
3. Pricing page design and checkout plan selection.
4. Stripe checkout route plan mapping for all launch plans.
5. Stripe webhook tier/plan/customer/subscription metadata handling.
6. Feature gates:
   - feed preview count
   - Bottle Check free limit
   - alert area/watchlist limits
   - Member Sightings read/submit
   - advanced filters
7. Success/account/billing route polish.
8. Full local verification, draft PR, Vercel preview, and browser/API smoke pass.

## Resolved tier decisions

- Free signed-in users cannot access alert setup/preferences; Bottle Check should be the alert-upsell path.
- Sightings alerts are included at launch and should be presented honestly as improving with member participation.
- Bottled-in-Bond Founder is a 100-spot lifetime tier for all current and future paid features.
- Standard includes both reading and submitting Member Sightings.

## Open decisions for Chandler

- Tester deal for the 16 testing-mode users: discount amount, duration/lifetime, whether it applies to Standard/Barrel/BiB, and how private the offer should feel.
- Exact launch homepage emphasis: premium private-club positioning vs practical “never miss a drop” utility.
