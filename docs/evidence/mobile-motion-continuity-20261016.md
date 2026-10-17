# Mobile motion and continuity

The selected background is the travelling wave at 1.2 times the comparison speed and 130 percent of its dot visibility. The shared native animation has a 10-second cycle, supports Reduce Motion, and stops while the app or route is inactive. Auth and onboarding use the full field; Radar, membership, Account, and rewards use a quieter header treatment.

The approved continuity scope is items 2, 4, 5, 6, 7, and 8 from the product discussion:

- Bottle Check returns confirmed bottles to the originating Post or Shelf draft. Direct handoffs retain checked prices and reference regions, bind to the current account, and protect existing draft details. A reference region does not establish a store observation.
- Home and Bottle Check surface the member's existing rating and buy-again choice. Recommendation access uses repeated favorite-rating cues, or saved setup preferences before enough ratings exist. Saved setup picks remain available on every plan. Home initially shows one pick, with an explicit expansion for the others.
- Home defaults to the saved home state when no browsing preference exists. Bottle Check inherits the selected browsing region; alert-area changes require confirmation in setup. Existing watched areas stay separate from temporary browsing choices.
- Posting success links to the saved Signal and an optional purchase entry. It refreshes the authoritative points balance and shows progress toward an eligible reward. Photo retries return the original saved Signal identity and payload.
- Onboarding can save a suggested bottle without creating ownership. Picks remain on Home after setup, unfinished alert setup has a relevant next step, and membership retains the bottle that prompted the upgrade.
- Coverage requests carry area or known store context and expose existing request progress. Support and feedback carry editable bottle, Signal, screen, and region details.

The bottle-profile navigation expansion and hunt-outcome-to-collection flow were outside the approved scope. This change does not introduce either flow.

## Validation

- Mobile verification passed with fresh checkout-local dependencies: native dependency/security checks, TypeScript, 417 core tests, 22 cohesion tests, 56 mounted regressions, artwork checks, browsing tests, release readiness, and production Android/iOS exports.
- Root TypeScript, 15 onboarding tests, the native thin-slice suite, bottle-profile tests, and collection-history checks passed.
- Twenty-seven responsive browser fixture journeys passed at 320px and 390px. They cover scanner return to a draft, conflicting-draft protection, checked price and store handoffs, personal ratings, saved picks, a resumed watch after simulated membership reconciliation, geographic continuity without alert-area writes, coverage status, editable feedback context, restrained headers, and Reduce Motion.
- The source includes the automatic bottle-assessment changes merged in PR #765. Its scoring UI and source explanations remain present.

Browser purchase, camera, data, and notification boundaries are simulated. These checks do not establish physical-device acceptance or real store-purchase behavior. OTA and deployment evidence is recorded separately by the release operator.
