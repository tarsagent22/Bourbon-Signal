# Native release checklist

## Completed in the readiness pass

- [x] Public app version set to `1.0.0`.
- [x] Bundle ID and Android package remain `com.bourbonsignal.app`.
- [x] Production EAS Build and Submit profiles exist.
- [x] Production builds auto-increment remotely and use the production OTA channel.
- [x] Runtime compatibility follows the app version.
- [x] OTA updates check on launch and fall back immediately to the embedded bundle.
- [x] iOS non-exempt-encryption declaration is present.
- [x] Expo template artwork is replaced with repository-owned Bourbon Signal icon, splash, adaptive, monochrome, and favicon assets.
- [x] Account includes Support, Privacy policy, and Request account deletion actions.
- [x] Public support and privacy URLs are documented.
- [x] Store copy, privacy inventory, review notes, and screenshot specification are version-controlled.
- [x] No native billing, external checkout steering, tracking SDK, location permission, camera permission, or push permission was added.

## Complete after Apple enrollment approval

- [ ] Accept any pending Apple agreements and verify the organization/team identity.
- [ ] Create the App Store Connect app record for `com.bourbonsignal.app`.
- [ ] Add the App Store Connect app ID (`ascAppId`) to the local/approved submit configuration only after it exists.
- [ ] Configure Apple signing through the organization-owned EAS account; do not export credentials into the repository.
- [x] Confirm the EAS `production` environment contains only the two approved public runtime values (`EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`).
- [ ] Create a least-privilege App Review account and place credentials only in App Store Connect.
- [ ] Produce a production iOS build and inspect its privacy manifests, SDK signatures, entitlements, permissions, and development-module exclusions.
- [ ] Install through TestFlight and test sign-in/MFA, feed pagination, detail, account links, deletion request, sign-out, offline/retry behavior, text scaling, and small-screen layout.
- [ ] Capture and batch-review real candidate screenshots at Apple-accepted dimensions.
- [ ] Reconcile App Privacy and age-rating answers against the final binary and current vendor disclosures.
- [ ] Submit to TestFlight internal testing first; App Store review requires separate owner approval after device QA.

## Release commands

```bash
npm ci
npm run verify
npx expo-doctor
npx eas-cli config --platform ios --profile production
npx eas-cli build --platform ios --profile production
```

Do not run the production iOS build or submission before Apple enrollment and team access are confirmed.
