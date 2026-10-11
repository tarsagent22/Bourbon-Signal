import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { loadWithMocks } from "../astra-test-harness";
import { preferencesFixture, profileFixture } from "../api/astra-fixtures";
import { canonicalBottleKey } from "../interactions/member-interactions";

// Execute the actual screen with stateful hooks and simulated service boundaries.
function setup({ free = false, failWatch = false, failPush = false } = {}) {
  const cells: any[] = []; let cursor = 0; const effects: Array<() => unknown> = [];
  const patches: any[] = []; const routes: any[] = []; let pushes = 0;
  let preferences = preferencesFixture({ entitlements: { alertAreaLimit: free ? 0 : 5, trackedBottleLimit: free ? 0 : 15 },
    monitoringScopes: [{ type: "city", id: "city:raleigh", label: "Raleigh", state: "NC" }, { type: "city", id: "city:durham", label: "Durham", state: "NC" }] });
  const api = {
    getMemberProfile: async () => profileFixture({ homeState: "NC", membership: { tier: free ? "free" : "standard", label: "Standard", paid: !free, hasBetaAccess: false }, feedAreas: { states: [{ code: "NC", label: "North Carolina", areaLabel: "Board", options: [] }] } }),
    getMemberPreferences: async () => preferences,
    updateMemberPreferences: async (patch: any) => {
      patches.push(patch); if (failWatch && patch.watchlistMutation) throw new Error("offline");
      if (patch.watchlistMutation) { const name = patch.watchlistMutation.bottleName; preferences = { ...preferences, bottleAlertPreferences: { bottleNames: [name], bottleKeys: [canonicalBottleKey(name)] } }; }
      else preferences = { ...preferences, ...patch };
      return preferences;
    },
    searchMonitoringGeography: async () => ({ results: [], hasMore: false }),
  };
  const module = loadWithMocks("app/(app)/setup.tsx", {
    react: { ...React,
      useState: (initial: any) => { const index = cursor++; if (!(index in cells)) cells[index] = typeof initial === "function" ? initial() : initial; return [cells[index], (value: any) => { cells[index] = typeof value === "function" ? value(cells[index]) : value; }]; },
      useRef: (initial: any) => { const index = cursor++; return cells[index] ||= { current: initial }; },
      useEffect: (effect: () => unknown, deps: any[]) => { const index = cursor++; if (!cells[index] || deps.some((value, i) => value !== cells[index][i])) { cells[index] = deps; effects.push(effect); } },
    },
    "@clerk/expo": { useAuth: () => ({ userId: "fixture-user" }) },
    "expo-router": { useRouter: () => ({ replace: (route: unknown) => routes.push(route) }) },
    "react-native": { View: "View", ScrollView: "ScrollView", Text: "Text", TextInput: "TextInput", Pressable: "Pressable", ActivityIndicator: "ActivityIndicator", StyleSheet: { create: (styles: unknown) => styles }, Linking: { openSettings: async () => {} } },
    "../../src/hooks/useMobileApi": { useMobileApi: () => api },
    "../../src/hooks/useBottleCatalog": { useBottleCatalog: () => ({ catalog: [{ id: "weller", name: "Weller Full Proof" }], search: () => [{ id: "weller", name: "Weller Full Proof" }], error: "", retry() {} }) },
    "../../src/hooks/useAccessibleStatus": { useAccessibleStatus() {} },
    "../../src/components/MemberScreen": { PageHeading: "Heading", ErrorState: "ErrorState", LoadingState: "LoadingState", memberScreenStyles: { screen: {}, content: {} } },
    "../../src/push/push-registration": { enableRadarPush: async () => { pushes++; if (failPush) throw new Error("denied"); return { enabled: true, currentDeviceRegistered: true }; }, radarPushPermission: async () => failPush ? "denied" : "granted" },
  });
  const component = module.default().type;
  const render = () => { cursor = 0; const tree = component(); effects.splice(0).forEach(effect => effect()); return tree; };
  function nodes(tree: any): any[] { if (Array.isArray(tree)) return tree.flatMap(nodes); if (!tree || typeof tree !== "object") return []; return [tree, ...nodes(tree.props?.children)]; }
  const find = (tree: any, predicate: (node: any) => boolean) => { const node = nodes(tree).find(predicate); assert.ok(node, "control must exist"); return node; };
  const action = (tree: any, label: string) => find(tree, node => node.props?.label === label).props;
  const settle = () => new Promise(resolve => setTimeout(resolve, 1));
  return { render, find, action, settle, patches, routes, pushes: () => pushes };
}
test("setup saves bottle intent, preserves an unchanged multi-area selection, and requests push only on the final tap", async () => {
  const screen = setup(); screen.render(); await screen.settle();
  let tree = screen.render(); assert.equal(screen.pushes(), 0);
  screen.action(tree, "Continue").onPress(); tree = screen.render();
  assert.equal(screen.patches.length, 0, "reopening setup must not replace two saved areas with one");
  assert.equal(screen.action(tree, "Continue").disabled, true, "empty bottle selection cannot silently enable useless alerts");
  screen.find(tree, node => node.props?.accessibilityLabel === "Search bottles to watch").props.onChangeText("Weller");
  tree = screen.render(); screen.action(tree, "Watch").onPress(); await screen.settle(); tree = screen.render();
  assert.deepEqual(screen.patches[0], { watchlistMutation: { bottleName: "Weller Full Proof", watched: true }, alertMode: "specific_bottles" });
  assert.equal(screen.action(tree, "Continue").disabled, false);
  screen.action(tree, "Continue").onPress(); tree = screen.render(); assert.equal(screen.pushes(), 0);
  screen.action(tree, "Enable notifications").onPress(); await screen.settle();
  assert.equal(screen.pushes(), 1); assert.equal(screen.routes.at(-1), "/(app)/(tabs)");
});
test("a failed watch or denied notification leaves setup retryable without claiming success", async () => {
  const screen = setup({ failWatch: true }); screen.render(); await screen.settle();
  screen.action(screen.render(), "Continue").onPress(); let tree = screen.render();
  screen.find(tree, node => node.props?.accessibilityLabel === "Search bottles to watch").props.onChangeText("Weller");
  screen.action(screen.render(), "Watch").onPress(); await screen.settle(); tree = screen.render();
  assert.equal(screen.action(tree, "Continue").disabled, true); assert.equal(screen.routes.length, 0);
  const denied = setup({ failPush: true }); denied.render(); await denied.settle(); denied.action(denied.render(), "Continue").onPress();
  tree = denied.render(); denied.find(tree, node => node.props?.accessibilityLabel === "Search bottles to watch").props.onChangeText("Weller"); denied.action(denied.render(), "Watch").onPress(); await denied.settle();
  denied.action(denied.render(), "Continue").onPress(); denied.action(denied.render(), "Enable notifications").onPress(); await denied.settle();
  assert.ok(denied.action(denied.render(), "Open phone settings")); assert.equal(denied.routes.length, 0);
});
test("Free setup offers Community and Shelf without writing paid alert settings", async () => {
  const screen = setup({ free: true }); screen.render(); await screen.settle(); const tree = screen.render();
  screen.action(tree, "Browse Community").onPress();
  assert.deepEqual(screen.routes[0], { pathname: "/(app)/(tabs)", params: { view: "community" } });
  assert.ok(screen.action(tree, "Add your first bottle")); assert.equal(screen.pushes(), 0); assert.equal(screen.patches.length, 0);
});
