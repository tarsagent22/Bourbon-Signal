import { build } from 'esbuild';
import path from 'node:path';
import { mkdir, copyFile, writeFile } from 'node:fs/promises';
const here = import.meta.dirname; const mobile = path.resolve(here, '../..'); const output = path.join(mobile, 'dist/continuity-preview');
await mkdir(output, { recursive: true });
await build({ entryPoints: [path.join(here, 'entry.tsx')], outfile: path.join(output, 'app.js'), bundle: true, platform: 'browser', jsx: 'automatic', resolveExtensions: ['.web.tsx', '.web.ts', '.web.js', '.tsx', '.ts', '.jsx', '.js', '.json'], loader: { '.js': 'jsx', '.png': 'file', '.jpg': 'file', '.webp': 'file', '.ttf': 'file' }, define: { 'process.env.NODE_ENV': '"development"', 'process.env': '{}', __DEV__: 'true', global: 'globalThis' }, plugins: [{ name: 'local-preview-boundaries', setup(b) {
  b.onResolve({ filter: /^react-native$/ }, () => ({ path: path.join(here, 'native.jsx') }));
  b.onResolve({ filter: /^@expo\/vector-icons(\/MaterialCommunityIcons)?$/ }, () => ({ path: path.join(here, '../cohesion-preview/icons.jsx') }));
  b.onResolve({ filter: /^(@clerk\/expo|expo-router|expo-secure-store|expo-crypto|expo-updates|react-native-safe-area-context)$|\/(useMobileApi|NativeBottleScanner)$|\/membership\/PurchasesProvider$|\/push\/push-registration$|\/sighting-photo-native$/ }, () => ({ path: path.join(here, 'fixture.tsx') }));
  b.onResolve({ filter: /^expo-router\/react-navigation$/ }, () => ({ path: path.join(here, 'fixture.tsx') }));
  b.onResolve({ filter: /^expo-constants$/ }, () => ({ path: path.join(here, '../cohesion-preview/constants.js') }));
} }] });
await copyFile(path.join(mobile, 'node_modules/@expo-google-fonts/fraunces/700Bold/Fraunces_700Bold.ttf'), path.join(output, 'fraunces.ttf'));
await copyFile(path.join(mobile, 'node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/MaterialCommunityIcons.ttf'), path.join(output, 'icons.ttf'));
await writeFile(path.join(output, 'index.html'), '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>@font-face{font-family:Fraunces_700Bold;src:url(fraunces.ttf)}@font-face{font-family:MaterialCommunityIcons;src:url(icons.ttf)}html,body,#root{height:100%;margin:0;background:#0B0A09}*{box-sizing:border-box}</style></head><body><div id="root"></div><script src="app.js"></script></body></html>');
console.log(output);
