# Proposed rare-bottle replacements for two CA candidates

First-party captures on October 23, 2026, 03:26–03:28 UTC. This is preparation only: two feasible seed replacements, zero admitted sources or proven new physical stores. Existing candidate configuration, fixtures and their Buffalo Trace common-bottle controls were not edited.

The saved pairs replay successfully through unchanged `shopify-variant-pickup.mjs`, SHA `82ec1ede939d793f40d7a945430f49c0867fdfadf18d4004c5775c8878e39206`. The current 188-record Bottle Bible fixture and every recorded builder input hash were verified locally. Actual customer `resolveDropClassification` ran against the current generated classification data, rather than inheriting the engine's tier. Both replacements qualify as limited/allocated in CA; this alone does not establish admission or normal customer visibility.

| Premise / replacement | Exact identities and current product claim | Saved independent pickup proof | Actual CA classification |
| --- | --- | --- | --- |
| Remedy Glendale — [Elijah Craig Barrel Proof](https://www.remedyliquor.com/products/elijah-craig-bourbon-barrel-proof-750ml) | Product `7687686488292`, variant `43040880197860`; title `ELIJAH CRAIG BOURBON BARREL PROOF KENTUCKY 750ML`; 750 ml, $55.99 | `pickup-availability` section repeats the product title and reports pickup available, usually ready in 24 hours, at **1700 W Glenoaks Blvd., Glendale CA 91201** | **limited**, national baseline `elijah-craig-barrel-proof`; engine Bible tier is allocated. Canonical engine ID `bb_be6a0afd4ba5f963`. |
| Main Street El Cajon — [Eagle Rare 10 Year](https://mainstreetliquor.com/products/eagle-rare) | Product `6860137169033`, variant `45411077685385`; title `Eagle Rare 10 Year Kentucky Straight Bourbon Whiskey`; explicit variant `750mL`, $44.99 | `store-availability` section repeats product title and 750mL variant, and reports pickup available at **120 South Mollison Avenue, 100, El Cajon CA 92020** | **allocated**, national baseline `eagle-rare-10`. Canonical engine ID `bb_d0fe561ac45db2d5`. |

Quantity is unknown. Collector `quantity:0` with `quantityIsExact:false` is binary-availability representation, not a sold-out assertion or invented count. Prices are point-in-time product claims, not guarantees. Remedy still omits suite B in its pickup address; that existing premises/newness ambiguity remains. Main Street's address line `100` must remain part of the existing Unit 100 identity.

Remedy needs one proposed exact-title mapping within the existing collector contract. The strict raw matcher returns null for the retailer's inserted BOURBON/KENTUCKY wording; every canonical token in **Elijah Craig Barrel Proof** occurs in the raw title. The proposal permits **no unsafe modifier exceptions** (`allowedUnsafeReasons:[]`) and binds the exact raw title/canonical name. It infers no batch, age or private-barrel expression. This configuration exception needs independent review; no code or Bible alias was loosened. Main Street matches the actual Bible directly and needs no title exception.

## Evidence and bounded cost

All eight live requests returned HTTP 200 through the unchanged default engine client. Remedy used **5/6** allowed requests; Main Street used **3/6**. Each used one ordinary first-party search-suggestion discovery request; no catalog pages, retries, logins, alternate clients or denied routes were used. Total captured response bodies: **70,311 bytes** including discovery and the rejected Remedy Eagle Rare attempt. The two selected pairs total **16,418 bytes**, two requests per merchant per successful fixed-seed replay. Replay elapsed times are local fixture timing, not production/source latency.

| Selected capture | UTC capture time | Bytes | SHA-256 |
| --- | --- | --- | --- |
| `remedy-ecbp-product.json` | 03:28:08.576 | 2,354 | `68c9f59901dbf03026d9960eb027650ab3dcc085b871351991c07e694959a990` |
| `remedy-ecbp-pickup.html` | 03:28:14.367 | 2,664 | `e645b9bff24a1cc534e3ffc92ad6e38112f931964912ee650b6a2d2513923f27` |
| `main-street-eagle-product.json` | 03:26:54.676 | 8,670 | `5fb2dd154250715a085b1167d46c974c0bf1ccdf09de9c701e9d9906cdaa848b` |
| `main-street-eagle-pickup.html` | 03:27:01.829 | 2,730 | `b369133ab9b752588c094639b6359d9c942ad0a5355e372858d4c3065335a4b6` |

Raw bodies, exact URLs/status/timing/hash metadata and the request-budget ledger are in `.operator/reseed-20261023/manifest.json`. Proposed replacement configs are `.operator/reseed-20261023/proposed-shopify-pickup-candidates.json`, SHA `912fa4405c4a738fc3f97de34a151d86b0dcd0cc5835db96534e55f83f69a4f9`. The frozen replay and classifier results are `.operator/reseed-20261023/reviewed-mapping-replay.json`. The standalone [structured report](shopify-candidate-reseeding-20261023.json), SHA `122f25dd8ec8043343c744affa2f9aab7fc1b3b0231f2476faaf578f7783adc1`, carries the full proposed evidence metadata and acceptance limits.

The initial Remedy Eagle Rare 10 attempt was deliberately rejected despite positive same-premise pickup and $54.99 product availability. Its title uses `10YR`; the unchanged raw matcher fails and its canonical `10 Year` tokens are not all present. Saved positive pickup is insufficient to override that identity guard. The failed replay remains saved as evidence; it is not a proposed replacement.

The lead can review a separate v2 cohort/configuration and new fixture directory, preserving all v1 evidence and common-bottle denial regressions. Require current canonical/customer classification, admission, premises baseline and suite reconciliation, genuinely due scheduled runs, and matching normal Feed/Coverage before counting coverage. No activation, merchant contact, purchase or agreement occurred in this pass.
