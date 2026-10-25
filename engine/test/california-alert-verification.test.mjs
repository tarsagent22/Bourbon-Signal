import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {expectedCaliforniaInventoryAlerts,assertCaliforniaInventoryAlertIdentities} from '../src/california-alert-verification.mjs';
const read=async p=>JSON.parse((await readFile(new URL(p,import.meta.url),'utf8')).replace(/^\uFEFF/,''));
const state=await read('./fixtures/california-alert-captured-state.json');
const bible=await read('./fixtures/california-alert-bible.json');
const now=Date.parse('2026-10-25T15:00:35.905Z');
test('captured two-store12 raw rows project10 eligible identities; standards never inflate floor',()=>{
  const previous=Date.now;Date.now=()=>now;
  try {
    const expected=expectedCaliforniaInventoryAlerts(state.signals,bible.records,{nowMs:now});
    assert.equal(state.signals.filter(r=>r.eventType==='retailer_store_inventory_result').length,12);
    assert.equal(expected.length,10);
    assert.ok(!expected.some(r=>/Hard Truth Sweet Mash|Pursuit United Double Oaked/.test(r.bottleName)));
    assert.deepEqual(assertCaliforniaInventoryAlertIdentities(expected,expected),{expectedEligible:10,requiredIdentityCount:10});
    assert.throws(()=>assertCaliforniaInventoryAlertIdentities(expected,expected.slice(1)),/alert identity/);
    const wrongVariant=expected.map((r,i)=>i? r:{...r,variantId:'wrong'});
    assert.throws(()=>assertCaliforniaInventoryAlertIdentities(expected,wrongVariant),/alert identity/);
    const standards=state.signals.filter(r=>['bb_c446121e6e477c0b','bb_293868597de2601b'].includes(r.canonicalBottleId));
    const none=expectedCaliforniaInventoryAlerts(standards,bible.records,{nowMs:now});
    assert.equal(none.length,0);
    assert.deepEqual(assertCaliforniaInventoryAlertIdentities(none,[]),{expectedEligible:0,requiredIdentityCount:0});
    assert.throws(()=>assertCaliforniaInventoryAlertIdentities(expected,expected.map(r=>({...r,eligibleForOnSite:false}))),/alert identity/);
    assert.throws(()=>assertCaliforniaInventoryAlertIdentities(expected,[...expected,{...expected[0],variantId:'invented'}]),/unexpected/);
    assert.throws(()=>assertCaliforniaInventoryAlertIdentities(expected,Array.from({length:12},()=>expected[0])),/must expose/);
    assert.deepEqual(assertCaliforniaInventoryAlertIdentities(expected,[],{allowMissing:true}),{expectedEligible:10,requiredIdentityCount:10});
    assert.throws(()=>assertCaliforniaInventoryAlertIdentities(expected,[{...expected[0],variantId:'invented'}],{allowMissing:true}),/unexpected/);
  } finally {Date.now=previous;}
});
