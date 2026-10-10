// Offline browser fixture: actual Radar screen, synthetic API and native boundaries.
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const output = path.join(root, 'dist/radar-preview');
await mkdir(output, { recursive: true });
await build({ entryPoints: [path.join(here, 'entry.jsx')], outfile: path.join(output, 'app.js'), bundle: true, platform: 'browser', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"development"', __DEV__: 'true' }, plugins: [{ name: 'offline-boundaries', setup(b) {
  b.onResolve({ filter: /^react-native$/ }, () => ({ path: fileURLToPath(import.meta.resolve('react-native-web')) }));
  b.onResolve({ filter: /^@expo\/vector-icons\/MaterialCommunityIcons$/ }, () => ({ path: path.resolve(here, '../community-preview/icons.tsx') }));
  b.onResolve({ filter: /^(expo-router|react-native-safe-area-context)$|\/(useMobileApi|useScreenRevalidation)$|\/push\/push-registration$/ }, () => ({ path: path.join(here, 'fixture.tsx') }));
} } ] });
await copyFile(path.join(root,'node_modules/@expo-google-fonts/fraunces/700Bold/Fraunces_700Bold.ttf'),path.join(output,'fraunces.ttf'));
await copyFile(path.join(root,'node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/MaterialCommunityIcons.ttf'),path.join(output,'icons.ttf'));
await writeFile(path.join(output, 'index.html'), `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Radar · Local preview</title><style>@font-face{font-family:Fraunces_700Bold;src:url(fraunces.ttf)}@font-face{font-family:MaterialCommunityIcons;src:url(icons.ttf)}html,body,#root{height:100%;margin:0;background:#090806}body{font-family:system-ui}*{box-sizing:border-box}</style></head><body><div id="root"></div><script src="app.js"></script></body></html>`);
console.log(output);
