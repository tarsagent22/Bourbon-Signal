import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,cp,mkdtemp,mkdir,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {prepareLegacySiteFixtureForCi} from './prepare-legacy-site-fixture-ci.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const STATES=['WA','NM','WI','OK'];
const read=async file=>JSON.parse(await readFile(file,'utf8'));
const digest=async file=>createHash('sha256').update(await readFile(file)).digest('hex');
const run=(script,args=[],cwd=ROOT,env=process.env)=>spawnSync(process.execPath,[path.join(ROOT,script),...args],{cwd,env,encoding:'utf8',windowsHide:true});

test('CI preparation preserves every legacy inventory byte/clock and passes the actual site validator with four honest empty states',async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'legacy-site-ci-'));
  assert.ok(path.resolve(root).startsWith(path.resolve(tmpdir())+path.sep));
  try{
    const site=path.join(root,'engine/out/site');await mkdir(path.dirname(site),{recursive:true});
    await cp(path.join(ROOT,'engine/out/site'),site,{recursive:true});
    for(const dir of ['src/config','engine/data/state-integration']){
      await mkdir(path.dirname(path.join(root,dir)),{recursive:true});await cp(path.join(ROOT,dir),path.join(root,dir),{recursive:true});
    }
    const oldStats=await read(path.join(site,'stats.json')),oldQuality=await read(path.join(site,'state-quality.json')),oldManifest=await read(path.join(site,'manifest.json')),oldIndex=await read(path.join(site,'states/index.json'));
    const untouched=['drops.json','events.json','alerts.json','stores.json','locations.json','bottles.json','historical-trends.json','nc-intelligence.json',...oldIndex.states.filter(row=>!STATES.includes(row.state)).map(row=>row.file)];
    const hashes=await Promise.all(untouched.map(file=>digest(path.join(site,file))));
    const result=await prepareLegacySiteFixtureForCi({root,ci:true,workflow:'CI'});assert.equal(result.inventoryRowsAdded,0);
    const stats=await read(path.join(site,'stats.json')),quality=await read(path.join(site,'state-quality.json')),manifest=await read(path.join(site,'manifest.json')),index=await read(path.join(site,'states/index.json'));
    assert.deepEqual(await Promise.all(untouched.map(file=>digest(path.join(site,file)))),hashes,'every old inventory/partition file stays byte-identical');
    assert.deepEqual(stats.stateCoverage.states.filter(row=>!STATES.includes(row.state)),oldStats.stateCoverage.states.filter(row=>!STATES.includes(row.state)));
    assert.deepEqual(quality.states.filter(row=>!STATES.includes(row.state)),oldQuality.states.filter(row=>!STATES.includes(row.state)));
    assert.deepEqual(index.states.filter(row=>!STATES.includes(row.state)),oldIndex.states.filter(row=>!STATES.includes(row.state)));
    for(const key of ['generatedAt','engineGeneratedAt','runId']){assert.equal(manifest[key],oldManifest[key]);assert.equal(stats[key],oldStats[key]);}
    assert.equal(stats.stateCount,28);assert.equal(stats.stateCoverage.stateCount,28);assert.equal(quality.summary.stateCount,28);assert.equal(index.stateCount,28);
    assert.equal(Object.values(stats.stateCoverage.counts).reduce((sum,value)=>sum+value,0),28);
    assert.equal(quality.summary.releaseEligibleStates+quality.summary.releaseBlockedStates,28);
    assert.equal(index.totalCount,oldIndex.totalCount);assert.equal(stats.dropCount,oldStats.dropCount);
    for(const state of STATES){
      const entry=index.states.find(row=>row.state===state),partition=await read(path.join(site,entry.file)),coverage=stats.stateCoverage.states.find(row=>row.state===state),q=quality.states.find(row=>row.state===state);
      assert.equal(partition.count,0);assert.deepEqual(partition.drops,[]);assert.equal(entry.sha256,await digest(path.join(site,entry.file)));assert.equal(partition.generatedAt,oldManifest.generatedAt);
      assert.equal(coverage.signalCount,0);assert.equal(coverage.sourceCount,0);assert.equal(coverage.freshestObservedAt,null);assert.equal(coverage.status,'ci_not_collected');assert.equal(coverage.inventoryAlertable,false);assert.equal(coverage.watchAlertable,false);
      assert.equal(q.releaseEligible,false);assert.equal(q.input.dropCount,0);assert.equal(q.input.freshestObservedAt,null);assert.equal(q.ciFixtureOnly,true);
    }
    const verified=run('engine/src/verify-site-contract.mjs',[],path.join(root,'engine'));assert.equal(verified.status,0,verified.stdout+verified.stderr);
    const emptyActual=run('engine/src/verify-state-integration.mjs',['--state=WA',`--site-dir=${site}`],path.join(ROOT,'engine'));
    assert.equal(emptyActual.status,0,emptyActual.stderr);
    assert.equal((await read(path.join(site,'states/WA/drops.json'))).drops.length,0,'a legitimate zero actual partition remains zero and is not backfilled from the positive canary');
    assert.equal((await read(path.join(ROOT,'engine/data/canary-site/four-state-20261029/states/WA/drops.json'))).count,177,'separate reviewed canary stays positive');
    const before=await digest(path.join(site,'stats.json'));await prepareLegacySiteFixtureForCi({root,ci:true,workflow:'CI'});assert.equal(await digest(path.join(site,'stats.json')),before,'preparation is idempotent');
    // Complete zero stock is legitimate and earns zero customer coverage. The
    // real-output validator must still reject missing actual partitions.
    const partitionFile=path.join(site,'states/WA/drops.json');await rm(partitionFile);
    const production=run('engine/src/verify-state-integration.mjs',['--state=WA',`--site-dir=${site}`],path.join(ROOT,'engine'));
    assert.notEqual(production.status,0,'missing actual output cannot fall back to the CI canary');assert.match(production.stderr,/WA: state partition payload is missing/);
    await writeFile(partitionFile,JSON.stringify({state:'WA',count:1,drops:[{state:'WA',id:'real'}]}));
    await assert.rejects(()=>prepareLegacySiteFixtureForCi({root,ci:true,workflow:'CI'}),/Refusing to overwrite/);
    manifest.runId='real-production-run';await writeFile(path.join(site,'manifest.json'),JSON.stringify(manifest));
    await assert.rejects(()=>prepareLegacySiteFixtureForCi({root,ci:true,workflow:'CI'}),/reviewed historical/);
  }finally{await rm(root,{recursive:true,force:true});}
});

test('CI-only preparer refuses ordinary or production invocation and remains absent from package/refresh validators',async()=>{
  await assert.rejects(()=>prepareLegacySiteFixtureForCi(),/CI-only/);
  await assert.rejects(()=>prepareLegacySiteFixtureForCi({ci:true,workflow:'Refresh engine feed'}),/CI-only/);
  for(const env of [{CI:'false',GITHUB_WORKFLOW:'CI'},{CI:'true',GITHUB_WORKFLOW:'Refresh engine feed'}])assert.notEqual(run('scripts/prepare-legacy-site-fixture-ci.mjs',['--ci-fixture-only'],ROOT,{...process.env,...env}).status,0);
  assert.notEqual(run('scripts/prepare-legacy-site-fixture-ci.mjs',[],ROOT,{...process.env,CI:'true',GITHUB_WORKFLOW:'CI'}).status,0);
  const workflow=await readFile(path.join(ROOT,'.github/workflows/ci.yml'),'utf8'),refresh=await readFile(path.join(ROOT,'.github/workflows/refresh-feed.yml'),'utf8'),pkg=await read(path.join(ROOT,'package.json'));
  assert.match(workflow,/node --test scripts\/test-legacy-site-fixture-ci\.mjs/);assert.ok(workflow.indexOf('node scripts/prepare-legacy-site-fixture-ci.mjs --ci-fixture-only')<workflow.indexOf('run: npm run verify:ci'));
  assert.doesNotMatch(pkg.scripts['verify:ci'],/prepare-legacy-site-fixture-ci/);assert.doesNotMatch(refresh,/prepare-legacy-site-fixture-ci|verify-active-state-integration-ci/);
  assert.match(refresh,/run: npm run verify:state-integration -- --all-active/);
});
