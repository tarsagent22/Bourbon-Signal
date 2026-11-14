import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {BourbonBible} from '../src/core/bible.mjs';
import {prepareCentralCityHiveCanary} from '../src/prepare-central-cityhive-canary.mjs';
import {collectCityHiveResearchReport,cityHiveResearchSourceForState} from '../src/research-cityhive-runtime.mjs';
import {CENTRAL_CITYHIVE_EXPANSION_SOURCES} from '../src/collectors/central-cityhive-expansion.mjs';
import {CENTRAL_CITYHIVE_RESEARCH_SOURCES} from '../src/collectors/central-cityhive-research-premises.mjs';
import {MA_JULIOS_PROBE_URLS} from '../src/collectors/massachusetts-retailer-surfaces.mjs';
import {buildCurrentInventoryAlertsFromDrops} from '../src/export-site-contract.mjs';
const bible=await BourbonBible.load(new URL('../out/bourbon-bible.json',import.meta.url));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const bodies=new Map(await Promise.all(CENTRAL_CITYHIVE_EXPANSION_SOURCES.map(async source=>[source.hostname,
  `<script type="application/json">${await readFile(new URL(`./fixtures/central-cityhive/${source.id}.json`,import.meta.url),'utf8')}</script>`])));

for(const state of ['WI','OK'])test(`${state} portable replay reparses raw merchant proof/current library and preserves clocks without delivery`,async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'central-canary-')),original=process.env.BOURBON_SIGNAL_SHADOW_MODE;
  assert.ok(path.resolve(directory).startsWith(path.resolve(tmpdir())+path.sep));
  try{
    process.env.BOURBON_SIGNAL_SHADOW_MODE='1';
    // Synthetic workflow variables test validation only, never actual receipts.
    const env={BOURBON_SIGNAL_SHADOW_MODE:'1',GITHUB_ACTIONS:'true',GITHUB_RUN_ID:'123',GITHUB_REPOSITORY:'tarsagent22/Bourbon-Signal',GITHUB_SHA:'a'.repeat(40)};
    const report=await collectCityHiveResearchReport(cityHiveResearchSourceForState(state),bible,{env,reportDirectory:directory,incidentFile:path.join(directory,'incidents.json'),
      cursorDir:path.join(directory,'cursor'),sleep:async()=>{},readAttempts:async()=>({}),writeAttempts:async()=>{},
      fetchText:async url=>({ok:true,status:200,url,text:bodies.get(new URL(url).hostname)})});
    assert.ok(report.metadata.receipts.every(receipt=>/^source-captures\/[A-Za-z0-9._-]+\.html$/.test(receipt.artifactPath)));
    const provenance={status:'verified_github_shadow_artifact',state,repository:env.GITHUB_REPOSITORY,workflowRunId:'123',
      headSha:env.GITHUB_SHA,artifactId:'456',artifactDigest:'b'.repeat(64)};
    const options={state,report:{...report,signals:[{id:'fabricated',price:1,tier:'unicorn'}]},reportDirectory:directory,bible,provenance};
    const result=await prepareCentralCityHiveCanary(options);
    assert.ok(result.drops.length>0);assert.ok(result.drops.every(row=>row.id!=='fabricated'));
    assert.equal(result.generatedAt,report.finishedAt);assert.equal(result.originalSourceClockPreserved,true);
    assert.equal(result.locations.length,state==='WI'?1:2);
    assert.ok(result.drops.every(row=>result.sourceReceipts.some(receipt=>receipt.observedAt===row.observedAt)));
    assert.ok(result.drops.every(row=>row.quantity===0&&row.quantityIsExact===false&&row.previewOnly&&row.eligibleForOnSite
      &&!row.canAlertAsInventory&&!row.canAlertAsWatch&&!row.eligibleForDelivery&&!row.eligibleForEmail&&!row.eligibleForSms));
    assert.equal(buildCurrentInventoryAlertsFromDrops(result.drops).length,0);
    await assert.rejects(()=>prepareCentralCityHiveCanary({...options,nowMs:Date.now()+121*60_000}),/stale/);
    for(const mutation of [{state:'TX'},{provenance:{...provenance,workflowRunId:'124'}},{provenance:{...provenance,artifactDigest:''}}]){
      await assert.rejects(()=>prepareCentralCityHiveCanary({...options,...mutation}));
    }
    for(const mutation of [
      receipt=>receipt.sha256='0'.repeat(64),receipt=>receipt.bytes=3*1024*1024,
      receipt=>receipt.artifactPath='../outside.html',receipt=>{delete receipt.artifactPath;receipt.file='/mutable/absolute.html';},
      receipt=>receipt.url='https://foreign.example/shop/',receipt=>receipt.finalUrl='https://foreign.example/shop/',
      receipt=>receipt.observedAt='2020-01-01T00:00:00Z',receipt=>receipt.observedAt=new Date(Date.now()+60_000).toISOString(),
    ]){
      const changed=structuredClone(report);mutation(changed.metadata.receipts[0]);
      await assert.rejects(()=>prepareCentralCityHiveCanary({...options,report:changed}));
    }
    const local=structuredClone(report);local.metadata.origin={kind:'local_shadow_not_workflow_issued'};
    await assert.rejects(()=>prepareCentralCityHiveCanary({...options,report:local}),/provenance/);
    const missing=structuredClone(report);missing.metadata.receipts=missing.metadata.receipts.filter(receipt=>new URL(receipt.url).searchParams.has('ch-query'));
    await assert.rejects(()=>prepareCentralCityHiveCanary({...options,report:missing}),/Partial state/);
    const duplicate=structuredClone(report);duplicate.metadata.receipts.push(duplicate.metadata.receipts[0]);
    await assert.rejects(()=>prepareCentralCityHiveCanary({...options,report:duplicate}));
    const disabled=new BourbonBible(structuredClone(bible.records).map(record=>({...record,libraryAlertEligible:false})));
    const disabledReport=structuredClone(report);disabledReport.metadata.bibleRecordsSha256=sha(Buffer.from(JSON.stringify(disabled.records||[])));
    await assert.rejects(()=>prepareCentralCityHiveCanary({...options,report:disabledReport,bible:disabled}),/No qualified/);
    // Tampering the raw exact premise still fails even if a local actor updates
    // its receipt hash. The outer actual ZIP digest is independently verified.
    const wrong=structuredClone(report);
    for(const receipt of wrong.metadata.receipts){
      const source=CENTRAL_CITYHIVE_EXPANSION_SOURCES.find(source=>source.hostname===new URL(receipt.url).hostname);
      const body=Buffer.from(bodies.get(source.hostname).replaceAll(source.address,'999 Other Street'));
      receipt.sha256=sha(body);receipt.bytes=body.length;await writeFile(path.join(directory,receipt.artifactPath),body);
    }
    await assert.rejects(()=>prepareCentralCityHiveCanary({...options,report:wrong}),/exact registered premise/);
  }finally{if(original===undefined)delete process.env.BOURBON_SIGNAL_SHADOW_MODE;else process.env.BOURBON_SIGNAL_SHADOW_MODE=original;await rm(directory,{recursive:true,force:true});}
});

function perStoreBody(source){
  const fixture=JSON.parse(bodies.get('liquorguys.com').match(/<script type="application\/json">([\s\S]*?)<\/script>/)[1]);
  fixture.merchant_configs[0].merchant.id=source.merchantId;
  fixture.merchant_configs[0].merchant.name=source.name;
  fixture.merchant_configs[0].merchant.address={full_address:source.address,location:{type:'Point',coordinates:[source.lng,source.lat]}};
  for(const product of fixture.products)for(const merchant of product.merchants||[]){
    merchant.merchant_id=source.merchantId;merchant.full_address=source.address;
    merchant.address={full_address:source.address,location:{type:'Point',coordinates:[source.lng,source.lat]}};
    for(const option of merchant.product_options||[]){
      option.merchant_id=source.merchantId;option.full_address=source.address;
      option.product_url=`${source.baseUrl}/shop/product/${product.name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}/${option.product_id}?option-id=${option.option_id}`;
    }
  }
  return `<script type="application/json">${JSON.stringify(fixture)}</script>`;
}

async function makePerStoreReport(state,directory){
  const sources=CENTRAL_CITYHIVE_RESEARCH_SOURCES.filter(source=>source.state===state);
  const receipts=[],requests=[];
  await mkdir(path.join(directory,'source-captures'),{recursive:true});
  const at=new Date().toISOString();
  for(const [index,source] of sources.entries()){
    const url=`${source.baseUrl}/shop/?ch-query=${encodeURIComponent('barrel proof')}&merchant-id=${source.merchantId}`;
    const body=Buffer.from(perStoreBody(source));
    const artifactPath=`source-captures/${String(index+1).padStart(3,'0')}.html`;
    await writeFile(path.join(directory,artifactPath),body);
    receipts.push({url,finalUrl:url,status:200,observedAt:at,bytes:body.length,sha256:sha(body),artifactPath});
    requests.push({sourceId:source.id,url,status:200,ok:true});
  }
  const centralRows=sources.map(source=>({sourceRuntimeId:`research:${state.toLowerCase()}:${source.id}`,label:source.sourceLabel,url:source.categoryUrl,ok:true,status:200}));
  const juliosRows=state==='MA'?MA_JULIOS_PROBE_URLS.map((url,index)=>({sourceRuntimeId:`precision:ma:julios-westborough:${index}`,label:"Julio's Liquors public pickup",url,ok:true,status:200})):[];
  const report={state,finishedAt:at,sources:[...centralRows,...juliosRows],signals:state==='MA'?[{sourceRuntimeId:'precision:ma:julios-westborough:0',id:'ignored-julios-signal'}]:[],metadata:{
    complete:true,shadowOnly:true,productionActivationAllowed:false,customerDeliveryAllowed:false,requests,receipts,
    bibleRecordsSha256:sha(Buffer.from(JSON.stringify(bible.records||[]))),origin:{kind:'github_actions',repository:'tarsagent22/Bourbon-Signal',workflowRunId:'123',commitSha:'a'.repeat(40)},
  }};
  return{sources,report,at};
}

for(const state of ['MN','MO','MA','WY'])test(`${state} per-store CityHive artifacts replay only complete exact-premise raw source receipts`,async t=>{
  const directory=await mkdtemp(path.join(tmpdir(),`cityhive-${state.toLowerCase()}-canary-`));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  const {sources,report}=await makePerStoreReport(state,directory);
  const provenance={status:'verified_github_shadow_artifact',state,repository:'tarsagent22/Bourbon-Signal',workflowRunId:'123',
    headSha:'a'.repeat(40),artifactId:'456',artifactDigest:'b'.repeat(64)};
  const result=await prepareCentralCityHiveCanary({state,report,reportDirectory:directory,bible,provenance});
  assert.equal(result.locations.length,sources.length);
  assert.equal(result.sourceReceipts.length,sources.length);
  assert.equal(result.sourceFamily,'central_cityhive');
  assert.equal(result.sourceRegistrySha256.length,64);
  assert.equal(result.bibleRecordsSha256,report.metadata.bibleRecordsSha256);
  assert.ok(result.drops.length>0);
  assert.ok(result.drops.every(row=>sources.some(source=>source.storeId===row.storeId)));
  if(state==='MA'){
    assert.deepEqual(result.excludedSourceFamilies,[{id:'julios-westborough',reason:'Separate source collector; excluded from central CityHive replay.'}]);
    assert.ok(result.drops.every(row=>row.sourceRuntimeId!=='precision:ma:julios-westborough:0'));
  }else assert.equal(result.excludedSourceFamilies,undefined);

  const missing=structuredClone(report);missing.metadata.receipts.pop();missing.metadata.requests.pop();
  await assert.rejects(()=>prepareCentralCityHiveCanary({state,report:missing,reportDirectory:directory,bible,provenance}),/Incomplete|Partial per-store/);
  const wrongBible=structuredClone(report);wrongBible.metadata.bibleRecordsSha256='0'.repeat(64);
  await assert.rejects(()=>prepareCentralCityHiveCanary({state,report:wrongBible,reportDirectory:directory,bible,provenance}),/library-mismatched/);
});
