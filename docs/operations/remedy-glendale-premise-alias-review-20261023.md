# Remedy Glendale: reviewed suite-B address alias

**Recommendation: accept these two address forms as the same physical Remedy Glendale premise.** The omission of suite B from its pickup widget is sufficiently resolved by the merchant's own unique matching location listing. This is a narrow address-identity review; it proves neither newness nor current stock.

Proposed canonical physical address: **1700 W Glenoaks Blvd, Suite B, Glendale, CA 91201**. Retain source `ca:remedy-glendale` and store `remedy-glendale:91201`. Keep the collector's literal pickup address, `1700 W Glenoaks Blvd., Glendale CA 91201`, unchanged for strict evidence matching; attach the canonical address and reviewed alias evidence to premises reconciliation/admission metadata.

## Evidence supporting the alias

- The same HTTPS merchant's current [official location listing](https://www.remedyliquor.com/pages/customer-service) publishes `1700 W. Glenoaks Blvd. #B` in Glendale, CA 91201. Its locations block has exactly one Glendale/91201 entry; the other two branches are in NY and TX. The source supplies the omitted unit rather than contradicting pickup's street/city/state/ZIP.
- The saved exact variant `43040880197860` section names exactly one pickup premise at `1700 W Glenoaks Blvd., Glendale CA 91201`, repeats the complete Elijah Craig Barrel Proof product title, and binds to the reviewed same-origin product `7687686488292`. It names no competing unit, second Glendale location or other merchant.
- Public Shopify shop ID `64706445540` in the current location page agrees with the shop digits `0647/0644/5540` in the saved product image CDN path. This corroborates the shared merchant identity; it is not an authentication credential or stock count.

The remaining difference is an omitted suite in one merchant display, alongside punctuation/street abbreviations. A numeric Shopify location ID would be useful additional provenance, but is not needed to accept this exact alias given the shared merchant, unique Glendale listing and otherwise identical physical address. No property occupancy census, merchant call or further stock/API request is required for this identity conclusion.

## Captured provenance

| Evidence | Captured UTC | Status / size | SHA-256 |
| --- | --- | --- | --- |
| Official customer-service/location page | 2026-10-23 04:05:22.413 | HTTP 200, 800,069 bytes | `63a3b30373a427782caae204fc0f6cd7b6a2dbb309e563b07d289e4fd8c8ad64` |
| Frozen product JSON | 2026-10-23 03:28:08.576 | HTTP 200, 2,354 bytes | `68c9f59901dbf03026d9960eb027650ab3dcc085b871351991c07e694959a990` |
| Frozen exact-variant pickup section | 2026-10-23 03:28:14.367 | HTTP 200, 2,664 bytes | `e645b9bff24a1cc534e3ffc92ad6e38112f931964912ee650b6a2d2513923f27` |

The official raw HTML and request manifest are `.operator/remedy-premise-alias-20261023/location-page.html` and `manifest.json`. Source records are at HTML lines 6509–6510. Earlier product/pickup bodies remain unchanged in `.operator/reseed-20261023/`. Local checks verified raw hashes, the one-row pickup count, title/variant binding, the one Glendale location paragraph and the matching public shop identifier. This pass made one authorized general-location-page GET, zero new stock/API requests and no retries.

The [structured review](remedy-glendale-premise-alias-review-20261023.json), SHA `6655129bd2e98be11124ca6e2587e1ad3bf915154ae0e55c6b762102cf0a652a`, records the exact source/store/host/street/city/state/ZIP constraints and canonical proposal. It remains preparation only.

## Scope and limits

Accept base-address ↔ suite B only for this reviewed merchant and premise. An explicit different unit, changed street/ZIP, different merchant or a later second Glendale pickup location requires fresh review. This is not a general rule to ignore unit numbers: Main Street's Unit 100 and other premises must retain their own exact identities.

The production baseline still independently decides whether this premise is prior inventory, stale/history, directory reuse or genuinely new. The frozen pickup remains a point-in-time merchant orderability claim with unknown physical quantity. This review does not reconfirm present inventory, qualify NY/TX branches, approve source activation or fulfill scheduled/customer acceptance. No v2 registry, fixture, collector, release or production setting was changed.
