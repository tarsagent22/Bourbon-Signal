import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile,mkdir,cp} from 'node:fs/promises';import {tmpdir}from'node:os';import path from'node:path';import{createHash}from'node:crypto';
import {activeRenewalCityHiveFixture,activeRenewalGroceryFixture} from './helpers/active-renewal-capture-fixture.mjs';
import {BourbonBible} from '../src/core/bible.mjs';
import {verifyActiveRenewalRawCaptures,isVerifiedActiveRenewalCanary} from '../src/active-renewal-capture-proof.mjs';
import {prepareCentralCityHiveCanary} from '../src/prepare-central-cityhive-canary.mjs';
import {prepareGroceryCanary} from '../src/prepare-grocery-canary.mjs';
import {buildShadowEvidence,runExpansionShadow} from '../src/run-expansion-shadow.mjs';
import {buildCanaryPreviewPayload} from '../src/build-state-canary-preview.mjs';
const bible=await BourbonBible.load(new URL('../out/bourbon-bible.json',import.meta.url));
const hash=value=>createHash('sha256').update(value).digest('hex');
async function fixture(t,state,soldOutSourceIds){const directory=await mkdtemp(path.join(tmpdir(),'synthetic-active-negative-'));t.after(()=>rm(directory,{recursive:true,force:true}));return activeRenewalCityHiveFixture({state,soldOutSourceIds,directory,bible});}

test('actual complete zero WI captures pass renewal readiness and two canary builds without stock or baseline backfill',async t=>{
 const input=await fixture(t,'WI',['liquorguys-wauwatosa']);assert.equal(input.report.metadata.complete,true);assert.equal(input.report.signals.length,0);
 assert.equal(buildShadowEvidence('WI',input.report).complete,false,'Metadata alone never approves zero');
 const audit=await verifyActiveRenewalRawCaptures({...input,lifecycle:input.lifecycleConfig});assert.equal(audit.rows.length,0);const evidence=buildShadowEvidence('WI',input.report);assert.equal(evidence.complete,true);assert.equal(evidence.readiness.inventory.status,'ready_no_current_inventory');assert.equal(evidence.metrics.signalCount,0);
 for(let run=0;run<2;run++){
  const candidate=await prepareCentralCityHiveCanary(input);assert.deepEqual(candidate.drops,[]);assert.equal(candidate.locations.length,1);assert.equal(candidate.locations[0].hasSignals,false);assert.equal(isVerifiedActiveRenewalCanary(candidate,{lifecycle:input.lifecycleConfig}),true);
  const preview=buildCanaryPreviewPayload({base:{drops:{drops:[{state:'WI',id:'old-positive'}]},alerts:{alerts:[{state:'WI',eligibleForDelivery:true}]}},state:'WI',candidateDrops:candidate.drops,candidateLocations:candidate.locations,candidateGeneratedAt:candidate.generatedAt});
  assert.equal(preview.stateDrops.count,0);assert.equal(preview.drops.drops.length,0);assert.equal(preview.alerts.alerts.length,0);assert.equal(preview.locations.locations.length,1);
 }
});

test('partial OK replay keeps only the genuinely positive premise while retaining both known locations',async t=>{
 const input=await fixture(t,'OK',['yucatan-liquor-okc']);const candidate=await prepareCentralCityHiveCanary(input);
 assert.ok(candidate.drops.length>0);assert.equal(candidate.locations.length,2);assert.equal(candidate.activeRenewalProof.positiveStoreIds.length,1);assert.ok(candidate.drops.every(row=>row.storeId.startsWith('byrons-liquor-okc:')));assert.equal(isVerifiedActiveRenewalCanary(candidate,{lifecycle:input.lifecycleConfig}),true);
 assert.ok(candidate.drops.every(row=>row.canAlertAsInventory===false&&row.canAlertAsWatch===false&&row.eligibleForDelivery===false&&row.eligibleForEmail===false&&row.eligibleForSms===false));
});

test('actual shadow runner revalidates captured zero after the child JSON boundary before qualifying it',async t=>{
 const input=await fixture(t,'WI',['liquorguys-wauwatosa']),cwd=path.join(input.reportDirectory,'runner');await mkdir(path.join(cwd,'out'),{recursive:true});
 await writeFile(path.join(cwd,'out/bourbon-bible.json'),JSON.stringify({records:bible.records}));
 const summary=await runExpansionShadow({lifecycle:input.lifecycleConfig,states:['WI'],renewActiveStates:['WI'],limit:1,cwd,outDir:path.join(cwd,'out/shadow'),
  env:{GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:'tarsagent22/Bourbon-Signal',GITHUB_RUN_ID:'999990'},
  maintenanceRequestJson:async route=>route==='workflows/refresh-feed.yml'?{id:311991230,path:'.github/workflows/refresh-feed.yml',state:'disabled_manually'}:{total_count:0,workflow_runs:[]},
  prepareCandidate:async()=>({ok:true,status:'not_required'}),runCollector:async(_state,file)=>{
   await cp(path.join(input.reportDirectory,'source-captures'),path.join(path.dirname(file),'source-captures'),{recursive:true});await writeFile(file,JSON.stringify(input.report));return{ok:true};}});
 assert.equal(summary.complete,true);assert.equal(summary.results[0].readiness.inventory.status,'ready_no_current_inventory');assert.equal(summary.results[0].metrics.signalCount,0);assert.equal(summary.results[0].publication.allowed,false);
});

test('missing manual authority, inactive/quarantined source, partial profile and stale captures cannot qualify a zero renewal',async t=>{
 const input=await fixture(t,'WI',['liquorguys-wauwatosa']);
 for(const mutate of [
  r=>delete r.metadata.manualActiveRenewal,r=>delete r.metadata.manualActiveRenewal.maintenance,
  r=>r.metadata.manualActiveRenewal.maintenance.workflowState='active',r=>r.metadata.manualActiveRenewal.maintenance.activeProductionRunCount=1,
  r=>r.metadata.origin.commitSha='bad',r=>r.metadata.complete=false,r=>r.metadata.verifiedPremises=[],r=>r.roadblocks.push({status:403}),
  r=>r.metadata.sourceAttempts[Object.keys(r.metadata.sourceAttempts)[0]].status='access_denied',
  r=>r.metadata.receipts.pop(),r=>r.metadata.receipts[0].status=403,r=>r.metadata.receipts[0].observedAt='2020-01-01T00:00:00Z',
  r=>r.metadata.receipts[0].sha256='0'.repeat(64),r=>r.metadata.receipts[0].artifactPath='../outside.html',
 ]){const report=structuredClone(input.report);mutate(report);await assert.rejects(()=>verifyActiveRenewalRawCaptures({...input,report,lifecycle:input.lifecycleConfig}));assert.equal(buildShadowEvidence('WI',report).complete,false);}
 const inactive=structuredClone(input.lifecycleConfig);inactive.activeStates=inactive.activeStates.filter(state=>state!=='WI');await assert.rejects(()=>prepareCentralCityHiveCanary({...input,lifecycleConfig:inactive}));
 const quarantined=structuredClone(input.lifecycleConfig);quarantined.states.WI.publicStatus='quarantined';await assert.rejects(()=>prepareCentralCityHiveCanary({...input,lifecycleConfig:quarantined}));
 const priorQuarantine=process.env.BOURBON_SIGNAL_QUARANTINED_STATES;process.env.BOURBON_SIGNAL_QUARANTINED_STATES='WI';
 try{await assert.rejects(()=>prepareCentralCityHiveCanary(input));}finally{if(priorQuarantine==null)delete process.env.BOURBON_SIGNAL_QUARANTINED_STATES;else process.env.BOURBON_SIGNAL_QUARANTINED_STATES=priorQuarantine;}
 await assert.rejects(()=>verifyActiveRenewalRawCaptures({...input,state:'LA',lifecycle:input.lifecycleConfig}));
 const ordinary=structuredClone(input.report);delete ordinary.metadata.manualActiveRenewal;await assert.rejects(()=>prepareCentralCityHiveCanary({...input,report:ordinary}),/No qualified/);
 await assert.rejects(()=>prepareCentralCityHiveCanary({...input,nowMs:Date.now()+121*60_000}));
});

test('forged candidate proof or altered zero/partial payload fails the closed consumer schema',async t=>{
 const input=await fixture(t,'WI',['liquorguys-wauwatosa']);const candidate=await prepareCentralCityHiveCanary(input);
 for(const mutate of [c=>delete c.activeRenewalProof,c=>c.activeRenewalProof.extra=true,c=>c.activeRenewalProof.state='LA',c=>c.activeRenewalProof.sourceHead='f'.repeat(40),c=>c.activeRenewalProof.cohortSha256='0'.repeat(64),c=>c.activeRenewalProof.rawQualifiedRows=1,c=>c.activeRenewalProof.maintenance.workflowState='active',c=>c.locations=[],c=>c.sourceReceipts.pop(),c=>c.drops.push({state:'WI',id:'old-stock'})]){const changed=structuredClone(candidate);mutate(changed);assert.equal(isVerifiedActiveRenewalCanary(changed,{lifecycle:input.lifecycleConfig}),false);}
});

test('merchant-only, malformed product, challenge and unknown availability bodies are never healthy zero even with rehashed local receipts',async t=>{
 const input=await fixture(t,'WI',['liquorguys-wauwatosa']);const original=await readFile(path.join(input.reportDirectory,input.report.metadata.receipts[0].artifactPath),'utf8');
 for(const change of [text=>text.replaceAll('"products":','"missing_products":'),text=>text.replace('"quantity":0','"quantity":"unknown"'),text=>'<title>Just a moment</title><div class="cf-chl-test"></div>'+text,text=>text.replace('11728 W North Ave','999 Other Street')]){
  const report=structuredClone(input.report);for(const receipt of report.metadata.receipts){const body=Buffer.from(change(original));receipt.sha256=hash(body);receipt.bytes=body.length;await writeFile(path.join(input.reportDirectory,receipt.artifactPath),body);}
  await assert.rejects(()=>verifyActiveRenewalRawCaptures({...input,report,lifecycle:input.lifecycleConfig}));
 }
});

for(const state of ['WA','NM'])test(`${state} complete closed resolver/search profile supports only proven active-renewal negatives`,async t=>{
 const directory=await mkdtemp(path.join(tmpdir(),'synthetic-active-grocery-zero-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const input=await activeRenewalGroceryFixture({state,directory,bible});assert.equal(input.report.metadata.complete,true);assert.equal(input.report.signals.length,0);assert.equal(input.report.metadata.receipts.length,state==='WA'?127:43);
 await verifyActiveRenewalRawCaptures({...input,lifecycle:input.lifecycleConfig});assert.equal(buildShadowEvidence(state,input.report).complete,true);
 for(let observation=0;observation<2;observation++){const candidate=await prepareGroceryCanary(input);assert.deepEqual(candidate.drops,[]);assert.equal(candidate.locations.length,state==='WA'?58:16);assert.equal(isVerifiedActiveRenewalCanary(candidate,{lifecycle:input.lifecycleConfig}),true);}
 for(const mutate of [r=>r.metadata.librarySearchPlan.terms.pop(),r=>r.metadata.verifiedPremises.pop(),r=>r.metadata.receipts.pop(),r=>r.metadata.manualActiveRenewal.state='CA',r=>r.metadata.manualActiveRenewal.maintenance.productionReenableAllowed=true]){const report=structuredClone(input.report);mutate(report);await assert.rejects(()=>verifyActiveRenewalRawCaptures({...input,report,lifecycle:input.lifecycleConfig}));}
 const index=input.report.metadata.receipts.findIndex(receipt=>new URL(receipt.url).pathname.includes('search/substitute'));
 const original=await readFile(path.join(directory,input.report.metadata.receipts[index].artifactPath));
 for(const mutate of [p=>p.response.miscInfo.query='other-query',p=>p.response.miscInfo.filter='wrong-store',p=>p.response.numFound=1,p=>p.response.docs=[],p=>delete p.appCode]){const report=structuredClone(input.report),payload=JSON.parse(original);mutate(payload);const body=Buffer.from(JSON.stringify(payload)),receipt=report.metadata.receipts[index];receipt.sha256=hash(body);receipt.bytes=body.length;await writeFile(path.join(directory,receipt.artifactPath),body);await assert.rejects(()=>prepareGroceryCanary({...input,report}));}
});
