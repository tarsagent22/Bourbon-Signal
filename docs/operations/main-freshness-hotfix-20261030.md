# Current-main freshness preparation

This independent change starts from merged main
`9a6e0ec0bbf74ede2d69cf9cc37e02d7ae4d5cd2` (M), which admits 28 customer-active
states. It does not admit the pending five states or change the four previously
admitted states' source authority, customer filters or evidence. Source requests,
provider changes, production activation and new customer stores in this preparation:
zero.

The prepared changes are:

- Pennsylvania reuses a whole FWGS artifact for at most 25 minutes and a chunk for
  at most five minutes, using original source clocks. A browser failure cannot
  advance the successful clock. The unchanged 120-minute publication ceiling,
  completeness floors and prior complete-artifact preservation still apply.
- New York's exact five registered native pickup descriptors have a 30-minute
  healthy cadence. Only their known successful null-HTTP legacy four-hour ledger
  entries migrate. A denial, failure, unknown hold or same-source roadblock keeps
  its existing scheduling behavior; force behavior is unchanged.
- The GitHub continuation and harmless smoke workflows are added with the feature
  flags off and maintenance on by default. They cannot collect or publish stock.
  Their production dispatch always has empty state/source/VA scope, force false
  and recovery zero. Manual bootstrap requires actual current-main full-fleet
  acceptance accounting for all currently admitted customer-active states.
  Legitimate zero, degraded, quarantined or disabled states add no current-store
  claims. The trust predicate is unchanged by that generic description.

This scope excludes the pending expansion's consumer and canary-builder repairs,
new source hooks and source-step cap change. The main refresh workflow remains
byte-identical to M: collection parent 22 minutes, export 25 minutes, browser 30
minutes and job 80 minutes. The root package and all source permissions are
unchanged. A later larger fleet needs its own reviewed capacity configuration.

## Timing limits

The PA planning model uses 25 minutes admitted source age, then 30 minutes for
collection/export/verification, a 15-minute continuation wait, 18 minutes of cold
FWGS collection and another 30 minutes after the browser. This totals 118 minutes
against the unchanged 120-minute publication ceiling. The steady cold cycle is
111 minutes. The former 90-minute reuse policy could reach 183 minutes before a
replacement. These are offline timing envelopes, with only two minutes of initial
margin and nine minutes in the steady model. Queue delay, a slower provider or a
longer collector can still exhaust the margin. Repeated actual unattended
publication and exact customer-path acceptance remain required; no cadence or
availability guarantee follows from these tests.

## Current-main proof noninterference

The adjacent evidence file
`engine/data/source-evidence/main-freshness-hotfix-20261030/current-four-noninterference.json`
records a fresh offline comparison to an exact detached M checkout, not to the
pending expansion branch. Each original WA/NM/WI/OK issuer ZIP SHA-256 matches the
state manifest's immutable provenance and its archived JSON. The exact JSON inside
each ZIP matches the archived issuer fields and bundle digest.

All 106 unique checked-in paths from those actual issued file lists remain
byte-identical to M. The original generated candidate/site digests are recorded
separately and were not recreated or retimed. Admission-era differences already
present in M relative to the inactive issuer are explicitly listed; this audit
does not relabel them as original source-byte equality. Fresh imports also
produce equal runtime metadata, closed-cohort hashes and semantic manifest hashes
for all four states. No source-proof equality exception is added.

## Local verification

With a fetch tripwire installed, 67 PA/NY/continuation tests and 30 metro-denial/MS
boundary tests passed. The Ops verifier, automation registry verifier and MS
research verifier passed. The sealed local Bible used by the MS research check
has SHA-256 `20156d9a3c3406dc46da9410151fa9094f05bf3cd0881e2e8c89d04e9da3233b`.

No environment, variable, workflow state, dispatch or retailer request was changed.
Before enabling continuation after a guarded release, configure the reviewed
main-only zero/15-minute environments and run the harmless five-producer immediate
chain plus two-producer paced chain. Confirm actual elapsed wait, exact provider
run IDs, ZIP digests and terminal stop, then obtain a real accepted current-main
adaptive full-fleet run for bootstrap. Check/dispatch deduplication is best effort;
the existing refresh concurrency is the serialization boundary. An unknown POST
outcome halts and must not be blindly resent.
