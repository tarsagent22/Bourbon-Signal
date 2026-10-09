import assert from "node:assert/strict";
import test from "node:test";
import { loadWithMocks } from "../astra-test-harness";

function harness(options: { background?: boolean; ready?: boolean; failOnce?: boolean; lastResponse?: Promise<unknown> } = {}) {
  const slots: any[] = [];
  let cursor = 0;
  let effects: Array<() => void> = [];
  let ready = options.ready !== false;
  let failures = options.failOnce ? 1 : 0;
  let tapped!: (response: unknown) => void;
  let changedState!: (state: string) => void;
  let cleared = 0;
  const routes: any[] = [];
  const router = { push: (route: unknown) => { if (failures-- > 0) throw new Error("navigator mounting"); routes.push(route); } };
  const react = {
    useRef(value: unknown) { const i = cursor++; return slots[i] ||= { current: value }; },
    useState(value: any) { const i = cursor++; if (!(i in slots)) slots[i] = value; return [slots[i], (next: any) => { slots[i] = typeof next === "function" ? next(slots[i]) : next; }]; },
    useEffect(effect: () => any, deps: unknown[]) {
      const i = cursor++;
      if (!slots[i] || deps.some((value, index) => value !== slots[i].deps[index])) {
        const previous = slots[i];
        slots[i] = { deps, cleanup: previous?.cleanup };
        effects.push(() => { slots[i].cleanup?.(); slots[i].cleanup = effect(); });
      }
    },
  };
  const { PushResponseHandler } = loadWithMocks("src/push/PushResponseHandler.tsx", {
    react,
    "@clerk/expo": { useAuth: () => ({ isLoaded: true, isSignedIn: true }) },
    "expo-router": { useRouter: () => router, useRootNavigationState: () => ready ? { key: "root" } : undefined },
    "expo-notifications": {
      getLastNotificationResponseAsync: () => options.lastResponse || Promise.resolve(null),
      addNotificationResponseReceivedListener: (listener: typeof tapped) => { tapped = listener; return { remove() {} }; },
      clearLastNotificationResponseAsync: async () => { cleared += 1; },
    },
    "react-native": { AppState: { currentState: options.background ? "background" : "active", addEventListener: (_event: string, listener: typeof changedState) => { changedState = listener; return { remove() {} }; } } },
    "../hooks/useMobileApi": {},
    "./push-registration": {},
  });
  const render = () => { cursor = 0; PushResponseHandler(); const next = effects; effects = []; next.forEach(effect => effect()); };
  return {
    render, routes, cleared: () => cleared,
    ready: () => { ready = true; },
    tap: (id: string, alertId: string) => tapped({ notification: { request: { identifier: id, content: { data: { screen: "radar", alertId } } } } }),
    foreground: () => changedState("active"),
    dispose: () => slots.forEach(slot => slot?.cleanup?.()),
  };
}
const tick = (milliseconds = 5) => new Promise(resolve => setTimeout(resolve, milliseconds));

test("background Account tap opens the exact Radar alert without rendering Home", async () => {
  const app = harness({ background: true, ready: false });
  try {
    app.render(); await tick();
    app.tap("os-account-tap", "alert-account"); app.render();
    assert.equal(app.routes.length, 0);
    app.foreground(); app.render();
    assert.equal(app.routes.length, 0, "wait for the root navigator");
    app.ready(); app.render();
    assert.deepEqual(app.routes[0], { pathname: "/(app)/(tabs)/radar", params: { section: "matches", alert: "alert-account", request: "os-account-tap" } });
    assert.equal(app.cleared(), 1);
    app.tap("os-account-tap", "alert-account"); app.render();
    assert.equal(app.routes.length, 1, "the listener and OS replay must not navigate twice");
  } finally { app.dispose(); }
});

test("a mounting failure retains the tap and clears OS state only after retry succeeds", async () => {
  const app = harness({ failOnce: true });
  try {
    app.render(); await tick(); app.tap("os-retry", "alert-retry"); app.render();
    assert.equal(app.cleared(), 0);
    await tick(275); app.render();
    assert.equal(app.routes.length, 1);
    assert.equal(app.cleared(), 1);
  } finally { app.dispose(); }
});

test("a delayed startup response cannot replace a newer live tap", async () => {
  let finish!: (response: unknown) => void;
  const lastResponse = new Promise(resolve => { finish = resolve; });
  const app = harness({ ready: false, lastResponse });
  try {
    app.render(); await tick(); app.tap("os-new", "alert-new");
    finish({ notification: { request: { identifier: "os-old", content: { data: { screen: "radar", alertId: "alert-old" } } } } });
    await tick(); app.ready(); app.render();
    assert.equal(app.routes[0].params.alert, "alert-new");
  } finally { app.dispose(); }
});
