# Nearby discovery — OTA release

Nearby is compatible with the existing iOS live-labels runtime. It adds no native dependency, permission or runtime change. City/state and ZIP lookups use Zippopotam.us; native Maps opens externally for each exact store. The previous unreleased native-map implementation has been replaced.

The actual screen uses Bourbon Signal typography and charcoal/amber surfaces, a manual location picker, immediate local radius changes, searchable reports, watchlist/rarity/age controls, virtualized store cards, expandable bottle details and external maps/directions. Manual location is retained using existing SecureStore. Search requests debounce and stale completions cannot replace newer results. Radius and watchlist changes do not issue new API requests.

The backend preserves the canonical feed authorization and filters, scans source pages within a bounded budget, and reports incomplete searches explicitly. Only exact-address report matches with valid non-placeholder coordinates are shown; contradictory coordinates are excluded. Directory-only stores do not create inventory results. Store coordinates are incomplete; results are not a comprehensive inventory guarantee. Distance is straight-line from an approximate city/ZIP center.

## Verification

Web/mobile type checks and targeted distance, exact-premise, coordinate conflict, lookup, watchlist, client and filter checks pass. The actual screen browser preview builds with synthetic data in scripts/nearby-preview. Work settings block browser access, so visual/tap-through and physical-phone acceptance remain unverified. A successful OTA manifest confirms provider delivery only.

Release evidence and final OTA identifiers are recorded with the task. Existing native configuration and dependency files must remain byte-equivalent to the current production baseline. No App Store submission or new native build is required.
