import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as shelf from './shelf-cabinet';

// Native-boundary model, NOT RNW or a physical-iPhone renderer. Render the real
// component with state/host adapters; inject static asset dimensions exactly as
// RN Image.ios does, then apply Yoga's definite-length-before-insets rule.
type Element = { type: string; props: Record<string, any> };
const mobile = new URL('../../', import.meta.url);
const componentUrl = new URL('../components/ShelfCabinet.tsx', import.meta.url);
const component = readFileSync(componentUrl, 'utf8');
const requireHere = createRequire(import.meta.url);
function flatten(style: any): Record<string, any> {
  return Array.isArray(style) ? Object.assign({}, ...style.map(flatten)) : style || {};
}
function harness(count: number, theme: string) {
  const state: any[] = []; let cursor = 0; let opened: any;
  const jsx = (type: string, props: Element['props']) => ({ type, props });
  const module = { exports: {} as any };
  const customRequire = (name: string): any => {
    if (name === 'react') return {
      useMemo: (fn: () => any) => fn(),
      useState: (initial: any) => { const i = cursor++; if (!(i in state)) state[i] = initial; return [state[i], (next: any) => { state[i] = typeof next === 'function' ? next(state[i]) : next; }]; },
    };
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
    if (name === 'react-native') return { Image: 'Image', View: 'View', Text: 'Text', Pressable: 'Pressable', Modal: 'Modal', ScrollView: 'ScrollView', Platform: { select: (options: any) => options.ios }, StyleSheet: { create: (s: any) => s, absoluteFill: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 } } };
    if (name === 'react-native-safe-area-context') return { SafeAreaView: 'SafeAreaView' };
    if (name === '../cellar/shelf-cabinet') return shelf;
    if (name === './CellarBottleArtwork') return { CellarBottleArtwork: 'Artwork' };
    const url = new URL(name, componentUrl);
    if (name.endsWith('.png')) { const png = readFileSync(url); return { uri: url.href, width: png.readUInt32BE(16), height: png.readUInt32BE(20) }; }
    if (name.endsWith('.json')) return JSON.parse(readFileSync(url, 'utf8'));
    return requireHere(name);
  };
  const compiled = ts.transpileModule(component, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  runInNewContext(compiled, { module, exports: module.exports, require: customRequire });
  const bottles = Array.from({ length: count }, (_, i) => ({ bottleId: String(i), bottleName: String(i), canonicalKey: String(i), rating: 80, isRated: true, sealedQuantity: 1, openedQuantity: 0, tastedOnly: false }));
  const render = () => { cursor = 0; return module.exports.ShelfCabinet({ bottles, shelfStyle: theme, busy: false, onStyle: async () => true, onBottle: (bottle: any) => { opened = bottle; } }) as Element; };
  return { render, opened: () => opened, setMode: (mode: string) => { state[0] = mode; } };
}
function descendants(node: any): Element[] {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(descendants);
  return [node, ...descendants(node.props?.children)];
}

// Render the actual showcase with host adapters. The old cabinet's native
// intrinsic-image geometry is retired: the ledge is a layout-sized View.
for (const count of [0, 1, 2, 3, 20]) test(`showcase count=${count} has one ledge and at most three bottles`, () => {
 const nodes = descendants(harness(count, 'walnut').render());
 assert.equal(nodes.filter(n => n.props?.testID === 'showcase-bottle').length, Math.min(count, 3));
 assert.equal(nodes.filter(n => n.props?.testID === 'showcase-ledge').length, count ? 1 : 0);
 assert.equal(nodes.filter(n => n.type === 'Image').length, 0, 'no intrinsic-sized cabinet background');
 assert.ok(nodes.filter(n => n.type === 'Artwork').every(n => n.props.size === 'showcase'));
 const names = nodes.filter(n => n.type === 'Text').map(n => n.props.children);
 if (count) assert.ok(names.includes('0'), 'names accompany bottles');
});
test('actual showcase tabs switch content and bottle taps open exact details', () => {
 const h = harness(6, 'walnut');
 let nodes = descendants(h.render());
 nodes.find(n => n.props?.testID === 'showcase-bottle')!.props.onPress();
 assert.equal(h.opened().bottleId, '0');
 const tabs = nodes.filter(n => n.props?.accessibilityRole === 'tab');
 tabs[1].props.onPress();
 nodes = descendants(h.render());
 assert.equal(nodes.filter(n => n.props?.accessibilityRole === 'tab')[1].props.accessibilityState.selected, true);
 assert.equal(nodes.filter(n => n.props?.testID === 'showcase-bottle').length, 3);
 nodes.filter(n => n.props?.accessibilityRole === 'tab')[2].props.onPress();
 nodes = descendants(h.render());
 assert.equal(nodes.filter(n => n.props?.testID === 'showcase-bottle').length, 0, 'buy-again never invents favorites');
 assert.ok(nodes.some(n => n.type === 'Text' && String(n.props.children).includes('Would buy again')));
});

test('legacy finishes share a default shelf without customization controls', () => {
 const renders = ['amber', 'walnut', 'black'].map(theme => descendants(harness(3, theme).render()));
 const ledge = (nodes: Element[]) => flatten(nodes.find(n => n.props?.testID === 'showcase-ledge')!.props.style);
 assert.equal(JSON.stringify(ledge(renders[0])), JSON.stringify(ledge(renders[1])));
 assert.equal(JSON.stringify(ledge(renders[1])), JSON.stringify(ledge(renders[2])));
 for (const nodes of renders) {
  assert.equal(nodes.some(n => n.type === 'Modal' || n.props?.accessibilityRole === 'radio'), false);
  assert.equal(nodes.filter(n => n.type === 'Pressable').length, 9);
 }
});
