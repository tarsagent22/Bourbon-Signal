# Fleet current-evidence preservation, October 29, 2026

Prepared from `bb9373784e94d07dfab45ce8287e58619647b7b1`. No source collection, lifecycle activation, release worktree or customer authorization changed.

## Findings and proof limits

Accepted workflow `40907316461` generated its snapshot at `2026-10-29T16:27:58.626Z`, using 61,485 current signals. Its stats report `historicalSignalCount: 1045896` as a high-water metric, not the exact restored historical pool size; the later exact-cache diagnostic found 457,870 restored historical candidates. The diagnostic stopped on that count mismatch, so it does not establish the precise historical cause or an export speedup. The current raw pool contains useful California grocery, Idaho availability and Iowa delivery evidence. A replay of the complete current pool through canonicalization, export, normalization and generated classification retains California's 76 grocery premises, Idaho's 74 premises and Iowa's delivery leads even under the original first 10,000-row cap. Therefore the current-only cap does **not** by itself explain the observed canonical California/Idaho loss.

California's accepted health metadata separately marks the entire state degraded because nine legacy retailer rows were overdue, despite 329 fresh reviewed grocery rows. The public degraded-state gate hides those fresh sibling rows. That independent consumer repair is owned by the Central agent.

The scheduled-verification ledger records a significant output collapse for Iowa and Idaho (Iowa also had zero visible output), after which older partitions were retained as stale. Production's final export consumes the **historical candidate pool**, not merely the current pool used for its quality scorecards. Three independent row budgets could truncate that pool: buildDrops, complete-fallback reservation, and board-history retention. A prior last-published partition could also fill the entire budget before any fresh state fit. The exact historical-cache replay remains a separate diagnostic; source-only replay is not proof that this patch has restored canonical production counts.

## Change

- Keep every already-admitted current observation, complete protected fallback partition and untouched prior partition. Existing identity, freshness, lifecycle, quality and collapse gates still decide admission.
- Prefer an exact current observation before stable source deduplication, preserving its original source clock and the existing historical first-seen/episode index.
- Cap only optional historical context. Budget its serialized UTF-8 bytes together with required rows. Required evidence exceeding 60 MiB fails explicitly; no current premise or complete fallback partition is silently clipped. The unchanged reader limit remains 64 MiB, leaving room for the export envelope.
- Write compact global drops JSON. The current 11,647-row replay is about 48.8 MB compact versus 57.5 MB formatted. Against the 60 MiB budget, that leaves roughly 14.1 MB of decimal-byte room; this profile does not guarantee future payload size. State partitions remain a verified lossless copy of the same selected rows.
- Replace quadratic findIndex/string-key deduplication with a Set using the identical key and first-duplicate behavior.
- Export the exact existing anomalyCodes array as degraded-state reasons, alongside the unchanged human-readable staleReason. Bind the new budget and existing merge implementation in promotion provenance.

No stock quantity, source date, inventory flag, alert flag, source proof or delivery eligibility is promoted by budgeting. Optional history is not counted as current inventory.

## Validation

The committed fleet fixture preserves exact CA/ID/IA raw rows from workflow40907316461. Washington/Wisconsin use the existing synthetic promotion schemas and captured-body fixture fetchers: no retailer HTTP, actual activation or immutable promotion proof is implied.

`node --import tsx scripts/test-fleet-current-visibility.mts` runs more than 10,000 current and historical fleet rows through actual export, later merges, lossless partitions, site normalization, generated classification, paid Drop and mobile Market routes, and Coverage. It verifies actual CA/ID/IA identities, on-site-only nonpreview WA/WI rows, original clocks, no WA/WI inventory alerts, and normal anonymous403. A complete 10,000-row protected partition cannot displace the fresh states. An oversized mandatory partition fails explicitly; UTF-8 tests distinguish bytes from JavaScript character count. The integration test is included in engine test:data-plane through engine/test/fleet-current-visibility.test.mjs.

The generated-output engine `npm test` requires collection outputs absent in this isolated checkout; its foundation phase passes, but the verifier cannot be claimed as run successfully here. The full data-plane test suite, focused customer-path fixture, MS boundary suite and TypeScript checks are the appropriate local checks. Production acceptance requires the parent's final integrated head and a newly accepted canonical publication.

Final local results: engine test:data-plane 1,697 passed; MS boundary 12 passed; focused fleet customer-path replay passed; TypeScript passed.
