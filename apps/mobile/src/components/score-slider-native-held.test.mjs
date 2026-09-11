import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const mobile = process.cwd();
const require = createRequire(path.join(mobile, 'package.json'));
const ts = require('typescript');

function load(file, mocks) {
  const full = path.join(mobile, file);
  const localRequire = createRequire(full);
  const code = ts.transpileModule(fs.readFileSync(full, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
    },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(
    id => id in mocks ? mocks[id] : localRequire(id), module, module.exports,
  );
  return module.exports;
}

// Execute actual source. Only hooks/native host boundaries are represented.
// Keyboard.dismiss queues real input onBlur behavior instead of suppressing it.
// This deterministic ordering test is NOT a UIKit/physical-iPhone gesture test.
function harness() {
  const slots = [], effects = [], measurements = [], locks = [];
  let cursor = 0, score = 50, input, blur;
  const memo = (fn, deps) => {
    const i = cursor++, previous = slots[i];
    if (!previous || deps.some((x, j) => x !== previous.deps[j])) {
      slots[i] = { value: fn(), deps };
    }
    return slots[i].value;
  };
  const react = {
    useRef: value => memo(() => ({ current: value }), []),
    useCallback: (fn, deps) => memo(() => fn, deps),
    useEffect: (fn, deps) => memo(() => effects.push(fn), deps),
    useState: initial => {
      const i = cursor++;
      if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }];
    },
  };
  const native = {
    View: 'View', Text: 'Text', TextInput: 'TextInput', Pressable: 'Pressable',
    StyleSheet: { create: value => value },
    Keyboard: { dismiss() { blur = () => input.onBlur(); } },
  };
  const { ScoreSlider } = load('src/components/ScoreSlider.tsx', {
    react, 'react-native': native,
    './score-slider-gesture': load('src/components/score-slider-gesture.ts', {}),
    '../theme': { colors: {} },
  });
  const nodes = node => node && typeof node === 'object'
    ? [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)] : [];
  function render() {
    cursor = 0;
    const all = nodes(ScoreSlider({
      value: score, onChange: value => { score = value; },
      onDraggingChange: value => locks.push(value),
    }));
    const track = all.find(node => node.props?.accessibilityRole === 'adjustable').props;
    input = all.find(node => node.type === 'TextInput').props;
    track.ref.current = { measureInWindow: fn => measurements.push(fn) };
    while (effects.length) effects.shift()();
    return track;
  }
  return {
    render, input: () => input, event: x => ({ nativeEvent: { pageX: x } }),
    blur: () => blur?.(), value: () => score, locks,
    measure: () => { while (measurements.length) measurements.shift()(100, 0, 200, 44); },
  };
}

function editDirectEntry(h) {
  h.input().onFocus(); h.render();
  h.input().onChangeText('6.0'); return h.render();
}
const hold = () => new Promise(resolve => setTimeout(resolve, 800));

test('stationary native hold after direct-entry blur retains grant measurement', async () => {
  const h = harness(); h.render();
  let track = editDirectEntry(h);
  track.onResponderGrant(h.event(200)); h.blur(); h.render(); h.measure();
  await hold(); track = h.render();
  track.onResponderMove(h.event(260));
  assert.equal(h.value(), 80, 'late blur must not invalidate measurement and leave width=0');
  track.onResponderRelease(h.event(280));
  assert.equal(h.value(), 90); assert.equal(h.locks.at(-1), false);
});

test('stationary hold with measured bounds cannot jump to stale direct-entry text', async () => {
  const h = harness(); let track = h.render(); track.onLayout({}); h.measure();
  track = editDirectEntry(h);
  track.onResponderGrant(h.event(200)); h.blur(); track = h.render(); h.measure();
  await hold();
  assert.equal(h.value(), 50, 'stationary contact keeps track value, not stale keyboard text');
  assert.equal(h.input().value, '5.0');
  track.onResponderMove(h.event(260)); assert.equal(h.value(), 80);
  track.onResponderTerminate(); assert.equal(h.locks.at(-1), false);
});

test('native blur after release cannot overwrite the final coordinate offered to Save', () => {
  const h = harness(); h.render(); const track = editDirectEntry(h);
  track.onResponderGrant(h.event(200)); track.onResponderRelease(h.event(280));
  h.blur(); h.render(); h.measure();
  assert.equal(h.value(), 90); assert.equal(h.locks.at(-1), false);
});

test('ordinary direct-entry blur still commits outside a track gesture', () => {
  const h = harness(); h.render(); editDirectEntry(h); h.input().onBlur();
  assert.equal(h.value(), 60);
});

test('unfocused stationary hold survives rerender, cancellation and a second drag', async () => {
  const h = harness(); let track = h.render();
  track.onResponderGrant(h.event(200)); h.blur(); h.measure(); await hold();
  track = h.render(); assert.equal(h.value(), 50);
  track.onResponderMove(h.event(260)); assert.equal(h.value(), 80);
  assert.equal(track.onResponderTerminationRequest(), false);
  track.onResponderTerminate(); assert.equal(h.locks.at(-1), false);
  track = h.render(); track.onResponderGrant(h.event(100)); h.measure();
  track.onResponderRelease(h.event(100));
  assert.equal(h.value(), 0); assert.equal(h.locks.at(-1), false);
});

test('stationary rating hold fences native page-sheet dismissal before a rating delta', () => {
  const source = fs.readFileSync(path.join(mobile, 'app/(app)/(tabs)/cellar.tsx'), 'utf8');
  const expression = source.match(/return <Modal allowSwipeDismissal=\{([^}]+)\}/)?.[1];
  assert.ok(expression, 'BottleEditor must expose the native sheet dismissal gate');
  const allows = new Function('dirty', 'busy', 'ratingDragging', `return (${expression})`);
  assert.equal(allows(false, false, true), false, 'clean held rating must fence native dismissal');
  assert.equal(allows(false, false, false), true);
  assert.equal(allows(true, false, false), false);
  assert.equal(allows(false, true, false), false);
});
