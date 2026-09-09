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
  const state: any[] = []; let cursor = 0;
  const jsx = (type: string, props: Element['props']) => ({ type, props });
  const module = { exports: {} as any };
  const customRequire = (name: string): any => {
    if (name === 'react') return {
      useMemo: (fn: () => any) => fn(),
      useState: (initial: any) => { const i = cursor++; if (!(i in state)) state[i] = initial; return [state[i], (next: any) => { state[i] = typeof next === 'function' ? next(state[i]) : next; }]; },
    };
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
    if (name === 'react-native') return { Image: 'Image', View: 'View', Text: 'Text', Pressable: 'Pressable', Modal: 'Modal', ScrollView: 'ScrollView', StyleSheet: { create: (s: any) => s, absoluteFill: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 } } };
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
  const render = () => { cursor = 0; return module.exports.ShelfCabinet({ bottles, shelfStyle: theme, busy: false, onStyle: async () => true, onBottle: () => {} }) as Element; };
  return { render };
}
function descendants(node: any): Element[] {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(descendants);
  return [node, ...descendants(node.props?.children)];
}
function geometry(tree: Element) {
  const nodes = descendants(tree);
  const parent = nodes.find(n => n.props?.testID === 'shelf-cabinet')!;
  const image = nodes.find(n => n.type === 'Image' && n.props.source.uri.includes('/shelf/') && !n.props.source.uri.includes('contact-shadow'))!;
  const source = image.props.source;
  // Image.ios.js: style = [{width, height}, styles.base, props.style].
  const style = flatten([{ width: source.width, height: source.height }, { overflow: 'hidden' }, image.props.style]);
  return { parent, image, style, nodes };
}
test('installed RN native static-source path establishes intrinsic sizing precedence', () => {
  const rn = new URL('node_modules/react-native/', mobile);
  const ios = readFileSync(new URL('Libraries/Image/Image.ios.js', rn), 'utf8');
  assert.match(ios, /const width = source.width \?\? props.width/);
  assert.match(ios, /style = \[\{width, height\}, styles.base, props.style\]/);
  const resolver = readFileSync(new URL('Libraries/Image/AssetSourceResolver.js', rn), 'utf8');
  assert.match(resolver, /width: this.asset.width/); assert.match(resolver, /height: this.asset.height/);
  const yoga = readFileSync(new URL('ReactCommon/yoga/yoga/algorithm/AbsoluteLayout.cpp', rn), 'utf8');
  assert.ok(yoga.indexOf('hasDefiniteLength(Dimension::Width') < yoga.indexOf("If the child doesn't have a specified width"));
  assert.ok(yoga.indexOf('hasDefiniteLength(Dimension::Height') < yoga.indexOf("If the child doesn't have a specified height"));
  // Mutation/repro: opposing insets do not clear the injected definite lengths.
  const old = flatten([{ width: 1230, height: 780 }, { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }]);
  assert.equal(old.width, 1230); assert.equal(old.height, 780);
});
for (const theme of ['amber', 'walnut', 'black']) for (const count of [0, 6, 10, 12, 20]) for (const width of [320, 390, 430]) {
  test(`native image measured geometry beats intrinsic source: ${theme} count=${count} width=${width}`, () => {
    const h = harness(count, theme);
    let g = geometry(h.render());
    assert.ok(Number.isFinite(g.style.width) && g.style.width >= 0);
    assert.ok(Number.isFinite(g.style.height) && g.style.height >= 0);
    assert.equal(g.style.height, flatten(g.parent.props.style).height, 'safe initial image and parent share height');
    g.parent.props.onLayout({ nativeEvent: { layout: { width } } });
    g = geometry(h.render());
    const expectedHeight = width * g.image.props.source.height / g.image.props.source.width;
    assert.equal(g.style.width, width, 'native injected width must be overwritten, not clipped');
    assert.equal(g.style.height, expectedHeight, 'native injected height must be overwritten, not clipped');
    assert.equal(g.style.left, 0); assert.equal(g.style.top, 0);
    assert.equal(g.style.position, 'absolute');
    assert.equal(flatten(g.parent.props.style).height, expectedHeight);
    assert.equal(flatten(g.parent.props.style).overflow, 'hidden', 'defensive clipping after numeric sizing');
    const key = count <= 10 ? '1' : count <= 16 ? '2spacious' : '2';
    const plate = JSON.parse(readFileSync(new URL('assets/shelf/placement.json', mobile), 'utf8'))[key];
    const rows = g.nodes.filter(n => n.props?.testID === 'cabinet-row');
    rows.forEach((row, i) => {
      const s = flatten(row.props.style);
      assert.ok(Math.abs(s.top + s.height - expectedHeight * plate.baselineY[i]) < 1e-8, 'photos remain on matching image baseline');
    });
    assert.equal(g.nodes.filter(n => n.props?.testID === 'cabinet-bottle').length, count);
    // Transient zero/invalid layout must not corrupt the last valid measured frame.
    for (const invalid of [0, -1, NaN, Infinity]) {
      g.parent.props.onLayout({ nativeEvent: { layout: { width: invalid } } });
      const next = geometry(h.render()); assert.equal(next.style.width, width); assert.equal(next.style.height, expectedHeight);
    }
  });
}
