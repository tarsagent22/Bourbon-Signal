# Radar redesign preview

Run from `apps/mobile`:

```sh
node scripts/radar-preview/build.mjs
python -m http.server 4387 --bind 127.0.0.1 --directory dist/radar-preview
```

Open http://127.0.0.1:4387. This bundles the actual Radar screen through React
Native Web. Only API, routing, safe-area and native push boundaries are replaced
with synthetic fixtures. It does not read or write customer data and is not an
application entry or an OTA payload. Preference changes last until reload.

Scenarios: `?scenario=current`, `denied`, `free`, `setup`, or `save-error`.
Default reproduces zero recent alerts with three unread past alerts.

`?scenario=phase1` shows compact single-bottle, grouped, and Community rows.
It supports the alert action menu, individual bottle muting, Undo, and the
searchable Muted bottles manager. The fixture stores preferences only until
reload; server persistence and queued-push filtering are covered separately by
`npm run test:bottle-mutes` from the repository root.

## Verification — 2026-10-03

- Mobile `npm test`: 343 main tests and 35 Astra tests pass.
- Mobile `npm run typecheck`: passes.
- Root `npm run test:native-thin-slice`: passes.
- Mobile `npm run export:ios`: passes.
- Browser refinement checks: inspected the 390px Alerts / Alert preferences layout;
  expanded past alerts while recent alerts remain visible; archived a past alert
  and verified its count; saved bottle tiers and checked the overview summary;
  opened Notifications directly through Fix and returned to the three-row overview.
- Earlier baseline checks covered bottle search, location save, notification controls,
  detail expansion, failed saves, and free membership gates.
- Physical iPhone interactions, native permission prompts, delivery of actual
  notifications, and OTA publication are not verified by this fixture.

This local refinement is based on current main and excludes the separate unfinished membership audit. This change does
not change server matching policy or membership entitlements. Selected rarity
tiers still apply to specific-bottle watches as well as discovery mode.
