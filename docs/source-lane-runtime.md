# Trusted runtime source opportunity lane

Status: implemented locally; production migration, activation and device proof have NOT been performed. Both new switches default off. This is distinct from the optional same-host checkpoints in source-checkpoints.md.

## Runtime and authority

The existing authenticated `/api/alerts/deliver?cron=v3` invocation calls `pollRuntimeSourceLanes` before reading candidates. The initial registry is one exact Liquor Library SC Square store, with two reviewed product/variation identities in `SOURCE_LANES`. Historic fixture data supplies identity only, never current stock, price or timestamps. All current observations come from injected/native fetch through the existing Square parser. No new scheduler, source-upload API, secret, or provider call in the poll.

The bounded request set contains the registered location, at most seven catalog pages and the reviewed SKU URLs. Redirects and unregistered URLs are rejected; transport has a 20-second abort, 1 MB/body and 6 MB/run bounds. SQL enforces a 45-second lease, five-minute cadence, exponential failure backoff and Retry-After. Sources commit independently before their promises settle. The source registry currently contains one lane; demand sorting does not imply a measured multi-source latency benefit.

A coherent, current remote snapshot and fresh non-fallback SC operating policy plus lifecycle authority are required. Bottle identity/tier comes from the coherent Bottle Bible export. The shared exporter constructs and applies the normal inventory alert policy. No Regular/standard/common/core inventory alert promotion.

`source_lane_commit` is a single PL/pgSQL transaction invoked through the existing Neon executor, not separate BEGIN/COMMIT HTTP calls. It fences owner/generation/revision, rejects conflicting replay and non-newer observations, and commits immutable batches, subject state and opportunities atomically. Replay cannot renew freshness. Positive reconfirmation updates current quantity and `lastConfirmedAt`, never the episode's observed/signal/firstSeen/display/first-accepted clocks or two-hour alert expiry. The subject JSONB stores the latest canonical `sourceDrop` and a separate `confirmationExpiresAt`; verified fresh inventory remains visible even after the episode stops being an alert opportunity. Explicit identity-bound zero creates a retained tombstone. Omission/unknown/error never means sold out. Initial positive inventory and new subject admission are visible canonical feed evidence but silent alert baselines; negative-to-positive opens a canonical restock using `sourceRuntimeId=precision:sc`.

## Consumption and rollback

`readAlertCandidateBatch` joins the durable lane with the normal national candidates. The lane owns only admitted source/store/bottle scope; overlap is replaced rather than relabeled and duplicated. Existing member relevance, channel guards, queue and push outbox remain in use. Durable veto is checked before reservation and immediately before email/SMS/push provider invocation after preparatory awaits, including ownership work for each push chunk. Attempt telemetry is recorded after the actual invocation, carrying its captured attempt time; failed calls preserve existing uncertainty handling. `/api/drops` uses durable covered-subject ownership even when no overlay is eligible: failures, unknowns, expired/mismatched policy and promotion rollback never restore owned snapshot stock. The feed uses the latest healthy, fresh subject projection, including a silent positive baseline, with a versioned pagination identity. On-site records are revalidated before inbox persistence.

`SOURCE_LANE_STORAGE_ENABLED=1` enables durable reads, including retained vetoes. `SOURCE_LANE_POLL_ENABLED=1` additionally enables collection and positive promotion. Both are required for activation. Rollback means POLL=0 while STORAGE stays 1; never delete source state, baselines, queue/outbox rows or tombstones. Rolling back the code to a version without the durable reader would remove veto protection and is not the safe feature rollback.

Dry-run, shadow and baseline calls never poll. Dry-run/shadow do not acquire/write the queue, live member leases, demand, inbox, provider or heartbeat. They may read durable state. The source switches do not change existing channel consent, phone verification, entitlements or push device ownership.

## Private measurement

Protected GET `/api/ops/source-usefulness` uses the existing dedicated scorecard bearer capability. It exposes aggregate distinct episodes/stores by source and area, health/reasons, bounded inspection accounting and stage latency samples/skew diagnostics. It does not report device receipt, source event time, opens, purchases or inferred effectiveness. Stage telemetry is best-effort and cannot reverse provider acceptance. Original observation/acceptance and first/last considered/reserved/provider-stage times remain in private durable storage.

`windowComplete` describes only the bounded SQL opportunity/trace query window. `endToEndComplete` is always false: telemetry is best-effort episode-stage evidence, not a per-recipient outcome audit. `provider_failed` means an actual call failed or returned an explicit rejection, not proof that an uncertain send never arrived. `onsite_committed` is emitted only after successful inbox persistence. Physical-device receipt remains unavailable.

The existing bounded recipient scan collects only explicit joint area×canonical-watchlist membership. Owner/retailer/test accounts are excluded; an incomplete, truncated or nonzero-cursor scan cannot publish a complete cohort. Cohorts require five distinct members and fresh complete data; unavailable/small/stale demand is neutral. No raw member IDs, contact details or raw watches are persisted. Every registered source retains an attempt floor; watch-matched eligible groups sort before caps without changing eligibility.

## Operator commands (parent only; NOT executed against production)

From the reviewed release checkout with the existing secure database environment:

    npm run migrate:app-storage
    npm run migrate:app-storage:apply
    npm run migrate:app-storage

The apply command enrolls the additive schema in the existing transactional CLI. Parent must verify production DB functions/tables and perform no-send runtime checks before activation. Runtime does not run DDL.

After managed issue/objective and independent review gates, from clean synchronized main using the existing release-lane wrapper:

    npm run release:production:code-only
    npm run verify:production-live

Configure only these non-secret switches, from a checkout already verified as linked to Vercel project `bourbonsignal` in scope `tarsagent22s-projects`. The following are parent-only commands, not commands executed during implementation.

After migration, enable durable reads without polling:

    vercel env add SOURCE_LANE_STORAGE_ENABLED production --value 1 --no-sensitive --force --yes --scope tarsagent22s-projects
    vercel env add SOURCE_LANE_POLL_ENABLED production --value 0 --no-sensitive --force --yes --scope tarsagent22s-projects
    npm run release:production:code-only

After authorized no-send proof, activate:

    vercel env update SOURCE_LANE_POLL_ENABLED production --value 1 --yes --scope tarsagent22s-projects
    npm run release:production:code-only
    npm run verify:production-live

Safe rollback (retain STORAGE=1):

    vercel env update SOURCE_LANE_POLL_ENABLED production --value 0 --yes --scope tarsagent22s-projects
    npm run release:production:code-only
    npm run verify:production-live

Read back the private ops aggregate and deployed effective poll flag after every configuration/release change; merely updating project environment does not update running deployments. Initial off deployment can leave both switches absent. Never rotate cron/delivery secrets or mutate the five-minute cron for this feature.

Production migration privileges and real cron authentication are parent verification, not asserted missing. Device delivery and live source/provider latency remain unmeasured until authorized production proof.

## Local evidence and limitations

Run `npm run test:usefulness` for parser, PGlite transaction/concurrency/episode tests, feed overlay, actual matcher/queue/stub-provider composition, relevance and aggregate metrics. Run `npm run test:alert-delivery-policy`, `npm run test:release`, `npm run test:astra`, `npx tsc --noEmit --pretty false`, `npm run verify:ci`, and `npm run build`.

The provider in composition tests is explicitly synthetic. PGlite executes real PostgreSQL functions and queue statements but is not multi-session PostgreSQL, production Neon or physical-device proof. The fix pass also rebuilds its SQL test adapter from the latest tests against the parent's isolated PostgreSQL 16 instance. Exact commands, results and remaining limitations are in `fix-results.md` and `fix-results.json` under the bs-usefulness report directory; those reports, not this document, determine verification status.

The Next webpack build uses `scripts/build/ms-registry-boundary.cjs` for one exact evidence-pinned MS collector. It transforms only the static registry load in build memory. Historical collector/policy/evidence bytes and the MS verifier remain unchanged. `scripts/test-ms-bundle-boundary.mjs` verifies pinned hashes, an exactly reversible loader transform and bundled policy parity; `verify:ms` and the full production build remain required gates. No filesystem or global runtime hooks are installed.
