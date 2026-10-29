import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import * as classificationModule from '../src/lib/drop-classification.ts';
import * as publicEvidenceModule from '../src/lib/public-drop-evidence.ts';
import * as coverageModule from '../src/lib/coverage-model.ts';
import * as siteEngineModule from '../src/lib/site-engine-contract.ts';
const {classifyPublicDrop,getDropClassificationIndex}=classificationModule.default||classificationModule;
const {normalizePublicDropEvidenceInput,isPublicDropFeedEligible,isCurrentInventoryEvidence}=publicEvidenceModule.default||publicEvidenceModule;
const {buildCoverageContract}=coverageModule.default||coverageModule;
const {normalizeDropForSite}=siteEngineModule.default||siteEngineModule;
const state=process.argv.find(value=>value.startsWith('--state='))?.slice(8);
assert.ok(['MA','CT','RI'].includes(state),'Use reviewed --state=MA|CT|RI');
const read=async file=>JSON.parse(await readFile(file,'utf8'));
const root=`engine/out/canary/${state}/site`,clock=new Date().toISOString();
const partition=await read(root+`/states/${state}/drops.json`),stats=await read(root+'/stats.json');
const lifecycle=await read(root+'/lifecycle-preview.json'),locations=(await read(root+'/locations.json')).locations;
const catalog=await read('src/data/drop-feed-classification.generated.json'),index=getDropClassificationIndex(catalog.records);
const classified=partition.drops.map(row=>normalizePublicDropEvidenceInput(classifyPublicDrop(normalizeDropForSite(row),index)));
const accepted=classified.filter(row=>isPublicDropFeedEligible(row)&&isCurrentInventoryEvidence(row,clock));
assert.ok(accepted.length>0,'Canary must have actual current app-eligible output, not merely raw source rows');
assert.ok(accepted.every(row=>row.previewOnly&&row.canAlertAsInventory===false&&row.canAlertAsWatch===false
  &&row.eligibleForDelivery===false&&row.eligibleForEmail===false&&row.eligibleForSms===false));
const binary=accepted.find(row=>row.quantityIsExact===false);
assert.ok(binary,'Actual shadow capture must exercise binary availability without an invented count');
assert.equal(binary.quantity,0);
assert.equal(binary.inventorySemantics,'binary_retailer_orderable_no_exact_count');
for(const mutation of [{storeId:'unreviewed'},{productId:'unreviewed'},{quantity:1},{inventorySemantics:'exact_retailer_quantity'},
  {eligibleForOnSite:false},{eligibleForDelivery:true},{sourceStale:true}]){
  const changed={...binary,...mutation};
  assert.equal(isPublicDropFeedEligible(changed)&&isCurrentInventoryEvidence(changed,clock),false,`Binary proof mutation admitted: ${JSON.stringify(mutation)}`);
}
const contract=buildCoverageContract({lifecycle,stateRows:stats.stateCoverage.states,locations,
  stores:(await read(root+'/stores.json')).stores,drops:classified,degradedStates:[],generatedAt:stats.generatedAt,asOf:clock,healthLimited:false});
const coverage=contract.states.find(row=>row.code===state);
assert.equal(coverage?.capabilities.currentBottleAvailability,true);
assert.equal(coverage?.capabilities.restockAlerts,false);
assert.ok(coverage.scope.searchableStores>0);
assert.equal(coverage.scope.inventoryMonitoredStores,new Set(accepted.map(row=>row.storeId)).size);
const proof={state,evaluatedAt:clock,scope:'local_customer_projection_of_workflow_canary_not_live_preview',
  rawRows:partition.drops.length,publicCurrentRows:accepted.length,publicCurrentStores:coverage.scope.inventoryMonitoredStores,
  searchableStores:coverage.scope.searchableStores,allDeliveryDisabled:true,binaryQuantityRemainsZero:true};
await writeFile(`engine/out/canary/${state}/public-projection.json`,JSON.stringify(proof,null,2)+'\n');
console.log(JSON.stringify(proof));
