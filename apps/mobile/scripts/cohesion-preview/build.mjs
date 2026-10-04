import { build } from 'esbuild';
import { mkdir, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const mobile=path.resolve(here,'../..');
const out=path.join(mobile,'dist/cohesion-preview');
await mkdir(out,{recursive:true});
const mock=path.join(here,'mocks.jsx');
await build({entryPoints:[path.join(here,'preview.jsx')],bundle:true,outdir:out,platform:'browser',format:'esm',jsx:'automatic',resolveExtensions:['.web.tsx','.web.ts','.web.js','.tsx','.ts','.jsx','.js','.json'],loader:{'.png':'file','.jpg':'file','.ttf':'file'},define:{'process.env.NODE_ENV':'"development"','__DEV__':'true'},plugins:[{name:'native-fixture',setup(b){
 b.onResolve({filter:/^react-native$/},()=>({path:path.join(here,'native.jsx')}));
 b.onResolve({filter:/@expo\/vector-icons/},()=>({path:path.join(here,'icons.jsx')}));
 b.onResolve({filter:/expo-router|@clerk\/expo|expo-secure-store|expo-crypto|expo-updates|useMobileApi$|push-registration$|PushResponseHandler$|sighting-photo-native$|PurchasesProvider$/},()=>({path:mock}));
 b.onResolve({filter:/^expo-constants$/},()=>({path:path.join(here,'constants.js')}));
}}]});
await copyFile(path.join(mobile,'node_modules/@expo-google-fonts/fraunces/700Bold/Fraunces_700Bold.ttf'),path.join(out,'fraunces.ttf'));
await writeFile(path.join(out,'index.html'),`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>@font-face{font-family:Fraunces_700Bold;src:url('./fraunces.ttf')}html,body,#root{margin:0;min-height:100%;background:#0b0a09}button,select{font:14px system-ui;padding:8px;border:1px solid #68523b;border-radius:8px;background:#211c17;color:#f3ece2;cursor:pointer}nav{display:flex;gap:8px;flex-wrap:wrap;padding:12px;justify-content:center}*{box-sizing:border-box}</style></head><body><div id="root"></div><script type="module" src="./preview.js?v=${Date.now()}"></script></body></html>`);
console.log(out);
