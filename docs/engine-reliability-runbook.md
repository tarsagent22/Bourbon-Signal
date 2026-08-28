# Bourbon Signal Engine Reliability Runbook

## Service contract

- Refresh cadence: every 30 minutes.
- Production snapshot age SLO: at most 45 minutes.
- Active-state coverage: exactly 100% of `src/config/state-lifecycle.json#activeStates`.
- A candidate with missing states, failed states, schema errors, corrupt files, or an unverifiable production generation must not remain active.
- Last-known-good state reports and the previous complete snapshot are retained for containment and rollback.
- Source collection SLO: strictly greater than 98% successful eligible source attempts over a real seven-day evidence window.

## Source failure isolation

Configured state sources (including `apiCandidates`) and the California multi-retailer lane use the shared source runtime under `engine/src/sources/`. The legacy precision dispatcher also runs through one shared, state-scoped precision adapter for each supported state, so a failed precision lane cannot stop configured or sibling state sources. Each adapter returns the same result envelope and error taxonomy. A throw, timeout, malformed response, or volume collapse is contained to that source while sibling adapters finish through the existing bounded worker pool.

Only transient and timeout failures receive bounded retries. Malformed, collapsed, permanent, and unexpected failures fail closed without retry. Repeated source failures open a per-source circuit whose state persists in the existing state report; after cooldown, one half-open attempt may close it. State run locks, state scheduling, partitions, immutable snapshots, rollback, and the recovery watchdog remain the enclosing orchestration.

Retained last-good data keeps its original observation and `lastGoodAt` timestamps. Stale and quarantined results are forced non-alertable (`canAlertAsInventory=false` and `canAlertAsWatch=false`) even when their diagnostic rows remain visible.

Each engine run appends every actual standardized source attempt (including retry attempts) to `out/optimization/source-run-history.json` and writes `out/source-slo-7d.json` plus `.md`. The JSON report carries both per-source and per-state evidence. Not-due, disabled, and quarantined diagnostics are excluded from the success denominator. A configured quarantine remains the public runtime status even when its diagnostic probe succeeds, times out, or fails; the result always carries `ok=false` and any underlying error for recovery work without reducing the SLO denominator. The report remains `insufficient_history` until the history spans the full window and contains eligible observations in all seven day buckets; no pre-launch or missing history is backfilled.

### Runtime coverage and intentional exceptions

The standard adapter boundary covers ordinary configured URLs, API candidates, each California Shopify retailer, and the state-scoped legacy precision lanes `KY`, `OH`, `OR`, `IA`, `UT`, `ID`, `AL`, `NC`, `IL`, `IN`, `TN`, `AZ`, `NV`, `FL`, `SC`, `TX`, `VA`, `PA`, and `MD-MONTGOMERY`.

The following remain outside an individual shared-adapter boundary and must not be described as per-source SLO evidence:

- `engine/src/ohlq-browser-collector.mjs`, `engine/src/fwgs-browser-collector.mjs`, `engine/src/fwgs-browser-full.mjs`, and `engine/src/or-browser-collector.mjs` are standalone CDP/browser artifact builders. They run as bounded preflight jobs and publish local artifacts, rather than returning a `collectState` source result or accepting the source-runtime abort contract.
- `engine/src/collectors/north-carolina-intelligence.mjs` is covered by the `precision:nc` lane, but its individual board, PDF, and warehouse subrequests remain a monolithic sequence; separating them needs explicit source identities and safe checkpointing before they can have per-board circuits or quarantines.
- `engine/src/collectors/costco.mjs` is a local, verified-observation artifact normalizer, not a network collector. Its upstream monitor must emit its own evidence before it can become a source-runtime adapter.

## Independent detection and recovery

`.github/workflows/engine-watchdog.yml` probes the customer domain every 10 minutes. It performs two cache-bypassed checks of `/api/stats` and every active state partition. After two failures it dispatches `refresh-feed.yml`, preserves the watchdog report, and fails loudly so GitHub notifications alert the repository owner.

The watchdog treats `refreshHealth.retryStateIds` from the published operating contract as authoritative targeted-recovery evidence even when the process stayed alive and the snapshot still serves successfully. A run that finished but published zero-customer, collapsed, or stale-useful recovery states is therefore unhealthy until a bounded targeted retry or a later healthy snapshot clears the same state IDs.

The watchdog also emits a GitHub warning annotation when production reports a rollback within the previous hour. Evidence is retained for 30 days. It suppresses duplicate dispatches while a refresh is queued or running. Set the repository variable `BOURBON_SIGNAL_AUTO_RECOVERY_ENABLED=0` as the global kill switch if automatic recovery itself is implicated in an incident.

Repeated unchanged incidents use bounded exponential redispatch backoff and then open a temporary incident circuit instead of either spamming duplicate refreshes or suppressing recovery forever. The immutable incident fingerprint remains the deduplication key; the backoff and circuit window are derived from recent GitHub workflow history so the guard survives runner restarts.

## State kill switches

Repository Actions variables provide state-level containment without a code deployment:

- `BOURBON_SIGNAL_QUARANTINED_STATES`: comma-separated state IDs. Collection continues for diagnostics, but the candidate cannot replace the prior state report.
- `BOURBON_SIGNAL_DISABLED_STATES`: comma-separated state IDs. Collection is skipped and the existing state report is preserved.

Examples: `TX` or `TX,FL`. Remove the state from the variable after the collector is fixed and a shadow/canary check succeeds. Do not remove an active state from the lifecycle merely to hide a failure.

## Expansion gate

`npm --prefix engine run verify:reliability` blocks CI and refresh publication when:

- projected collector runtime exceeds the 30-minute cadence minus the 5-minute safety margin;
- a new customer-active state lacks shadow/canary promotion evidence;
- active-state lifecycle metadata is inconsistent; or
- the versioned reliability policy is malformed.

New states must progress through discovery, probeable, shadow, canary, active, and finally alert-grade operation. A new active entry must include `promotionStage: "active"` and `promotionEvidence` with successful shadow runs, canary runs, and a verification timestamp.

## Publication failure

1. Do not mutate or delete immutable snapshots.
2. Confirm the refresh workflow preserved the last-known-good snapshot.
3. Inspect the publication artifact and production regression output.
4. If production verification failed, the workflow invokes `publish-site-snapshot.mjs --rollback` and fails.
5. The next idempotent rollback republishes the immutable pointer event, preventing a stale mutable Blob pointer from masking recovery.

## Recovery drill

`.github/workflows/engine-recovery-drill.yml` runs monthly and can be manually dispatched. It is simulation-only and never touches production. It proves:

- collector collapse preserves the prior report;
- recovery starts at the earliest stale stage;
- interrupted control-plane execution resumes from the persisted checkpoint after stale lease takeover;
- corrupt snapshot readback cannot activate; and
- rollback restores the prior complete snapshot.

## Control-plane continuity

`engine/src/refresh-site.mjs` persists a fenced control-plane journal at `engine/out/control-plane/refresh-session.json`. The journal records the planned stages, the current lease owner, heartbeat/expiry, completed checkpoints, and the last failed stage. The workflow retries a failed refresh once on the same runner, where completed-stage outputs and the journal share one filesystem; that retry resumes from the next incomplete stage only after the prior process is dead or its lease expires. A stale owner is fenced from writing new checkpoints or final status after takeover.

The journal is uploaded with refresh diagnostics but is deliberately **not** restored as a cross-run cache. A clean GitHub runner does not necessarily have the intermediate outputs named by an older journal, so a new workflow run safely replays the idempotent stages instead of skipping work from metadata alone. The journal does not weaken publication gates: export, verification, release-lane, snapshot activation, rollback, and production-readback checks remain fatal.

Artifacts are retained for 90 days. Any failure blocks the drill and requires investigation before engine expansion.

## Verification commands

```bash
npm --prefix engine run verify:reliability
npm --prefix engine run drill:recovery
npm run test:ops
npm --prefix engine run test:data-plane
node --test engine/test/source-runtime.test.mjs engine/test/source-slo-report.test.mjs engine/test/source-runtime-integration.test.mjs
npm run build
npm run watchdog:engine
```

## Ownership and targets

The product engineering owner is responsible for collector correctness, lifecycle promotion, and recovery-drill failures. GitHub Actions owns scheduled detection and guarded dispatch; Vercel serves the verified remote snapshot. Target detection time is 10 minutes and target automated recovery initiation is 20 minutes or less.
