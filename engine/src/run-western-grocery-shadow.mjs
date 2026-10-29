import { mkdir,readFile,writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { fetchWithMeta } from './core/fetcher.mjs';
import { BourbonBible } from './core/bible.mjs';
import { collectGroceryExpansion } from './collectors/grocery-xapi-expansion.mjs';

const args=Object.fromEntries(process.argv.slice(2).map(arg=>{const split=arg.indexOf('=');return[arg.slice(2,split),arg.slice(split+1)];}));
if(!['WA','CA','NM'].includes(args.state) || !args.output)throw new Error('Use --state=WA|CA|NM --output=<new directory>');
const output=path.resolve(args.output);
await mkdir(output,{recursive:false});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const root=fileURLToPath(new URL('../../',import.meta.url));
const git=(...command)=>execFileSync('git',command,{cwd:root,encoding:'utf8'}).trim();
const sourceCommit=git('rev-parse','HEAD');
const trackedChanges=git('status','--porcelain','--untracked-files=no');
if(trackedChanges)throw new Error('Commit source changes before producing immutable local shadow evidence');
const library=JSON.parse(await readFile('out/library-catalog.json','utf8'));
const age=Date.now()-Date.parse(library.fetchedAt);
if(!Number.isFinite(age)||age< -60_000||age>3_600_000)throw new Error('Refresh the full app library before shadow collection');
const inputs={};
for(const file of ['out/library-catalog.json','out/bourbon-bible.json']){
  const bytes=await readFile(file);await writeFile(path.join(output,path.basename(file)),bytes);inputs[file]=hash(bytes);
}
const sourceFiles={};
for(const file of ['collectors/grocery-xapi-expansion.mjs','collectors/grocery-xapi-identity.mjs','collectors/western-grocery-premises.mjs','collectors/california-grocery-premises.mjs','collectors/new-mexico-grocery-premises.mjs','collectors/arizona-xapi-matching.mjs','collectors/arizona-xapi-library-identity.mjs','collectors/safe-bottle-match.mjs','library-search-runtime.mjs','library-query-plan.mjs']){
  sourceFiles[file]=hash(await readFile(new URL(file,import.meta.url)));
}
let requestNumber=0;const captures=[];
const fetchText=async(url,options)=>{
  const startedAt=new Date().toISOString();const response=await fetchWithMeta(url,options);
  const bytes=Buffer.from(response.text || ''),packed=gzipSync(bytes),file=`request-${String(++requestNumber).padStart(3,'0')}.txt.gz`;
  await writeFile(path.join(output,file),packed);
  captures.push({url,status:response.status,ok:response.ok,startedAt,finishedAt:new Date().toISOString(),file,
    decodedBytes:bytes.length,decodedSha256:hash(bytes),gzipSha256:hash(packed)});
  process.stdout.write(`${requestNumber} ${response.status} ${new URL(url).searchParams.get('storeid') || 'resolver'} ${new URL(url).searchParams.get('q') || ''}\n`);
  return response;
};
const startedAt=new Date().toISOString();
const result=await collectGroceryExpansion({id:args.state},await BourbonBible.load(),{fetchText,
  cursorDir:path.resolve('out/cache/western-grocery-shadow'),signal:AbortSignal.timeout(600_000)});
const observations=Buffer.from(JSON.stringify(result,null,2));
await writeFile(path.join(output,'observations.json'),observations);
await writeFile(path.join(output,'captures.json'),JSON.stringify(captures,null,2));
const receipt={schemaVersion:1,kind:'local_shadow_not_production_activation',state:args.state,startedAt,finishedAt:new Date().toISOString(),
  sourceCommit,sourceUnchanged:sourceCommit===git('rev-parse','HEAD')&&!git('status','--porcelain','--untracked-files=no'),
  sourceFiles,inputs,complete:result.metadata.complete,requests:captures.length,
  verifiedPremises:result.metadata.verifiedPremises.length,positiveStores:result.metadata.positiveStores.length,
  rows:result.signals.length,roadblocks:result.roadblocks.length,observationsSha256:hash(observations),
  canonicalNames:[...new Set(result.signals.map(row=>row.canonicalName))].sort(),
  invocation:result.metadata.librarySearchPlan?.invocation,
  queryPoolSize:result.metadata.librarySearchPlan?.poolSize};
await writeFile(path.join(output,'receipt.json'),JSON.stringify(receipt,null,2));
process.stdout.write(JSON.stringify(receipt,null,2)+'\n');
if(!receipt.sourceUnchanged||!receipt.complete)process.exitCode=2;
