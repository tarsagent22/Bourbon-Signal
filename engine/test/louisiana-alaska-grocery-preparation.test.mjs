import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BourbonBible} from '../src/core/bible.mjs';
import {LOUISIANA_ALASKA_GROCERY_SOURCES as sources} from '../src/collectors/louisiana-alaska-grocery-premises.mjs';
import {louisianaAlaskaGroceryPremiseMatches,parseLouisianaAlaskaGroceryResearch} from '../src/collectors/louisiana-alaska-grocery-research.mjs';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/louisiana-alaska-grocery/identity.json',import.meta.url)));
const bible=new BourbonBible(fixture.records);
const replay=(entry,products=entry.products,recordBible=bible)=>parseLouisianaAlaskaGroceryResearch({response:{docs:products}},sources.find(source=>source.id===entry.source.id),recordBible,{resolverStore:entry.resolverStore,observedAt:entry.observedAt});

test('34 exact first-party premises preserve separate research records with bounded geography and literal resolver identities',()=>{
  assert.equal(sources.length,34);assert.equal(sources.filter(s=>s.stateCode==='LA').length,15);assert.equal(sources.filter(s=>s.stateCode==='AK').length,19);
  assert.equal(new Set(sources.map(s=>s.storeId)).size,34);assert.ok(Object.isFrozen(sources));
  for(const source of sources){assert.ok(Object.isFrozen(source));assert.match(source.merchantId,/^\d+$/);assert.equal(source.storeId,source.banner+':'+source.merchantId);
    assert.ok(Number.isFinite(source.lat)&&Number.isFinite(source.lng));assert.equal(source.releaseStage,'research_only_requires_separate_promotion');
    assert.equal(source.stateCode==='LA'?source.host==='www.albertsons.com':source.host===`www.${source.banner}.com`,true);
    assert.match(source.premiseUrl,/^https:\/\/local\.(?:albertsons|safeway|carrsqc)\.com\//);
    assert.ok(source.stateCode==='LA'?source.lat>28&&source.lat<34&&source.lng> -95&&source.lng< -88:source.lat>51&&source.lat<72&&source.lng> -170&&source.lng< -129);}
  assert.ok(!sources.some(source=>source.merchantId==='1839'),'404 local-page premise is excluded');
  const lifecycle=JSON.parse(readFileSync(new URL('../../src/config/state-lifecycle.json',import.meta.url)));
  for(const state of ['LA','AK']){assert.equal(lifecycle.states[state].inventoryAlertable,false);assert.equal(lifecycle.states[state].watchAlertable,false);assert.equal(lifecycle.states[state].publicStatus,lifecycle.activeStates.includes(state)?'active':'research_only');}
});

test('captured LA and AK rows reparse exact allocated expressions as binary source research, never stock counts or delivery',()=>{
  const expected=[['E.H. Taylor Jr. Barrel Proof Bourbon','Weller Full Proof','Eagle Rare 10 Year','E.H. Taylor Small Batch',"Booker's Bourbon"],['Eagle Rare 10 Year','E.H. Taylor Small Batch']];
  fixture.cases.forEach((entry,index)=>{const rows=replay(entry);assert.deepEqual(rows.map(row=>row.record.canonical).sort(),expected[index].sort());
    for(const row of rows){assert.equal(row.quantity,0);assert.equal(row.inventorySemantics,'binary_retailer_orderable_no_exact_count');assert.equal(row.researchOnly,true);assert.equal(row.customerVisible,false);
      for(const flag of ['productionActivated','canAlertAsInventory','canAlertAsWatch','eligibleForDelivery','eligibleForEmail','eligibleForSms'])assert.equal(row[flag],false);}});
});

test('premise replay rejects forged IDs, banners, domains, address, state and foreign source references',()=>{
  const entry=fixture.cases[0],source=sources.find(s=>s.id===entry.source.id);assert.equal(louisianaAlaskaGroceryPremiseMatches(source,entry.resolverStore),true);
  for(const mutate of [s=>s.locationId='other',s=>s.polarisBannerName='safeway',s=>s.domainName='Other',s=>s.address.line1='Neighbor premise',s=>s.address.state='AK',s=>s.address.country='CA']){
    const resolver=structuredClone(entry.resolverStore);mutate(resolver);assert.deepEqual(parseLouisianaAlaskaGroceryResearch({response:{docs:entry.products}},source,bible,{resolverStore:resolver,observedAt:entry.observedAt}),[]);}
  assert.deepEqual(parseLouisianaAlaskaGroceryResearch({response:{docs:entry.products}},{...source},bible,{resolverStore:entry.resolverStore,observedAt:entry.observedAt}),[]);
});

test('captured stock cannot survive channel, store, alcohol, proof, size or packaging contradictions',()=>{
  const entry=fixture.cases[0],original=entry.products[0];assert.equal(replay(entry,[original]).length,1);
  for(const mutate of [p=>p.storeId='neighbor',p=>p.pid='invalid',p=>p.upc='bad',p=>p.containsAlcohol=false,p=>p.alcoholVolumePct=12,
    p=>p.dispItemPackageQty=4,p=>p.dispItemSizeQty=5000,p=>p.channelEligibility.inStore=false,p=>p.channelInventory.instore='0',p=>p.channelInventory.instoreItemQty=0]){
    const product=structuredClone(original);mutate(product);assert.deepEqual(replay(entry,[product]),[]);}
});

test('current library suppression and state demotion apply; generic source alias cannot establish Wild Turkey Master',()=>{
  const entry=fixture.cases[0],records=structuredClone(fixture.records),record=records.find(r=>r.canonical==='Weller Full Proof');
  record.libraryAlertEligible=false;assert.ok(!replay(entry,entry.products,new BourbonBible(records)).some(row=>row.record.canonical==='Weller Full Proof'));
  record.libraryAlertEligible=true;for(const identity of record.libraryIdentities||[])identity.stateOverrides=[{jurisdiction:'LA',tier:'regular'}];
  assert.ok(!replay(entry,entry.products,new BourbonBible(records)).some(row=>row.record.canonical==='Weller Full Proof'));
  const excluded=fixture.excludedCase;assert.deepEqual(parseLouisianaAlaskaGroceryResearch({response:{docs:[excluded.product]}},sources.find(s=>s.id===excluded.source.id),bible,{resolverStore:excluded.resolverStore,observedAt:entry.observedAt}),[]);
});
