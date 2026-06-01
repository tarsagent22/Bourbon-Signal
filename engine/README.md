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
