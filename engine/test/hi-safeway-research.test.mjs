import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {BourbonBible} from '../src/core/bible.mjs';
import {HI_SAFEWAY_SOURCES,hiSafewayPremiseMatches,parseHiSafewayInventory} from '../src/collectors/hi-safeway-grocery.mjs';
import {hiSafewayResearchSourceForState,collectHiSafewayResearchReport} from '../src/research-hi-safeway-runtime.mjs';
import {researchSourceForState,withResearchLifecycle} from '../src/research-state-registry.mjs';
import {selectShadowCandidates} from '../src/run-expansion-shadow.mjs';
import {cityHiveResearchSourceForState} from '../src/research-cityhive-runtime.mjs';

const fixtureDir=new URL('./fixtures/hi-safeway-grocery/',import.meta.url);
const fixture=async name=>JSON.parse(await readFile(new URL(name,fixtureDir),'utf8'));
const identity=await fixture('../national-grocery-breadth-20261105/identity.json');
const bible=new BourbonBible(identity.records),observedAt='2026-11-14T09:17:00.000Z';

test('retained public captures match their research manifest digests',async()=>{
 const manifest=await fixture('manifest.json');
 for(const store of manifest.stores){
  for(const item of [store.resolver.body,store.productQuery.body]){
   const file=item.file;const bytes=await readFile(new URL(file,fixtureDir));
   assert.equal(bytes.length,item.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),item.sha256);
  }
 }
});

test('HI Safeway premises require exact resolver location, banner, domain and complete address',async()=>{
 const resolver=await fixture('resolver-96814.json'),store=resolver.instore.stores.find(x=>x.locationId==='2944');
 assert.equal(hiSafewayPremiseMatches(HI_SAFEWAY_SOURCES[0],store),true);
 assert.equal(hiSafewayPremiseMatches(HI_SAFEWAY_SOURCES[0],{...store,locationId:'other'}),false);
 assert.equal(hiSafewayPremiseMatches(HI_SAFEWAY_SOURCES[0],{...store,address:{...store.address,zipcode:'96815'}}),false);
});

test('HI inventory only accepts three reviewed exact SKUs and in-store binary positives',async()=>{
 const counts={};
 for(const source of HI_SAFEWAY_SOURCES){const payload=await fixture(`products-${source.merchantId}.json`);const rows=parseHiSafewayInventory(payload,source,bible,{observedAt});counts[source.merchantId]=rows.map(x=>x.productId);assert.ok(rows.every(x=>x.quantity===0&&x.quantityIsExact===false&&x.inventorySemantics==='binary_retailer_in_store_no_exact_count'&&x.canAlertAsInventory===false&&x.canAlertAsWatch===false));
  const falseFamily={...payload,response:{...payload.response,docs:[...payload.response.docs,{...payload.response.docs[0],id:'970752278',pid:'970752278',name:'Bulleit Single Malt - 750 Ml',upc:'0008200077777'}]}};
  assert.deepEqual(parseHiSafewayInventory(falseFamily,source,bible,{observedAt}).map(x=>x.productId),rows.map(x=>x.productId));
  if(source.merchantId==='2944'){
   const variableProof={...payload,response:{...payload.response,docs:payload.response.docs.map(p=>p.id==='960488502'?{...p,alcoholVolumePct:64}:p)}};
   assert.ok(parseHiSafewayInventory(variableProof,source,bible,{observedAt}).some(x=>x.productId==='960488502'));
  }
 }
 assert.deepEqual(Object.fromEntries(Object.entries(counts).map(([k,v])=>[k,v.sort()])),{'2944':['960051942','960293806','960488502'],'280':['960051942'],'2894':['960051942'],'2893':['960051942']});
});

test('HI runtime is shadow registered, four-store bounded and never alertable',async()=>{
 const config=hiSafewayResearchSourceForState('HI'),dir=await mkdtemp(path.join(tmpdir(),'hi-safe-shadow-'));let calls=0;
 assert.equal(researchSourceForState('HI',{shadowMode:true}),cityHiveResearchSourceForState('HI'),'default HI route should preserve the existing CityHive collector');
 assert.equal(researchSourceForState('HI',{shadowMode:true,sourceLane:'default'}),cityHiveResearchSourceForState('HI'));
 assert.equal(researchSourceForState('HI',{shadowMode:true,sourceLane:'hi-safeway'}),config);
 assert.equal(researchSourceForState('HI',{shadowMode:true,sourceLane:'hi-cityhive'})?.id,'HI');
 assert.equal(researchSourceForState('HI',{shadowMode:false,sourceLane:'hi-safeway'}),null);
 const production=JSON.parse(await readFile(new URL('../../src/config/state-lifecycle.json',import.meta.url),'utf8'));
 production.activeStates=production.activeStates.filter(state=>state!=='HI');delete production.states.HI;
 const before=JSON.stringify(production),overlay=withResearchLifecycle(production);assert.equal(JSON.stringify(production),before);
 assert.equal(overlay.activeStates.includes('HI'),false);assert.equal(overlay.states.HI.publicStatus,'research_only');assert.equal(overlay.states.HI.inventoryAlertable,false);assert.equal(overlay.states.HI.watchAlertable,false);assert.deepEqual(selectShadowCandidates(overlay,{states:['HI'],limit:1}),['HI']);
 try{const report=await collectHiSafewayResearchReport(config,bible,{env:{BOURBON_SIGNAL_SHADOW_MODE:'1'},reportDirectory:dir,incidentDir:path.join(dir,'incidents'),
  fetchText:async url=>{calls++;const u=new URL(url);let name;if(u.pathname.includes('storeresolver'))name=`resolver-${u.searchParams.get('zipcode')}.json`;else name=`products-${u.searchParams.get('storeid')}.json`;const text=await readFile(new URL(name,fixtureDir),'utf8');return{ok:true,status:name.startsWith('resolver')?206:200,url,text};}});
  assert.equal(report.metadata.complete,true);assert.equal(report.metadata.verifiedPremises.length,4);assert.equal(calls,8);assert.equal(report.metadata.receipts.length,8);
  assert.ok(report.metadata.receipts.every(receipt=>/^[a-f0-9]{64}$/.test(receipt.sha256)&&receipt.bytes<=4*1024*1024&&receipt.observedAt));
  const inventoryReceipts=report.metadata.receipts.filter(receipt=>receipt.kind==='inventory');
  assert.equal(inventoryReceipts.length,4);assert.ok(inventoryReceipts.every(receipt=>receipt.term==='bourbon'&&receipt.storeAddress&&new URL(receipt.url).searchParams.get('storeid')===receipt.merchantId));
  assert.ok(report.signals.every(signal=>inventoryReceipts.some(receipt=>receipt.storeId===signal.storeId&&receipt.observedAt===signal.observedAt)));
  assert.equal(report.metadata.shadowOnly,true);assert.equal(report.metadata.productionActivationAllowed,false);assert.equal(report.metadata.customerDeliveryAllowed,false);
  assert.ok(report.signals.every(x=>x.canAlertAsInventory===false&&x.canAlertAsWatch===false&&x.eligibleForDelivery===false&&x.sourceProductBinding.shadowOnly));
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('Safeway access denial persists and suppresses later requests',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'hi-safe-denial-'));let calls=0;
 try{const options={env:{BOURBON_SIGNAL_SHADOW_MODE:'1'},reportDirectory:path.join(dir,'report'),incidentDir:path.join(dir,'incidents'),
  fetchText:async url=>{calls++;return{ok:false,status:403,url,text:'denied'};}};
  const first=await collectHiSafewayResearchReport(hiSafewayResearchSourceForState('HI'),bible,options);
  assert.equal(first.metadata.complete,false);assert.equal(calls,1);
  const second=await collectHiSafewayResearchReport(hiSafewayResearchSourceForState('HI'),bible,options);
  assert.equal(second.metadata.complete,false);assert.equal(calls,1);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('unresolved HI request leaves an in-flight latch that blocks retry',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'hi-safe-inflight-'));let calls=0;
 try{const incidentDir=path.join(dir,'incidents'),options={env:{BOURBON_SIGNAL_SHADOW_MODE:'1'},incidentDir,reportDirectory:path.join(dir,'report'),fetchText:async()=>{calls++;throw Error('network uncertainty');}};
  await assert.rejects(()=>collectHiSafewayResearchReport(hiSafewayResearchSourceForState('HI'),bible,options),/network uncertainty/);
  const latch=JSON.parse(await readFile(path.join(incidentDir,'HI.json'),'utf8'))['host:www.safeway.com'];
  assert.equal(latch.status,'in_flight');assert.equal(latch.httpStatus,null);assert.ok(latch.requestId);
  const retry=await collectHiSafewayResearchReport(hiSafewayResearchSourceForState('HI'),bible,options);
  assert.equal(calls,1);assert.equal(retry.metadata.complete,false);assert.match(retry.roadblocks[0].error,/in-flight observation/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
