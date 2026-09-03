# Bourbon Signal mobile

Lean Expo SDK 57 development client for the first native product slice.

## Included

- Clerk email/password sign-in with secure token storage
- Bearer-authenticated Signal Feed with opaque cursor pagination
- Exact Signal detail
- Privacy-safe membership/account state
- In-app support, privacy policy, and account-deletion request paths
- Sign-out and cursor/session recovery
- Optional sighting evidence from the system camera or selected-photo flow
- Resized, metadata-stripped JPEG upload with retry against the already-saved Signal
- Pure lazy-permission policy with a manual posting without-photo fallback

Camera and selected-photo permissions are never requested at launch; each appears only after the matching member action. Optional sighting evidence may appear publicly with its Signal. Barcode matching, native billing, editable profiles, badges, and social mechanics remain intentionally deferred. Microphone and all location permissions are disabled.

## Local configuration

Create `.env.local` (ignored by Git):

```dotenv
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
EXPO_PUBLIC_API_URL=https://www.bourbonsignal.com
```

Then run:

```bash
npm ci
npm run typecheck
npm test
npm start
```

## Build verification

```bash
npm run verify
npx eas-cli build --profile development --platform android
npx eas-cli build --profile development-simulator --platform ios
```

The simulator profile proves the iOS native compile without Apple signing, but its artifact runs only in an iOS Simulator. Installing Bourbon Signal on a physical iPhone, using TestFlight, or submitting to the App Store requires an active Apple Developer Program membership and an authorized Apple team.

After a development binary with `expo-updates` is installed, compatible TypeScript, JavaScript, style, and bundled-asset changes can be published without another native build:

```bash
npx eas-cli update --channel development --environment development --message "Describe the preview"
```

Native dependencies, permissions, app identifiers, and other native configuration changes still require a new EAS Build. `runtimeVersion` follows the app version so an incompatible update cannot be delivered to a different binary version.

The app IDs are `com.bourbonsignal.app` on Android and iOS. EAS `development`, `preview`, and `production` environments provide the same two public Clerk/API runtime values; no Clerk secret belongs in a mobile build. The production store candidate uses app version `1.0.0`, remote build-number auto-increment, and the `production` OTA channel.

The version-controlled `store/` directory contains App Store copy, conservative privacy answers, review notes, a real-device screenshot specification, and the post-enrollment release checklist. Run `npm run verify:release-readiness` to validate the machine-checkable parts of that package. App Store Connect IDs, reviewer credentials, Apple signing material, and real TestFlight screenshots are intentionally absent until the organization account is approved.

The app never stores user IDs, email addresses, or database identifiers in its own persistence. Clerk tokens use the official Expo secure token cache. The sign-in flow completes password, email/phone code, TOTP, backup-code, and Device Trust challenges; the production Clerk instance must keep `email_code` or another supported code factor enabled.
