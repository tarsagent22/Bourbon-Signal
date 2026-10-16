import { build } from 'esbuild';
import path from 'node:path';
import { mkdir, copyFile, writeFile } from 'node:fs/promises';
const here = import.meta.dirname, root = path.resolve(here, '../..'), output = path.join(root, 'dist/bottle-profile-preview');
await mkdir(output, { recursive: true });
await build({ entryPoints: [path.join(here, 'entry.tsx')], outfile: path.join(output, 'app.js'), bundle: true, platform: 'browser', resolveExtensions: ['.web.tsx', '.web.ts', '.web.js', '.tsx', '.ts', '.js'], jsx: 'automatic', loader: { '.js': 'jsx', '.png': 'file', '.jpg': 'file', '.webp': 'file', '.ttf': 'file' }, define: { 'process.env': '{}', 'process.env.NODE_ENV': '"development"', __DEV__: 'true', global: 'globalThis' }, plugins: [{ name: 'preview-boundaries', setup(b) {
  if (process.env.SCANNER_PREVIEW === '1') {
  b.onResolve({filter: /\/NativeBottleScanner$/}, () => ({path:path.join(root,'src/scanner/NativeBottleScanner.native.tsx')}));
  b.onResolve({filter: /^(expo|expo-camera|expo-file-system|expo-image-manipulator)$/}, () => ({path:path.join(here,'scanner-fixture.tsx')}));
}
  b.onResolve({ filter: /^react-native$/ }, () => ({ path: path.join(root, 'node_modules/react-native-web/dist/index.js') }));
  b.onResolve({ filter: /^node:async_hooks$/ }, () => ({ path: 'server-only-font-context', namespace: 'preview' }));
  b.onLoad({ filter: /.*/, namespace: 'preview' }, () => ({ contents: 'export class AsyncLocalStorage { constructor() { throw new Error("Server font context must not run in the browser"); } }', loader: 'js' }));
  b.onResolve({ filter: /^expo-router$|^expo-secure-store$|^react-native-safe-area-context$|\/(useMobileApi|useScreenRevalidation)$/ }, () => ({ path: path.join(here, 'fixture.tsx') }));
} }] });
await copyFile(path.join(root, 'node_modules/@expo-google-fonts/fraunces/700Bold/Fraunces_700Bold.ttf'), path.join(output, 'fraunces.ttf'));
await writeFile(path.join(output, 'index.html'), '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Bottle Profile · Local source preview</title><style>@font-face{font-family:Fraunces_700Bold;src:url(fraunces.ttf)}html,body,#root{height:100%;margin:0;background:#0B0A09}*{box-sizing:border-box}</style></head><body><div id="root"></div><script src="app.js"></script></body></html>');
console.log(output);
