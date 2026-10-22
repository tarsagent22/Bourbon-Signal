# Nationwide coverage source research — October 22, 2026

The first pilot is the existing Shopify connector at two named premises in two states: Mission Trails Wine & Spirits in San Diego, California, and Jensen's Liquors at 1646 SW 27th Avenue in Miami, Florida. This is connector hardening and verification of existing sources, not two newly covered states or a nationwide rollout. Further source expansion waits until the pilot is verified through the normal release and production acceptance gates.

## Evidence boundaries

Public product catalogs, store directories, platform fingerprints, search results, shipment notices, online shipping offers and partner network sizes are discovery or intelligence evidence. Store inventory requires a current positive product/variant offer bound to the exact retailer premise and pickup path. Pickup availability remains binary retailer orderability; it does not establish a shelf count, reservation or immediate collection.

Mission Trails is already configured as an inventory-eligible Shopify source at 8181 Mission Gorge Rd, Ste A, San Diego, CA 92120. Its existing California collector combines variant availability with a first-party general pickup policy. That policy is weaker than per-variant pickup proof and must remain explicit during pilot verification. Chips Liquor is catalog-only (`inventoryEligible: false`), and Del Mesa's current schema failure does not establish functioning inventory. See `engine/src/collectors/california-san-diego-surfaces.mjs` and the lead's production baseline evidence.

## Jensen's bounded first-party preflight

The production HTTP helper made credential-free reads; no cart, order, customer form or merchant contact was submitted. At 23:31 UTC, the following exact evidence was captured:

| Field | Observed value |
| --- | --- |
| Product | Elijah Craig Single Barrel 18 Years Bourbon Whiskey |
| Handle | `elijah-craig-single-barrel-18-years-bourbon-whiskey` |
| Product / variant | `15414448390218` / `67703590977610` |
| SKU / price | `9674901018` / USD 249.99 |
| Size | `750 ML` in the product's own `body_html` |
| Feed availability | The exact variant has `available: true` |
| Pickup | Available at Jensen's Liquors PICKUP, usually ready in 24 hours |
| Exact pickup address | 1646 Southwest 27th Avenue, Miami, FL 33145 |
| Quantity | Unreported; preserve binary availability and zero projected count |

The [products feed](https://jensensliquors.com/products.json?limit=250&page=1), [single-product JSON](https://jensensliquors.com/products/elijah-craig-single-barrel-18-years-bourbon-whiskey.json), [product page](https://jensensliquors.com/products/elijah-craig-single-barrel-18-years-bourbon-whiskey) and [exact variant pickup section](https://jensensliquors.com/variants/67703590977610/?section_id=pickup-availability) returned HTTP 200. The feed has 250 products; that is a page length, not a count of safe bottles or stores. The single-product JSON omits the feed's `available` field and cannot establish availability by itself. A collector using that metadata must independently require the exact variant's positive pickup response and reject any explicit variant-availability conflict.

Buffalo Trace product `7793267081290`, variant `41616729079882`, is a required negative case. Its title and default variant omit size, while its own body specifies **375 ML**. It has positive online and pickup availability but fails the pilot's bottle-size policy. The previous Florida selection path checked title and variant size without this body evidence. Extract size from the product's own body; do not interpret tasting-note words such as honey, vanilla or rye as product category or format.

Raw captures and manifests are retained in ignored `.operator/preflight/` artifacts:

| Artifact | HTTP / bytes | SHA-256 |
| --- | --- | --- |
| `jensens-products-page-1.json` | 200 / 1,131,452 | `93df839a903eb1eb1d44fc034698ff41c6633a43309e6901cdeece9429fed749` |
| `jensens-elijah-craig-18-product.json` | 200 / 8,312 | `7a3861da4fc8e60098a02f790fdf462efdfc0b3450c10f31f5b9e3a165ee504d` |
| `jensens-elijah-craig-18-pickup.html` | 200 / 2,800 | `650dccae5bc7c62acedcb5f3e3ef818fb6e59e5aa6eca049006b90cab2c236ac` |

The manifests retain exact request/final URLs and capture times. These are local source observations, not release, alert-delivery or production-coverage proof. Jensen's existing integration is in `engine/src/collectors/precision-probes.mjs`; the named premise is allowlisted in `engine/src/florida-retailer-policy.mjs`.

## Platform and integration priorities

1. **Shopify: selected pilot.** Existing public products and variant pickup surfaces permit a small, reproducible cross-state test. Preserve exact host, product, variant, premise, positive pickup, size and freshness checks. Luekens' products feed returned HTTP 200, but its pickup request failed with status 0; no repeated request was made and no store inventory was inferred.
2. **CityHive: later platform expansion candidate.** Existing adapters bind merchant, premises, product and pickup evidence and distinguish exact quantities from sentinel/binary values. The earlier October 22 NY/CO positive captures were followed by direct-client HTTP 403 denials. `engine/data/metro-source-attempts-bootstrap.json` records source-specific next allowed times on October 23, around 14:20 UTC. Do not retry during cooldown or change clients to evade denial. No denied-store requests were made in this investigation. [CityHive's official integration page](https://www.cityhive.net/retailers/connect-pos) advertises 200+ POS integrations and 4,500+ retailers; those vendor network claims do not establish accessible Bourbon Signal inventory. An agreed feed is a research prospect, not an existing partnership.
3. **Verified retailer submissions: direct relationship route.** Existing verified applications, verified stores and expiring submissions provide direct retailer reports (`src/lib/retailer-repository.ts`, `src/lib/retailer-signal-feed.ts`). This is a working submission path, not an automated POS integration or evidence of recruited partners. `docs/retailer-acquisition.md` restricts outreach drafting to qualified small independent retailers; large chains and unknown chain status remain research-only. No outreach was drafted or sent here.
4. **Bottlecapps / BottlePOS: integration partnership research.** [Bottlecapps](https://www.bottlecapps.com/integrations) offers custom integrations and expressly says it has no self-service public API. [BottlePOS](https://bottlepos.com/integrations) lists ecommerce partners including CityHive and Bottlecapps. These are potential negotiated routes; existing fingerprints and blocked/app-only Mississippi surfaces do not establish a reusable running connector.
5. **GoToLiquorStore: secondary existing adapter.** Its parser binds visible product/cart controls to merchant identity and emits binary orderability. The [official FAQ](https://www.gotoliquorstore.com/faqs) describes local retailer fulfillment. Two Mississippi storefronts are explicitly disabled after production-client 403s in `engine/data/mississippi-retailer-registry.json`; they were not requested here.

`engine/src/discovery/platform-fingerprints.mjs` detects Shopify, CityHive, WooCommerce, Square, Lightspeed, Bottlecapps, BottlePOS, Grabbl and POS360/Remix. Detection is not collector support or inventory proof. The generic adapter table provides public probe paths for only Shopify, CityHive and WooCommerce; specialist collectors have separate reviewed contracts.

## Chain opportunities remain research

[Total Wine's company page](https://www.totalwine.com/about-us/our-company) advertises 300 stores across 30 states and DC. That footprint is not a count of spirits-selling, accessible or covered stores; the existing South Carolina review records a selected-store HTTP 403. Binny's Algolia and Florida ABC Searchspring already offer useful store-specific integrations within their states, but do not establish a cross-state pilot. Spec's product/event pages remain catalog or release intelligence without exact-store stock proof.

Costco's existing collector reads a configured warehouse observation feed and validates item, warehouse, timestamp and availability. It does not discover or collect live warehouse inventory by itself (`engine/src/collectors/costco.mjs`). No chain agreements, purchases, API access requests or source activation occurred. Chain, platform and direct-retailer opportunities stay queued behind completion and verification of the two-premise Shopify pilot.
