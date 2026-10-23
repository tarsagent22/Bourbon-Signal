# Feed serving cost: next bounded repair (#821)

Initial preparation analysis, 2026-10-23, inspected worktree head `8891a19ef512f5517bc504dc06a3403fb9abb1a9`. The analysis made no runtime, source configuration, admission, database, task, or release changes. The later preparation implementation and baseline evidence are recorded below; production source admission remains unchanged.

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

## Preparation implementation and verification update

The minimal context split is implemented in preparation commit `3ef31b3fe0c3b4a50c33cca5f05d07b1fd484d60`, with only `src/lib/source-scheduler.ts` and the new `scripts/test-source-policy-context.mts` changed. Customer drops, candidate consumption and final-send validation now request a single pinned `bottles` / `state-health` / `alerts` bundle and do not construct a `BourbonBible`. Collection continues to read its original four exports together, including drops, and retains matching Bible construction, broad-history episode continuity and bootstrap-zero delivery candidates. Shared policy guards are preserved. This preparation introduces no query optimization, cache change, instrumentation, collector change, or source activation.

Independent review approved the split. The 18 new actual saved-scheduler/wrapper regressions cover exact requested export lists, Bible/collector counters, shared fail-closed policy gates, torn snapshot IDs, current failures and canonical/state policy, expiry without a generation change, recovery, final-send field equality, and the released Jensen/Mission Trails pilot. Commit `bd708d87` wires the new test into the first `test:engine-dependability` tsx group; that combined group passed 21/21. The prepared remote head reported for this verification is `07f5884340cdac3d4dc489193dcb6911abb83d46`; it is not a claim that #821 is deployed.

The originally reported 201 relevant tests and typecheck were repeated with raw files saved at that prepared head, 04:11:56–04:12:09 UTC. Scheduler source SHA-256 `ad97a0e798f0b2d4bb022d21ad2f5de4fb0b82307d452e29deb95945d32b3f90` and focused-test SHA-256 `a1174a7c4ad345536f3d384cadc0137cb423668f5640fec41e66d857472ef575` match the reviewed implementation.

| Saved repeat | Result |
| --- | --- |
| Context, actual generic scheduler/customer/v2, normal-feed freshness and pilot rollback suites | 84/84 passed |
| Poll/pilot policy, Jensen collector and shared Shopify policy suites | 117/117 passed |
| `tsc --noEmit --incremental false` | Exit 0; empty stdout/stderr |

Raw logs and their command/clock/checkout/hash manifest are under `C:/Users/chand/projects/bs-feed-freshness-prep-20261023/.operator/feed-serving-cost-821-verification/`: `focused-84.stdout.log`, `policy-pilot-117.stdout.log`, `tsc-noemit.stdout.log`, matching stderr files, and `manifest.json`. These are saved repetitions, not retroactively attributed files from the earlier tool-transcript-only run. The shared collector remains unchanged at SHA-256 `82ec1ede939d793f40d7a945430f49c0867fdfadf18d4004c5775c8878e39206`. No elapsed serving benefit has been measured for the split.

## New production manifest evidence, separate from the local benchmark

Successful baseline run [39899012800](https://github.com/tarsagent22/Bourbon-Signal/actions/runs/39899012800) produced the locally preserved `C:/Users/chand/Documents/Bourbon Signal/shopify-shared-foundation-20261023-evidence/baseline/39899012800/coverage-premises-baseline.json`, captured at `2026-10-23T04:12:30.988Z` and bound to expected production commit `a86a0433c7b0b051761fdc5e3625128bbac42281`. Its active snapshot is `2026-10-23T03-40-10-771Z-fd2196a326946310` and its active manifest SHA-256 is `60d14a7d071542fa47f18677d02623e1b1388a6da45a7ce4e0d434523450519c`.

| Active production manifest descriptor | Plaintext bytes | SHA-256 |
| --- | --- | --- |
| drops | **49,049,948** | `3b06ace203d508aa72375fe0c45753cbff4e30561d39b61276f9b1e931592fce` |
| state-health | 30,477 | `658fc7c059a4b9b8481a3f62aa7bc0f96cf4ff2fe01f741a5b3044c783082927` |

The **49,049,948-byte production drops plaintext** is distinct from the **12,861,662-byte local bundled drops fixture** used in the CPU-only parse experiment. The prepared policy-only consumer no longer requests that drops export; collection still does. The production descriptor strengthens the priority of removing unnecessary payload processing, but provides no measured milliseconds saved or isolated bottleneck attribution.

Neither plaintext size is an encrypted wire-transfer measurement, the 1,345,156-byte packed public feed cache, or the roughly 35 KB normal feed response. The baseline's separate `readAccounting` records 42 object reads and 16,044,542 encrypted-and-manifest bytes across its multi-snapshot baseline capture. Those totals are not the cost of a single normal customer request, and must not be used as a per-request transfer-savings estimate. The original serving timings predate this active 03:40 snapshot and the prepared context split; they are not a before/after comparison of the repair.
