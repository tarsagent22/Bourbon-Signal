# Shopify cohort customer processing QA

Preparation only; no source is admitted or active. `scripts/test-shopify-cohort-customer.mts` injects explicitly synthetic approval artifacts and enabled descriptors around the five saved public fixture pairs and actual reviewed Bible. It runs the real collector, platform policy, projection helper, site normalizer, generated classification, public evidence, canonical signal conversion, grouping, actual Coverage server assembly, and actual `DropFeed` card markup. Infrastructure readers and animation wrappers are isolated in memory; stock policy and customer processing are not replaced by always-true mocks.

Run:

```powershell
node --no-warnings --experimental-strip-types --test scripts/test-shopify-cohort-customer.mts
```

The actual card is exposed only in an in-memory transformed module; no production export is added. React server rendering exercises collapsed and expanded detail states. This is markup QA, not browser interaction, device display, live inventory, scheduled acceptance, or notification delivery proof.

## Current verified boundaries

- Five fixture positives retain exact configured premises, stable canonical IDs, source URL and exact variant pickup URL. Binary quantity zero is removed from customer count fields, not shown as zero bottles. Canonical signal price remains the precise source offer.
- Vino retains canonical `bb_1fd1f694742e0a1e` / Weller Single Barrel, while preserving the longer retailer raw name separately. Generated classification resolves the canonical record rather than hashing the raw title.
- Glendale and La Crescenta rows retain the correct city/address and do not acquire San Diego copy. Hot Spot remains Shopify with no invented CityHive option ID or label.
- Actual Feed classification and actual Coverage server assembly both show **three customer-eligible fixture sources**: Christie's CA, Vino NY and Hot Spot TX. Remedy and Main Street's Buffalo Trace products are `regular` under current generated classification and contribute zero. Their engine Bible baseline `allocated` tier cannot establish customer rarity or five fulfilled stores.
- Denial/failure, disablement, clock expiry and explicit veto suppress current inventory in normal customer processing and actual Coverage. Old base rows do not revive current counts. History may remain as non-current context.

## Narrow price finding

The card's catalog MSRP reference is separate from retailer price. Showing a valid independently labeled reference is not itself an error and the tests allow it. The actual expanded details, however, currently label the source offer as `MSRP` and round away cents (`DropFeed.tsx` detail construction, around line 913):

| Fixture | Source offer | Catalog reference | Actual expanded detail |
| --- | --- | --- | --- |
| Remedy | $19.99 | MSRP $25 | `MSRP: $20` |
| Main Street | $22.99 | MSRP $25 | `MSRP: $23` |
| Vino | $750.00 | MSRP $50 | `MSRP: $750` |
| Hot Spot | $134.99 | MSRP $90 | `MSRP: $135` |
| Christie's | $99.99 | MSRP $90 | `MSRP: $100` |

The card also shows the catalog reference in the main mobile/desktop row. The bug was the retailer offer mislabeled as MSRP in expanded details and rounded, not the legitimate catalog reference. No deal/discount claim was observed. The coordinated owner's narrow shared-component fix now labels the actual offer distinctly and preserves its cents; all five targeted actual-rendering assertions pass while allowing the independent catalog MSRP reference. These fixtures did not justify an unrelated pricing-feature redesign.

## Backend state-tier integration follow-up

The customer classification maps CA Buffalo Trace to `regular`, NY Weller Single Barrel to `allocated`, and both Booker's sources to `limited`. The engine Bible baseline labels NY Weller `unicorn`. Runtime policy now validates canonical ID/name/tier against global `lookup.byId` and admission, then independently requires an eligible current state market record from `lookup.byState[state]`. Raw collector signals retain canonical tier; exported rows use the accepted current `marketTier`. An explicitly supplied state lookup with a missing record fails closed instead of falling back to global eligibility. Vino's unicorn canonical authority can therefore produce an allocated customer row without relaxing canonical identity; regular CA Buffalo Trace remains denied. No classification table was changed.

The customer harness's initial five raw projections use baseline context to expose downstream classification. A separate actual state-classified scheduler-context test proves both CA regular products fail backend projection, while Vino produces the correct allocated row and stable canonical ID. The three eligible sources remain silent at bootstrap. These are synthetic admissions and do not establish any production scheduler approval, activation or net-new coverage count.
