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
Default reproduces zero current matches with three unread historical matches.

## Verification — 2026-10-03

- Mobile `npm test`: 342 main tests and 35 Astra tests pass.
- Mobile `npm run typecheck`: passes.
- Root `npm run test:native-thin-slice`: passes.
- Mobile `npm run export:ios`: passes.
- Browser: inspected 390px layout; Current/History separation; marking shown
  historical matches read; bottle search and adding a watch; location editor,
  statewide selection and save; notification controls; detail expansion;
  failed save messaging; denied-permission recovery; free membership gate.
- Physical iPhone interactions, native permission prompts, delivery of actual
  notifications, and OTA publication are not verified by this fixture.

The release is based on current main and excludes the separate unfinished membership audit. This change does
not change server matching policy or membership entitlements. Selected rarity
tiers still apply to specific-bottle watches as well as discovery mode.
