import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {tmpdir} from 'node:os';
const bash=process.platform==='win32'?'C:/Program Files/Git/bin/bash.exe':'bash';
for(const file of ['state-expansion-canary.yml','state-promotion-provenance.yml'])test(`${file} executes strict WI/OK dispatch boundaries and routes verified portable replay`,async()=>{
  const source=await readFile(new URL('../.github/workflows/'+file,import.meta.url),'utf8');
  const validation=source.split('      - name: Validate')[1].split(/\r?\n      - (?:name:|uses:)/)[0];
  const script=validation.split('        run: |\n')[1].split('\n').map(line=>line.replace(/^          /,'')).join('\n');
  assert.ok(script.includes('RAW_SHADOW_RUN'));
  const directory=await mkdtemp(path.join(tmpdir(),'central-workflow-'));
  assert.ok(path.resolve(directory).startsWith(path.resolve(tmpdir())+path.sep));
  try{
    let index=0;
    const run=(state,candidate,shadow)=>execFileSync(bash,['-c',script],{encoding:'utf8',windowsHide:true,
      env:{...process.env,RAW_STATE:state,RAW_CANDIDATE_DROPS:candidate,RAW_SHADOW_RUN:shadow,
        GITHUB_OUTPUT:path.join(directory,String(index++)).replaceAll('\\','/')},stdio:['ignore','pipe','pipe']});
    for(const state of ['WI','OK','WA','NM']){
      assert.doesNotThrow(()=>run(state,`data/canary-inputs/${state}.json`,'123'));
      for(const [candidate,shadow] of [[`data/canary-inputs/${state}.json`, ''],['data/canary-inputs/other.json','123'],
        [`data/canary-inputs/${state}.json`,'123; echo injected'],['data/canary-inputs/../foreign.json','123']])assert.throws(()=>run(state,candidate,shadow));
    }
    assert.throws(()=>run('TX','data/canary-inputs/TX.json','123'));
    assert.throws(()=>run('WI; echo injected','data/canary-inputs/WI.json','123'));
    assert.ok(source.includes('family=cityhive'));
    assert.ok(source.includes('prepare-central-cityhive-canary.mjs'));
    assert.ok(source.includes('test-central-cityhive-public-canary.mjs'));
    assert.ok(source.includes('engine/out/cityhive-shadow-input/${{ steps.validate.outputs.state }}/provenance.json'));
    for(const flag of ['ALERT_DELIVERY_ENABLED','ALERT_ONSITE_DELIVERY_ENABLED','ALERT_EMAIL_DELIVERY_ENABLED','ALERT_SMS_DELIVERY_ENABLED'])assert.match(source,new RegExp(flag+': "0"'));
  }finally{await rm(directory,{recursive:true,force:true});}
});
