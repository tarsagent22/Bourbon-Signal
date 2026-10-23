# Feed serving cost: next bounded repair (#821)

Preparation analysis only, 2026-10-23. Inspected worktree head `8891a19ef512f5517bc504dc06a3403fb9abb1a9`; no runtime, source configuration, admission, database, task, or release changes. Implement after the #822 baseline and the separately owned #823 release have been preserved. Production source admission remains unchanged.

## Evidence and limits

The local evidence file `C:/Users/chand/Documents/Bourbon Signal/shopify-shared-foundation-20261023-evidence/serving-cost-821-readonly-samples.json` contains five sequential read-only public responses, captured 03:37:49–03:38:18 UTC. Four are normal `/api/drops?limit=7` and one is `/api/coverage`.

| Observation | Recorded value |
| --- | --- |
| Two feed responses labeled prepare cache | 3,828.4 / 3,761.8 ms prepare; 4,199 / 4,150 ms total |
| Two feed responses labeled prepare build | 5,286.7 / 5,453.8 ms prepare; 9,735 / 5,861 ms total |
| Feed filtering | 257.0–269.9 ms |
| Packed immutable feed cache | 1,345,156 bytes |
| Coverage response | 4,434 ms total; no phase timing |

All four feed responses have the same body hash and broad snapshot ID. All five responses are HTTP 200 and `private, no-store`. This is neither a p95 measurement nor an isolated SQL, CPU, decryption, storage, or network profile. A cache label reports whether `publicFeedSnapshotCache.get()` reused the immutable preparation; the measured prepare interval also includes `readSiteExportIdentity()` and the fresh `preparePublicFeedSnapshot()` overlay and retailer work. Therefore “3.8 seconds in the immutable cache” would misstate this evidence. See `src/app/api/drops/route.ts:323` and `:329`.

## Current dependency boundary

`src/lib/source-scheduler.ts:45` reads `bottles`, `drops`, `state-health`, and `alerts` in one `readSiteExportResults()` call, validates policy, constructs both a `BourbonBible` and catalog lookup, and returns the complete drops array.

| Consumer | Actual context dependencies | Retain broad drops? |
| --- | --- | --- |
| `readPollProjection()` (`source-scheduler.ts:172`) | `lookup`, `health`, `snapshotId` for current policy validation | No |
| `pollCandidatesValid()` (`:181`) | Calls the same current candidate projection path, including final field equality | No |
| `runSourceScheduler()` collection (`:86`) | `bible`, `lookup`, `health`, `snapshotId`, previous `drops` | Yes |
| Legacy source projection (`:123`) | Lease projection, or matching broad drops for first collection history | Yes |
| Generic Shopify projection | Lease observations/episode seeds, or `ctx.drops`; current lookup and policy stamp | Yes, preserve existing fallback |
| `sourceSchedulerHealth()` (`:210`) | Jobs, scheduling fields, counts, source acceptance; no `context()` | No context change needed |

The generic bootstrap candidate gate is `Boolean(prior)` and the previous-episode comparison in `engine/src/sources/shopify-poll-projection.mjs:74`. Its history fallback is at `:67`. Legacy bootstrap is likewise gated by an existing lease projection. Removing collection history or substituting customer-normalized rows could alter stable episodes and restock decisions even if first-run candidates remain zero.

## Proposed minimal implementation

1. Split the private scheduler context into `readPollPolicyContext()` and `readCollectionContext()`, sharing a pure validation/catalog-normalization function. The customer policy reader requests exactly `['bottles', 'state-health', 'alerts']` once. The collection reader continues to request all four exports once. Collection alone constructs `BourbonBible`; customer consumers require the lookup, including current state-specific classifications for registered generic sources.
2. Keep each bundle pinned by the existing `readSiteExportResults()` implementation (`src/lib/site-engine-contract.ts:117`). Do not implement collection as a policy read followed by an independent drops read: the active pointer could advance between them. All policy members must have the same nonempty remote snapshot ID. Collection additionally requires its drops ID to match that same bundle.
3. Preserve the existing fail-closed checks: remote policy authority, valid generated clock, no future age, maximum seven-day policy age, health quarantine/bootstrap, alerts quarantine/bootstrap/manualRefresh, blocked-state health and environment quarantine, current canonical identity/tier and state-market eligibility, current row policy stamp, exact source ownership and disable policy. Re-evaluate clock-sensitive checks on each consumption; caching a previously successful validation is unsafe.
4. Keep the normal request's fresh job read, validation, merge, expiry checks and final-send revalidation outside all packed/process/shared caches. Keep `private, no-store`. Do not use the existing `[source_id, generation, accepted_at]` version as a mutable-policy cache key: disable/environment changes, clock expiry, and a changed failure reason can invalidate rows independently of that tuple.

This first change needs no snapshot schema, database migration, collector, cadence, recovery, admission, or client-cache change. Keep `pollJobs()` behavior for health/operations callers initially. Avoid broad cache lifetime changes in the same repair.

### Quantified work avoided, without a latency promise

On every enabled scheduler customer projection read, this split removes one encrypted drops-file decode/decrypt/decompress/hash/JSON parse and one unused `BourbonBible` construction. It changes the policy bundle from four export files to three. The current remote reader also reparses/verifies the manifest for each requested export (`src/lib/remote-site-snapshot.ts:72`); one of those repeated manifest operations disappears. This counts logical operations, not guaranteed network round trips: the immutable object strings already use the Next Data Cache.

The local bundled drops plaintext is **12,861,662 bytes**, bottles **133,844 bytes**, and alerts **1,389,965 bytes**. These are local fixture bytes, not measurements of the production snapshot's drops plaintext. A bounded local Node v24.19.0 experiment warmed each plaintext then parsed it five times, with no network or writes:

| Local plaintext | Five JSON parse durations (ms) |
| --- | --- |
| drops | 13.23, 12.71, 11.48, 11.81, 11.57 |
| bottles | 0.15, 0.15, 0.14, 0.14, 0.14 |
| alerts | 1.19, 1.49, 1.47, 1.40, 1.36 |

These CPU-only measurements exclude storage/cache transport, encryption, gzip, manifest/hash verification, network transit, lookups, classification and overlay work. They demonstrate avoidable payload processing and do not explain the observed 3.8-second preparation interval.

## Further cost hypotheses to measure separately

`readImmutableObject()` caches serialized encrypted objects for one year; each `remoteReader.read()` still validates the manifest, decrypts, decompresses, hashes and parses the plaintext. The active pointer has a separate 15-second cache. An eventual bounded immutable parsed-policy cache could be keyed by the currently selected verified snapshot/manifest, classification version and deployed code, with rejected promises evicted and data protected from downstream mutation. The pointer/current-selection check, age checks, environment gates, jobs and row expiry must still execute on every read. Do not cache a result obtained from fallback/shadow/local mode as remote policy authority.

`pollJobs()` currently executes `SELECT * FROM source_poll_jobs ORDER BY source_id` (`source-scheduler.ts:44`). For customer consumption the used head fields are `source_id`, `generation`, `accepted_at`, `last_reason`, and `projection`. Lease, due, pause and failure counters are needed elsewhere, especially health. Removing a few scalar columns alone may save little; no production projection-byte measurement or SQL duration was taken here.

If phase timing establishes meaningful job-transfer cost, add a **separate** `readPollProjectionJobs(kind)` query, leaving health/acquire/finish queries alone. A drops read needs only `projection.drops`; a candidate read needs only `projection.candidates`. It does not need observations, episode seeds, or the other row family. Preserve SQL NULL projection versus a present empty projection: empty accepted results own their partition and must suppress old positives, while missing projection follows different failure/bootstrap logic. One possible shape is `CASE WHEN projection IS NULL THEN NULL ELSE jsonb_build_object($kind, projection->$kind) END AS projection`, with kind restricted to the two internal literals, plus the five required head fields. Do not split a head read and a projection read into independent SQL statements; a newer failure or generation could be joined to an older payload. Preserve deterministic source ordering and all registered disabled owners. A one-statement projected row is coherent at the database statement boundary; subsequent mutations remain handled on the next consumption/final-send check, as today.

The SC lane, when storage is enabled, independently reads alerts/health/bottles before the scheduler reads its own policy bundle (`src/lib/source-lane-runtime.ts:20`, `:68`). Sharing a request-scoped pinned bundle might later reduce duplication, but requires preserving SC's base-snapshot coherence and promotion/storage-off semantics. It is outside the minimal split.

Fresh overlay, retailer submission read, row normalization/sort, and awaited trace writes are other plausible contributors. `tracePollCandidates()` awaits SQL telemetry writes (`source-scheduler.ts:204`), even though telemetry failure is caught. Do not change telemetry durability/ordering merely from the aggregate timings; first instrument its duration. No production SQL, credentials, private projection dumps, or new source calls were used for this analysis.

## Required regression and measurement evidence

Use the actual saved scheduler/context and route modules with infrastructure stubs; a stubbed policy that always accepts cannot establish safety.

- Assert a normal feed/candidate read requests only the three policy exports, never drops, and does not construct the collection Bible or invoke any collector/write path. Assert collection still obtains all four from one pinned call and retains matching prior episode IDs and bootstrap-zero candidates.
- Exercise pointer rotation between independent calls, mixed IDs, absent ID, local/shadow/cache-fallback authority, malformed/missing exports, expired/future/invalid clocks, quarantine/bootstrap/manualRefresh, blocked state, and current canonical/state-tier loss. A failed policy read must veto owned positives/candidates through the existing fail-closed wrapper.
- Keep a warm immutable feed cache while advancing the job generation; then test newer failed head with retained accepted payload, reader error, explicit disable including global scheduler off, healthy complete negative, no-projection failure, clock-only expiry, recovery and final-send equality/veto. No broad cache hit may hide a current change. Preserve unrelated siblings and exact tuple partition ownership.
- If narrowing SQL, compare old and new merge outputs for absent projection, empty accepted projection, both row families, large observations/episode-seed metadata, stale rows, negatives and failures. Assert the query returns head and payload together, includes `last_reason`, retains the projection key for empty results and avoids `SELECT *` on the customer path. Update SQL harnesses that currently recognize that exact string; do not let them silently return empty rows and produce a false-green test.
- Reuse `scripts/test-shopify-cohort-scheduler.mts`, `scripts/test-feed-source-freshness.mts` and `scripts/test-pilot-runtime-rollback.mts`; add focused context/pinned-reader tests because the existing route harness stubs scheduler policy reads. Preserve actual customer feed/coverage identity checks and bootstrap/reconfirmation/restock tests.
- Add bounded timings for pointer identity, immutable base read/unpack, SC policy/heads, scheduler policy/heads, retailer read, source composition/classification and trace writes. Report response shape/deployment/snapshot, cold versus warm/cache hit and sample count. Keep existing prepare/filter totals so results remain comparable. Avoid SQL text, source URLs, credentials or private row data in timing headers.

Accept the repair only after correctness suites and the baseline observation evidence remain intact, then compare normal customer responses from the same deployed version with an appropriately described sample set. Any measured improvement is scoped to those observations; no p95 or fleet-wide cost reduction claim follows from five sequential requests. Fresh source failure, disable, negative and expiry handling are release requirements regardless of the measured latency benefit.
