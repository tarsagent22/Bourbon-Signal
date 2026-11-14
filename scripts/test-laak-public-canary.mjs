import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import * as classificationModule from '../src/lib/drop-classification.ts';
import * as evidenceModule from '../src/lib/public-drop-evidence.ts';
import * as coverageModule from '../src/lib/coverage-model.ts';
import * as siteModule from '../src/lib/site-engine-contract.ts';
const {classifyPublicDrop,getDropClassificationIndex}=classificationModule.default||classificationModule;
const {normalizePublicDropEvidenceInput,isPublicDropFeedEligible,isCurrentInventoryEvidence}=evidenceModule.default||evidenceModule;
const {buildCoverageContract}=coverageModule.default||coverageModule;
const {normalizeDropForSite}=siteModule.default||siteModule;
const state=process.argv.find(value=>value.startsWith('--state='))?.slice(8);
assert.ok(['AK','LA'].includes(state),'Use reviewed --state=AK|LA');
const read=async file=>JSON.parse(await readFile(file,'utf8'));
const root=`engine/out/canary/${state}/site`,asOf=new Date().toISOString();
const partition=await read(root+`/states/${state}/drops.json`),stats=await read(root+'/stats.json');
const lifecycle=await read(root+'/lifecycle-preview.json'),locations=(await read(root+'/locations.json')).locations;
const catalog=await read('src/data/drop-feed-classification.generated.json'),index=getDropClassificationIndex(catalog.records);
const rows=partition.drops.map(row=>normalizePublicDropEvidenceInput(classifyPublicDrop(normalizeDropForSite(row),index)));
const accepted=rows.filter(row=>isPublicDropFeedEligible(row)&&isCurrentInventoryEvidence(row,asOf));
assert.ok(accepted.length>0,'Canary must export current exact-store binary inventory to the real app projection');
assert.ok(accepted.every(row=>row.previewOnly===true&&row.quantity===0&&row.quantityIsExact===false
 &&row.inventorySemantics==='binary_retailer_orderable_no_exact_count'&&row.canAlertAsInventory===false&&row.canAlertAsWatch===false
 &&row.eligibleForDelivery===false&&row.eligibleForEmail===false&&row.eligibleForSms===false
 &&row.raw?.shadowOnly!==true&&row.sourceProductBinding?.shadowOnly!==true));
const candidate=accepted[0];
for(const mutation of [
 {state:state==='AK'?'LA':'AK'}, {storeId:'unreviewed:1'}, {sourceUrl:'https://unreviewed.example/product'},
 {quantity:1}, {inventorySemantics:'exact_retailer_quantity'}, {eligibleForOnSite:false}, {eligibleForDropFeed:false},
 {eligibleForDelivery:true}, {canAlertAsInventory:true}, {previewOnly:false}, {observedAt:'2020-01-01T00:00:00.000Z'},
 {raw:{...candidate.raw,shadowOnly:true}},
]){
 const changed={...candidate,...mutation};
 assert.equal(isPublicDropFeedEligible(changed)&&isCurrentInventoryEvidence(changed,asOf),false,`Mutated preview proof admitted: ${JSON.stringify(mutation)}`);
}
const contract=buildCoverageContract({lifecycle,stateRows:stats.stateCoverage.states,locations,
 stores:(await read(root+'/stores.json')).stores,drops:rows,degradedStates:[],generatedAt:stats.generatedAt,asOf,healthLimited:false});
const coverage=contract.states.find(row=>row.code===state);
assert.equal(coverage?.capabilities.currentBottleAvailability,true);
assert.equal(coverage?.capabilities.restockAlerts,false);
assert.ok(coverage.scope.searchableStores>0);
assert.equal(coverage.scope.inventoryMonitoredStores,new Set(accepted.map(row=>row.storeId)).size);
const proof={state,evaluatedAt:asOf,scope:'local_customer_projection_of_workflow_canary_not_live_preview',rawRows:partition.drops.length,
 publicCurrentRows:accepted.length,publicCurrentStores:coverage.scope.inventoryMonitoredStores,searchableStores:coverage.scope.searchableStores,
 allDeliveryDisabled:true,binaryQuantityRemainsZero:true,liveUiExercised:false};
await writeFile(`engine/out/canary/${state}/public-projection.json`,JSON.stringify(proof,null,2)+'\n');
console.log(JSON.stringify(proof));
