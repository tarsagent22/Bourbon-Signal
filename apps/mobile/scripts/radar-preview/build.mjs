// Offline browser fixture: actual Radar screen, synthetic API and native boundaries.
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const output = path.join(root, 'dist/radar-preview');
await mkdir(output, { recursive: true });
await build({ entryPoints: [path.join(here, 'entry.jsx')], outfile: path.join(output, 'app.js'), bundle: true, platform: 'browser', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"development"', __DEV__: 'true' }, plugins: [{ name: 'offline-boundaries', setup(b) {
  b.onResolve({ filter: /^react-native$/ }, () => ({ path: fileURLToPath(import.meta.resolve('react-native-web')) }));
  b.onResolve({ filter: /^(expo-router|react-native-safe-area-context)$|\/hooks\/useMobileApi$|\/push\/push-registration$/ }, () => ({ path: path.join(here, 'fixture.tsx') }));
} } ] });
await writeFile(path.join(output, 'index.html'), `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Radar · Local preview</title><style>html,body,#root{height:100%;margin:0;background:#090806}body{font-family:system-ui}*{box-sizing:border-box}</style></head><body><div id="root"></div><script src="app.js"></script></body></html>`);
console.log(output);
