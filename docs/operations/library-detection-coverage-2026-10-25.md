# Allocated-library detection and state coverage

The customer library and engine matcher previously had different identity sets. A bottle could be allocated and alert eligible in the library while the engine could not identify its exact name. Geographic coverage therefore did not establish bottle coverage.

## Change

Production refresh now reads the complete public customer catalog before collection. The sync validates record identities, tiers, uniqueness and response total; the engine requires a fresh, digest-verified sync. Offline builds use the existing deterministic classification catalog. An unavailable or invalid live sync stops the new refresh and preserves the existing published snapshot.

New scarce expressions use exact library identity matching. Expression words, ages, proofs, finishes and release years remain significant. Only packaging size, punctuation and equivalent age notation are normalized. Ambiguous aliases fail closed. New records never enter legacy substring matching or general page scanning. Existing canonical IDs remain stable; a specific library canonical expression takes precedence over an old broad family alias. The public exporter also excludes new identities from lossy fingerprint matching.

The live catalog captured on October 25 contained 1,177 entries and 235 targets whose national or state tier was limited, allocated, highly allocated or unicorn. Against that same target set:

| Measure | Released baseline | Revised matcher |
|---|---:|---:|
| Engine canonical records | 188 | 271 |
| Safely matched scarce canonical names | 169 / 235 | 235 / 235 |

This closes 66 canonical-name recognition gaps, including 1792 12 Year and distinct Taylor expressions. It does not establish retailer stock for those bottles. Totals follow the synchronized catalog and can change after approved library edits.

## Retrieval and audit

Arizona grocery searches retain their 134-premise, 150-search and 120-results-per-search limits. The 16 supplemental searches can now rotate through library expressions, with a coprime stride preventing a large query pool from becoming trapped in a narrow cohort. Broad bourbon retrieval still runs at each selected premise. Newly admitted grocery and Flagstaff brands require exact library identity; legacy fuzzy matches remain confined to the previous candidate brands. Exact premise, size, channel and stock checks still apply. Smart & Final remains a single Buffalo Trace SKU connector.

A live 150-search grocery preflight completed in 337 seconds without source roadblocks. Replaying its immutable responses through the final matcher produced 580 public rows at 132 premises, including three 1792 Full Proof store listings. This is an additional detected allocated expression, not a claim of three new physical stores. Production acceptance remains a separate receipt.

Every refresh writes `verification/library-coverage.json` and `.md` to its retained workflow artifact, along with the precise library catalog and built matcher. The report covers all 50 states plus a separate Montgomery County jurisdiction. Each target/jurisdiction pair records exact matching, retrieval limitations and available lane inputs, observed/fresh source rows, fresh public rows, actual inventory alert candidates and state alert permission. It carries the collection run ID and catalog digest. The audit uses a conservative two-hour observation window; rows outside that window are not counted as fresh audit evidence even when a source has a longer product-specific retention policy.

No state is marked exhaustively searched. Unsupported states remain unsupported, and Montgomery County never represents all Maryland. Shipment, aggregate and recent-purchase lanes retain their evidence class. No fresh public evidence means unknown availability; it does not mean a bottle is out of stock. An alert candidate is not a delivered notification.

The next capacity constraint is retrieval: bounded queries, pages, pinned product lists, denied sources and freshness. Exact matching alone cannot establish detection of every library bottle in every state. Expanding those routes still requires source-specific permission, variant and premise evidence, sufficient runtime budgets and current public-path acceptance.

## Validation

Tests cover the full static target set, new live-library identities, Taylor Small Batch versus Single Barrel, age/year and alias ambiguity, exporter fingerprint isolation, invalid/stale catalog rejection, all-state audit denominators, stale observations, non-inventory alert restrictions and bounded query rotation. The existing engine, source-denial, coverage-depth, classification and reliability contracts remain applicable. Live collection and immutable publication receipts are retained separately from deterministic fixtures.
