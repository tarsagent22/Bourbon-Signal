# Historical CI site fixture after four-state admission

The checked-in site is the historical `a7401de0a51cca45` fixture: 24 states and 4,764 drops. The lifecycle now contains 28 active states. Required CI prepares only its missing structure before running the unchanged site verifier; it does not combine historic data with captured canary stock.

`scripts/prepare-legacy-site-fixture-ci.mjs` requires `CI=true`, `GITHUB_WORKFLOW=CI` and the CLI flag `--ci-fixture-only`. The helper also pins the historical run and clocks. The only invocation is an explicit step in `.github/workflows/ci.yml` before Build and verify. Package scripts, production refresh, state-integration/site validators, source code and provenance-bound files remain unchanged.

WA/NM/WI/OK receive empty partitions with exact hashes, zero signal/store/source counts, null freshness, disabled alerts, `ci_not_collected` labels and release-blocked quality rows. Index and coverage/quality summaries account for all 28 states. Existing 24 partition files and every inventory artifact remain byte-identical; old coverage/quality rows and all original generation/source clocks are preserved. No current clock, stock, alert, feed row or customer coverage is created.

The separate existing CI wrapper validates the 220 real issued four-state canary rows under their actual immutable manifests. Production still reads its real output. A legitimate complete empty actual partition can pass structural validation and earns zero new coverage; missing/corrupt actual partitions fail even while a valid positive canary is checked in. Publication acceptance separately requires positive exact-premise customer evidence before any new-store claim.

The fixture tests run the actual unchanged site verifier, check old-file hashes/clocks and empty partition hashes, exercise complete-zero/missing actual output, and reject ordinary/production helper invocation. The existing three CI isolation tests also verify absent/corrupt actual output and a corrupt CI partition. No source requests are needed.
