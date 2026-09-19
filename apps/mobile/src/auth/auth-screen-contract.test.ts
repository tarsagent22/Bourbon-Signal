import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const read = (relative: string) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
const entry = read("../../app/index.tsx");
const signIn = read("../../app/(auth)/sign-in.tsx");
const signUp = read("../../app/(auth)/sign-up.tsx");
const authLayout = read("../../app/(auth)/_layout.tsx");

test("entry routes signed-out members to native auth and keeps the existing sign-in and MFA contracts", () => {
  assert.match(entry, /"\/\(auth\)\/sign-in"/);
  for (const contract of [
    /useSignIn/, /signIn\.password/, /signIn\.mfa\.sendEmailCode/, /signIn\.mfa\.sendPhoneCode/,
    /signIn\.mfa\.verifyEmailCode/, /signIn\.mfa\.verifyPhoneCode/, /signIn\.mfa\.verifyTOTP/,
    /signIn\.mfa\.verifyBackupCode/, /signIn\.finalize/,
  ]) assert.match(signIn, contract);
  assert.match(signIn, /Create a free account/);
  assert.match(authLayout, /name="sign-in"/);
  assert.match(authLayout, /name="sign-up"/);
});

test("verified accounts must resume server-authoritative onboarding before entering the app", () => {
  assert.match(entry, /getMobileOnboardingStatus/);
  assert.match(entry, /status\.completed/);
  assert.match(entry, /resume: "onboarding"/);
  assert.match(signUp, /useLocalSearchParams/);
  assert.match(signUp, /params\.resume === "onboarding"/);
});

test("native sign-up uses Clerk email code verification and no social or phone collection", () => {
  for (const contract of [
    /useSignUp/, /signUp\.password/, /signUp\.verifications\.sendEmailCode/, /signUp\.verifications\.verifyEmailCode/, /signUp\.finalize/,
    /I affirm that I am 21 or older/, /Community display name/, /Home state and starting area/, /Continue Free/,
    /accessibilityRole="alert"/, /accessibilityLabel="Email verification code"/,
  ]) assert.match(signUp, contract);
  assert.doesNotMatch(signUp, /OAuth|social login|phone-pad|phoneNumber/);
  assert.match(signUp, /Free accounts do not receive alerts/);
  assert.ok(signUp.indexOf('setStage("onboarding")') < signUp.indexOf("await signUp.finalize()"), "onboarding must own the route before Clerk activates the session");
});

test("sign-up exposes retryable busy and error states without logging credentials or PII", () => {
  assert.match(signUp, /ActivityIndicator/);
  assert.match(signUp, /editable=\{!busy\}/);
  assert.match(signUp, /caught instanceof Error/);
  assert.match(signUp, /Try again/);
  assert.doesNotMatch(signUp, /console\.(?:log|warn|error)/);
});
