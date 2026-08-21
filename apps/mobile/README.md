# Bourbon Signal mobile

Lean Expo SDK 57 development client for the first native product slice.

## Included

- Clerk email/password sign-in with secure token storage
- Bearer-authenticated Signal Feed with opaque cursor pagination
- Exact Signal detail
- Privacy-safe membership/account state
- Sign-out and cursor/session recovery

Camera, push, barcode scanning, native billing, editable profiles, badges, and social mechanics are intentionally deferred.

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

The app IDs are `com.bourbonsignal.app` on Android and iOS. EAS environment variables must provide the same public Clerk key and API URL; no Clerk secret belongs in a mobile build.

The app never stores user IDs, email addresses, or database identifiers in its own persistence. Clerk tokens use the official Expo secure token cache. The sign-in flow completes password, email/phone code, TOTP, backup-code, and Device Trust challenges; the production Clerk instance must keep `email_code` or another supported code factor enabled.
