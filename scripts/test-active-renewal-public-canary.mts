// Offline captured-body fixtures with synthetic workflow identifiers. These
// tests never collect source HTTP, issue proof, or activate customer coverage.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {BourbonBible} from '../engine/src/core/bible.mjs';
import {STATE_LIFECYCLE_CONFIG} from '../engine/src/state-lifecycle.mjs';
import {activeRenewalCityHiveFixture,activeRenewalGroceryFixture} from '../engine/test/helpers/active-renewal-capture-fixture.mjs';
import {prepareCentralCityHiveCanary} from '../engine/src/prepare-central-cityhive-canary.mjs';
import {prepareGroceryCanary} from '../engine/src/prepare-grocery-canary.mjs';
import {collectGroceryResearchReport,groceryResearchSourceForState} from '../engine/src/research-grocery-runtime.mjs';
import {mockedCompleteGroceryFetch} from '../engine/test/helpers/synthetic-grocery-promotion.mjs';
import {buildStateCanaryPreview} from '../engine/src/build-state-canary-preview.mjs';
import {assertVerifiedCanaryProjection,assertCanaryCoverageProjection,assertCanaryStoreSearch} from './lib/verified-active-renewal-projection.mjs';
import * as classificationModule from '../src/lib/drop-classification.ts';
import * as evidenceModule from '../src/lib/public-drop-evidence.ts';
import * as contractModule from '../src/lib/site-engine-contract.ts';
const interop=(value:any)=>value.default||value;
const {classifyPublicDrop,getDropClassificationIndex}=interop(classificationModule);
const {normalizePublicDropEvidenceInput,isPublicDropFeedEligible,isCurrentInventoryEvidence}=interop(evidenceModule);
const {normalizeDropForSite}=interop(contractModule);
const root=fileURLToPath(new URL('../',import.meta.url));
const json=async(file:string)=>JSON.parse(await readFile(file,'utf8'));
const bible=await BourbonBible.load(path.join(root,'engine/out/bourbon-bible.json'));
const index=getDropClassificationIndex((await json(path.join(root,'src/data/drop-feed-classification.generated.json'))).records);
const classify=(candidate:any)=>candidate.drops.map((row:any)=>normalizePublicDropEvidenceInput(classifyPublicDrop(normalizeDropForSite(row),index)))
  .filter((row:any)=>isPublicDropFeedEligible(row)&&isCurrentInventoryEvidence(row));

async function withDirectory(fn:(directory:string)=>Promise<void>){
  const directory=await mkdtemp(path.join(tmpdir(),'active-four-public-canary-'));
  assert.ok(path.resolve(directory).startsWith(path.resolve(tmpdir())+path.sep));
  try{await fn(directory);}finally{await rm(directory,{recursive:true,force:true});}
}

async function runActualPublicVerifier(state:string,candidate:any,directory:string){
  // The child runs the real verifier against an isolated coherent snapshot.
  // Only source/config files are junctioned; generated evidence stays in temp.
  const workspace=path.join(directory,'workspace'),base=path.join(directory,'base');
  await mkdir(path.join(base,'states'),{recursive:true});await mkdir(workspace,{recursive:true});
  await symlink(path.join(root,'src'),path.join(workspace,'src'),'junction');
  await symlink(path.join(root,'node_modules'),path.join(workspace,'node_modules'),'junction');
  const generatedAt=candidate.generatedAt;
  const files={manifest:{files:{stateDrops:'states/index.json'}},stats:{generatedAt,stateCoverage:{states:[]}},
    drops:{drops:[],count:0},alerts:{alerts:[]},locations:{locations:[]}};
  for(const[name,payload]of Object.entries(files))await writeFile(path.join(base,name+'.json'),JSON.stringify(payload));
  await writeFile(path.join(base,'states/index.json'),JSON.stringify({states:[],totalCount:0,stateCount:0}));
  const site=path.join(workspace,'engine/out/canary',state,'site');
  await buildStateCanaryPreview({state,candidateDrops:candidate.drops,candidateLocations:candidate.locations,candidateGeneratedAt:generatedAt,
    lifecycleConfig:STATE_LIFECYCLE_CONFIG,siteDir:base,outDir:site});
  await writeFile(path.join(site,'stores.json'),JSON.stringify({generatedAt,stores:candidate.locations}));
  const input=path.join(workspace,'engine/data/canary-inputs');await mkdir(input,{recursive:true});
  await writeFile(path.join(input,state+'.json'),JSON.stringify(candidate));
  const script=['WA','NM'].includes(state)?'test-grocery-public-canary.mjs':'test-central-cityhive-public-canary.mjs';
  const child=spawnSync(process.execPath,['--import','tsx',path.join(root,'scripts',script),'--state='+state],
    {cwd:workspace,env:{...process.env,TSX_TSCONFIG_PATH:path.join(root,'tsconfig.json')},encoding:'utf8',windowsHide:true,timeout:60_000});
  assert.equal(child.status,0,child.stderr||child.stdout);
  return json(path.join(workspace,'engine/out/canary',state,'public-projection.json'));
}

for(const state of ['WI','OK','WA','NM'])test(`${state}: actual public verifier accepts only a fully captured active negative renewal`,async()=>withDirectory(async directory=>{
  const candidate=['WI','OK'].includes(state)?await prepareCentralCityHiveCanary(await activeRenewalCityHiveFixture({state,directory,bible,
    soldOutSourceIds:state==='WI'?['liquorguys-wauwatosa']:['yucatan-liquor-okc','byrons-liquor-okc']})):
    await prepareGroceryCanary(await activeRenewalGroceryFixture({state,directory,bible}));
  assert.equal(candidate.drops.length,0);
  const result=await runActualPublicVerifier(state,candidate,directory);
  assert.equal(result.publicCurrentRows,0);assert.equal(result.publicCurrentStores,0);assert.equal(result.verifiedNegativeRenewal,true);
  assert.equal(result.knownWithoutCurrentStoreIds.length,candidate.locations.length);assert.equal(result.binaryQuantityRemainsZero,null);
}));

test('ordinary positive grocery canary still proves actual binary rows without using renewal authority',async()=>withDirectory(async directory=>{
  const state='NM',env={BOURBON_SIGNAL_SHADOW_MODE:'1',GITHUB_ACTIONS:'true',GITHUB_RUN_ID:'999990',
    GITHUB_REPOSITORY:'tarsagent22/Bourbon-Signal',GITHUB_SHA:'a'.repeat(40)};
  const report=await collectGroceryResearchReport(groceryResearchSourceForState(state),bible,{env,reportDirectory:directory,
    attemptsFile:path.join(directory,'synthetic-attempts.json'),cursorDir:path.join(directory,'cursor'),sleep:async()=>{},
    fetchText:mockedCompleteGroceryFetch(state)});
  const candidate=await prepareGroceryCanary({state,report,reportDirectory:directory,bible,
    provenance:{status:'verified_github_shadow_artifact',state,repository:env.GITHUB_REPOSITORY,workflowRunId:env.GITHUB_RUN_ID,
      headSha:env.GITHUB_SHA,artifactId:'999991',artifactDigest:'b'.repeat(64)}});
  assert.equal(Object.hasOwn(candidate,'activeRenewalProof'),false);
  const result=await runActualPublicVerifier(state,candidate,directory);
  assert.ok(result.publicCurrentRows>0);assert.equal(result.publicCurrentStores,16);assert.equal(result.binaryQuantityRemainsZero,true);
  assert.equal(result.verifiedActiveRenewal,false);assert.equal(result.verifiedNegativeRenewal,false);
}));

test('OK: actual Coverage and selectable services distinguish one positive store from one sold-out premise',async()=>withDirectory(async directory=>{
  const candidate=await prepareCentralCityHiveCanary(await activeRenewalCityHiveFixture({state:'OK',directory,bible,soldOutSourceIds:['yucatan-liquor-okc']}));
  assert.equal(candidate.drops.length,2);assert.equal(new Set(candidate.drops.map((row:any)=>row.storeId)).size,1);
  const result=await runActualPublicVerifier('OK',candidate,directory);
  assert.equal(result.publicCurrentRows,2);assert.equal(result.publicCurrentStores,1);assert.equal(result.verifiedNegativeRenewal,false);
  assert.deepEqual(result.knownWithoutCurrentStoreIds,candidate.locations.filter((row:any)=>!candidate.drops.some((drop:any)=>drop.storeId===row.id)).map((row:any)=>row.id));
}));

test('zero projection fails for forged metadata, changed raw counts/clocks/premises, inactive authority and new states',async()=>withDirectory(async directory=>{
  const candidate=await prepareCentralCityHiveCanary(await activeRenewalCityHiveFixture({state:'WI',directory,bible,soldOutSourceIds:['liquorguys-wauwatosa']}));
  const args=()=>({state:'WI',candidate:structuredClone(candidate),partition:{drops:[]},accepted:[],locations:structuredClone(candidate.locations),
    lifecycle:structuredClone(STATE_LIFECYCLE_CONFIG),nowMs:Date.now()});
  assert.equal(assertVerifiedCanaryProjection(args()).verifiedNegativeRenewal,true);
  for(const mutate of [
    (value:any)=>delete value.candidate.activeRenewalProof,
    (value:any)=>value.candidate.activeRenewalProof.allowEmpty=true,
    (value:any)=>value.candidate.activeRenewalProof.rawQualifiedRows=1,
    (value:any)=>value.candidate.activeRenewalProof.candidateRows=1,
    (value:any)=>value.candidate.activeRenewalProof.receiptCount--,
    (value:any)=>value.candidate.activeRenewalProof.sourceArtifactDigest='0'.repeat(64),
    (value:any)=>value.candidate.activeRenewalProof.maintenance.workflowState='active',
    (value:any)=>value.nowMs+=121*60_000,
    (value:any)=>value.candidate.locations.pop(),
    (value:any)=>value.locations.pop(),
    (value:any)=>value.locations[0].address='999 Other Street',
    (value:any)=>value.partition.drops.push({id:'injected',state:'WI'}),
    (value:any)=>value.lifecycle.activeStates=value.lifecycle.activeStates.filter((state:string)=>state!=='WI'),
    (value:any)=>value.lifecycle.states.WI.publicStatus='research_only',
    (value:any)=>value.lifecycle.states.WI.promotionEvidence.shadowRuns=2,
    ...['LA','AK','MA','CT','RI'].map(state=>(value:any)=>{value.state=state;value.candidate.state=state;delete value.candidate.activeRenewalProof;}),
  ]){const changed=args();mutate(changed);assert.throws(()=>assertVerifiedCanaryProjection(changed),String(mutate));}
}));

test('positive projection cannot invent rows, clocks, store counts, or monitored status at a sold-out premise',async()=>withDirectory(async directory=>{
  const candidate=await prepareCentralCityHiveCanary(await activeRenewalCityHiveFixture({state:'OK',directory,bible,soldOutSourceIds:['yucatan-liquor-okc']}));
  const accepted=classify(candidate),args={state:'OK',candidate,partition:{drops:candidate.drops},accepted,locations:candidate.locations,
    lifecycle:STATE_LIFECYCLE_CONFIG,nowMs:Date.now()};
  const projection=assertVerifiedCanaryProjection(args);assert.equal(projection.positiveStoreIds.length,1);
  assert.throws(()=>assertVerifiedCanaryProjection({...args,accepted:[]}),/Current app-eligible/);
  for(const mutate of [(row:any)=>row.storeId='unreviewed',(row:any)=>row.productId='unreviewed',(row:any)=>row.observedAt=new Date(Date.now()+1000).toISOString(),(row:any)=>row.id='invented']){
    const changed=structuredClone(accepted);mutate(changed[0]);assert.throws(()=>assertVerifiedCanaryProjection({...args,accepted:changed}));
  }
  const negative=candidate.locations.find((row:any)=>projection.knownWithoutCurrentStoreIds.includes(row.id));
  assertCanaryStoreSearch([{kind:'store',storeId:negative.id,status:'known-expansion-candidate'}],negative,projection);
  assert.throws(()=>assertCanaryStoreSearch([{kind:'store',storeId:negative.id,status:'actively-monitored'}],negative,projection));
  assert.throws(()=>assertCanaryCoverageProjection({capabilities:{currentBottleAvailability:true,restockAlerts:false},
    scope:{searchableStores:2,inventoryMonitoredStores:2}},projection));
}));
