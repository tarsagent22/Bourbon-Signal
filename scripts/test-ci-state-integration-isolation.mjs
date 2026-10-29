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
const states=['WA','NM','WI','OK'];
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

test('CI-only wrapper validates the unchanged real four-state manifests and rejects corrupt CI partition data',async()=>{
  const manifests=await Promise.all(states.map(state=>read(path.join(ROOT,`engine/data/state-integration/${state}.json`))));
  assert.ok(manifests.every(manifest=>manifest.evidence.production.status==='awaiting_first_publication'));
  const result=await verifyActiveStateIntegrationForCi({states});assert.equal(result.length,4);
  assert.ok(result.every(row=>row.mode==='explicit_ci_only_reviewed_canary'&&row.immutableEvidenceRequired));
  const dir=await mkdtemp(path.join(tmpdir(),'ci-only-integration-'));
  assert.ok(path.resolve(dir).startsWith(path.resolve(tmpdir())+path.sep));
  try{
    for(const file of ['src/config/state-lifecycle.json',...states.flatMap(state=>[`engine/data/state-integration/${state}.json`,`engine/data/state-fixtures/${state}.json`])]){
      await mkdir(path.dirname(path.join(dir,file)),{recursive:true});await cp(path.join(ROOT,file),path.join(dir,file));
    }
    await mkdir(path.dirname(path.join(dir,CANARY)),{recursive:true});await cp(path.join(ROOT,CANARY),path.join(dir,CANARY),{recursive:true});
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
