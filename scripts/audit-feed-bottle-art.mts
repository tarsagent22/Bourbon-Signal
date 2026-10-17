import {readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {resolveLabeledBottleArtwork:resolve}=require('../shared/labeled-bottle-artwork.ts') as typeof import('../shared/labeled-bottle-artwork');
const catalog=require('../apps/mobile/src/cellar/bottle-catalog-seed.json');
const args=process.argv.slice(2);
const value=(name:string)=>args.includes(name)?args[args.indexOf(name)+1]:undefined;
const input=value('--input')||new URL('./fixtures/feed-bottle-artwork-20261017.json',import.meta.url);
const payload=JSON.parse(await readFile(input,'utf8'));
const rows=Array.isArray(payload)?payload:payload.entries||payload.signals||payload.drops||payload.payload?.drops;
if(!Array.isArray(rows))throw new Error('Expected feed signals, drops or artwork fixture entries.');
const identities=new Map<string,{bottleId:string;bottleName:string;occurrences:number;artworkId:string|null}>();
for(const row of rows){
 const bottleId=String(row.bottleId??row.bottle?.id??row.bottle_id??row.canonicalId??row.canonical_id??row.id??'');
 const bottleName=String(row.bottleName??row.bottle?.name??row.canonicalName??row.canonical_name??row.name??'');
 if(!bottleName)throw new Error('Every input row must provide a bottle name.');
 const key=JSON.stringify([bottleId,bottleName]),existing=identities.get(key);
 if(existing){existing.occurrences++;continue;}
 identities.set(key,{bottleId,bottleName,occurrences:1,artworkId:resolve({bottleId,bottleName},catalog)?.catalogId??null});
}
const missing=[...identities.values()].filter(row=>!row.artworkId);
const report={checkedAt:new Date().toISOString(),source:payload.source??null,rows:rows.length,identities:identities.size,uniqueNames:new Set([...identities.values()].map(row=>row.bottleName)).size,fallbackIdentities:missing.length,fallbackNames:new Set(missing.map(row=>row.bottleName)).size,fallbackRows:missing.reduce((sum,row)=>sum+row.occurrences,0),missing};
if(value('--report'))await writeFile(value('--report')!,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(args.includes('--require-complete')&&missing.length)process.exitCode=1;
