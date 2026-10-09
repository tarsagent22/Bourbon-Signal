# Beta usability fixes — October 9, 2026

Prepared from `origin/main` at `aa4785584cdfad206a864d4b82325c3a8a49070c` in an isolated checkout.

## Changes

- Opening Home's State or Location dropdown dismisses the keyboard and reveals clipped choices. The menu adapts to the measured viewport, keeps its trigger visible, and respects reduced motion. Android measurement views are retained explicitly.
- The existing NC location choices show county first, then the canonical ABC board and official store towns. Forsyth County shows Triad Municipal ABC and Winston-Salem. Radar's existing board search accepts county, town and board names; its existing Board chip reads ABC area. No new controls were added.
- Email verification in sign-in and signup says exactly: “Enter the one-time code sent to your email address.” Text-message, authenticator and backup-code instructions name their respective methods.

## Geography and alerts

All 173 board identities remain selectable. The county labels come from the NC ABC Commission's board profiles; town labels come from its official store directory. Board profiles identify the office county, not a complete geographic boundary. The display labels do not select every board in a county or claim inventory coverage. Multiple boards in a county remain separate choices.

Values, monitoring IDs and saved labels stay canonical. The alert/evidence alias registry was not changed. Earlier clients receive a combined county-and-board label so they can distinguish boards even without subtitle support. Census counties without a corresponding board are not fabricated as board destinations.

Refresh the presentation metadata with `node scripts/sync-nc-board-localities.mjs` and verify it with `npm run test:nc-board-localities`. Production does not fetch the Commission at runtime.

## Verification

- Mobile suite: 426 passing tests, including dropdown positioning cases.
- Mobile and root TypeScript checks passed.
- NC locality, board completeness, alert matching and historical shipment tests passed. These cover all 173 boards, conflicting same-name boards, 27 alert candidates and 563 historical shipment rows.
- Mobile Signal API contract passed; nationwide geography and monitoring scope tests passed (16 tests).
- iOS and Android JavaScript exports passed. These are build checks, not production-configured OTA or physical-device acceptance.
- Browser fixture: selected Forsyth County retains Triad Municipal ABC; the short-screen menu scrolls into view, stays within the viewport and keeps the trigger visible. Narrow-width presentation was inspected.

An additional legacy `test-nationwide-radar-contracts.mts` source-contract check fails because it still requires `compactMonitoringScopes` in Radar; that token is already absent at the unchanged baseline. No unrelated behavior was changed to satisfy that obsolete assertion.

## Release status

Not merged or published. The host's guarded release registry contains three existing objective locks for bottle-photo mappings, native signup/membership/push, and the iPhone startup crash. No other task's checkout, objective or release lock was changed. Reconcile the shared lane before preparing the production PR and backend/OTA release. Physical iPhone/Android interaction remains unverified.
