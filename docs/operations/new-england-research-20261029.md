# MA, CT and RI source preparation

One bounded discovery pass found 13 currently qualified bottle observations,
covering six expressions at seven named physical premises. Five premises were
newly discovered in CT/RI; two MA premises were refreshed from earlier prepared
candidates. No customer coverage, state activation or promotion is claimed.

| State | Premise | Observed qualified pickup offers |
| --- | --- | --- |
| MA | Table & Vine, 1119 Riverdale St, West Springfield | Elijah Craig Barrel Proof $84.99; Larceny Barrel Proof $54.99 |
| MA | Redstone Liquors, 115 Main St, Stoneham | Elijah Craig Barrel Proof $74.99; Larceny Barrel Proof $64.99; Henry McKenna 10 Year $64.99 |
| CT | Branford Wine & Spirits, 384 E Main St, Branford | Elijah Craig Barrel Proof $89.99; Larceny Barrel Proof $59.99; 1792 Full Proof $49.99 |
| CT | Stew Leonard's Wines, 55 Westport Ave, Norwalk | Elijah Craig Barrel Proof Rye $79.99 |
| CT | Stew Leonard's Wines, 2 Nabby Rd, Danbury | Elijah Craig Barrel Proof Rye $79.99 |
| RI | Gold's Wine and Spirits, 48 Valley Rd, Middletown | Elijah Craig Barrel Proof $74.99; Blanton's Original Single Barrel $94.99 |
| RI | Rhode Island Liquor Delivery, 342 Broad St, Providence | Larceny Barrel Proof $79.99 |

The source clock window is **2026-10-29 15:47:51–15:52:54 UTC**. Prices and
availability are observations at those original clocks. They may change. Positive
source quantity is retained only in supporting proof; display quantity remains
zero, with no claim of an exact shelf count or guaranteed fulfillment.

The [closed registry](../../engine/data/new-england-research-sources.json) is
inactive. Its offline parser requires the exact reviewed merchant, physical
address, coordinates, product/option URL and current unique library identity.
Every option must explicitly permit pickup or declare no option restriction,
exclude preorder, and describe a single bottle. All customer, alert, watch and
delivery flags are false. No production runtime or ordinary shadow registry
imports this preparation.

[Receipt metadata](../../engine/data/source-evidence/new-england-research-20261029/receipts.json)
binds seven compressed, unmodified first-party response bodies by both raw and
compressed SHA-256. Four additional official premise captures are preserved with
the same checks. The full app library was refreshed at 16:00:47 UTC: 1,177
identities and 271 canonical records. Its catalog/Bible hashes are recorded;
matching after that refresh retained all 13 observations.

The official CT package-store dataset identifies Branford at the exact address
and publishes active records for the two selected Stew Leonard's premises. The
Stew records publish future renewal effective dates; this preparation records
the fields without interpreting current legal eligibility. The RI tax portal
lists Fernandez Square Liquors at 342 Broad St with a 2026 clearance. This binds
the physical premises only and does not establish a reviewed DBA alias or active
liquor-license status. Middletown's historical planning minutes bind Gold's
liquor business to 48 Valley Rd; its current pickup proof comes from the retailer.

Rejected or held routes remain explicit:

- Wines and More Milford: current storefront address **242 Boston Post Rd**
  disagrees with the active state record **232 Boston Post Rd**. Not admitted.
- Stew Newington: zero qualified scarce rows in its exact-premise query. Not
  admitted, and no additional query was attempted there.
- The Wise Old Dog: the reviewed Larceny variant explicitly reports unavailable.
- Bottles Fine Wine Providence: catalog variant orderability lacked exact-store
  pickup proof; the standard pickup section returned 404. Not admitted.
- Haxton's: the first request returned 403. The incident was atomically persisted
  before body handling with a minimum 24-hour cooldown. No alternate route or
  retry was attempted.
- Julio's: one existing reviewed brand query matched only standard rye. No
  scarce inventory was admitted or second brand query attempted.

Validation: the portable replay verifies all source and official body hashes,
then reparses against the refreshed library without resetting source timestamps.
Tests reject shipping-only options, missing option restrictions, preorder,
foreign merchants/URLs, changed address/coordinates, stale clocks and disabled
library identities. Actual normalization, classification and Coverage policy
replay gives **zero public current rows/stores** in all three inactive states.
TypeScript checking passes. No production dispatch, preview or retailer message
was performed.

Next admission requires separate reviewed runtime/source registration, fresh
hosted source proofs, three shadow runs, two canaries, owned previews and issued
immutable provenance. These local observations satisfy none of those gates.
