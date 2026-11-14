import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import * as classificationModule from '../src/lib/drop-classification.ts';
import * as evidenceModule from '../src/lib/public-drop-evidence.ts';
import * as siteEngineModule from '../src/lib/site-engine-contract.ts';
import * as coverageModule from '../src/lib/coverage-model.ts';
import {isOregonDailyInventoryObservation,OREGON_DAILY_INVENTORY_URL} from '../engine/src/or-daily-inventory.mjs';
const {classifyPublicDrop,getDropClassificationIndex}=classificationModule.default||classificationModule;
const {normalizePublicDropEvidenceInput,isPublicDropFeedEligible,isCurrentInventoryEvidence}=evidenceModule.default||evidenceModule;
const {normalizeDropForSite}=siteEngineModule.default||siteEngineModule;
const {buildCoverageContract}=coverageModule.default||coverageModule;
const state=process.argv.find(value=>value.startsWith('--state='))?.slice(8);assert.equal(state,'OR','Use --state=OR');
const read=async file=>JSON.parse(await readFile(file,'utf8'));
const root='engine/out/canary/OR/site',now=new Date().toISOString(),clock=Date.parse(now);
const partition=await read(root+'/states/OR/drops.json'),stats=await read(root+'/stats.json'),lifecycle=await read(root+'/lifecycle-preview.json');
const locations=(await read(root+'/locations.json')).locations,index=getDropClassificationIndex((await read('src/data/drop-feed-classification.generated.json')).records);
const alerts=await read(root+'/alerts.json'),previewPolicy=await read(root+'/canary-preview-policy.json');
const projected=partition.drops.map(row=>normalizePublicDropEvidenceInput(classifyPublicDrop(normalizeDropForSite(row),index)));
const accepted=projected.filter(row=>isPublicDropFeedEligible(row)&&isCurrentInventoryEvidence(row,now));
assert.ok(accepted.length>0,'The actual app policy must retain fresh exact OLCC rows');
assert.ok(accepted.every(row=>row.state==='OR'&&row.sourceUrl===OREGON_DAILY_INVENTORY_URL&&row.sourceAvailabilityVerified===true
  &&Number.isSafeInteger(row.quantity)&&row.quantity>0&&row.locationPrecision==='store_level'&&row.storeId&&row.storeAddress
  &&row.canAlertAsInventory===false&&row.canAlertAsWatch===false&&row.eligibleForDelivery===false
  &&row.eligibleForEmail===false&&row.eligibleForSms===false&&row.previewOnly===true));
for(const mutation of [{state:'WA'},{sourceUrl:'https://example.org/fake.csv'},{storeId:''},{storeAddress:''},{quantity:0},
  {canAlertAsInventory:true},{canAlertAsWatch:true}]){
  const changed=normalizePublicDropEvidenceInput(classifyPublicDrop(normalizeDropForSite({...partition.drops[0],...mutation}),index));
  assert.equal(isPublicDropFeedEligible(changed)&&isCurrentInventoryEvidence(changed,now),false,`Oregon canary accepted ${JSON.stringify(mutation)}`);
}
const canarySignal=partition.drops[0];assert.equal(isOregonDailyInventoryObservation(canarySignal,clock),true);
const coverage=buildCoverageContract({lifecycle,stateRows:stats.stateCoverage.states,locations,stores:(await read(root+'/stores.json')).stores,
  drops:projected,degradedStates:[],generatedAt:stats.generatedAt,asOf:now,healthLimited:false}).states.find(row=>row.code==='OR');
const positiveStores = new Set(accepted.map(row => row.storeId));
assert.equal(coverage.capabilities.currentBottleAvailability, true);
assert.equal(coverage.freshness.currentInventoryStores, positiveStores.size);
assert.ok(coverage.scope.searchableStores > 0);
assert.equal(coverage.capabilities.restockAlerts, false);
assert.equal(lifecycle.states.OR.publicStatus,'active');assert.equal(lifecycle.states.OR.inventoryAlertable,false);
assert.equal(previewPolicy.alertDeliveryEnabled,false);assert.equal(previewPolicy.productionSnapshotPublicationEnabled,false);
assert.equal(alerts.previewAlertDeliveryDisabled,true);assert.equal(alerts.alerts.some(row=>row.state==='OR'&&row.eligibleForDelivery===true),false);
const proof={state:'OR',evaluatedAt:now,scope:'local_customer_projection_of_official_shadow_report_canary',rawRows:partition.drops.length,
  appEligibleCurrentRows:accepted.length,appEligibleStores:new Set(accepted.map(row=>row.storeId)).size,searchableStores:coverage.scope.searchableStores,
  exactQuantitiesPreserved:true,originalObservationClocksPreserved:true,allDeliveryDisabled:true,liveUiExercised:false};
await writeFile('engine/out/canary/OR/site/public-projection.json',JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify(proof));
