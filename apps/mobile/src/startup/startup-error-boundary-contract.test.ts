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

test("authentication providers mount while fonts load, with navigation gated until font readiness", () => {
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
    assert.ok(loading.includes("BrandLoading"));
    assert.ok(!loading.some(type => typeof type === "function" && type.name === "SessionNavigation"));
    ready = true;
    const loaded = types(RootLayout());
    assert.ok(loaded.some(type => typeof type === "function" && type.name === "SessionNavigation"));
    assert.ok(!loaded.includes("BrandLoading"));
  } finally {
    if (savedKey === undefined) delete process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
    else process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY = savedKey;
  }
});
