import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import * as classificationModule from '../src/lib/drop-classification.ts';
import * as publicEvidenceModule from '../src/lib/public-drop-evidence.ts';
import * as coverageModule from '../src/lib/coverage-model.ts';
import * as siteEngineModule from '../src/lib/site-engine-contract.ts';
import {assertVerifiedCanaryProjection,assertCanaryCoverageProjection,assertCanaryStoreSearch} from './lib/verified-active-renewal-projection.mjs';
const {classifyPublicDrop,getDropClassificationIndex}=classificationModule.default||classificationModule;
const {normalizePublicDropEvidenceInput,isPublicDropFeedEligible,isCurrentInventoryEvidence}=publicEvidenceModule.default||publicEvidenceModule;
const {buildCoverageContract,searchCoverageTargets}=coverageModule.default||coverageModule;
const {normalizeDropForSite}=siteEngineModule.default||siteEngineModule;
const state=process.argv.find(value=>value.startsWith('--state='))?.slice(8);
assert.ok(['WA','NM'].includes(state),'Use reviewed --state=WA|NM');
const read=async file=>JSON.parse(await readFile(file,'utf8'));
const root=`engine/out/canary/${state}/site`,clock=new Date().toISOString();
const partition=await read(root+`/states/${state}/drops.json`),stats=await read(root+'/stats.json');
const lifecycle=await read(root+'/lifecycle-preview.json'),locations=(await read(root+'/locations.json')).locations;
const candidate=await read(`engine/data/canary-inputs/${state}.json`),authority=await read('src/config/state-lifecycle.json');
const catalog=await read('src/data/drop-feed-classification.generated.json'),index=getDropClassificationIndex(catalog.records);
const classified=partition.drops.map(row=>normalizePublicDropEvidenceInput(classifyPublicDrop(normalizeDropForSite(row),index)));
const accepted=classified.filter(row=>isPublicDropFeedEligible(row)&&isCurrentInventoryEvidence(row,clock));
const projection=assertVerifiedCanaryProjection({state,candidate,partition,accepted,locations,lifecycle:authority,nowMs:Date.parse(clock)});
assert.ok(accepted.every(row=>row.previewOnly&&row.canAlertAsInventory===false&&row.canAlertAsWatch===false
  &&row.eligibleForDelivery===false&&row.eligibleForEmail===false&&row.eligibleForSms===false));
const binary=accepted.find(row=>row.quantityIsExact===false);
assert.ok(binary||projection.verifiedNegativeRenewal,'Actual positive shadow capture must exercise binary availability without an invented count');
if(binary){
assert.equal(binary.quantity,0);
assert.equal(binary.inventorySemantics,'binary_retailer_orderable_no_exact_count');
for(const mutation of [{storeId:'unreviewed'},{productId:'unreviewed'},{quantity:1},{inventorySemantics:'exact_retailer_quantity'},
  {eligibleForOnSite:false},{eligibleForDelivery:true},{sourceStale:true}]){
  const changed={...binary,...mutation};
  assert.equal(isPublicDropFeedEligible(changed)&&isCurrentInventoryEvidence(changed,clock),false,`Binary proof mutation admitted: ${JSON.stringify(mutation)}`);
}
}
const coverageInput={lifecycle,stateRows:stats.stateCoverage.states,locations,
  stores:(await read(root+'/stores.json')).stores,drops:classified,degradedStates:[],generatedAt:stats.generatedAt,asOf:clock,healthLimited:false};
const contract=buildCoverageContract(coverageInput);
const coverage=contract.states.find(row=>row.code===state);
assertCanaryCoverageProjection(coverage,projection);
for(const location of candidate.locations){
  const results=searchCoverageTargets({...coverageInput,stateCode:state,query:location.name});
  assertCanaryStoreSearch(results,location,projection);
}
const proof={state,evaluatedAt:clock,scope:'local_customer_projection_of_workflow_canary_not_live_preview',
  rawRows:partition.drops.length,publicCurrentRows:accepted.length,publicCurrentStores:coverage.scope.inventoryMonitoredStores,
  searchableStores:coverage.scope.searchableStores,allDeliveryDisabled:true,binaryQuantityRemainsZero:binary?true:null,
  verifiedActiveRenewal:projection.verifiedActiveRenewal,verifiedNegativeRenewal:projection.verifiedNegativeRenewal,
  knownWithoutCurrentStoreIds:projection.knownWithoutCurrentStoreIds};
await writeFile(`engine/out/canary/${state}/public-projection.json`,JSON.stringify(proof,null,2)+'\n');
console.log(JSON.stringify(proof));
