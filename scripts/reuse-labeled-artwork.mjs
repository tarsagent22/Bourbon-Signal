// Apply explicitly reviewed same-expression mappings. Never infer from bottle shape.
import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const manifestPath='.operator/labeled-art-manifest.json';
const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
const rows=JSON.parse(await readFile(process.argv[2],'utf8'));
const products=(await Promise.all([1,2,3,4,5,6].map(async n=>JSON.parse(await readFile(`apps/mobile/assets/bottles/label-free-v${n}/catalog.json`,'utf8'))))).flatMap(b=>b.products);
const known=new Set(manifest.assets.flatMap(a=>a.products.map(p=>p.id)));
for(const row of rows){
 if(row.reviewed!==true || !row.reviewNotes?.trim() || !row.reference) throw new Error(`${row.id}: completed reference review required`);
 if(known.has(row.id)) throw new Error(`${row.id}: already mapped`);
 const source=manifest.assets.find(a=>a.products.some(p=>p.id===row.sourceId));
 const product=products.find(p=>p.id===row.id);
 if(!source || !product) throw new Error(`${row.id}: unknown identity or source`);
 source.products.push({id:product.id,name:product.name,...(product.names?{names:product.names}:{})});
 source.reuseReviews??=[];source.reuseReviews.push(row);known.add(row.id);
}
await writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n');
for(const script of ['prepare-labeled-bottle-art.mjs','audit-labeled-bottle-art.mjs'])execFileSync(process.execPath,[`scripts/${script}`,...(script.startsWith('prepare')?[manifestPath]:[])],{stdio:'inherit'});
