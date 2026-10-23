# Ohio dependency triage: frozen 09:40 audit

Read-only bounded inspection. No network, production SQL, Ohio source request, credential read, worker-state read, task/environment change, dispatch or tracked edit. Machine-readable facts and source hashes are in `oh-dependency-triage-0940.json` beside this file.

## What the frozen evidence proves

The frozen audit covers 41 captures through slot 40, with audit time `2026-10-23T09:36:33.956Z`. Ohio reports `dependency_unavailable` / `browser_artifact_unavailable` in all 41. The last capture is run `39932638042`, artifact `12492796102`, at `09:33:07.076Z`, bound to release `a86a0433c7b0b051761fdc5e3625128bbac42281`. Its saved JSON SHA-256 `01ffe3b279ba708843039cbd7372f098f6ca4ba926c8d14b3179a7fe5b6cfc0f` was independently recomputed and matches.

At that capture, `oh:browser-artifact` generation 316 has no accepted timestamp, 30 failures, no feed rows/candidates, last attempt `08:45:20.505Z`–`08:45:21.866Z`, and next-due/pause `09:45:21.866Z`. The incident first appears `2026-10-09T03:35:22.232Z` and has 316 occurrences. These are saved timestamps, not a live health statement.

The health label is derived from source kind `oh-probe` and last reason (`src/lib/source-acceptance-health.ts:8`). It is not a precise root-cause code. The captured run accounting contains `probe:true` and `trigger:scheduled`, without backend choice, artifact generation clock or validation failure detail.

## Concrete pre-existing wiring defect

`src/lib/source-scheduler.ts:23` imports the Blob-only `readLatestOhlqWorkerEnvelope` and the OH branch calls it at `:90`. That reader searches `source-artifacts/ohlq/latest/` in Blob (`src/lib/ohlq-worker-artifact-store.ts:104`). Missing artifact or age greater than one hour fails the scheduler probe; other artifact-named reader failures collapse into the same classification.

In contrast, upload and authenticated download use `ohlqWorkerArtifactBackend()` in `src/app/api/source/ohlq/artifact/route.ts:19` and `:25`. The selector (`src/lib/ohlq-worker-artifact-database.ts:25`) chooses the existing application database whenever any configured application database URL is present, with Blob used only when no database is configured. Its precedence matches the scheduler SQL executor. Production scheduler SQL health is evidence of a working application database configuration, so the probe and upload/download paths have inconsistent authority in this deployment shape. The documented contract explicitly requires one authoritative backend, with no fallback merely because one is unreachable (`docs/ohlq-persistent-worker.md:70`).

This establishes a code defect that can make a valid database artifact invisible to the probe. It does **not** establish that any fresh artifact currently exists in the database or that this defect alone caused generation 316 to fail. Frozen evidence cannot distinguish empty/stale/malformed Blob evidence, a rejected artifact, a stopped worker, an upload/authentication/configuration problem or legitimate source access denial.

No specific missing key, worker bootstrap, current cooldown or access authorization can be diagnosed from these captures. Code supports all of those failure paths; their existence is not evidence that one occurred. No credential/profile/task inspection was performed.

## What a repair would and would not accomplish

The current OH branch returns `signals:[]`, `probe:true`, and `dependencyReady:true` when a fresh artifact is usable. Its scope matcher excludes `oh-probe`; a successful probe does not ingest Ohio stock, create alert candidates or count physical coverage. Actual Ohio ingestion remains the broad refresh's authenticated worker-artifact hydration (`.github/workflows/refresh-feed.yml:209`, `engine/src/ohlq-worker-artifact.mjs`). Targeted Ohio hydration is required; other states may retain Ohio as stale/non-alertable when the dependency fails.

A bounded preparation repair is feasible without any Ohio endpoint request or new access: share the existing authoritative durable-reader selection between the API and scheduler, retain its schema/digest/clock gates and the scheduler's one-hour threshold, and emit only sanitized backend/missing/stale/invalid dependency diagnostics. Never silently fall back to an old Blob copy when the database is selected. Do not widen freshness or reclassify a missing artifact as healthy.

One integration caution: `readLatestOhlqWorkerEnvelopeFromDatabase()` currently calls `ensureSchema()` before SELECT (`src/lib/ohlq-worker-artifact-database.ts:111`). That issues CREATE TABLE/INDEX IF NOT EXISTS. Reusing it is not a strictly SELECT-only diagnostic; make any schema/read-path change explicit and verify provisioning, rather than claiming zero-write behavior. Neither that reader nor the Blob reader was called during this triage.

Meaningful offline tests should load the actual scheduler with injected stores: a fresh database artifact with empty/different Blob must be selected when the database is configured; selected-database failure must not use Blob; Blob-only deployments remain supported; missing/stale/malformed/digest-invalid evidence remains unavailable; boundary clocks retain current semantics; a successful OH probe produces no inventory/candidates; other sources and cooldowns are unaffected. Existing store tests prove backend selection and immutable digest ordering but do not exercise the scheduler's direct import (`scripts/test-ohlq-worker-store.mts:140`).

Rank the authority-alignment/diagnostic repair immediately after the active #821/retailer-baseline delivery, ahead of speculative new platforms. Keep it separate from frozen PR #824. It is a concrete shared-infrastructure correction with inexpensive offline proof, but its production benefit is conditional on real worker evidence: no fresh database artifact or recovered Ohio inventory is claimed. Worker collection/access remediation remains unknown and is lower-confidence work until an authorized status/artifact-metadata review establishes the actual blocker. No denied-source retry, cooldown bypass, new credential, business contact or permission change is justified by this report.
