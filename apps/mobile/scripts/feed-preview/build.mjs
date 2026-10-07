import {build} from 'esbuild';
import {mkdir,writeFile,copyFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));const mobile=path.resolve(here,'../..');const out=path.join(mobile,'dist/feed-preview');await mkdir(out,{recursive:true});
await build({entryPoints:[path.join(here,'preview.jsx')],outfile:path.join(out,'preview.js'),bundle:true,platform:'browser',format:'esm',jsx:'automatic',resolveExtensions:['.web.tsx','.web.ts','.web.js','.tsx','.ts','.jsx','.js','.json'],loader:{'.png':'file','.jpg':'file','.ttf':'file'},define:{'process.env.NODE_ENV':'"development"','__DEV__':'true'},plugins:[{name:'native-fixture',setup(b){
 b.onResolve({filter:/^react-native$/},()=>({path:path.join(here,'../cohesion-preview/native.jsx')}));
 b.onResolve({filter:/@expo\/vector-icons/},()=>({path:path.join(here,'../cohesion-preview/icons.jsx')}));
 b.onResolve({filter:/expo-router|@clerk\/expo|expo-secure-store|expo-file-system\/legacy|expo-crypto|expo-updates|useMobileApi$|PushResponseHandler$/},()=>({path:path.join(here,'mocks.jsx')}));
}}]});
await copyFile(path.join(mobile,'node_modules/@expo-google-fonts/fraunces/700Bold/Fraunces_700Bold.ttf'),path.join(out,'fraunces.ttf'));
await writeFile(path.join(out,'index.html'),`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>@font-face{font-family:Fraunces_700Bold;src:url('./fraunces.ttf')}html,body,#root{margin:0;min-height:100%;background:#0b0a09;color:#e8dac7;font:14px system-ui}nav{display:flex;gap:8px;padding:12px;flex-wrap:wrap}button{font:14px system-ui;padding:10px;background:#211c17;color:#f3ece2;border:1px solid #68523b;border-radius:8px}p{margin:8px 16px}*{box-sizing:border-box}</style></head><body><div id="root"></div><script type="module" src="./preview.js"></script></body></html>`);
console.log(out);
