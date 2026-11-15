import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,mkdtemp,mkdir,cp,writeFile,rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {verifyActiveStateIntegrationForCi} from './verify-active-state-integration-ci.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const CANARY='engine/data/canary-site/four-state-20261029';
const DE_CANARY='engine/data/canary-site/de-active-candidate';
const states=['WA','NM','WI','OK'];
const read=async file=>JSON.parse(await readFile(file,'utf8'));
const digest=async file=>createHash('sha256').update(await readFile(file)).digest('hex');
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

test('Delaware active admission uses its exact immutable source-replayed canary partition',async()=>{
  const manifest=await read(path.join(ROOT,'engine/data/state-integration/DE.json'));
  const proof=await read(path.join(ROOT,DE_CANARY,'source-proof.json'));
  const partition=await read(path.join(ROOT,DE_CANARY,'states/DE/drops.json'));
  assert.equal(manifest.evidence.production.status,'awaiting_first_publication');
  assert.equal(manifest.evidence.canary.siteArtifact,DE_CANARY);
  assert.equal(proof.runs[0].canaryRunId,manifest.evidence.immutablePromotionEvidence.canaryRuns.at(-1).runId);
  assert.equal(proof.runs[0].artifactDigest,manifest.evidence.immutablePromotionEvidence.canaryRuns.at(-1).artifactHash);
  assert.ok(manifest.evidence.immutablePromotionEvidence.shadowRuns.some(row=>row.runId===proof.runs[0].sourceShadowRunId&&row.status==='success'));
  assert.equal(partition.count,5);assert.equal(proof.runs[0].partitionSha256,await digest(path.join(ROOT,DE_CANARY,'states/DE/drops.json')));
  const policy=await read(path.join(ROOT,DE_CANARY,'canary-preview-policy.json'));
  assert.equal(policy.alertDeliveryEnabled,false);assert.equal(policy.productionSnapshotPublicationEnabled,false);assert.equal(policy.productionDeploymentEnabled,false);
  assert.ok(partition.drops.every(row=>row.eligibleForDelivery===false&&row.eligibleForEmail===false&&row.eligibleForSms===false));
  const result=await verifyActiveStateIntegrationForCi({states:['DE']});
  assert.ok(result.some(row=>row.state==='DE'&&row.mode==='explicit_ci_only_reviewed_canary'&&row.immutableEvidenceRequired));
  const root=await mkdtemp(path.join(tmpdir(),'ci-de-integration-'));
  assert.ok(path.resolve(root).startsWith(path.resolve(tmpdir())+path.sep));
  try{
    for(const file of ['src/config/state-lifecycle.json','engine/data/state-integration/DE.json','engine/data/state-fixtures/DE.json']){
      await mkdir(path.dirname(path.join(root,file)),{recursive:true});await cp(path.join(ROOT,file),path.join(root,file));
    }
    await mkdir(path.dirname(path.join(root,DE_CANARY)),{recursive:true});await cp(path.join(ROOT,DE_CANARY),path.join(root,DE_CANARY),{recursive:true});
    const file=path.join(root,DE_CANARY,'states/DE/drops.json'),changed=await read(file);changed.drops[0].quantity=changed.drops[0].quantity+1;await writeFile(file,JSON.stringify(changed));
    await assert.rejects(()=>verifyActiveStateIntegrationForCi({root,states:['DE']}),/partition hash or workflow lineage mismatch/);
  }finally{await rm(root,{recursive:true,force:true});}
});

test('only required CI uses the wrapper; refresh workflow retains the real-output production CLI',async()=>{
  const pkg=await read(path.join(ROOT,'package.json')),workflow=await readFile(path.join(ROOT,'.github/workflows/refresh-feed.yml'),'utf8');
  assert.match(pkg.scripts['verify:ci'],/node scripts\/verify-active-state-integration-ci\.mjs/);
  assert.doesNotMatch(pkg.scripts['verify:ci'],/verify:state-integration -- --all-active/);
  assert.match(workflow,/run: npm run verify:state-integration -- --all-active/);
  assert.doesNotMatch(workflow,/verify-active-state-integration-ci/);
});
