# Source checkpoints and local alert ordering

This document describes the retained optional checkpoint layer only, not the
independent live opportunity data plane. The trusted runtime/SQL vertical slice,
activation switches, rollback and operational commands are documented in
[source-lane-runtime.md](source-lane-runtime.md).

## Source checkpoints

`runSourceAdapters` optionally reads/writes private same-host checkpoints using
`BOURBON_SIGNAL_SOURCE_CHECKPOINT_DIRECTORY` (absolute path). Unset means off.
Tests can use `checkpointDirectory`; passing an empty string explicitly disables
checkpointing even when the environment variable exists.

For checkpointed engine adapters, the existing bounded source pool and scheduler remain the acquisition path.
Each completed source result is committed before waiting for sibling results.
A restarted runner restores a newer checkpoint rather than refetching a source
that is not due. Original observation and last-good clocks remain unchanged.
A restored result older than two hours is context-only and non-alertable. Source
URL, source ID and state bind the checkpoint identity. Current quarantine,
current caller circuit policy, disabled-source policy, collapse checks and
normal downstream source/lifecycle/publication gates still apply.

Each binding has one current JSON checkpoint, capped at 8 MiB. Writes take an
exclusive per-binding `.lock`, fsync a same-directory temporary file and atomically
rename it. A writer collision fails closed; equal-time conflicting data and older
results cannot overwrite the checkpoint. Exact duplicate replay is a no-op.
Checksums detect corruption, not malicious writes by someone with filesystem access.
Use a private directory, never `public/` or an exported site-data directory.
Windows directory ACLs must be provisioned by the parent/operator; POSIX mode
arguments do not establish Windows ACLs. No directory ACL changes occur here.

`checkpointErrors` contains sanitized codes. Failed writes also attach
`checkpointError` to the source result so collectors' result summaries retain it.
Storage failures do not retry collection or confer new alert authority. The
existing snapshot path remains usable; a checkpoint error means durability was
not established for that source. Storage read/configuration diagnostics are also
returned at the runner level. Callers must inspect these when enabling the feature.

An abandoned `.lock` deliberately blocks writes. After proving its writer is
terminated, the operator may move the lock aside and retry. Never delete a lock
based only on age. Atomic rename is process-interruption protection; power-loss,
network filesystems, multi-host operation and filesystem ACLs were not verified.
Bound retired-source files manually after reviewing them; no destructive retention
job is installed.

For read-only inspection, construct `SourceCheckpointStore` and call `read` with
the exact current adapter. This validates size, binding and checksum and does not
create directories or call a collector/provider. Do not print the raw result in
public logs. The automated test exercises this API and a separate Node process
replays a committed result without executing the producer.

## Member ordering

The existing delivery consumer now passes the member's normalized explicit bottle
preferences to `groupCandidatesByLocation` after canonical eligibility, rarity,
area and specific-bottle filters. A group with a watched child ranks first before
caps. Unwatched groups remain candidates; existing reliability ranking breaks
ties. Empty watchlists preserve legacy ordering. No member preferences are written,
no auto-watch occurs, and recipient scanning, tier gates, SMS consent, push ownership,
freshness and stable availability-episode dedupe remain unchanged.

No price model or good-deal threshold is introduced. This is not a fair demand-led
source scheduler or a guarantee that every non-watched opportunity will reach a
member before expiry.

## Proof and parent activation boundary

Run `npm run test:usefulness`. It includes real filesystem replay and an isolated
PGlite composition: source checkpoint -> restarted source consumer -> canonical
export/matching -> stable-v2 SQL reservation -> provider stub -> durable delivered
record -> duplicate suppression. Source/provider inputs are synthetic. Provider
acceptance is not device receipt. No network provider is called.

The composition invokes existing exporter/queue components in a test. It does not
mean production delivery reads checkpoints directly. The normal snapshot consumer
remains, alongside the separately gated SQL lane described below. Checkpointing reduces lost acquisition work, not demonstrated
member alert latency.

Parent prerequisites:
1. Review the frozen commit and incomplete criteria in the implementation report.
2. Provision a private durable directory for one existing persistent engine worker;
   GitHub-hosted ephemeral disks alone are insufficient. Do not add a competing job.
3. Keep delivery disabled for the checkpoint canary. Enable the absolute path only
   on that worker; exercise a narrow source and verify checkpoint errors, source
   clocks, restart/no-refetch and normal publication safety.
4. Retain regular snapshot reconciliation. Roll back by unsetting the checkpoint
   path; preserve files for audit. Revert the ordering change independently if needed.

## Separate bounded SQL pilot

The local patch also implements one Liquor Library SC store lane with two registered SKU
subjects. It polls inside the existing authenticated delivery invocation and commits
independently to six additive source tables. It is not a nationwide collector conversion
and does not consume these same-host checkpoint files. Canonical projections are merged
into alerts and the feed under coherent source/lifecycle policy; initial positive
inventory is visible but silently baselined for alerts. Episode/opening clocks and alert
lifetime are immutable; current quantity and confirmation have separate clocks.

Both source switches default off. After parent-owned migration/review/no-send proof,
SOURCE_LANE_STORAGE_ENABLED=1 retains durable subject ownership and
SOURCE_LANE_POLL_ENABLED=1 enables polling/promotion. Safe pilot rollback sets
SOURCE_LANE_POLL_ENABLED=0 while keeping storage reads on. Failure, expired policy,
snapshot mismatch and rollback must never revive owned older snapshot stock. Preserve
baselines, negatives and dedupe records. Unsetting the checkpoint directory is only a
checkpoint rollback, not a rollback of SQL ownership. See source-lane-runtime.md for
parent-only activation commands and private episode-stage metrics.

No feedback prompts, surveys, auto-watch, customer analytics UI, engagement emails or
new scheduler are introduced. Local SQL/build evidence is not production activation,
provider delivery or physical-device receipt. The fix pass performs no production writes.
