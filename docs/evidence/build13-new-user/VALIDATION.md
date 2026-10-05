# Build 13 new-member fixes

Based on owner screenshots and physical-iPhone walkthrough of build 13. The owner reported a successful Free-to-Standard purchase; that is evidence of that purchase path, not restore, renewal, notification receipt, or acceptance of these fixes.

## Changes

- Keep Expo Router mounted during Clerk account/session changes. The API instance still changes by account/session and refuses stale token requests; the protected app stack still resets by account/session.
- Send signed-in auth entry routes through the server onboarding check. Welcome collects a display name and home state; first Home browsing starts in that state.
- Permit profile name updates before a numbered posting identity exists. Existing numbered identities and rollback of Community reporter-name updates are preserved.
- Render the API's Free market summaries and clear membership/Community actions instead of incorrectly presenting a locked feed as no data.
- Limit board/city and bottle filters to Barrel/Founder. Sanitize persisted filters for Free/Standard and reject unauthorized advanced queries at the API before source reads. State browsing remains available, matching the existing acquisition policy.
- Simplify Free Radar and empty Shelf copy, remove the Shelf footer upsell and membership slogan, and use a filled Glencairn and a barrel on membership cards.
- Standard advertises reward redemption. The native Barrel card describes Bourbon DNA from ratings rather than implying native bottle recommendations are already delivered.

## Verification

- Root TypeScript, entitlement matrix and auth/account suites passed.
- Six new route regressions passed: profile without numbered identity, existing-member rollback, resumable onboarding and home-state readback, forbidden detailed filters, paid NC board forwarding, and retained state browsing.
- Full mobile verification passed after a clean mobile install: 346 core tests, 7 cohesion tests, 41 Astra checks, Home persistence tests, native/security/recovery/readiness checks, and Android/iOS exports. Dependency audit reported zero known vulnerabilities.
- Actual React Native Web screens were exercised at 390px and 320px using clearly marked synthetic data and native/provider substitutes: Free Home summaries, Standard locked filters, saving Mikey, Welcome, membership cards/icons, Free Radar, empty Shelf, and Account logout to Sign in.
- A separate fixture uses the actual API provider and signup screen with mocked Clerk/HTTP. Email verification activates a session and preserves Welcome plus a child draft with navigation mount count 1. Sign-out also preserves navigation mount count 1. This checks the remount regression without claiming a physical Expo Router/Clerk device run.

## Remaining product discussion

Basic collection statistics are available to all tiers. Native Bourbon DNA summarizes strongly rated bottles and repeated taste cues; the native Shelf does not yet offer the website dashboard's bottle recommendations. Owner discussion of deeper Barrel collection insights and recommendations, and visiting other users' shelves, remains separate work.

New-member posting still depends on the existing numbered-public-identity requirement. This fix does not allocate new public member numbers or change that privacy/identity contract.

## Reproduce

Run `node --test scripts/test-build13-new-user.cjs`, `npm run test:auth-account`, `npm run test:entitlements`, root `npx tsc --noEmit`, and mobile `npm run verify`.

Build browser fixtures with `node apps/mobile/scripts/cohesion-preview/build.mjs`; serve `apps/mobile/dist/cohesion-preview` locally. `index.html` contains actual screen fixtures; `auth.html` contains the API-provider/signup transition probe. These fixtures never create real accounts or make purchases.

Physical-iPhone acceptance of these fixes remains pending.
