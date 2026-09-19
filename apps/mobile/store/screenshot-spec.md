# App Store screenshot specification — pending capture

Screenshots have not been captured or approved. They must come from the reviewed TestFlight candidate or a byte-equivalent simulator build after Apple products and representative review data are configured. Do not fabricate screenshots, inventory, purchase states, prices, trial eligibility, private identifiers, or review evidence.

## Subscription review screenshots (required for the four Apple products)

These are **App Review-only In-App Purchase assets**, separate from the public App Store listing screenshots below. Capture the real in-app review screen once for each configured product:

1. Standard monthly — Account → Membership → Standard → Monthly.
2. Standard annual — Account → Membership → Standard → Annual.
3. Barrel monthly — Account → Membership → Barrel → Monthly.
4. Barrel annual — Account → Membership → Barrel → Annual.

Each image must visibly contain the matching tier name, Apple-localized price and billing period, auto-renewal disclosure, and the enabled purchase action. The current detail screen intentionally keeps those elements together above the benefits list. Do not upload the overview screen, a disabled `Price unavailable` state, a development mock, or a screenshot whose selected interval differs from the App Store Connect product receiving it.

Apple documents iOS subscription review screenshots as at least 640 × 920 px. A normal portrait capture from the final iPhone candidate is acceptable; do not resize it into the public-listing 6.9-inch slot. Reconfirm the accepted dimensions shown by App Store Connect when uploading.

Trial presentation is disabled in this candidate because product-level offer metadata does not establish the reviewing Apple account’s eligibility. Every product screenshot must show the ordinary paid state with its real localized price.

## Public App Store listing source set

Public listing screenshots have not been captured or approved. They must come from the reviewed TestFlight candidate or a byte-equivalent simulator build after Apple products and representative review data are configured. Do not fabricate screenshots, inventory, purchase states, prices, trial eligibility, private identifiers, or review evidence.

Capture portrait iPhone screenshots at 1320 × 2868 px for Apple’s current 6.9-inch slot, then reconfirm accepted dimensions and required device slots in App Store Connect at submission time. Regenerate from the approved scenes rather than stretching an older capture.

## Planned public listing scenes

1. Fresh Signals, clearly sourced
   - Home with two or three representative, non-sensitive Signal cards.
   - No loading/error state or guaranteed-availability language.

2. Exact details when evidence supports them
   - Signal detail with retailer, observed timing, source context, and price/quantity only where actual review data supports it.
   - Keep the confirm-before-travel caveat visible.

3. Radar built for the hunt
   - Saved markets, watched bottles, and alert controls from the review account.
   - Do not imply Free receives alerts or show an OS permission prompt as the marketing scene.

4. Membership that follows the account
   - Account → Membership showing Free, Standard, Barrel, and existing Founder language.
   - Use real StoreKit localized prices from the candidate; never type prices into a composited screenshot.
   - Capture the ordinary paid state. Trial wording is disabled in this candidate.

5. Shelf, ratings, and notes
   - Representative owned/tasted data with no personal notes or identifiers.
   - Avoid any retired membership labels.

6. Optional: Secure member access
   - Sign-in only if it improves the sequence.
   - Never show credentials, email addresses, verification codes, private account IDs, or debug information.

## Capture rules

- Use a dedicated least-privilege review account with representative but non-sensitive data.
- Use the actual candidate and configured products; do not use mocked product pricing or status.
- Capture only configured StoreKit localized price values returned by the reviewed candidate.
- Keep status-bar time, carrier, locale, and appearance consistent.
- Public identity tags are Founder #N or Member #N, never “scout.”
- Do not imply guaranteed quantity, orderability, nationwide coverage, or alerts for Free members.
- Do not imply annual or Founder trials.
- Do not show owner/admin controls, development-client chrome, debug menus, loading states, errors, or permission prompts.
- Keep captions short and factual, outside interactive UI elements.
- Inspect all final PNGs together for legibility, cropping, truthful data, canonical names, and visual continuity before upload.
- Record the candidate build identifier and review-account fixture used for capture without storing credentials in the repository.

## Approval gate

Screenshots remain blocked until:

- Apple and RevenueCat products return the approved localized product set;
- sandbox purchase, restore, lifecycle, and offer-eligibility behavior is verified;
- the candidate’s account, legal, support, deletion, and push paths pass device QA; and
- the exact build used for capture is approved for review preparation.

Real App Review screenshots are intentionally not produced by this Windows implementation pass.
