import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { loadWithMocks } from "../astra-test-harness";

const boundary = readFileSync(new URL("./StartupErrorBoundary.tsx", import.meta.url), "utf8");

test("startup recovery preserves JavaScript and React component stacks", () => {
  assert.match(boundary, /componentStack:\s*string/);
  assert.match(boundary, /componentDidCatch\(error: Error, info: ErrorInfo\)/);
  assert.match(boundary, /info\.componentStack/);
  assert.match(boundary, /error\.stack/);
});

test("startup recovery exposes bounded selectable diagnostics", () => {
  assert.match(boundary, /ScrollView/);
  assert.match(boundary, /selectable/);
  assert.match(boundary, /const MAX_DIAGNOSTIC_LENGTH = \d+/);
  assert.match(boundary, /slice\(0, MAX_DIAGNOSTIC_LENGTH\)/);
  assert.match(boundary, /STARTUP_DIAGNOSTIC_RELEASE/);
});

test("authentication and account routing start while fonts load behind the native splash", () => {
  let ready = false;
  const savedKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
  process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_test_fixture";
  try {
    const { default: RootLayout } = loadWithMocks("app/_layout.tsx", {
      "@clerk/expo": { ClerkProvider: "ClerkProvider" },
      "@clerk/expo/token-cache": { tokenCache: {} },
      "@expo-google-fonts/fraunces/700Bold": { Fraunces_700Bold: 1 },
      "expo-font": { useFonts: () => [ready, null] },
      react: { useEffect: () => {} },
      "expo-splash-screen": { preventAutoHideAsync: async () => {}, setOptions: () => {} },
      "../src/components/BrandLoading": { BrandLoading: "BrandLoading" },
      "expo-router": {},
      "expo-status-bar": { StatusBar: "StatusBar" },
      "react-native": { StyleSheet: { create: (styles: unknown) => styles }, Text: "Text", View: "View" },
      "react-native-safe-area-context": { SafeAreaProvider: "SafeAreaProvider" },
      "../src/membership/PurchasesProvider": { PurchasesProvider: "PurchasesProvider" },
      "../src/startup/StartupErrorBoundary": { StartupErrorBoundary: "StartupErrorBoundary" },
      "../src/hooks/useMobileApi": { MobileApiProvider: "MobileApiProvider" },
      "../src/startup/DeviceTimeZoneCapture": { DeviceTimeZoneCapture: "DeviceTimeZoneCapture" },
      "../src/startup/report-render-error": {},
      "../src/push/PushResponseHandler": {},
    });
    const types = (node: any): unknown[] => !node || typeof node !== "object" ? [] : Array.isArray(node)
      ? node.flatMap(types) : [node.type, ...types(node.props?.children)];
    const loading = types(RootLayout());
    assert.ok(loading.includes("ClerkProvider"), "session recovery starts during the font read");
    assert.ok(loading.some(type => typeof type === "function" && type.name === "SessionNavigation"), "account setup requests must overlap font loading");
    ready = true;
    const loaded = types(RootLayout());
    assert.ok(loaded.some(type => typeof type === "function" && type.name === "SessionNavigation"));
    assert.ok(!loaded.includes("BrandLoading"));
  } finally {
    if (savedKey === undefined) delete process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
    else process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY = savedKey;
  }
});


test("entry starts profile and setup together without waiting for profile completion", async () => {
  const calls: string[] = [];
  let effect!: () => (() => void);
  let finishSetup!: (status: { completed: boolean }) => void;
  let destination: unknown;
  let stateIndex = 0;
  const { default: Entry } = loadWithMocks("app/index.tsx", {
    "@clerk/expo": { useAuth: () => ({ isLoaded: true, isSignedIn: true }) },
    "expo-router": { Redirect: "Redirect" },
    react: {
      useEffect: (callback: typeof effect) => { effect = callback; },
      useState: (value: unknown) => { const index = stateIndex++; return [value, (next: unknown) => { if (index === 0) destination = next; }]; },
    },
    "react-native": { StyleSheet: { create: (styles: unknown) => styles } },
    "../src/components/BrandLoading": { BrandLoading: "BrandLoading" },
    "../src/hooks/useMobileApi": { useMobileApi: () => ({
      getMemberProfile: () => { calls.push('profile'); return new Promise(() => {}); },
      getMobileOnboardingStatus: () => { calls.push('setup'); return new Promise(resolve => { finishSetup = resolve; }); },
    }) },
    "../src/api/client": {},
  });
  Entry();
  const cleanup = effect();
  assert.deepEqual(calls, ['profile', 'setup']);
  finishSetup({ completed: true });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(destination, 'app', 'a slow profile cannot block server-authoritative routing');
  cleanup();
});
