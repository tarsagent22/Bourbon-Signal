# Radar alert details redesign

The opened alert now prioritizes individual bottles, store address, and next actions. Multi-bottle summaries show a bottle count; expanded cards separate names from size/proof, remove the repeated retailer availability notice, and show one conservative availability warning. Directions require a street address. The source label, exact timestamp, reported quantity, and original listing names remain in a closed-by-default Report details disclosure. Mute/watch identity, stale classification, and report navigation still use the original alert data.

## Verification

- Base: `6deae85aaa1b78900cb5eafab03570613c95a8d7` (current origin/main when checked).
- Mobile typecheck passed.
- All 44 focused Radar and push-navigation checks passed, including new bottle-edition and address parsing cases.
- Mobile release-readiness contract passed.
- Expo exports for iOS, Android, and web passed (`apps/mobile/dist/alert-release-check`).
- Offline preview built from the actual Radar screen with synthetic data. Run the existing radar-preview build and serve instructions; `?scenario=retailer-detail` reproduces the five-bottle Safeway example.
- Browser verification could not run: computer-use reported local browser use disabled in Work settings. No visual or physical-phone acceptance is claimed.

## Original preparation handoff (2026-10-29)

This is a detached local preparation, not a released change. The repository's sole release lane remains occupied by draft PR #859, `Expand four-state inventory and repair fleet visibility`, objective #858. No second branch/PR was created, no objective lock was changed, and no OTA was published.

Once the lane is free, reconcile onto fresh origin/main, visually verify 320px/390px and larger text, and use the guarded objective/PR/merge workflow. Confirm installed runtime/channel coverage before publishing compatible OTAs. Preserve the distinction between published bundles and installation/acceptance on a physical phone.

Evidence logs and a source patch are saved under `C:/Users/chand/Documents/Bourbon Signal/radar-alert-redesign-20261029-evidence`.

## Authorized release (2026-10-30)

The owner approved live publication after receiving the hosted sample. PR #859 has merged and its objective lock is gone. This release is reconciled onto `a79b0a4a8b1afb5a2037f35d2aa76ba198fec834`. The new parsing cases are included in the existing Radar presentation test suite; no native dependencies or package configuration change. Publication and physical-device acceptance remain separate until verified.

Fresh release validation: `npm --prefix apps/mobile run verify` and `npm run test:native-thin-slice` passed on 2026-10-30, including both native exports. Logs are retained in the external evidence folder.
