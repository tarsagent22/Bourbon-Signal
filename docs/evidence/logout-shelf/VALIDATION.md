# Logout and shelf statistics

Owner screenshots show the startup recovery page after logout and the inline Stats link beside the bottle count.

Root Expo Router `Stack.Protected` now owns member-route removal and history cleanup. The nested member navigator no longer swaps its Stack for a Redirect or changes its key during sign-out. An inner startup boundary preserves diagnostics for the same session and clears member-screen failure state when the Clerk identity changes; the outer provider/startup boundary remains intact. Existing account-specific API invalidation and push revocation before logout remain unchanged.

Collection stats now has a full-width 56-point action between the count and Shelf Highlights. It opens the existing whole-collection statistics sheet.

Validation: mobile `npm run verify` passed, including typecheck, regression suites and Android/iOS exports. New regressions execute the actual boundary's session reset logic and enforce root-protected navigation. Browser fixture checks at 390px and 320px show the button and its working statistics sheet. A deliberately failed member screen recovers to the actual Sign In screen when the fixture changes to signed-out identity. Screenshot: `stats-button-preview.png`.

Evidence limits: the browser substitutes Clerk, Expo Router navigation and native services. It does not prove physical-iPhone logout or the exact native failure. Device diagnostics were requested; physical-device acceptance is pending. The owner screenshot alone does not identify the exception.

Collection worth was proposed but was not shipped in the previous release and is not shipped here. The existing secondary ranges in `src/data/bottles.ts` are undated and lack sufficient provenance for trustworthy estimates. MSRP and secondary totals need reviewed pricing records, source dates and coverage; existing plan/design scope remains in `docs/product/collection-stats-scope.md`.
