import {readFile,writeFile} from 'node:fs/promises';
const source=JSON.parse(await readFile(new URL('../src/lib/achievement-catalog.json',import.meta.url),'utf8'));
for(const [path,name] of [['../apps/mobile/src/rewards/badge-catalog.ts','badgeCatalog'],['../src/lib/achievement-definitions.ts','achievementCatalog']]) {
 const text='// Generated from src/lib/achievement-catalog.json. Run node scripts/generate-achievement-catalog.mjs.\nexport const '+name+' = '+JSON.stringify(source,null,2)+(name==='badgeCatalog'?' as const':'')+';\n';
 const target=new URL(path,import.meta.url);
 if(process.argv.includes('--check')){if(await readFile(target,'utf8')!==text)throw Error('Badge catalog has drifted: '+path)}else await writeFile(target,text);
}
