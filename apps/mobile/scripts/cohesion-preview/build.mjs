import { build } from 'esbuild';
import { mkdir, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const mobile=path.resolve(here,'../..');
const out=path.join(mobile,'dist/cohesion-preview');
await mkdir(out,{recursive:true});
const mock=path.join(here,'mocks.jsx');
const authMock=path.join(here,'auth-provider-mocks.jsx');
await build({entryPoints:[path.join(here,'preview.jsx')],bundle:true,outdir:out,platform:'browser',format:'esm',jsx:'automatic',resolveExtensions:['.web.tsx','.web.ts','.web.js','.tsx','.ts','.jsx','.js','.json'],loader:{'.png':'file','.jpg':'file','.ttf':'file'},define:{'process.env.NODE_ENV':'"development"','__DEV__':'true'},plugins:[{name:'native-fixture',setup(b){
 b.onResolve({filter:/^react-native$/},()=>({path:path.join(here,'native.jsx')}));
 b.onResolve({filter:/@expo\/vector-icons/},()=>({path:path.join(here,'icons.jsx')}));
 b.onResolve({filter:/expo-router|@clerk\/expo|expo-secure-store|expo-crypto|expo-updates|useMobileApi$|push-registration$|PushResponseHandler$|sighting-photo-native$|PurchasesProvider$/},()=>({path:mock}));
 b.onResolve({filter:/^expo-constants$/},()=>({path:path.join(here,'constants.js')}));
}}]});
await copyFile(path.join(mobile,'node_modules/@expo-google-fonts/fraunces/700Bold/Fraunces_700Bold.ttf'),path.join(out,'fraunces.ttf'));
await writeFile(path.join(out,'index.html'),`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>@font-face{font-family:Fraunces_700Bold;src:url('./fraunces.ttf')}html,body,#root{margin:0;min-height:100%;background:#0b0a09}button,select{font:14px system-ui;padding:8px;border:1px solid #68523b;border-radius:8px;background:#211c17;color:#f3ece2;cursor:pointer}nav{display:flex;gap:8px;flex-wrap:wrap;padding:12px;justify-content:center}*{box-sizing:border-box}</style></head><body><div id="root"></div><script type="module" src="./preview.js?v=${Date.now()}"></script></body></html>`);
console.log(out);
await build({entryPoints:[path.join(here,'auth-provider.jsx')],outfile:path.join(out,'auth.js'),bundle:true,platform:'browser',format:'esm',jsx:'automatic',loader:{'.png':'file'},define:{'process.env.NODE_ENV':'"development"','__DEV__':'true'},plugins:[{name:'auth-fixture',setup(b){
 b.onResolve({filter:/^react-native$/},()=>({path:path.join(here,'native.jsx')}));
 b.onResolve({filter:/@clerk\/expo|expo-router|\/api\/client$/},()=>({path:authMock}));
}}]});
await writeFile(path.join(out,'auth.html'),`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>html,body,#root{margin:0;background:#0b0a09;max-width:390px;margin:auto}input{font:16px system-ui;padding:10px}button{padding:10px}</style></head><body><div id="root"></div><script type="module" src="./auth.js?v=${Date.now()}"></script></body></html>`);

await build({entryPoints:[path.join(here,'owner-web.jsx')],alias:{react:path.join(mobile,'node_modules/react'),'react-dom':path.join(mobile,'node_modules/react-dom')},bundle:true,outfile:path.join(out,'owner-web.js'),platform:'browser',format:'esm',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'web-fixture',setup(b){b.onResolve({filter:/^next\/link$|AdminSightingsClient$|AdminBottleQueueClient$|SignalPointRewardQueue$/},()=>({path:path.join(here,'web-leaf.jsx')}));b.onResolve({filter:/^@\//},args=>({path:path.resolve(mobile,'../../src',args.path.slice(2)+'.tsx')}));}}]});
await writeFile(path.join(out,'admin.html'),`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="./owner-web.css"><style>body{margin:0;background:#0b0a09;font-family:system-ui}*{box-sizing:border-box}</style></head><body><div id="root"></div><script type="module" src="./owner-web.js"></script></body></html>`);
