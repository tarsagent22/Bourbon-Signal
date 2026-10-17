import { build } from 'esbuild';
import { mkdir, copyFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
const here=import.meta.dirname,mobile=path.resolve(here,'../..'),negative=process.argv.includes('--negative'),camera=process.argv.includes('--camera'),out=path.join(mobile,'dist/navigation-preview'+(negative?'-negative':camera?'-camera':''));
await mkdir(out,{recursive:true});
await build({entryPoints:[path.join(here,'entry.tsx')],outfile:path.join(out,'app.js'),bundle:true,platform:'browser',jsx:'automatic',resolveExtensions:['.web.tsx','.web.ts','.web.js','.tsx','.ts','.jsx','.js','.json'],loader:{'.js':'jsx','.png':'file','.jpg':'file','.webp':'file','.ttf':'file'},define:{'process.env.NODE_ENV':'"development"','process.env':'{}',__DEV__:'true',global:'globalThis'},plugins:[{name:'native-boundaries-real-navigation',setup(b){
 b.onResolve({filter:/^react-native$/},()=>({path:path.join(here,'../continuity-preview/native.jsx')}));
 b.onResolve({filter:/^@expo\/vector-icons(\/MaterialCommunityIcons)?$/},()=>({path:path.join(here,'../cohesion-preview/icons.jsx')}));
 b.onResolve({filter:/^expo-router$/},()=>({path:path.join(here,'navigation.tsx')}));
 if(camera){
  b.onResolve({filter:/\/NativeBottleScanner$/},()=>({path:path.join(mobile,'src/scanner/NativeBottleScanner.native.tsx')}));
  b.onResolve({filter:/^(expo|expo-camera|expo-file-system|expo-image-manipulator)$/},()=>({path:path.join(here,'../bottle-profile-preview/scanner-fixture.tsx')}));
 }
 b.onResolve({filter:/^expo-router\/build\//},args=>({path:path.join(mobile,'node_modules',args.path)+'.js'}));
 b.onResolve({filter:/react-navigation\/native$/},()=>({path:path.join(mobile,'node_modules/expo-router/build/react-navigation/core/index.js')}));
 b.onResolve({filter:/^(@clerk\/expo|expo-secure-store|expo-crypto|expo-updates|react-native-safe-area-context)$|\/(useMobileApi|NativeBottleScanner)$|\/membership\/PurchasesProvider$|\/push\/(push-registration|PushResponseHandler)$|\/sighting-photo-native$|\/activity\/useMobileActivity$/},()=>({path:path.join(here,'boundaries.tsx')}));
 b.onResolve({filter:/^expo-constants$/},()=>({path:path.join(here,'../cohesion-preview/constants.js')}));
 if(negative)b.onLoad({filter:/app[\\/]\(app\)[\\/]bottle-check\.tsx$/},()=>({contents:execFileSync('git',['show','7def5a40:apps/mobile/app/(app)/bottle-check.tsx'],{cwd:mobile,encoding:'utf8'}),loader:'tsx',resolveDir:path.join(mobile,'app/(app)')}));
}}]});
await copyFile(path.join(mobile,'node_modules/@expo-google-fonts/fraunces/700Bold/Fraunces_700Bold.ttf'),path.join(out,'fraunces.ttf'));
await copyFile(path.join(mobile,'node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/MaterialCommunityIcons.ttf'),path.join(out,'icons.ttf'));
await writeFile(path.join(out,'index.html'),'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@font-face{font-family:Fraunces_700Bold;src:url(fraunces.ttf)}@font-face{font-family:MaterialCommunityIcons;src:url(icons.ttf)}html,body,#root{height:100%;margin:0;background:#0B0A09}#root{display:flex;flex-direction:column}*{box-sizing:border-box}</style></head><body><div id="root"></div><script src="app.js"></script></body></html>');console.log(out);
