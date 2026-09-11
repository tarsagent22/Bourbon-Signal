import "./score-slider-native-held.test.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { scoreFromTrackPageX } from "./score-slider-gesture";
import { loadWithMocks } from "../astra-test-harness";
import { readFileSync } from "node:fs";

// Execute the actual TSX with deferred native layout measurement. Hooks retain
// state across parent rerenders; only the native host/measurement boundary is fake.
function mountedSlider() {
  const slots: any[] = []; let cursor = 0; let score = 0;
  const effects: Array<() => void> = [], measurements: Array<(...args: number[]) => void> = [];
  const memo = (fn: () => any, deps: any[]) => {
    const i = cursor++, prev = slots[i];
    if (!prev || deps.some((d, j) => d !== prev.deps[j])) slots[i] = { value: fn(), deps };
    return slots[i].value;
  };
  const locks: boolean[] = [];
  const react = {
    useRef: (v: any) => memo(() => ({ current: v }), []), useCallback: (f: any, d: any[]) => memo(() => f, d),
    useEffect: (f: any, d: any[]) => memo(() => { effects.push(f); }, d),
    useState: (v: any) => { const i = cursor++; if (!(i in slots)) slots[i] = typeof v === 'function' ? v() : v; return [slots[i], (n: any) => { slots[i] = typeof n === 'function' ? n(slots[i]) : n; }]; },
  };
  const { ScoreSlider } = loadWithMocks('src/components/ScoreSlider.tsx', {
    react, 'react-native': { View: 'View', Text: 'Text', TextInput: 'TextInput', Pressable: 'Pressable', Keyboard: { dismiss() {} }, StyleSheet: { create: (x: any) => x } },
  });
  function nodes(n: any): any[] { return n && typeof n === 'object' ? [n, ...[n.props?.children].flat(Infinity).flatMap(nodes)] : []; }
  let tree: any;
  const render = () => {
    cursor = 0;
    tree = ScoreSlider({ value: score, onChange: (n: number) => { score = n; }, onDraggingChange: (v: boolean) => locks.push(v) });
    const track = nodes(tree).find(n => n.props?.accessibilityRole === 'adjustable');
    track.props.ref.current = { measureInWindow: (fn: any) => measurements.push(fn) };
    while (effects.length) effects.shift()!();
    return track.props;
  };
  return { render, event: (x: number) => ({ nativeEvent: { pageX: x } }), locks,
    measure: (left = 100, width = 200) => { while (measurements.length) measurements.shift()!(left, 0, width, 44); },
    value: () => score, setValue: (n: number) => { score = n; },
  };
}

test('deferred measurement replays the latest drag coordinate across rerenders, not a stale grant', () => {
  const h = mountedSlider(); let p = h.render();
  p.onResponderGrant(h.event(120));
  p = h.render(); p.onResponderMove(h.event(250));
  h.measure();
  assert.equal(h.value(), 75, 'moves before asynchronous measure must not leave the thumb stuck');
  p = h.render(); p.onResponderRelease(h.event(290));
  assert.equal(h.value(), 95, 'final position is the value offered to Save');
});

test('drag holds the parent scroll lock, survives rerenders and releases on cancellation and repeated drags', () => {
  const h = mountedSlider(); let p = h.render(); p.onLayout({}); h.measure();
  p.onResponderGrant(h.event(150));
  assert.deepEqual(h.locks, [true], 'native ScrollView must not steal the active rating gesture');
  for (const x of [160, 180, 220, 260]) { p = h.render(); p.onResponderMove(h.event(x)); assert.equal(h.value(), (x - 100) / 2); }
  assert.equal(p.onResponderTerminationRequest(), false);
  p.onResponderTerminate(h.event(0));
  assert.equal(h.value(), 80, 'OS cancellation retains the last intentional value; it does not apply a bogus release coordinate');
  assert.equal(h.locks.at(-1), false);
  p = h.render(); p.onResponderGrant(h.event(300)); h.measure();
  p = h.render(); p.onResponderRelease(h.event(100));
  assert.equal(h.value(), 0); assert.equal(h.locks.at(-1), false);
});

test('release before measurement preserves final coordinate and stale measurement cannot overwrite later drag', () => {
  const h = mountedSlider(); let p = h.render();
  p.onResponderGrant(h.event(120)); p.onResponderRelease(h.event(280)); h.measure();
  assert.equal(h.value(), 90);
  p = h.render(); p.onResponderGrant(h.event(180)); p.onResponderTerminate(h.event(0)); h.measure();
  assert.equal(h.value(), 40);
});

test('bounds and accessibility adjustments preserve valid zero separately from unrated', () => {
  const h = mountedSlider(); let p = h.render(); p.onLayout({}); h.measure();
  p.onResponderGrant(h.event(-20)); assert.equal(h.value(), 0);
  p.onResponderMove(h.event(900)); assert.equal(h.value(), 100);
  p.onResponderRelease(h.event(300));
  p = h.render(); p.onAccessibilityAction({ nativeEvent: { actionName: 'increment' } }); assert.equal(h.value(), 100);
  h.setValue(0); p = h.render(); p.onAccessibilityAction({ nativeEvent: { actionName: 'decrement' } }); assert.equal(h.value(), 0);
  p.onAccessibilityAction({ nativeEvent: { actionName: 'increment' } }); assert.equal(h.value(), 1);
  assert.equal(p.accessibilityRole, 'adjustable');
  const editor = readFileSync('app/(app)/(tabs)/cellar.tsx', 'utf8');
  assert.match(editor, /isRated \? <ScoreSlider/);
  assert.match(editor, /rating,\s+isRated,/);
});

test('both production scroll containers bind rating drag lifecycle without changing save/cancel authority', () => {
  for (const file of ['app/(app)/(tabs)/cellar.tsx', 'app/(app)/cellar/add.tsx']) {
    const src = readFileSync(file, 'utf8');
    assert.match(src, /scrollEnabled=\{!ratingDragging\}/, file);
    assert.match(src, /onDraggingChange=\{setRatingDragging\}/, file);
  }
});

test('completed drag cannot replay over a subsequent adjustment or changed layout', () => {
  const h = mountedSlider(); let p = h.render(); p.onLayout({}); h.measure();
  p.onResponderGrant(h.event(200)); h.measure(); p.onResponderRelease(h.event(200));
  p = h.render(); p.onAccessibilityAction({ nativeEvent: { actionName: 'increment' } });
  assert.equal(h.value(), 51);
  p = h.render(); p.onLayout({}); h.measure(0, 400);
  assert.equal(h.value(), 51, 'finished gesture must not replay after layout changes');
});

test('new non-drag adjustment fences a release whose measurement is still pending', () => {
  const h = mountedSlider(); let p = h.render();
  p.onResponderGrant(h.event(120)); p.onResponderRelease(h.event(280));
  h.setValue(25); p = h.render(); p.onAccessibilityAction({ nativeEvent: { actionName: 'increment' } });
  h.measure(); assert.equal(h.value(), 26);
});

test("score slider maps stable screen coordinates to the same clamped 0-100 range as the website", () => {
  assert.equal(scoreFromTrackPageX(200, 100, 200), 50);
  assert.equal(scoreFromTrackPageX(100, 100, 200), 0);
  assert.equal(scoreFromTrackPageX(300, 100, 200), 100);
  assert.equal(scoreFromTrackPageX(72, 100, 200), 0);
  assert.equal(scoreFromTrackPageX(340, 100, 200), 100);
  assert.equal(scoreFromTrackPageX(200, 100, 0), null);
});
