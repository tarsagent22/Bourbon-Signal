import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {zipSync,strToU8} from 'fflate';
import {validateShadowWorkflowOrigin,decodeBoundedShadowArchive} from './download-grocery-shadow.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const base={state:'WA',repository:'tarsagent22/Bourbon-Signal',currentHead:'a'.repeat(40),
  run:{id:123,status:'completed',conclusion:'success',head_sha:'a'.repeat(40),repository:{full_name:'tarsagent22/Bourbon-Signal'},path:'.github/workflows/state-expansion-shadow.yml'},
  artifact:{id:456,name:'state-expansion-shadow-123',digest:'sha256:'+'b'.repeat(64),size_in_bytes:100,expired:false}};
test('workflow origin requires exact successful workflow and source-equivalent preparation changes',()=>{
  assert.equal(validateShadowWorkflowOrigin(base).workflowRunId,'123');
  assert.throws(()=>validateShadowWorkflowOrigin({...base,run:{...base.run,conclusion:'failure'}}),/successful/);
  assert.throws(()=>validateShadowWorkflowOrigin({...base,artifact:{...base.artifact,expired:true}}),/expired/);
  const ahead={...base,currentHead:'c'.repeat(40),comparison:{status:'ahead',files:[{filename:'engine/data/state-integration/WA.json'}]}};
  assert.equal(validateShadowWorkflowOrigin(ahead).sourceEquivalentPreparationChanges.length,1);
  assert.throws(()=>validateShadowWorkflowOrigin({...ahead,comparison:{status:'ahead',files:[{filename:'engine/src/collectors/grocery-xapi-expansion.mjs'}]}}),/source changed/);
  assert.throws(()=>validateShadowWorkflowOrigin({...ahead,comparison:{status:'diverged',files:[]}}),/source changed/);
});
test('archive digest and bounded portable paths are required before extraction',()=>{
  const bytes=zipSync({'state/report.json':strToU8('{"fixture":true}')});
  assert.ok(decodeBoundedShadowArchive(bytes,sha(bytes))['state/report.json']);
  assert.throws(()=>decodeBoundedShadowArchive(bytes,'0'.repeat(64)),/digest/);
  for(const name of ['../outside.json','/outside.json','C:/outside.json','state\\outside.json']){
    const unsafe=zipSync({[name]:strToU8('{}')});
    assert.throws(()=>decodeBoundedShadowArchive(unsafe,sha(unsafe)),/Unsafe/);
  }
});
