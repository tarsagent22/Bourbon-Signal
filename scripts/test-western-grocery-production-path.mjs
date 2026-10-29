import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {BourbonBible} from '../engine/src/core/bible.mjs';
import {ALL_STATE_SOURCES} from '../engine/src/state-sources.mjs';
import {collectState} from '../engine/src/collectors/generic-state.mjs';
import {canonicalizeSignal} from '../engine/src/operational-report.mjs';
import {buildDrops,bibleLookup,buildStores,buildCurrentInventoryAlertsFromDrops} from '../engine/src/export-site-contract.mjs';
import {fixture,syntheticPromotedGroceryConfig,syntheticPromotionManifest,mockedCompleteGroceryFetch} from '../engine/test/helpers/synthetic-grocery-promotion.mjs';
import * as siteModule from '../src/lib/site-engine-contract.ts';
import * as classificationModule from '../src/lib/drop-classification.ts';
import * as evidenceModule from '../src/lib/public-drop-evidence.ts';
import * as coverageModule from '../src/lib/coverage-model.ts';
const {normalizeDropForSite,normalizeStoreForSite}=siteModule.default||siteModule;
const {getDropClassificationIndex,classifyPublicDrop}=classificationModule.default||classificationModule;
const {normalizePublicDropEvidenceInput,isPublicDropFeedEligible,isCurrentInventoryEvidence}=evidenceModule.default||evidenceModule;
const {buildCoverageContract,searchCoverageTargets,findCoverageStoreTarget}=coverageModule.default||coverageModule;
const bible=new BourbonBible(fixture.records),catalog=JSON.parse(await readFile('src/data/drop-feed-classification.generated.json','utf8'));
const index=getDropClassificationIndex(catalog.records),output=[];
for(const state of ['WA','NM']){
  const directory=await mkdtemp(path.join(tmpdir(),`production-grocery-path-${state}-`));
  try{
    // Synthetic promotion schemas and mocked captures validate implementation;
    // this script never issues source HTTP or supplies promotion evidence.
    const lifecycle=syntheticPromotedGroceryConfig(state),config=ALL_STATE_SOURCES.find(row=>row.id===state);
    const report=await collectState(config,bible,{lifecycleConfig:lifecycle,promotionManifest:syntheticPromotionManifest(state,lifecycle),sourceRunnerOptions:{checkpointDir:null},
      grocerySourceOptions:{cacheDir:path.join(directory,'cache'),incidentDir:path.join(directory,'incidents'),cursorDir:path.join(directory,'cursor'),sleep:async()=>{},fetchText:mockedCompleteGroceryFetch(state)}});
    assert.equal(report.status,'useful');assert.ok(report.signals.length>0);
    const operational=report.signals.map(row=>canonicalizeSignal(row,bible));
    assert.ok(operational.every(row=>!row.canAlertAsInventory&&!row.canAlertAsWatch&&row.confidence>=.82));
    const drops=buildDrops(operational,bibleLookup(bible.records),operational);
    assert.ok(drops.length>0);assert.ok(drops.every(row=>row.previewOnly!==true));
    assert.ok(drops.every(row=>row.quantity===0&&row.quantityIsExact===false&&row.inventorySemantics==='binary_retailer_orderable_no_exact_count'
      &&row.eligibleForOnSite===true&&row.eligibleForDropFeed===true&&row.canAlertAsInventory===false&&row.canAlertAsWatch===false
      &&row.alertable===false&&row.eligibleForWatch===false&&row.eligibleForDelivery===false&&row.eligibleForEmail===false&&row.eligibleForSms===false));
    assert.equal(buildCurrentInventoryAlertsFromDrops(drops).length,0);
    assert.ok(drops.every(row=>/exact shelf count is not published/i.test(row.inventoryCaveat)));
    const rows=drops.map(row=>normalizePublicDropEvidenceInput(classifyPublicDrop(normalizeDropForSite(row),index)));
    const accepted=rows.filter(row=>isPublicDropFeedEligible(row)&&isCurrentInventoryEvidence(row));
    assert.ok(accepted.length>0);assert.ok(accepted.every(row=>row.quantity===0&&row.quantityIsExact===false));
    const stores=buildStores(operational).filter(row=>row.state===state).map(normalizeStoreForSite);
    assert.ok(stores.length>0);assert.ok(stores.every(row=>row.signalCount>0));
    const stateRows=[{state,publicStatus:'active',coverageTier:'sparse_live_store_inventory',signalCount:accepted.length}];
    const args={lifecycle,stateRows,stores,drops:rows,locations:[],degradedStates:[],healthLimited:false,asOf:new Date().toISOString()};
    const coverage=buildCoverageContract(args).states.find(row=>row.code===state);
    assert.equal(coverage.capabilities.currentBottleAvailability,true);assert.equal(coverage.capabilities.restockAlerts,false);
    assert.equal(coverage.scope.inventoryMonitoredStores,new Set(accepted.map(row=>row.storeId)).size);
    assert.ok(coverage.scope.searchableStores>0);
    const finder=searchCoverageTargets({...args,stateCode:state,query:stores[0].name});
    assert.ok(finder.length>0,'Actual Finder search service must retain source-backed store evidence');
    const selected=findCoverageStoreTarget({...args,stateCode:state,storeId:stores[0].id});
    assert.ok(selected,'Actual Finder exact-store lookup service must accept the source identity');
    const invalid={...rows[0],storeId:'unreviewed'};assert.equal(isPublicDropFeedEligible(invalid),false);
    assert.equal(isPublicDropFeedEligible({...rows[0],sourceStale:true}),false);
    assert.equal(isPublicDropFeedEligible({...rows[0],quarantined:true}),false);
    assert.equal(isPublicDropFeedEligible({...rows[0],raw:{sourceRuntimeNonAlertable:true}}),false);
    assert.equal(isPublicDropFeedEligible({...rows[0],raw:{staleFallback:true}}),false);
    const later=new Date(Date.now()+121*60_000).toISOString();
    assert.ok(rows.every(row=>!isCurrentInventoryEvidence(row,later)));
    assert.equal(buildCoverageContract({...args,asOf:later}).states.find(row=>row.code===state).capabilities.currentBottleAvailability,false);
    const inactive=structuredClone(lifecycle);inactive.activeStates=inactive.activeStates.filter(row=>row!==state);inactive.states[state].publicStatus='research_only';
    const held=await collectState(config,bible,{lifecycleConfig:inactive,grocerySourceOptions:{fetchText:async()=>{throw new Error('Inactive state requested HTTP');}}});
    assert.equal(held.signals.length,0);
    output.push({state,scope:'synthetic_production_runtime_and_actual_customer_service_test_not_source_or_delivery_evidence',
      rows:accepted.length,stores:coverage.scope.inventoryMonitoredStores,allDeliveryDisabled:true,binaryQuantityRemainsUnknown:true,previewFlagRequired:false});
  }finally{await rm(directory,{recursive:true,force:true});}
}
console.log(JSON.stringify(output));
