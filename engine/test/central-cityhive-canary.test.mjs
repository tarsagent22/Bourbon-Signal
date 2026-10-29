import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {BourbonBible} from '../src/core/bible.mjs';
import {prepareCentralCityHiveCanary} from '../src/prepare-central-cityhive-canary.mjs';
import {CENTRAL_CITYHIVE_EXPANSION_SOURCES} from '../src/collectors/central-cityhive-expansion.mjs';

test('canary input reparses bounded saved source proof and rejects body tampering, foreign evidence and stale clocks',async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'central-canary-'));
  try{
    const source=CENTRAL_CITYHIVE_EXPANSION_SOURCES.find(source=>source.state==='WI');
    const json=await readFile(new URL(`./fixtures/central-cityhive/${source.id}.json`,import.meta.url),'utf8');
    const body=`<script type="application/json">${json}</script>`,file=path.join(directory,'capture.html'),clock=new Date().toISOString();
    await writeFile(file,body);
    const receipt={status:200,url:source.categoryUrl,finalUrl:source.categoryUrl,file,bytes:Buffer.byteLength(body),sha256:createHash('sha256').update(body).digest('hex'),observedAt:clock};
    const report={state:'WI',finishedAt:clock,sources:[{ok:true}],metadata:{receipts:[receipt]}};
    const bible=await BourbonBible.load(new URL('../out/bourbon-bible.json',import.meta.url));
    const options={state:'WI',report,bible,captureRoots:[directory]};
    const result=await prepareCentralCityHiveCanary(options);
    assert.equal(result.drops.length,1);assert.equal(result.drops[0].observedAt,clock);assert.equal(result.originalSourceClockPreserved,true);
    for(const flag of ['canAlertAsInventory','canAlertAsWatch','eligibleForOnSite','eligibleForDelivery','eligibleForEmail','eligibleForSms'])assert.equal(result.drops[0][flag],false);
    await assert.rejects(()=>prepareCentralCityHiveCanary({...options,captureRoots:[directory+'-other']}),/escaped/);
    await assert.rejects(()=>prepareCentralCityHiveCanary({...options,state:'OK'}),/matching/);
    for(const mutation of [{sha256:'0'.repeat(64)},{bytes:3*1024*1024},{url:'https://foreign.example/shop/'},{observedAt:'2020-01-01T00:00:00Z'}]){
      const changed=structuredClone(report);Object.assign(changed.metadata.receipts[0],mutation);
      await assert.rejects(()=>prepareCentralCityHiveCanary({...options,report:changed}));
    }
    await writeFile(file,body+'tampered');
    await assert.rejects(()=>prepareCentralCityHiveCanary(options),/does not match/);
  }finally{await rm(directory,{recursive:true,force:true});}
});
