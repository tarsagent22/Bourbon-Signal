import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,mkdir,rm,copyFile,appendFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const script=fileURLToPath(new URL('./build-promotion-provenance.mjs',import.meta.url));
const root=path.dirname(path.dirname(script)),source=await readFile(script,'utf8');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const common=['engine/src/collectors/generic-state.mjs','engine/src/confidence-policy.mjs','engine/src/run.mjs',
  'engine/src/core/collection-http.mjs','engine/src/reliability-policy.mjs','.github/workflows/refresh-feed.yml',
  '.github/workflows/state-expansion-shadow.yml','engine/out/library-catalog.json','engine/out/bourbon-bible.json'];
for(const state of ['WA','NM','WI','OK','MN','MO','NJ','MI','AK','LA','RI','DE','SD','OR'])test(`${state} issued bundle binds actual runtime files and refuses missing mandatory production code`,async t=>{
  const directory=await mkdtemp(path.join(tmpdir(),'synthetic-promotion-hashes-'));
  assert.ok(path.resolve(directory).startsWith(path.resolve(tmpdir())+path.sep));t.after(()=>rm(directory,{recursive:true,force:true}));
  // Synthetic replay bytes validate the issuer, never source or promotion truth.
  // Repository/run labels explicitly cannot pass immutable promotion validation.
  const candidates=[...source.matchAll(/['`]([^'`\n]+)['`]/g)].map(match=>match[1])
    .filter(file=>/^(?:engine\/|src\/|scripts\/|apps\/|\.github\/|next\.config\.ts$)/.test(file)&&!file.includes(' '))
    .map(file=>file.replaceAll('${candidateDrops}',`data/canary-inputs/${state}.json`).replaceAll('${state}',state));
  if(state==='OR')candidates.push('engine/out/canary/OR/site/public-projection.json');
  for(const file of new Set(candidates)){
    if(file==='engine/out/sd-shadow-input'||file==='engine/out/canary/SD'){
      await mkdir(path.join(directory,file),{recursive:true});
      if(file==='engine/out/sd-shadow-input')await writeFile(path.join(directory,file,'provenance.json'),JSON.stringify({syntheticUnitFixture:true,state}));
      continue;
    }
    const destination=path.join(directory,file);await mkdir(path.dirname(destination),{recursive:true});
    if(file.startsWith('engine/out/')||file.startsWith('engine/data/canary-inputs/'))await writeFile(destination,JSON.stringify({syntheticUnitFixture:true,state}));
    else {
      try { await copyFile(path.join(root,file),destination); }
      catch(error) {
        // The issuer selects a state-specific subset. A path for another
        // cohort does not need to exist; its use by the issuer still fails.
        if(error.code!=='ENOENT')throw error;
      }
    }
  }
  const run=()=>spawnSync(process.execPath,[script,`--state=${state}`],{cwd:directory,encoding:'utf8',windowsHide:true,
    env:{...process.env,PROMOTION_CANDIDATE_DROPS:`data/canary-inputs/${state}.json`,GITHUB_REPOSITORY:'synthetic/unit-only',GITHUB_RUN_ID:'unit-only',GITHUB_SHA:'unit-only'}});
  const first=run();assert.equal(first.status,0,first.stderr);
  const out=path.join(directory,`engine/out/promotion-provenance/${state}.json`),payload=JSON.parse(await readFile(out,'utf8'));
  const oregon=state==='OR',sd=state==='SD',central=['WI','OK','RI','MO','DE'].includes(state),minnesota=state==='MN',njmi=['NJ','MI'].includes(state),laak=['AK','LA'].includes(state);
  const module=oregon?'engine/src/collectors/oregon-daily-production.mjs':sd?'engine/src/collectors/south-dakota-production.mjs':laak?'engine/src/collectors/louisiana-alaska-grocery-production-adapter.mjs':njmi?'engine/src/collectors/nj-mi-cityhive-production.mjs':minnesota?'engine/src/collectors/minnesota-cityhive-production.mjs':central?'engine/src/collectors/central-cityhive-production.mjs':'engine/src/collectors/western-grocery-production.mjs';
  const config=oregon?'engine/src/oregon-daily-production-policy.mjs':sd?'engine/src/south-dakota-pickup-policy.mjs':laak?'engine/src/louisiana-alaska-grocery-production-config.mjs':njmi?'engine/src/nj-mi-production-config.mjs':minnesota?'engine/src/minnesota-cityhive-production-config.mjs':central?'engine/src/central-cityhive-production-config.mjs':'engine/src/western-grocery-production-config.mjs';
  const runtimeFiles=oregon?['engine/src/collectors/generic-state.mjs','engine/src/run.mjs','.github/workflows/refresh-feed.yml','engine/src/verify-oregon-first-publication.mjs','engine/src/verify-oregon-distinct-report.mjs']:
  sd?[
    'engine/src/collectors/generic-state.mjs','engine/src/run.mjs','.github/workflows/refresh-feed.yml',
    'engine/src/verify-sd-first-publication.mjs','engine/src/operational-report.mjs',
    'engine/src/south-dakota-source-lineage.mjs','engine/src/export-site-contract.mjs','engine/src/verify-state-fixtures.mjs',
    'engine/src/south-dakota-fixtures.mjs','engine/src/build-state-canary-preview.mjs','src/lib/site-engine-contract.ts',
    'src/lib/drop-feed-visibility.ts','src/lib/public-drop-evidence.ts','engine/data/state-integration/SD.json',
    'engine/data/state-fixtures/SD.json','engine/out/sd-shadow-input/provenance.json','engine/out/canary/SD/public-projection.json',
  ]:laak?[
    'engine/src/collectors/generic-state.mjs','engine/src/run.mjs','.github/workflows/refresh-feed.yml',
    'engine/src/verify-laak-first-publication.mjs','engine/src/operational-report.mjs',
    `engine/out/laak-shadow-input/${state}/provenance.json`,
  ]:minnesota?[...common,'engine/src/collectors/generic-state.mjs','engine/src/run.mjs','.github/workflows/refresh-feed.yml',
    'engine/src/central-cityhive-policy.mjs','engine/src/collectors/minnesota-cityhive-production.mjs','engine/src/minnesota-cityhive-production-config.mjs',
    'engine/data/state-integration/MN.json','engine/data/minnesota-cityhive-expansion-sources.json',
    'engine/src/collectors/central-cityhive-research-premises.mjs','engine/src/collectors/central-cityhive-transport.mjs',
    'engine/src/collectors/central-cityhive-expansion.mjs','engine/src/collectors/cityhive-surfaces.mjs',
    'engine/src/prepare-central-cityhive-canary.mjs','engine/src/research-cityhive-runtime.mjs',
    `engine/out/cityhive-shadow-input/${state}/provenance.json`,`engine/out/cityhive-shadow-input/${state}/artifact.zip`,
    `engine/out/canary-preparation/${state}/lifecycle-research.json`,`engine/out/canary/${state}/site/stats.json`,
    `engine/out/canary/${state}/site/locations.json`,`engine/out/canary/${state}/site/stores.json`,
    `engine/out/canary/${state}/site/drops.json`,`engine/out/canary/${state}/site/states/index.json`]
    :state==='MO'?[...common,'engine/src/collectors/central-cityhive-production.mjs','engine/src/central-cityhive-production-config.mjs',
      'engine/src/library-query-plan.mjs','engine/src/library-search-runtime.mjs','engine/src/collectors/central-cityhive-market-policy.mjs',
      'engine/src/verify-mo-first-publication.mjs','engine/data/state-integration/MO.json',
      'engine/data/canary-site/mo-active-candidate/manifest.json','engine/data/canary-site/mo-active-candidate/stats.json',
      'engine/data/canary-site/mo-active-candidate/alerts.json','engine/data/canary-site/mo-active-candidate/locations.json',
      'engine/data/canary-site/mo-active-candidate/drops.json',
      'engine/data/canary-site/mo-active-candidate/canary-preview-policy.json','engine/data/canary-site/mo-active-candidate/states/index.json',
      'engine/data/canary-site/mo-active-candidate/states/MO/drops.json']
      :state==='RI'?[...common,'engine/src/verify-ri-first-publication.mjs']
      :state==='DE'?[...common,'engine/src/collectors/central-cityhive-production.mjs','engine/src/central-cityhive-production-config.mjs',
        'engine/src/collectors/central-cityhive-premises.mjs','engine/src/collectors/central-cityhive-research-premises.mjs',
        'engine/src/collectors/central-cityhive-expansion.mjs','engine/src/collectors/central-cityhive-transport.mjs',
        'engine/src/collectors/cityhive-surfaces.mjs','engine/src/collectors/central-cityhive-market-policy.mjs',
        'engine/src/central-cityhive-policy.mjs','engine/src/delaware-ecwid-production-policy.mjs','engine/src/research-delaware-ecwid.mjs',
        'engine/src/verify-de-first-publication.mjs','engine/src/customer-drop-freshness.mjs','engine/data/additional-cityhive-expansion-sources.json',
        'engine/data/de-ecwid-research-source.json','engine/data/state-integration/DE.json','engine/test/de-production-adapter.test.mjs',
        'engine/test/de-first-publication.test.mjs']
      :common;
  for(const file of [...runtimeFiles,module,config])assert.equal(payload.fileDigests[file],sha(await readFile(path.join(directory,file))),file);
  if(sd){
    const bindingPath='engine/out/promotion-provenance/SD-manifest-binding.json',bindingBytes=await readFile(path.join(directory,bindingPath));
    const binding=JSON.parse(bindingBytes),manifest=JSON.parse(await readFile(path.join(directory,'engine/data/state-integration/SD.json')));
    const semantic=Object.fromEntries(['lifecycle','collector','storeIdentity','sourceSemantics','customerPaths'].map(key=>[key,manifest[key]]));
    assert.equal(binding.sourceConfigHash,sha(Buffer.from(JSON.stringify(semantic))));
    assert.equal(payload.fileDigests[bindingPath],sha(bindingBytes));
  }
  await appendFile(path.join(directory,module),'\n// synthetic mutation\n');assert.equal(run().status,0);
  const changed=JSON.parse(await readFile(out,'utf8'));assert.notEqual(changed.bundleDigest,payload.bundleDigest);assert.notEqual(changed.fileDigests[module],payload.fileDigests[module]);
  await rm(out);await rm(path.join(directory,config));const missing=run();assert.notEqual(missing.status,0);
  assert.match(missing.stderr,/ENOENT/);await assert.rejects(()=>readFile(out),{code:'ENOENT'});
});
