# Shared Shopify exact pickup policy

This module is preparation code, not admission or activation. `engine/src/sources/shopify-pickup-policy.mjs` exports a frozen empty `SHOPIFY_PICKUP_SOURCES` registry. It imports no research candidate manifest and performs no network, filesystem, database, environment, scheduling or sending work. The existing CA/FL pilot is not changed.

## Integration API

```js
const shopifyPolicy = createShopifyPickupPolicy({
  descriptors: SHOPIFY_PICKUP_SOURCES,
  enabledSourceIds: [],
  collectorSha256,
  catalogSha256,
  lookup,
  policySnapshotId,
  blockedStates: [],
  now: Date.now(),
});

shopifyPolicy.owns(row);     // exact source partition; independent of eligibility
shopifyPolicy.eligible(row); // current exact pickup and authority checks
shopifyPolicy.evaluate(row);
// { owned, eligible, reason, sourceId, marketTier? }
```

Compile once per exporter build, scheduler invocation, projection read or final-send validation. Do not compile per row or cache the resulting policy across requests: its observation clock, current canonical lookup, quarantine context and policy snapshot belong to that invocation. Descriptor rebuilding, configuration hashing and admission validation happen only at compilation. Per-row evaluation uses compiled tuple/source/store/product maps and the supplied current canonical lookup.

The caller passes only explicitly trusted descriptors built by `buildShopifyCohortDescriptors`. The policy reconstructs that validated contract and compares every authority field except runtime `disabled`. Identity, definition, partition, admission, code/catalog/config hashes and lifecycle defaults cannot be substituted on a copied descriptor. Compilation snapshots descriptor state and validated definitions; subsequent mutation of the caller's objects does not change policy authority. Overlapping exact partitions and unknown/duplicate enabled IDs are rejected.

Enablement has two independent conditions: the trusted descriptor must explicitly have `disabled: false`, and its ID must be in the caller's explicit `enabledSourceIds`. The descriptor builder's frozen default-disabled output remains ineligible even when its ID appears in that list. The default registry and enabled list are empty. Research configurations and successful fixture checks are never enablement authority. Test files inject synthetic approvals and enabled copies to exercise meaningful positive paths; they do not supply real admissions or count stores as delivered.

The expected collector and catalog SHA-256 values must match the descriptor/admission bindings. Current canonical ID, name and tier are rechecked against the invocation's current `lookup.byId` rather than trusting a row or the previous accepted projection. A canonical disappearance or tier/name/ID change fails closed. A supplied `lookup.byState[state]` separately determines current market eligibility and tier; an explicitly present state lookup with a missing record fails closed. Market tier may differ from canonical tier if both remain eligible. Raw collector signals must carry canonical tier; flattened exported rows carry the accepted `marketTier`, returned by `evaluate`. Thus Weller's unicorn canonical can be allocated in New York while a regular Buffalo Trace market record still vetoes inventory. Changing the reviewed catalog bytes requires a new reviewed catalog binding; the caller must hash/verify the actual artifact, not pass a stale label. This pure policy cannot independently fetch or authenticate the external review/baseline/preflight artifacts identified by admission hashes. Their existence, provenance and authorization remain the release lead's responsibility.

## Ownership and eligibility

Ownership uses state, chain and the exact `(storeId, productId, variantId)` tuple from the admission. It does not require a healthy source, valid host, runtime ID, canonical, pickup status or proof. An invalid old row in that exact partition still needs to be suppressed during source disablement, failure or policy loss. Neighboring stores/products/variants and other source chains remain separate. This avoids Cartesian matching of unrelated products and variants.

Ownership does not itself make a row inventory-eligible. Every positive must also satisfy all of these common platform checks, with no merchant-specific branch:

| Authority or evidence | Requirement |
| --- | --- |
| Runtime | Exact nonempty `sourceRuntimeId`; any leaf/raw runtime ID and present `sourcePollId` agree. |
| State, merchant, chain, label | Present aliases agree with the trusted descriptor, including top-level and raw fields. |
| Product | Exact reviewed product/variant tuple; any raw IDs and handle agree; exact reviewed raw title. |
| URL | Exact reviewed HTTPS product URL and exact same-host numeric variant section URL; no extra query, alternate host/path or alternate section. |
| Premises | Exact configured name, full address including unit, city and ZIP; conflicting aliases reject. |
| Canonical and market | All present row canonical IDs/names agree with admission and current canonical record; canonical tier equals the admitted tier. The current market record must preserve ID/name and have an eligible tier. Raw signal tier is canonical; flattened row tier is market. |
| Current policy | Mandatory `sourcePolicySnapshotId` equals the invocation's current `policySnapshotId`; blocked states veto. |
| Binary inventory | Exact inventory event and store precision, `in_stock`, verified availability, numeric quantity zero, `quantityIsExact: false`, binary orderability semantics. Stale/cache fallback/explicit inventory veto/hidden/inert flags reject. |
| Exact pickup | Verified pickup offer, verified premises and verified selected variant availability. Every retained proof field must be true; a contradictory false rejects. General pickup policy or online `available` alone is insufficient. |
| Freshness | `lastConfirmedAt || observedAt` is valid, not future, and within the descriptor's one-hour expiry. Invalid/future retained observation clocks reject. |

The admission's original `policySnapshotId` identifies review provenance. It is deliberately not required to equal every later broad snapshot: current row stamps and current canonical/quarantine context provide consumption authority. A projection stamped under an older current policy snapshot fails closed until the scheduler revalidates and produces a new accepted stamped projection. Do not silently rewrite a stored row's stamp during feed reads to make it match.

Actual collector signals retain proof in `raw`; actual `publicSignal` rows flatten it into `variantAvailable`, `pickupOfferVerified`, `premisesVerified` and `sourceProductBinding`. Both shapes are supported, and conflicting top/raw values reject. The central exporter must preserve `sourcePolicySnapshotId`; a consumer must not invent it. Actual inventory candidates need the same proof preserved or must be validated against a current eligible exact source projection before delivery; candidate IDs alone are not proof.

The current public row format omits raw full-metadata size proof. The collector remains responsible for rejecting missing, ambiguous or excluded volumes on every collection; the policy rejects contradictory retained `raw.sizeMl` / `raw.sizeMetadataVerified` fields. It does not claim to reparse product HTML from a flattened row. The reviewed source/config/code bindings and exact projection provenance remain necessary. A future explicit exported size-proof field can strengthen consumer verification without a merchant-specific parser.

## Central wiring and evidence boundary

Use this single platform predicate from the NY safe-public gate, CA/TX positive inventory gates, shared poll-policy validation and scheduler acceptance. Keep existing merchant/source policies as separate legacy paths, preserving their behavior. Generic rows must pass this policy; a failed generic check must not be recategorized as a legacy merchant or catalog-positive fallback. Use ownership to veto exact partitions even when eligibility fails, and preserve current disable/failure/expiry/final-send rules. No source registry is appended by this preparation change.

`engine/test/shopify-pickup-policy.test.mjs` uses all five real saved product/pickup fixture pairs and the actual reviewed 188-record catalog. Explicit synthetic test authority makes positive signal paths meaningful. Tests cover flattened exporter rows, default-disabled and empty registries, exact tuples, wrong host/path/section/runtime/merchant/premises/canonical/current policy, missing/conflicting fulfillment, hidden source evidence, real negative pickup, code/config/catalog authority mutation, canonical policy loss, source expiry without a generation change, and immutable compiled descriptor authority. It preserves existing explicit row vetoes. These are local compatibility checks, not production admissions, scheduled runs, queue emissions or five new delivered stores.

Run `node --test engine/test/shopify-pickup-policy.test.mjs`. The collector, cohort descriptor utility and their focused tests remain separate reusable components. Shared runtime integration, actual artifact verification, source enablement, novelty admission and production observation remain coordinated release work.
