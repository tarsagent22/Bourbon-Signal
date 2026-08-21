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
npx eas-cli build --profile development --platform ios
```

The app IDs are `com.bourbonsignal.app` on Android and iOS. EAS environment variables must provide the same public Clerk key and API URL; no Clerk secret belongs in a mobile build.

The app never stores user IDs, email addresses, or database identifiers in its own persistence. Clerk tokens use the official Expo secure token cache. The sign-in flow completes password, email/phone code, TOTP, backup-code, and Device Trust challenges; the production Clerk instance must keep `email_code` or another supported code factor enabled.
