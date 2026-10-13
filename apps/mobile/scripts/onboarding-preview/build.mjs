import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
const here = path.dirname(fileURLToPath(import.meta.url)); const root = path.resolve(here, '../..'); const output = path.join(root, 'dist/onboarding-preview');
await mkdir(output, { recursive: true });
await build({ entryPoints: [path.join(here, 'entry.tsx')], outfile: path.join(output, 'app.js'), bundle: true, platform: 'browser', jsx: 'automatic', loader: { '.png': 'file', '.jpg': 'file', '.webp': 'file' }, define: { 'process.env.NODE_ENV': '"development"', __DEV__: 'true', global: 'globalThis' }, plugins: [{ name: 'offline-boundaries', setup(b) {
  b.onResolve({ filter: /^react-native$/ }, () => ({ path: path.join(here, 'native-preview.mjs') }));
  b.onResolve({ filter: /^(@clerk\/expo|expo-router|expo-secure-store|react-native-safe-area-context)$|\/(useMobileApi|useAccessibleStatus)$|\/membership\/PurchasesProvider$|\/push\/push-registration$/ }, () => ({ path: path.join(here, 'fixture.tsx') }));
} }] });
await copyFile(path.join(root, 'node_modules/@expo-google-fonts/fraunces/700Bold/Fraunces_700Bold.ttf'), path.join(output, 'fraunces.ttf'));
await writeFile(path.join(output, 'index.html'), '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Onboarding · Local preview</title><style>@font-face{font-family:Fraunces_700Bold;src:url(fraunces.ttf)}html,body,#root{height:100%;margin:0;background:#0B0A09}body{font-family:system-ui}*{box-sizing:border-box}</style></head><body><div id="root"></div><script src="app.js"></script></body></html>');
console.log(output);
