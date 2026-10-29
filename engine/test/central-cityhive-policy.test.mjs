import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { BourbonBible } from '../src/core/bible.mjs';
import { CENTRAL_CITYHIVE_EXPANSION_SOURCES,parseCentralCityHiveInventory } from '../src/collectors/central-cityhive-expansion.mjs';
import { isCentralCityHiveInventory } from '../src/central-cityhive-policy.mjs';
import { confidenceForSignal } from '../src/confidence-policy.mjs';
import { buildDrops,bibleLookup,dropHasPositiveAlertInventory } from '../src/export-site-contract.mjs';
import { executeStateFixtures,validateStateFixtures } from '../src/verify-state-fixtures.mjs';
import { STATE_LIFECYCLE_CONFIG } from '../src/state-lifecycle.mjs';
import { collectPromotedCentralCityHiveState } from '../src/research-cityhive-runtime.mjs';
import { CENTRAL_CITYHIVE_STATE_CONFIGS } from '../src/central-cityhive-state-config.mjs';
const bibleFile=new URL('../out/bourbon-bible.json',import.meta.url),bible=await BourbonBible.load(bibleFile),lookup=bibleLookup(bible.records);

test('WI/OK golden fixtures execute actual collector parsing, source policy and site projection',async()=>{
  for(const state of ['WI','OK']){
    const fixture=JSON.parse(await readFile(new URL(`../data/state-fixtures/${state}.json`,import.meta.url),'utf8'));
    assert.deepEqual(validateStateFixtures(fixture),{ok:true,failures:[]});
    assert.deepEqual(await executeStateFixtures(fixture,{bibleFile}),{ok:true,failures:[]});
  }
});
test('promotion-gated production collector cannot start a request for inactive states',async()=>{
  for(const config of CENTRAL_CITYHIVE_STATE_CONFIGS){
    const original=STATE_LIFECYCLE_CONFIG.states[config.id];
    try{STATE_LIFECYCLE_CONFIG.states[config.id]={...original,publicStatus:'research_only'};
      let calls=0;const result=await collectPromotedCentralCityHiveState(config,bible,{fetchText:()=>{calls++;throw new Error('unexpected request');}});
      assert.equal(calls,0);assert.equal(result.signals.length,0);assert.equal(result.roadblocks[0].status,'promotion_required');
    }finally{if(original)STATE_LIFECYCLE_CONFIG.states[config.id]=original;else delete STATE_LIFECYCLE_CONFIG.states[config.id];}
  }
});
test('every source binding dimension is checked again after parsing and before public projection',async()=>{
  for(const source of CENTRAL_CITYHIVE_EXPANSION_SOURCES){
    const fixture=await readFile(new URL(`./fixtures/central-cityhive/${source.id}.json`,import.meta.url),'utf8');
    const rows=parseCentralCityHiveInventory(`<script type="application/json">${fixture}</script>`,source,bible,{observedAt:new Date().toISOString()});
    assert.ok(rows.length>0);const row=rows[0];assert.equal(isCentralCityHiveInventory(row),true);
    for(const change of [{merchantId:'wrong'},{sourceChain:'wrong'},{storeAddress:'wrong'},{productId:'wrong'},
      {optionId:'wrong'},{sourceUrl:'https://example.com/foreign'},{price:1},{canonicalBottleId:'wrong'},{canonicalName:'wrong'},
      {observedAt:'2099-01-01T00:00:00Z'},{observedAt:'2020-01-01T00:00:00Z'},{stale:true},{sourceStale:true},
      {quantity:4},{quantityIsExact:true},{availabilityStatus:'out_of_stock'},{sourceAvailabilityVerified:false},
      {sourceProductBinding:{...row.sourceProductBinding,pickupOfferVerified:false}},
      {raw:{...row.raw,reportedQuantity:0}}]){
      const invalid={...row,...change};assert.equal(isCentralCityHiveInventory(invalid),false,JSON.stringify(change));
      assert.equal(confidenceForSignal(invalid).canAlertAsInventory,false);
      assert.equal(buildDrops([invalid],lookup,[invalid]).length,0);
    }
  }
});
test('simulated active lifecycle enables valid proof but cannot publish retained shadow rows',async()=>{
  const source=CENTRAL_CITYHIVE_EXPANSION_SOURCES[0],fixture=await readFile(new URL(`./fixtures/central-cityhive/${source.id}.json`,import.meta.url),'utf8');
  const[row]=parseCentralCityHiveInventory(`<script type="application/json">${fixture}</script>`,source,bible,{observedAt:new Date().toISOString()});
  const original=STATE_LIFECYCLE_CONFIG.states.WI;
  try{
    STATE_LIFECYCLE_CONFIG.states.WI={...original,publicStatus:'active',inventoryAlertable:true,watchAlertable:true};
    assert.equal(confidenceForSignal(row).canAlertAsInventory,true);
    const[d]=buildDrops([row],lookup,[row]);assert.equal(d.quantity,0);assert.equal(d.quantityIsExact,false);
    assert.equal(dropHasPositiveAlertInventory(d),true);
    const shadow={...row,raw:{...row.raw,shadowOnly:true},alertable:false,eligibleForDelivery:false,eligibleForEmail:false,eligibleForSms:false};
    assert.equal(confidenceForSignal(shadow).canAlertAsInventory,false);
    assert.deepEqual(buildDrops([shadow],lookup,[shadow]),[]);
  }finally{STATE_LIFECYCLE_CONFIG.states.WI=original;}
});
