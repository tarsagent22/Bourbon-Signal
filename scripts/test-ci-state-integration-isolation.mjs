import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,cp,writeFile,rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {verifyActiveStateIntegrationForCi} from './verify-active-state-integration-ci.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const CANARY='engine/data/canary-site/four-state-20261029';
const reviewedStates=['WA','NM','WI','OK','LA','AK','MA','CT','RI'];
const actualLifecycle=JSON.parse(await readFile(path.join(ROOT,'src/config/state-lifecycle.json'),'utf8'));
const states=reviewedStates.filter(state=>actualLifecycle.activeStates.includes(state));
const sites=[CANARY,'engine/data/canary-site/five-state-20261029'];
const read=async file=>JSON.parse(await readFile(file,'utf8'));
function production(siteDir){return spawnSync(process.execPath,['src/verify-state-integration.mjs','--state=WA',`--site-dir=${siteDir}`],{cwd:path.join(ROOT,'engine'),encoding:'utf8',windowsHide:true});}

test('production CLI rejects missing and corrupt actual WA output while a valid checked-in canary exists',async()=>{
  const manifest=await read(path.join(ROOT,'engine/data/state-integration/WA.json'));
  assert.equal(manifest.evidence.production.status,'awaiting_first_publication');
  assert.ok((await read(path.join(ROOT,CANARY,'states/WA/drops.json'))).drops.length>0);
  const dir=await mkdtemp(path.join(tmpdir(),'production-integration-'));
  assert.ok(path.resolve(dir).startsWith(path.resolve(tmpdir())+path.sep));
  try{
    const missing=production(path.join(dir,'absent'));
    assert.notEqual(missing.status,0);assert.match(missing.stderr,/state partition is missing/);
    await cp(path.join(ROOT,CANARY),path.join(dir,'actual-output'),{recursive:true});
    const file=path.join(dir,'actual-output/states/WA/drops.json'),partition=await read(file);partition.count++;
    await writeFile(file,JSON.stringify(partition));const corrupt=production(path.join(dir,'actual-output'));
    assert.notEqual(corrupt.status,0);assert.match(corrupt.stderr,/partition index count|partition count/);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('CI-only wrapper validates the unchanged currently-active reviewed manifests and rejects corrupt CI partition data',async()=>{
  const manifests=await Promise.all(states.map(state=>read(path.join(ROOT,`engine/data/state-integration/${state}.json`))));
  assert.ok(manifests.every(manifest=>manifest.evidence.production.status==='awaiting_first_publication'));
  const result=await verifyActiveStateIntegrationForCi({states});assert.equal(result.length,states.length);
  assert.ok(result.every(row=>row.mode==='explicit_ci_only_reviewed_canary'&&row.immutableEvidenceRequired));
  const dir=await mkdtemp(path.join(tmpdir(),'ci-only-integration-'));
  assert.ok(path.resolve(dir).startsWith(path.resolve(tmpdir())+path.sep));
  try{
    for(const file of ['src/config/state-lifecycle.json',...states.flatMap(state=>[`engine/data/state-integration/${state}.json`,`engine/data/state-fixtures/${state}.json`])]){
      await mkdir(path.dirname(path.join(dir,file)),{recursive:true});await cp(path.join(ROOT,file),path.join(dir,file));
    }
    for(const reviewed of sites){await mkdir(path.dirname(path.join(dir,reviewed)),{recursive:true});await cp(path.join(ROOT,reviewed),path.join(dir,reviewed),{recursive:true});}
    const file=path.join(dir,CANARY,'states/WA/drops.json'),partition=await read(file);partition.count++;
    await writeFile(file,JSON.stringify(partition));
    await assert.rejects(()=>verifyActiveStateIntegrationForCi({root:dir,states:['WA']}),/partition index count|partition count/);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('only required CI uses the wrapper; refresh workflow retains the real-output production CLI',async()=>{
  const pkg=await read(path.join(ROOT,'package.json')),workflow=await readFile(path.join(ROOT,'.github/workflows/refresh-feed.yml'),'utf8');
  assert.match(pkg.scripts['verify:ci'],/node scripts\/verify-active-state-integration-ci\.mjs/);
  assert.doesNotMatch(pkg.scripts['verify:ci'],/verify:state-integration -- --all-active/);
  assert.match(workflow,/run: npm run verify:state-integration -- --all-active/);
  assert.doesNotMatch(workflow,/verify-active-state-integration-ci/);
});

test('future all-nine admission uses exact scoped CI paths while every new-state production CLI still rejects missing actual output',async()=>{
 const fixture=path.join(ROOT,'engine/test/fixtures/nine-state-admission'),config=await read(path.join(fixture,'lifecycle.json')),manifests=await read(path.join(fixture,'manifests.json')),dir=await mkdtemp(path.join(tmpdir(),'future-nine-ci-'));
 assert.ok(path.resolve(dir).startsWith(path.resolve(tmpdir())+path.sep));
 try{
  for(const state of reviewedStates){for(const[relative,payload]of [[`engine/data/state-integration/${state}.json`,manifests[state]],[`engine/data/state-fixtures/${state}.json`,await read(path.join(ROOT,`engine/data/state-fixtures/${state}.json`))]]){await mkdir(path.dirname(path.join(dir,relative)),{recursive:true});await writeFile(path.join(dir,relative),JSON.stringify(payload));}}
  const configFile=path.join(dir,'src/config/state-lifecycle.json');await mkdir(path.dirname(configFile),{recursive:true});await writeFile(configFile,JSON.stringify(config));
  for(const reviewed of sites){await mkdir(path.dirname(path.join(dir,reviewed)),{recursive:true});await cp(path.join(ROOT,reviewed),path.join(dir,reviewed),{recursive:true});}
  const results=await verifyActiveStateIntegrationForCi({root:dir,states:reviewedStates});assert.equal(results.length,9);assert.ok(results.every(row=>row.immutableEvidenceRequired===true));
  for(const state of ['LA','AK','MA','CT','RI']){
   const result=spawnSync(process.execPath,['src/verify-state-integration.mjs',`--state=${state}`,`--site-dir=${path.join(dir,'absent-real-output')}`,`--config=${configFile}`,`--manifest-dir=${path.join(dir,'engine/data/state-integration')}`],{cwd:path.join(ROOT,'engine'),encoding:'utf8',windowsHide:true});
   assert.notEqual(result.status,0,state+': production cannot consume the positive reviewed CI snapshot');assert.match(result.stderr,/state partition is missing/);
  }
  const file=path.join(dir,'engine/data/canary-site/five-state-20261029/states/CT/drops.json'),partition=await read(file);partition.count++;await writeFile(file,JSON.stringify(partition));
  await assert.rejects(()=>verifyActiveStateIntegrationForCi({root:dir,states:['CT']}),/partition index count|partition count/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
