import assert from "node:assert/strict";
import test from "node:test";
import { loadWithMocks } from "../astra-test-harness";

function mountedSwitch(initial = false, reduced = false) {
  const slots: any[] = [], effects: Array<() => void> = [], animations: any[] = [];
  let cursor = 0, value = initial, disabled = false, calls = 0;
  let complete!: (ok: boolean) => void;
  let motionChanged!: (next: boolean) => void;
  const memo = (fn: () => any, deps: any[]) => {
    const i = cursor++, previous = slots[i];
    if (!previous || deps.some((d, j) => d !== previous.deps[j])) slots[i] = { value: fn(), deps };
    return slots[i].value;
  };
  const { PreferenceSwitch } = loadWithMocks("src/components/PreferenceSwitch.tsx", {
    react: {
      useRef: (v: any) => memo(() => ({ current: v }), []),
      useState: (v: any) => { const i = cursor++; if (!(i in slots)) slots[i] = v; return [slots[i], (next: any) => { slots[i] = next; }]; },
      useEffect: (fn: any, deps: any[]) => memo(() => { effects.push(fn); }, deps),
    },
    "react-native": {
      Pressable: "Pressable", StyleSheet: { create: (v: any) => v }, Easing: { cubic: "cubic", out: (v: any) => v },
      AccessibilityInfo: { isReduceMotionEnabled: async () => reduced, addEventListener: (_: string, fn: any) => { motionChanged = fn; return { remove() {} }; } },
      Animated: { View: "AnimatedView", Value: class { constructor(public current: number) {} setValue(v: number) { this.current = v; } interpolate(v: any) { return v; } },
        timing: (_: any, config: any) => ({ start: () => animations.push(config), stop() {} }) },
    },
  });
  return {
    render() {
      cursor = 0;
      const tree = PreferenceSwitch({ label: "Test notifications", value, disabled, onValueChange: (next: boolean) => {
        calls++; return new Promise<boolean>(resolve => { complete = ok => { if (ok) value = next; resolve(ok); }; });
      } });
      while (effects.length) effects.shift()!();
      return tree.props;
    },
    complete: (ok: boolean) => complete(ok), animations, calls: () => calls,
    setDisabled: (next: boolean) => { disabled = next; },
    reduceMotion: (next: boolean) => motionChanged(next),
  };
}

const settle = async () => { await Promise.resolve(); await Promise.resolve(); };

for (const initial of [false, true]) test(`toggle slides immediately from ${initial} while persistence is unresolved`, async () => {
  const h = mountedSwitch(initial);
  h.render(); await settle();
  const before = h.render(); before.onPress(); before.onPress();
  h.setDisabled(true); // Parent rerenders busy while its request is still running.
  const pending = h.render();
  assert.equal(pending.accessibilityState.checked, !initial);
  assert.equal(pending.accessibilityState.busy, true);
  assert.equal(h.calls(), 1, "repeated events cannot launch duplicate writes");
  assert.equal(pending.style[1], undefined, "saving must not fade or reshape the active thumb");
  assert.deepEqual(h.animations.at(-1), { toValue: initial ? 0 : 1, duration: 180, easing: "cubic", useNativeDriver: true, isInteraction: false });
  h.complete(true); await settle(); h.setDisabled(false);
  assert.equal(h.render().accessibilityState.checked, !initial);
  assert.equal(h.render().accessibilityState.busy, false);
});

test("failed saving slides back and allows a later retry", async () => {
  const h = mountedSwitch(); h.render(); await settle();
  h.render().onPress(); assert.equal(h.render().accessibilityState.checked, true);
  h.complete(false); await settle();
  assert.equal(h.render().accessibilityState.checked, false);
  assert.equal(h.animations.at(-1).toValue, 0);
  h.render().onPress(); assert.equal(h.calls(), 2);
  h.complete(true); await settle(); assert.equal(h.render().accessibilityState.checked, true);
});

test("Reduce Motion changes value immediately without a timed slide and disabled controls do not save", async () => {
  const h = mountedSwitch(false, true); h.render(); await settle();
  h.setDisabled(true); h.render().onPress(); assert.equal(h.calls(), 0);
  h.setDisabled(false); h.render().onPress();
  assert.equal(h.render().accessibilityState.checked, true); assert.equal(h.animations.length, 0);
  h.complete(true); await settle(); h.render(); h.reduceMotion(false); h.render().onPress(); h.render();
  assert.equal(h.animations.at(-1).toValue, 0);
  h.complete(true); await settle();
});
