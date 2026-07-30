# Bourbon Signal Engine Foundation

Standalone data engine for Bourbon Signal. This folder is intentionally **not wired into the live Next.js app yet**.

## Primary workflow

```bash
cd engine
npm run bible           # build canonical bottle bible
npm run run             # collect configured state/control-board sources
npm run rare            # verify rare-signal coverage
npm run location        # report best extracted public location precision
npm run operational     # persist snapshot, diff previous run, rank alert candidates
npm run export:site     # write stable website-facing JSON contracts to out/site
npm run verify:pristine # repeatability + quality audit + tests
```

Browser-assisted collectors, run when their source artifacts need refreshing:

```bash
npm run ohlq            # Ohio seeded product availability via OpenClaw Chrome/CDP
npm run ohlq:discover   # Ohio rendered product discovery + availability collection
npm run or              # Oregon Liquor Search age-gated product/store drilldown
npm run browser:discover # generic rendered/API discovery for configured difficult states
```

## Measured state-expansion workflow

Broad state improvements use the repository-enforced task packet and timing ledger from the repository root:

```bash
npm run engine:expansion -- init --state=GA --objective="Increase fresh exact-store Georgia inventory"
# Fill only discoveryCommands, then execute the four read-only lanes.
npm run engine:expansion -- discover --packet=.operator/engine-expansions/GA/task-packet.json
# Use their artifacts to fill/freeze baseline, source dispositions, trust,
# customer path, acceptance floors, exact phase commands, and rollback.
npm run engine:expansion -- verify --packet=.operator/engine-expansions/GA/task-packet.json
npm run engine:expansion -- phase --packet=.operator/engine-expansions/GA/task-packet.json --name=contract-freeze
npm run engine:expansion -- phase --packet=.operator/engine-expansions/GA/task-packet.json --name=implementation
npm run engine:expansion -- summary --ledger=.operator/engine-expansions/GA/timings.jsonl
```

The `live-probe` and `production-verification` commands must finish by writing six numeric metrics (`knownStores`, `liveStores`, `alertGradeStores`, `representedAreas`, `freshExactStoreDrops`, and `alertableStaleRows`) to a JSON file and invoking:

```bash
npm run engine:expansion -- acceptance --packet=<packet> --metrics=<metrics.json> --phase=live-probe
```

The helper atomically binds fresh acceptance evidence to the run ID, frozen packet digest, phase, HEAD, diff, and—on production verification—current `origin/main`. The phase fails if it reuses an old artifact or misses a floor.

The runner requires a clean worktree based on current `origin/main`, creates an immutable run ID, requires a fresh state task packet and one writer, executes the four read-only discovery lanes with global concurrency at most three, prevents same-domain browser overlap, and records machine-readable durations/outcomes bound to the packet digest, state, base/head commits, diff digest, and configured-command digest. Phase commands are read only from the frozen packet—`--command` overrides are rejected. An exclusive writer lock and atomic attempt reservation prevent overlapping mutating phases. The runner enforces the contract-freeze → focused tests → one live probe → diff freeze → one full validation → one final review → guarded release order, evaluates the packet's acceptance floors from a fresh evidence artifact after live and production verification, and rejects repeated broad-gate attempts regardless of outcome. Use a narrow affected-test follow-up after a bounded finding; start a fresh run if the frozen contract itself changes.

Browser discovery is endpoint-only: images, fonts, media, ads, and analytics are suppressed while scripts/XHR/fetch stay available. It uses adaptive network settling and processes independent domains in parallel, with one page active per domain. Captured endpoint evidence or fixtures accelerate development but never count as current inventory.

Florida's independent top-level source lanes also run through a bounded three-way pool and retain source-level timings, while every lane remains sequential within its domain and continues to honor aborts, rate limits, freshness, and stale non-alertability.

## Stable website-facing contract

`npm run export:site` writes integration-safe files under `out/site/`:

- `manifest.json` — contract version and file/schema map.
- `stats.json` — totals, source caveat, precision/rare coverage summary.
- `bottles.json` — canonical Bourbon Bible-matched bottles only.
- `stores.json` — store-level locations extracted from inventory-capable sources.
- `drops.json` — normalized drop/watch/inventory signals suitable for test-mode UI.
- `alerts.json` — ranked candidate alerts only; these are **not sent** until alert policy is explicitly enabled.
- `nc-intelligence.json` — North Carolina ABC board/warehouse intelligence dossier and coverage summary.

Contract version: `bourbon-signal-site-v0.1`.

## Output families

- `out/bourbon-bible.json` — canonical bottle records and aliases.
- `out/signals.json` — normalized cross-state raw engine signals.
- `out/states/*.json` — per-state collector output.
- `out/current-snapshot.json` — operational normalized signal snapshot.
- `out/diff.*` — signal changes vs previous operational snapshot.
- `out/alert-candidates.*` — ranked candidate alerts/watch items.
- `out/location-hardening.*` — target vs achieved public location precision.
- `out/roadblocks.*` — explicit blockers and next routes.
- `out/source-slo-7d.*` — seven-day source-attempt SLO evidence; reports insufficient history until seven real day buckets exist.
- `out/optimization/source-run-history.json` — observed source results only; never backfilled with synthetic success history.

## Incremental source runtime

`src/sources/` standardizes source adapters, results, errors, bounded transient retry, per-source circuit breaking, and SLO evidence. It is integrated at the existing `run-state.mjs` boundary for configured sources and the California multi-retailer lane. Whole-state workers, adaptive scheduling, state partitions, snapshot publication, and recovery continue to use their existing modules.

Source-level stale fallbacks preserve their original `lastGoodAt` and observation timestamps and are non-alertable. Quarantined sources may collect diagnostic candidates but cannot emit inventory or watch alerts.

## Current scope

State/county targets: OH, OR, IA, UT, AL, VA, PA, ID, NC, NH, Montgomery County MD, ME, VT, MI, MT, WV, WY, MS.

The engine models signals honestly: store-level when public sources expose it, board/county/warehouse aggregate where that is the public ceiling, and catalog/policy/watch context when inventory is not public enough for alerts.

## North Carolina definition of done

NC is considered hardened when all of the following are true:

- Official/public-source-only policy is preserved in `out/nc-board-intelligence.json`, `out/site/nc-intelligence.json`, and `out/site/stats.json`.
- Board directory coverage is at least 170 ABC boards.
- Tracked board shipment coverage is at least 100 boards and 500 shipment signals.
- State warehouse radar emits at least one positive tracked-stock signal when the official warehouse page exposes one.
- Board website discovery finds at least 5 inventory/product-search/release-capable boards.
- Aggregate NC board/warehouse signals are never inventory-alertable; only exact store-level rows can become inventory alerts.
- Current NC roadblocks are 5 or fewer.

These checks are enforced by `npm run quality` and `npm test`; `npm run verify:pristine` remains the global all-state gate.

## Virginia definition of done

VA is considered hardened at the current scanner depth when all of the following are true:

- Store-level VA ABC `storeNearby` inventory probes produce at least 700 current VA signals.
- At least 250 VA rows are positive, store-level, inventory-alertable rows.
- Site export exposes at least 1,000 VA drops and 350 VA locations.
- Product-code coverage stays at or above the current two-code baseline until broader official product-code discovery is added.
- `1792 Small Batch Bourbon` canonicalizes to `1792 Small Batch`, never `1792 Full Proof`.
- Stale/closed ArcGIS store numbers do not create `No Store exists` inventory-probe roadblocks.
- Direct VA product/catalog page 403s are tracked as known source roadblocks, not treated as scanner failure.

Focused check: `npm run verify:va`.
