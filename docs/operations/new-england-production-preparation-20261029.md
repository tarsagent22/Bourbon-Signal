# Inactive New England production preparation

The production cohort remains exactly seven premises: MA Table & Vine and
Redstone; CT Branford Wine & Spirits and Stew Leonard's Norwalk/Danbury; RI
Gold's Middletown and Rhode Island Liquor Delivery Providence. Held sources in
the earlier research report remain excluded.

Source configurations are `active:false`. Authoritative lifecycle remains absent
for MA/CT/RI and is not modified by this change. Even forced collection returns
`not_promoted` with zero HTTP and no cache access. There is no production dispatch,
activation or release in this preparation.

The separate runtime requires active lifecycle, store refinement, sparse named
store inventory, false inventory/watch flags, the exact source IDs and semantic
manifest hash, and the exact reviewed per-state cohort hash. It also requires at
least three immutable shadow runs and two canary runs, owned preview and issued
provenance. A dedicated immutable binding is mandatory:

```json
{
  "sourceProof": {
    "protocol": "bourbon-signal/new-england-first-party-cohort@1",
    "cohortSha256": "reviewed per-state cohort SHA-256",
    "allSourceRunsComplete": true,
    "storeIds": ["exact reviewed state premise IDs in registry order"]
  }
}
```

This binding belongs inside `immutableEvidence`. The future workflow issuer must
produce it only after raw source reparse proves the complete named cohort for
each accepted source run. Generic or legacy Julio's MA proofs cannot authorize
the new runtime. No such real binding exists yet; schemas fabricated by unit
fixtures are explicitly synthetic and provide no production authority.

Collection makes one reviewed query per premise with no redirects or retries:
MA at most two requests/40 seconds, CT three/50 seconds, RI two/40 seconds. Each
parent has a 90-second ceiling. The parser verifies merchant/name/address,
coordinates, product/option identity, single bottle format, explicit option
pickup restrictions, absence of preorder and the current unique app-library
identity. Quantity stays zero with unknown exact shelf quantity.

The 30-minute inventory cache retains original per-response clocks and rechecks
current library eligibility. There is no stale inventory fallback. Native
401/403/429/435 response headers persist incident metadata before body reads or
parent-abort checks. An incident-only pre-request latch survives a failed denial
write. Existing malformed/unreadable cache or incident files fail closed.
Denials retain at least 24 hours and longer Retry-After, then remain held for
review rather than automatically retrying an unchanged denied source. Force or
cohort changes cannot clear them.

The production workflow restores and always saves
`engine/out/source-incidents/new-england-cityhive`, using the same global cache
prefix as the dedicated New England hosted preflight. This preserves access
evidence across branch heads, research and production.

Local implementation checks use the seven frozen first-party bodies plus
explicitly synthetic promotion schemas and test observation clocks. All 13
expressions survive the actual nonpreview runtime, normalization,
classification, authenticated Feed fixture, exact-store Feed filters, Coverage
GET/POST, Finder directory/locations and store preference scopes. Every alert,
watch, delivery, email and SMS flag remains false; alert export is empty. The
authoritative inactive path still produces zero public current rows/stores.

The separate actual GitHub-runner preflight **40909637916**, producer
`607339eab09fb550eb7833b465b2fbf5fb63cb15`, observed HTTP 200 and 12 qualified
rows at six independent-host premises at **16:17:12–16:17:17 UTC**. Artifact
**12914085186** digest is
`641dbc70851db8ed1a2014f18ad47abee15830ad8f4c09096f2ef9c72262f2a0`.
Its raw bodies were independently hash-checked and reparsed against its uploaded
fresh library. Danbury was intentionally uninspected under the once-per-host
budget. That report is incomplete and is not one of the three promotion shadows.

Before promotion, integrate the dedicated complete-cohort research adapter,
portable downloader/raw preparer, actual positive canary and owned-preview
checks, mandatory implementation hashes and workflow issuer support. Replace
legacy MA research routing for this cohort; do not count older Julio's evidence.
Then freeze the integrated source implementation and collect three fresh complete
shadows and two canaries per state. Current lifecycle remains inactive until all
those steps pass and a separate guarded release is reviewed.
