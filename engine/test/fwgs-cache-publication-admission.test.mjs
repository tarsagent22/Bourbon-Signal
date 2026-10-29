import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';import {fileURLToPath} from 'node:url';import {spawnSync} from 'node:child_process';
const runner=fileURLToPath(new URL('../src/fwgs-browser-full.mjs',import.meta.url));
const productList=Array.from({length:12},(_,index)=>({sku:'synthetic-'+index}));
function chunk(offset,ageMinutes){const locations=Array.from({length:300},(_,index)=>({locationId:String(offset+index),latitude:40,longitude:-77}));const inventoryRows=locations.flatMap((location,index)=>[0,1].map(delta=>({product:productList[(index+delta)%12],location,quantity:1})));
 return{generatedAt:new Date(Date.now()-ageMinutes*60000).toISOString(),inventoryEndpoint:'/ccstorex/custom/v1/b2b/get-inventory',locationTotal:600,products:productList,locations,inventoryRows,
 productSearches:Array.from({length:37},()=>({ok:true,status:200})),summary:{sourceLocationCount:300,locationCount:300,excludedLocationCount:0,invalidCoordinateCount:0,positiveInventoryProductCount:12,searchTermCount:37}};}
async function setup(t,ages=[111,111]){const directory=await mkdtemp(path.join(tmpdir(),'fwgs-publication-admission-'));assert.ok(path.resolve(directory).startsWith(path.resolve(tmpdir())+path.sep));t.after(()=>rm(directory,{recursive:true,force:true}));
 await mkdir(path.join(directory,'out/browser'),{recursive:true});await mkdir(path.join(directory,'src'));
 const originals=[];for(const[offset,index]of [[0,0],[300,1]]){const payload=chunk(offset,ages[index]),file=path.join(directory,'out/browser/fwgs-store-inventory-'+offset+'.json');const text=JSON.stringify(payload);await writeFile(file,text);originals.push({offset,file,text,payload});}
 // Deliberately synthetic child collector: filesystem only, never a browser,
 // source request, inventory observation, or production evidence.
 await writeFile(path.join(directory,'src/fwgs-browser-collector.mjs'),`import fs from 'node:fs';
globalThis.fetch=()=>{throw Error('Synthetic child cannot request source HTTP');};
const offset=process.env.FWGS_LOCATION_OFFSET,file=process.env.FWGS_OUT_FILE,payload=JSON.parse(fs.readFileSync(file,'utf8'));
const mode=process.env.SYNTHETIC_FWGS_CLOCK_MODE;
payload.generatedAt=mode==='expired'?new Date(Date.now()-111*60000).toISOString():mode==='future'?new Date(Date.now()+60000).toISOString():new Date().toISOString();
if(mode==='missing')delete payload.generatedAt;
fs.writeFileSync(file,JSON.stringify(payload));fs.appendFileSync('out/child-calls.txt',offset+'\\n');
`);
 return{directory,originals,out:path.join(directory,'out/full.json')};}
function run(options,extra={}){return spawnSync(process.execPath,[runner],{cwd:options.directory,encoding:'utf8',timeout:15000,windowsHide:true,env:{...process.env,FWGS_FULL_OFFSETS:'0,300',FWGS_FULL_CHUNK_LIMIT:'300',FWGS_OUT_FILE:'out/full.json',FWGS_FULL_CHUNK_RETRIES:'0',FWGS_ALLOW_PARTIAL_FULL:'0',FWGS_CHUNK_REUSE_MAX_AGE_MS:'7200000',BOURBON_SIGNAL_MIN_FWGS_POSITIVE_ROWS:'1000',BOURBON_SIGNAL_MIN_FWGS_LOCATIONS:'550',...extra}});}

test('real full-wrapper refuses the failed111-minute cache even when old two-hour reuse is requested',async t=>{
 const options=await setup(t),result=run(options);assert.equal(result.status,0,result.stderr);assert.equal(await readFile(path.join(options.directory,'out/child-calls.txt'),'utf8'),'0\n300\n');
 const merged=JSON.parse(await readFile(options.out,'utf8'));assert.equal(merged.summary.locationCount,600);assert.equal(merged.summary.positiveInventoryRowCount,1200);assert.ok(Date.now()-Date.parse(merged.generatedAt)<60000);assert.equal(merged.generatedAt,merged.chunks.map(row=>row.generatedAt).sort()[0]);
});

test('real full-wrapper reuses sufficiently fresh chunks without replacing any original source clock',async t=>{
 const options=await setup(t,[20,30]),result=run(options);assert.equal(result.status,0,result.stderr);
 await assert.rejects(()=>readFile(path.join(options.directory,'out/child-calls.txt')),{code:'ENOENT'});
 for(const original of options.originals)assert.equal(await readFile(original.file,'utf8'),original.text);
 const merged=JSON.parse(await readFile(options.out,'utf8'));assert.equal(merged.generatedAt,options.originals[1].payload.generatedAt);assert.deepEqual(merged.chunks.map(row=>row.generatedAt),options.originals.map(row=>row.payload.generatedAt));
});

test('aged or future child artifacts cannot replace the last full artifact after structural validation',async t=>{
 for(const mode of ['expired','future','missing']){const options=await setup(t),previous='{"saved":"previous original artifact"}\n';await writeFile(options.out,previous);const result=run(options,{SYNTHETIC_FWGS_CLOCK_MODE:mode});assert.equal(result.status,1);assert.match(result.stderr,/publication headroom|original pickup clock/);assert.equal(await readFile(options.out,'utf8'),previous);}
});

test('invalid cache configuration fails before any child collection or source work',async t=>{
 const options=await setup(t),result=run(options,{FWGS_CHUNK_REUSE_MAX_AGE_MS:'not-a-duration'});assert.equal(result.status,1);assert.match(result.stderr,/nonnegative integer/);await assert.rejects(()=>readFile(path.join(options.directory,'out/child-calls.txt')),{code:'ENOENT'});
});


test('actual targeted refresh fails before collection/export when browser skip leaves expiring PA cache',async t=>{
  const options=await setup(t),file=path.join(options.directory,'out/browser/fwgs-store-inventory.json'),previous=JSON.stringify(options.originals[0].payload);await writeFile(file,previous);
  await writeFile(path.join(options.directory,'src/build-bible.mjs'),"import fs from 'node:fs';fs.writeFileSync('out/unexpected-build.txt','unexpected pipeline');");
  const refreshScript=fileURLToPath(new URL('../src/refresh-site.mjs',import.meta.url));
  const result=spawnSync(process.execPath,[refreshScript],{cwd:options.directory,encoding:'utf8',timeout:15000,env:{...process.env,BOURBON_SIGNAL_SKIP_BROWSER_COLLECTORS:'1',BOURBON_SIGNAL_RUN_STATES:'PA',BOURBON_SIGNAL_AUTO_DEPLOY:'0'}});
  assert.equal(result.status,1);assert.match(result.stderr,/Targeted Pennsylvania refresh requires original pickup evidence with publication headroom/);
  await assert.rejects(()=>readFile(path.join(options.directory,'out/unexpected-build.txt')),{code:'ENOENT'});assert.equal(await readFile(file,'utf8'),previous);
});
