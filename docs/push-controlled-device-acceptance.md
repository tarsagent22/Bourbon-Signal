# Controlled iOS push acceptance

Use this only after the push-receipt migration and matching application release are deployed. This is an owner-run acceptance check for one opted-in Chandler device; it is not an automated production test and it must not be run against another member.

## Safety gate

- Confirm the app release and additive push migration were deployed from the same reviewed release.
- Confirm `/api/ops/alert-readiness` is authenticated, private/no-store, and returns a bounded `pushDelivery` aggregate without an error.
- Confirm there are no manual-review/unknown receipt rows that could overlap the test bottle/location episode.
- Use Chandler's exact signed-in account and one controlled iPhone. Do not copy, log, or paste its Expo token.
- In Radar, confirm the desired state/area and rarity settings, then enable push there. Do not trigger the permission prompt from signup or first launch.
- Record the app version, build, device label, state/area, test bottle, exact location, and start time without recording a token or account ID.

## Acceptance run

1. With the app foregrounded, create or wait for one fresh, alert-eligible exact-location signal matching the controlled account's Radar area and rarity preferences.
2. Confirm exactly one notification is received. Tap it and confirm the app opens Radar Matches using the same minimal `{ screen: "radar" }` payload contract used by background and terminated launches; no alert, bottle, store, account, or token identifier belongs in the OS payload.
3. Repeat with the app backgrounded, using a new bottle/location availability episode. Confirm one notification and the same Radar Matches routing.
4. Terminate the app and repeat with another new episode. Confirm one notification and the same routing after cold start.
5. Re-run the delivery worker for each already-used episode. Confirm bottle/location dedupe prevents another notification.
6. In authenticated readiness, confirm an accepted ticket first appears as pending, then becomes delivered only after an authoritative Expo receipt success. Confirm pending-ticket age/receipt lag returns to the expected range.
7. Rotate the Expo token by reinstalling or otherwise using the supported registration flow. Confirm only the current owned generation is eligible and the old token does not receive a notification.
8. If a controlled device can safely produce `DeviceNotRegistered`, confirm only that exact owned token/device generation is disabled. A replacement generation and any second owned device must remain enabled.
9. Add a second controlled device to the same account. Confirm each currently owned opted-in device receives at most one notification for a new matching episode and no device owned by another account is touched.
10. Disable push in Radar. Confirm a new matching episode creates no push send. Re-enable only if desired.
11. Change the area and rarity preferences so a fresh signal does not match. Confirm no push is sent; restore the settings and use a new episode to confirm matching resumes.
12. Log out on one device. Confirm its ownership is disabled and queued work cannot deliver to it. Log back in and explicitly re-enable from Radar before retesting.
13. Delete only a disposable controlled account, if deletion coverage is being accepted. Confirm its pending/unknown/accepted outbox work and device ownership are suppressed before any worker rerun.

## Pass criteria

- Permission is requested only from Radar.
- Foreground, background, and terminated taps use the same minimal `{ screen: "radar" }` payload and open Radar Matches, which then fetches only the currently authenticated account's alerts.
- Delivery is immediate and area/preference filtered.
- Bottle/location availability episodes dedupe across retries and regrouping.
- Provider acceptance never counts as delivery; only a successful Expo receipt does.
- Partial, malformed, missing, or unknown receipt results remain manual-review/unknown and never become duplicate-send candidates.
- `DeviceNotRegistered` disables only the exact current owned generation.
- Logout, opt-out, token rotation, account reassignment, and account deletion prevent stale queued ownership from receiving pushes.
- Readiness exposes aggregate counts and reason classes only; it contains no user IDs, installation IDs, account IDs, or Expo tokens.

Stop and investigate before any broader enablement if any item fails. Do not compensate by replaying an ambiguous accepted send.
