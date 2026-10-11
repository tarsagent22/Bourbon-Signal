import assert from "node:assert/strict";
import test from "node:test";
import { loadWithMocks } from "../astra-test-harness";
test("feed rows share one clock, suspend it in background, and release it after the last row unmounts", t => {
  let intervals = 0; let cleared = 0; let updates = 0; let removed = 0;
  let changed: (state: string) => void = () => {};
  const cleanups: Array<() => void> = [];
  t.mock.method(globalThis, "setInterval", () => { intervals++; return 1 as any; });
  t.mock.method(globalThis, "clearInterval", () => { cleared++; });
  const appState = { currentState: "active", addEventListener: (_event: string, callback: typeof changed) => { changed = callback; return { remove: () => { removed++; } }; } };
  const { useReportClock } = loadWithMocks("src/hooks/useReportClock.ts", {
    react: { useState: (initial: () => Date) => [initial(), () => { updates++; }], useEffect: (effect: () => () => void) => cleanups.push(effect()) },
    "react-native": { AppState: appState },
  });
  useReportClock(); useReportClock(); assert.equal(intervals, 1);
  appState.currentState = "background"; changed("background"); assert.equal(cleared, 1);
  const before = updates; appState.currentState = "active"; changed("active");
  assert.equal(intervals, 2); assert.equal(updates - before, 2, "both rows update immediately on foreground");
  cleanups[0](); assert.equal(removed, 0); cleanups[1](); assert.equal(removed, 1); assert.equal(cleared, 2);
});
