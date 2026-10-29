import test from 'node:test';
import assert from 'node:assert/strict';
import {zipSync,strToU8} from 'fflate';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {validateCityHiveShadowWorkflowOrigin,decodeBoundedShadowArchive} from './download-cityhive-shadow.mjs';
const base={state:'WI',repository:'tarsagent22/Bourbon-Signal',currentHead:'a'.repeat(40),
  run:{id:123,status:'completed',conclusion:'success',head_sha:'a'.repeat(40),repository:{full_name:'tarsagent22/Bourbon-Signal'},path:'.github/workflows/state-expansion-shadow.yml'},
  artifact:{id:456,name:'state-expansion-shadow-123',digest:'sha256:'+'b'.repeat(64),size_in_bytes:100,expired:false}};
test('WI/OK downloader requires actual successful source-equivalent shadow workflow provenance',()=>{
  for(const state of ['WI','OK'])assert.equal(validateCityHiveShadowWorkflowOrigin({...base,state}).state,state);
  for(const change of [{state:'TX'},{run:{...base.run,conclusion:'failure'}},{run:{...base.run,path:'.github/workflows/refresh-feed.yml'}},
    {artifact:{...base.artifact,expired:true}},{artifact:{...base.artifact,digest:null}},{repository:'foreign/repository'}]){
    assert.throws(()=>validateCityHiveShadowWorkflowOrigin({...base,...change}));
  }
  const ahead={...base,currentHead:'c'.repeat(40),comparison:{status:'ahead',files:[{filename:'engine/data/state-integration/WI.json'}]}};
  assert.equal(validateCityHiveShadowWorkflowOrigin(ahead).sourceEquivalentPreparationChanges.length,1);
  for(const filename of ['engine/src/research-cityhive-runtime.mjs','engine/src/collectors/central-cityhive-expansion.mjs','engine/src/core/bible.mjs','src/config/state-lifecycle.json']){
    assert.throws(()=>validateCityHiveShadowWorkflowOrigin({...ahead,comparison:{status:'ahead',files:[{filename}]}}),/source changed/);
  }
  assert.throws(()=>validateCityHiveShadowWorkflowOrigin({...ahead,comparison:{status:'diverged',files:[]}}),/source changed/);
});
test('WI/OK archive uses issued ZIP digest and existing bounded portable path decoder',()=>{
  const bytes=zipSync({'WI/report.json':strToU8('{}')}),digest=createHash('sha256').update(bytes).digest('hex');
  assert.ok(decodeBoundedShadowArchive(bytes,digest)['WI/report.json']);
  assert.throws(()=>decodeBoundedShadowArchive(bytes,'0'.repeat(64)),/digest/);
  const unsafe=zipSync({'../outside.json':strToU8('{}')});
  assert.throws(()=>decodeBoundedShadowArchive(unsafe,createHash('sha256').update(unsafe).digest('hex')),/Unsafe/);
});
test('the shared exact CityHive customer policy bundles for a browser without collector or filesystem imports',async()=>{
  const bundle=await build({entryPoints:[fileURLToPath(new URL('../engine/src/central-cityhive-policy.mjs',import.meta.url))],
    bundle:true,platform:'browser',format:'esm',write:false,metafile:true});
  assert.ok(bundle.outputFiles[0].text.includes('isCentralCityHiveCanaryOnSiteSignal'));
  assert.ok(Object.keys(bundle.metafile.inputs).every(file=>!file.endsWith('/central-cityhive-expansion.mjs')&&!file.includes('library-search')));
});
