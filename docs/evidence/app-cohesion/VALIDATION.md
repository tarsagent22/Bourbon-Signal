# App cohesion and recovery

Implemented on 2026-10-04 from main `1bb3406169ea717a93d832fcc4441246d55d7d0f`.

## Delivered

1. Expired Home pagination has a working fresh-feed retry.
2. Radar, Post and Add Bottle use one catalog hook, seed, ranked alias search and existing shared API cache.
3. Bottle Profile supports local retry, pull-to-refresh and focus revalidation.
4. Catalog and store failures are distinct from empty results; catalog failures return a non-cacheable 503. Account refresh retains last known points and badges.
5. Shared heading, bottle, input and label typography spans tabs, authentication, account, membership, rewards and forms. Feed cards have stronger contrast. Existing shelf artwork and normal three-column layout remain.
6. Post and Add Bottle text drafts persist locally by account and form, with restoration and explicit discard. Serialized writes prevent discarded drafts reappearing. Existing post-photo submission recovery is retained; unsubmitted photos are not newly persisted.
7. Radar loads preferences, alerts and profile independently; catalog failure does not block settings or push status.
8. Home and Shelf empty states offer contextual actions such as clearing filters or adding the first bottle.
9. Crash recovery shows friendly actions first, with opt-in diagnostic disclosure and system sharing.
10. Behavioral regression tests cover recovery, catalog failure/cache reuse, draft isolation/write races, and mounted Radar partial failure.

## Automated verification

- Root `npx tsc --noEmit`: passed.
- Mobile `npm run verify`: passed on final implementation, including 345 base tests, 7 cohesion tests and 41 Astra tests, plus security/native/recovery/readiness checks and both Android and iOS production exports.
- `git diff --check`: passed.
- No measured performance benchmark is claimed. The concrete optimization is shared catalog caching and memoized search indexes with independent section loading.

## Browser walkthrough

Actual React Native screen components rendered through React Native Web at 390px and 320px. Synthetic data and substituted native services/icons were clearly identified in the preview.

Verified Home cursor failure followed by successful Refresh feed; Post draft restoration; Add Bottle alias selection, quantity/notes restoration and discard across remount; Bottle Profile failure and in-place retry; Radar settings during alert/catalog failure; and narrow Shelf, Account, Membership and Rewards layouts. Crash diagnostics are hidden initially and can be disclosed.

The preview's Large text control exercises layout branching only, not native Dynamic Type font rendering. Browser storage substitutes for SecureStore. Native purchases, notification receipt, system share presentation, camera behavior and physical-device acceptance were not tested. No OTA or production deployment was performed.

## Reproduce preview

From `apps/mobile`, run `node scripts/cohesion-preview/build.mjs`, then serve `dist/cohesion-preview` on localhost. The current review server uses `http://127.0.0.1:5196/`.

The preview is a development fixture, not an application route or production service.
