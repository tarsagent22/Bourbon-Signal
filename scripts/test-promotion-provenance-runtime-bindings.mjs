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
for(const state of ['WA','NM','WI','OK','NJ','MI'])test(`${state} issued bundle binds actual runtime files and refuses missing mandatory production code`,async t=>{
  const directory=await mkdtemp(path.join(tmpdir(),'synthetic-promotion-hashes-'));
  assert.ok(path.resolve(directory).startsWith(path.resolve(tmpdir())+path.sep));t.after(()=>rm(directory,{recursive:true,force:true}));
  // Synthetic replay bytes validate the issuer, never source or promotion truth.
  // Repository/run labels explicitly cannot pass immutable promotion validation.
  const candidates=[...source.matchAll(/['`]([^'`\n]+)['`]/g)].map(match=>match[1])
    .filter(file=>/^(?:engine\/|src\/|scripts\/|\.github\/|next\.config\.ts$)/.test(file)&&!file.includes(' '))
    .map(file=>file.replaceAll('${candidateDrops}',`data/canary-inputs/${state}.json`).replaceAll('${state}',state));
  for(const file of new Set(candidates)){
    const destination=path.join(directory,file);await mkdir(path.dirname(destination),{recursive:true});
    if(file.startsWith('engine/out/')||file.startsWith('engine/data/canary-inputs/'))await writeFile(destination,JSON.stringify({syntheticUnitFixture:true,state}));
    else await copyFile(path.join(root,file),destination);
  }
  const run=()=>spawnSync(process.execPath,[script,`--state=${state}`],{cwd:directory,encoding:'utf8',windowsHide:true,
    env:{...process.env,PROMOTION_CANDIDATE_DROPS:`data/canary-inputs/${state}.json`,GITHUB_REPOSITORY:'synthetic/unit-only',GITHUB_RUN_ID:'unit-only',GITHUB_SHA:'unit-only'}});
  const first=run();assert.equal(first.status,0,first.stderr);
  const out=path.join(directory,`engine/out/promotion-provenance/${state}.json`),payload=JSON.parse(await readFile(out,'utf8'));
  const central=['WI','OK'].includes(state),njmi=['NJ','MI'].includes(state);
  const module=njmi?'engine/src/collectors/nj-mi-cityhive-production.mjs':central?'engine/src/collectors/central-cityhive-production.mjs':'engine/src/collectors/western-grocery-production.mjs';
  const config=njmi?'engine/src/nj-mi-production-config.mjs':central?'engine/src/central-cityhive-production-config.mjs':'engine/src/western-grocery-production-config.mjs';
  for(const file of [...common,module,config])assert.equal(payload.fileDigests[file],sha(await readFile(path.join(directory,file))),file);
  await appendFile(path.join(directory,module),'\n// synthetic mutation\n');assert.equal(run().status,0);
  const changed=JSON.parse(await readFile(out,'utf8'));assert.notEqual(changed.bundleDigest,payload.bundleDigest);assert.notEqual(changed.fileDigests[module],payload.fileDigests[module]);
  await rm(out);await rm(path.join(directory,config));const missing=run();assert.notEqual(missing.status,0);
  assert.match(missing.stderr,/ENOENT/);await assert.rejects(()=>readFile(out),{code:'ENOENT'});
});
