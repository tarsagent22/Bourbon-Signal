# Bourbon Signal Engine Reliability Runbook

## Service contract

- Refresh cadence: every 30 minutes.
- Production snapshot age SLO: at most 45 minutes.
- Active-state coverage: exactly 100% of `src/config/state-lifecycle.json#activeStates`.
- A candidate with missing states, failed states, schema errors, corrupt files, or an unverifiable production generation must not remain active.
- Last-known-good state reports and the previous complete snapshot are retained for containment and rollback.

## Independent detection and recovery

`.github/workflows/engine-watchdog.yml` probes the customer domain every 10 minutes. It performs two cache-bypassed checks of `/api/stats` and every active state partition. After two failures it dispatches `refresh-feed.yml`, preserves the watchdog report, and fails loudly so GitHub notifications alert the repository owner.

The watchdog also emits a GitHub warning annotation when production reports a rollback within the previous hour. Evidence is retained for 30 days. It suppresses duplicate dispatches while a refresh is queued or running. Set the repository variable `BOURBON_SIGNAL_AUTO_RECOVERY_ENABLED=0` as the global kill switch if automatic recovery itself is implicated in an incident.

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
- corrupt snapshot readback cannot activate; and
- rollback restores the prior complete snapshot.

Artifacts are retained for 90 days. Any failure blocks the drill and requires investigation before engine expansion.

## Verification commands

```bash
npm --prefix engine run verify:reliability
npm --prefix engine run drill:recovery
npm run test:ops
npm --prefix engine run test:data-plane
npm run build
npm run watchdog:engine
```

## Ownership and targets

The product engineering owner is responsible for collector correctness, lifecycle promotion, and recovery-drill failures. GitHub Actions owns scheduled detection and guarded dispatch; Vercel serves the verified remote snapshot. Target detection time is 10 minutes and target automated recovery initiation is 20 minutes or less.
