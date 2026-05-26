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
