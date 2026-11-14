import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import manifest from '../data/state-integration/MN.json' with {type:'json'};
import {STATE_LIFECYCLE_CONFIG} from '../src/state-lifecycle.mjs';
import {MINNESOTA_CITYHIVE_PRODUCTION_COHORT_SHA256 as cohort,MINNESOTA_CITYHIVE_PRODUCTION_SOURCES as sources,
  MINNESOTA_CITYHIVE_PRODUCTION_STORE_IDS as storeIds,selectMinnesotaProductionSources,nextMinnesotaProductionCursor} from '../src/minnesota-cityhive-production-config.mjs';
import {minnesotaCityHiveProductionAllowed,collectMinnesotaCityHiveProductionState,minnesotaCityHiveSourceConfigHash,
  isMinnesotaCityHiveProductionOnSiteSignal} from '../src/collectors/minnesota-cityhive-production.mjs';

test('Minnesota production cohort is exact and rotates all sixteen premises in three bounded observations',()=>{
  assert.equal(sources.length,16);
  assert.equal(new Set(storeIds).size,16);
  assert.equal(manifest.collector.cohortSha256,cohort);
  assert.equal(createHash('sha256').update(JSON.stringify(['central-cityhive-onsite-v1','MN',sources])).digest('hex'),cohort);
  let cursor=0;const seen=new Set();
  for(let run=0;run<3;run++){
    const batch=selectMinnesotaProductionSources(cursor);
    assert.equal(batch.length,7);
    assert.equal(new Set(batch.map(source=>source.storeId)).size,7);
    for(const source of batch)seen.add(source.storeId);
    cursor=nextMinnesotaProductionCursor(cursor);
  }
  assert.equal(seen.size,16);
  assert.ok(cursor>=0&&cursor<sources.length);
});

test('Minnesota stays promotion blocked and performs no source fetch without complete immutable admission evidence',async()=>{
  assert.equal(manifest.lifecycle.publicStatus,'research_only');
  assert.equal(minnesotaCityHiveSourceConfigHash(manifest).length,64);
  assert.equal(minnesotaCityHiveProductionAllowed(STATE_LIFECYCLE_CONFIG),false);
  let calls=0;
  const report=await collectMinnesotaCityHiveProductionState({id:'MN',label:'Minnesota',tier:'B',strategy:'retailer_store_inventory',cadence:'30m'}, {}, {
    fetchText:async()=>{calls++;throw Error('source fetch must not run while dormant');},
  });
  assert.equal(report.status,'not_promoted');
  assert.equal(report.metadata.blockedByPromotion,true);
  assert.equal(report.metadata.requestCount,0);
  assert.equal(calls,0);
});

test('Minnesota on-site policy requires exact merchant binding and binary positive pickup proof',()=>{
  const observedAt='2026-11-14T10:38:28.761Z',storeId='top-ten-liquors:64640ae4a9a1022c2d6eba51';
  const optionId='f7d916d860bc19fb3f5b76ba1490b98851104085bb9b3b7e9497c33d120bee85';
  const row={state:'MN',stateCode:'MN',sourceLabel:'Top Ten Liquors Minnesota first-party pickup inventory',
    sourceUrl:`https://toptenliquors.com/shop/product/larceny-barrel-proof-brourbon/5e21e94d0320ad0f80403af4?option-id=${optionId}`,
    sourceChain:'top-ten-liquors',merchantId:'64640ae4a9a1022c2d6eba51',productId:'5e21e94d0320ad0f80403af4',optionId,variantId:optionId,
    rawName:'Larceny Barrel Proof Brourbon',canonicalBottleId:'bb_dec2c347ba378237',canonicalName:'Larceny Barrel Proof',
    eventType:'retailer_store_inventory_result',locationPrecision:'store_level',storeName:'Top Ten Liquors- Blaine',storeId,
    storeAddress:'12513 Central Ave NE, Blaine, MN 55449, USA',city:'Blaine',postalCode:'55449',zip:'55449',lat:45.19845189999999,lng:-93.2320845,
    quantity:0,quantityIsExact:false,quantitySemantics:'binary_retailer_orderable_no_exact_count',price:59.95,observedAt,
    availabilityStatus:'in_stock',sourceAvailabilityVerified:true,canAlertAsInventory:false,canAlertAsWatch:false,alertable:false,
    eligibleForOnSite:true,eligibleForDropFeed:true,eligibleForWatch:false,eligibleForDelivery:false,eligibleForEmail:false,eligibleForSms:false,
    sourceRuntimeId:'mn:central-cityhive',sourceProductBinding:{schemaVersion:1,source:'central-cityhive',merchantId:'64640ae4a9a1022c2d6eba51',
      storeId,storeAddress:'12513 Central Ave NE, Blaine, MN 55449, USA',productId:'5e21e94d0320ad0f80403af4',optionId,
      rawName:'Larceny Barrel Proof Brourbon',canonicalBottleId:'bb_dec2c347ba378237',canonicalName:'Larceny Barrel Proof',price:59.95,observedAt,
      premisesVerified:true,pickupOfferVerified:true,reportedQuantity:6,quantitySemantics:'binary_retailer_orderable_no_exact_count',
      latitude:45.19845189999999,longitude:-93.2320845,coordinatesVerified:true,productionOnSiteOnly:true,productionCohortSha256:cohort},
    raw:{chain:'top-ten-liquors',merchantId:'64640ae4a9a1022c2d6eba51',productId:'5e21e94d0320ad0f80403af4',optionId,
      reportedQuantity:6,quantitySemantics:'binary_retailer_orderable_no_exact_count'}};
  const nowMs=Date.parse(observedAt);
  assert.equal(isMinnesotaCityHiveProductionOnSiteSignal(row,{nowMs}),true);
  assert.equal(isMinnesotaCityHiveProductionOnSiteSignal({...row,quantity:1},{nowMs}),false);
  assert.equal(isMinnesotaCityHiveProductionOnSiteSignal({...row,sourceProductBinding:{...row.sourceProductBinding,pickupOfferVerified:false}},{nowMs}),false);
  assert.equal(isMinnesotaCityHiveProductionOnSiteSignal({...row,sourceProductBinding:{...row.sourceProductBinding,productionCohortSha256:'0'.repeat(64)}},{nowMs}),false);
});
