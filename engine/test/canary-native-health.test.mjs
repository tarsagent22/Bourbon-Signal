import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {BourbonBible} from '../src/core/bible.mjs';
import {activeRenewalCityHiveFixture,activeRenewalGroceryFixture} from './helpers/active-renewal-capture-fixture.mjs';
import {prepareCentralCityHiveCanary} from '../src/prepare-central-cityhive-canary.mjs';
import {prepareGroceryCanary} from '../src/prepare-grocery-canary.mjs';
import {attestActiveRenewalCanaryHealth,attestActiveRenewalCanaryHealthFromArtifact} from '../src/canary-source-health.mjs';
import {buildCanaryPreviewPayload} from '../src/build-state-canary-preview.mjs';
const captured=JSON.parse(await readFile(new URL('../../scripts/fixtures/native-overdue-sibling/nm-40965098976.json',import.meta.url),'utf8'));
const bible=new BourbonBible(captured.bibleRecords);
const sole=state=>({state,status:'degraded',stale:false,staleReason:'inventory_confirmation_overdue',reasons:['inventory_confirmation_overdue']});
async function setup(t,state='WI',empty=false){const dir=await mkdtemp(path.join(tmpdir(),'synthetic-canary-health-'));t.after(()=>rm(dir,{recursive:true,force:true}));const input=state==='NM'?await activeRenewalGroceryFixture({state,directory:path.join(dir,'raw'),bible}):await activeRenewalCityHiveFixture({state,directory:path.join(dir,'raw'),bible,soldOutSourceIds:empty?['liquorguys-wauwatosa']:[]});const prepare=state==='NM'?prepareGroceryCanary:prepareCentralCityHiveCanary;const candidate=JSON.parse(JSON.stringify(await prepare(input)));const token=await attestActiveRenewalCanaryHealth(candidate,input);return{dir,input,candidate,token};}
function base(state){return{drops:{drops:[{state,id:'expired-historical'}]},alerts:{alerts:[{state,id:'old-alert'}]},stats:{refreshHealth:{degradedStateCount:2,states:[{state,health:'degraded',anomalyCodes:['inventory_confirmation_overdue']}],healthCounts:{degraded:2},degradedStates:[sole(state),{state:'SC',status:'source_access_denied',stale:true,staleReason:'source_access_denied'}]}}};}
function build(value,source=base(value.candidate.state),changes={}){return buildCanaryPreviewPayload({base:source,state:value.candidate.state,candidateDrops:value.candidate.drops,candidateLocations:value.candidate.locations,candidateGeneratedAt:value.candidate.generatedAt,candidateHealthAttestation:value.token,...changes});}

test('complete raw-audited positive replacement retires only its obsolete warning, preserves clocks and sibling health',async t=>{
 const value=await setup(t),source=base('WI'),original=JSON.stringify(source),preview=build(value,source),health=preview.stats.refreshHealth;
 assert.ok(preview.stateDrops.count>0);assert.equal(preview.drops.drops.some(r=>r.id==='expired-historical'),false);assert.equal(health.degradedStateCount,1);assert.deepEqual(health.degradedStates,[source.stats.refreshHealth.degradedStates[1]]);assert.deepEqual(health.states,source.stats.refreshHealth.states);assert.deepEqual(health.healthCounts,source.stats.refreshHealth.healthCounts);assert.equal(JSON.stringify(source),original);
 const receipt=health.canaryDerivedStateReplacements.WI;assert.equal(receipt.productionHealthChanged,false);assert.equal(receipt.sourceClocksPreserved,true);assert.deepEqual(receipt.retiredWarnings,[sole('WI')]);assert.equal(receipt.sourceArtifactDigest,value.candidate.workflowSource.artifactDigest);assert.equal(receipt.generatedAt,value.candidate.generatedAt);assert.equal(receipt.observedFrom,value.candidate.activeRenewalProof.observedFrom);assert.deepEqual(preview.stateDrops.drops,value.candidate.drops);assert.equal(preview.alerts.alerts.length,0);
});
test('complete raw-audited zero NM replacement earns no stock, removes historical sibling and retains known premises',async t=>{
 const value=await setup(t,'NM'),preview=build(value);assert.equal(preview.stateDrops.count,0);assert.equal(preview.drops.drops.length,0);assert.equal(preview.locations.locations.length,16);assert.equal(preview.stats.refreshHealth.canaryDerivedStateReplacements.NM.candidateRows,0);assert.deepEqual(preview.stats.refreshHealth.canaryDerivedStateReplacements.NM.positiveStoreIds,[]);assert.equal(preview.stats.refreshHealth.degradedStates.some(r=>r.state==='NM'),false);
});
test('coherent union carries prior derived health and requires a new raw attestation for each replaced state',async t=>{
 const wi=await setup(t),nm=await setup(t,'NM'),source=base('WI');source.stats.refreshHealth.degradedStates.unshift(sole('NM'));source.stats.refreshHealth.degradedStateCount=3;
 const first=build(wi,source);assert.ok(first.stats.refreshHealth.degradedStates.some(r=>r.state==='NM'));
 const untrusted=build(nm,first,{candidateHealthAttestation:JSON.parse(JSON.stringify(nm.token))});assert.ok(untrusted.stats.refreshHealth.degradedStates.some(r=>r.state==='NM'));
 const union=build(nm,first);assert.deepEqual(Object.keys(union.stats.refreshHealth.canaryDerivedStateReplacements).sort(),['NM','WI']);assert.deepEqual(union.stats.refreshHealth.degradedStates,[source.stats.refreshHealth.degradedStates.find(r=>r.state==='SC')]);assert.deepEqual(union.drops.drops.filter(r=>r.state==='WI'),wi.candidate.drops);assert.equal(union.drops.drops.filter(r=>r.state==='NM').length,0);
});
test('denied, stale, unresolved, unknown, mixed and reasonless health remain unchanged despite valid complete replacement',async t=>{
 const value=await setup(t);for(const row of[{...sole('WI'),stale:true},{...sole('WI'),status:'blocked'},{...sole('WI'),status:'stale_useful'},{...sole('WI'),reasons:{hidden:'source_access_denied'}},...['source_access_denied','unresolved_source_attempt','quarantined','unknown'].map(reason=>({...sole('WI'),reasons:[reason]})),{state:'WI',status:'degraded'},{...sole('WI'),reasons:['inventory_confirmation_overdue','missing_required_customer_fields']}]){const source=base('WI');source.stats.refreshHealth.degradedStates[0]=row;const preview=build(value,source);assert.deepEqual(preview.stats.refreshHealth,source.stats.refreshHealth,JSON.stringify(row));}
 const source=base('WI');source.stats.refreshHealth.degradedStates.push({state:'WI',status:'blocked',reasons:['inventory_confirmation_overdue']});assert.deepEqual(build(value,source).stats.refreshHealth,source.stats.refreshHealth);
});
test('serialized/forged token, marker-only input, wrong rows/locations/time and post-attestation mutation cannot retire health',async t=>{
 const value=await setup(t),source=base('WI');for(const change of[{candidateHealthAttestation:null},{candidateHealthAttestation:JSON.parse(JSON.stringify(value.token))},{candidateHealthAttestation:value.candidate},{candidateDrops:[]},{candidateLocations:[]},{candidateGeneratedAt:new Date(0).toISOString()}])assert.deepEqual(build(value,source,change).stats.refreshHealth,source.stats.refreshHealth);
 const forged=structuredClone(value.candidate);forged.drops[0].price+=1;await assert.rejects(()=>attestActiveRenewalCanaryHealth(forged,value.input),/raw reparse/);
 value.candidate.activeRenewalProof.candidateRows+=1;assert.deepEqual(build(value,source).stats.refreshHealth,source.stats.refreshHealth);
});
test('missing/malformed source body and stale source clock cannot regenerate private authority',async t=>{
 const value=await setup(t),receipt=value.input.report.metadata.receipts[0],file=path.join(value.input.reportDirectory,receipt.artifactPath),bytes=await readFile(file);await writeFile(file,'malformed');await assert.rejects(()=>attestActiveRenewalCanaryHealth(value.candidate,value.input));await writeFile(file,bytes);await assert.rejects(()=>attestActiveRenewalCanaryHealth(value.candidate,{...value.input,nowMs:Date.now()+3*3600000}));
});
test('CLI regenerates authority from serialized candidate plus exact source artifact; marker and absent raw source fail',async t=>{
 const value=await setup(t),artifact=path.join(value.dir,'artifact');await mkdir(artifact);await writeFile(path.join(value.input.reportDirectory,'report.json'),JSON.stringify(value.input.report));const proof=path.join(value.dir,'provenance.json');await writeFile(proof,JSON.stringify(value.input.provenance));const rebuilt=await attestActiveRenewalCanaryHealthFromArtifact(value.candidate,{bible,artifactDirectory:value.input.reportDirectory,provenanceFile:proof});assert.equal(build(value,base('WI'),{candidateHealthAttestation:rebuilt}).stats.refreshHealth.degradedStateCount,1);
 const engine=path.join(value.dir,'engine'),source=path.join(engine,'out/cityhive-shadow-input/WI/extracted');await mkdir(source,{recursive:true});const {cp}=await import('node:fs/promises');await cp(value.input.reportDirectory,source,{recursive:true});await writeFile(path.join(engine,'out/cityhive-shadow-input/WI/provenance.json'),JSON.stringify(value.input.provenance));await mkdir(path.join(engine,'data/canary-inputs'),{recursive:true});await writeFile(path.join(engine,'data/canary-inputs/WI.json'),JSON.stringify(value.candidate));await writeFile(path.join(engine,'out/bourbon-bible.json'),JSON.stringify({records:bible.records}));const site=path.join(engine,'out/site');await mkdir(site,{recursive:true});for(const[name,data]of Object.entries({stats:base('WI').stats,drops:base('WI').drops,alerts:base('WI').alerts}))await writeFile(path.join(site,name+'.json'),JSON.stringify(data));
 const script=fileURLToPath(new URL('../src/build-state-canary-preview.mjs',import.meta.url)),run=()=>spawnSync(process.execPath,[script,'--state=WI','--candidate-drops=data/canary-inputs/WI.json'],{cwd:engine,encoding:'utf8',windowsHide:true});const ok=run();assert.equal(ok.status,0,ok.stderr);const result=JSON.parse(await readFile(path.join(engine,'out/canary/WI/site/stats.json'),'utf8'));assert.equal(result.refreshHealth.degradedStateCount,1);await rm(source,{recursive:true,force:true});assert.notEqual(run().status,0,'A serialized proof alone cannot replace raw replay');
});
