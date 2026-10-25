import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compileGroceryXapiDescriptors,createGroceryXapiPolicy,groceryXapiHash} from '../src/sources/grocery-xapi-policy.mjs';
import { validateGroceryXapiRows, failClosedPollRows } from '../src/sources/poll-policy.mjs';
const fixtureUrl = name => new URL('./fixtures/grocery-xapi/'+name, import.meta.url);
const fixtures=JSON.parse(readFileSync(fixtureUrl('2026-10-25-five-prospects-six-premises-derived.json'))).sources.filter(s=>s.state!=='AZ');
fixtures.push(JSON.parse(readFileSync(fixtureUrl('2026-10-25-safeway1749-derived.json'))).source);
const now=Date.parse('2026-10-25T10:00:00.000Z'),runtimeVersion='grocery-xapi-1',runtimeSha256='a'.repeat(64);
// Authority/clock simulation using real saved product identities. Fixture source
// clocks are unchanged; synthetic observations are not new provider evidence.
function setup(f) {
 const bindings=f.products.map(({product,expected})=>({productId:expected.productId,variantId:expected.variantId || expected.productId,canonicalBottleId:expected.canonicalId,canonicalName:expected.canonicalName || expected.canonical,rawName:product.name,volumeMl:750,packageCount:1}));
 // Canonical spelling is fixture evidence; current policy is supplied separately.
 for(let i=0;i<bindings.length;i++) bindings[i].canonicalName ||= f.products[i].expected.bottleName || 'Current canonical';
 const d={id:f.sourceId,state:f.state,banner:f.host.split('.')[1],host:f.host,merchantId:f.merchantId,premise:f.premise,expiryHours:1,bindings};
 const admission={sourceId:d.id,configSha256:groceryXapiHash(d),bindingsSha256:groceryXapiHash(bindings),runtimeVersion,runtimeSha256,reviewedAt:'2026-10-25T09:30:00.000Z',expiresAt:'2026-10-26T09:30:00.000Z'};
 const descriptors=compileGroceryXapiDescriptors({definitions:[d],admissions:[admission],runtimeVersion,runtimeSha256});
 const lookup={byState:{[d.state]:{byId:new Map(bindings.map(b=>[b.canonicalBottleId,{id:b.canonicalBottleId,canonical:b.canonicalName,tier:'allocated'}]))}}};
 lookup.byId=lookup.byState[d.state].byId;
 const policy=createGroceryXapiPolicy({descriptors,lookup,policySnapshotId:'current',enabledSourceIds:[d.id],now});
 const rows=bindings.map((b,i)=>({sourceRuntimeId:d.id,sourceChain:descriptors[0].chain,state:d.state,stateCode:d.state,merchantId:d.merchantId,...{storeId:d.premise.storeId,storeName:d.premise.name,storeAddress:d.premise.address,city:d.premise.city,zip:d.premise.zip},productId:b.productId,variantId:b.variantId,canonicalBottleId:b.canonicalBottleId,canonicalName:b.canonicalName,rawName:b.rawName,tier:'allocated',sourceUrl:`https://${d.host}/shop/product-details.${b.productId}.html`,sourceProductBinding:groceryXapiHash(b),sourceConfigSha256:descriptors[0].configSha256,sourceAdmissionSha256:descriptors[0].admissionSha256,sourceRuntimeSha256:runtimeSha256,sourceCollectorVersion:runtimeVersion,sourcePolicySnapshotId:'current',observedAt:new Date(now-600000).toISOString(),eventType:'retailer_store_inventory_result',locationPrecision:'store_level',sourceAvailabilityVerified:true,availabilityStatus:'in_stock',quantity:f.products[i].expected.quantity,quantityIsExact:true,inventorySemantics:'exact_retailer_quantity',completeSnapshot:false,absenceIsOutOfStock:false,raw:{volumeMl:750,packageCount:1,fulfillmentPolicyVerified:true,reportedQuantity:f.products[i].expected.quantity}}));
 return {policy,rows,descriptors,lookup};
}
test('global canonical identity and market-specific eligibility have distinct authority', () => {
  const {policy,rows,lookup}=setup(fixtures[0]);
  lookup.byId=new Map([...lookup.byId].map(([id,record])=>[id,{...record,tier:'core'}]));
  assert.equal(policy.eligible(rows[0]),true,'a globally regular bottle may be allocated in this state');
  lookup.byState.NV.byId.set(rows[0].canonicalBottleId,{...lookup.byState.NV.byId.get(rows[0].canonicalBottleId),tier:'core'});
  assert.equal(policy.eligible(rows[0]),false,'state demotion immediately vetoes the old allocation');
});
test('cached rows cannot revive after registry loss, policy loss, expiry or storage failure', () => {
  const originalNow=Date.now; Date.now=()=>now;
  try {
    const {rows,descriptors,lookup}=setup(fixtures[0]);
    const row={...rows[0],canAlertAsInventory:true,canAlertAsWatch:false};
    assert.equal(validateGroceryXapiRows([row],descriptors,lookup,null,'','current','candidates').length,1);
    assert.equal(validateGroceryXapiRows([row],[],lookup,null,'','current','candidates').length,0);
    assert.equal(validateGroceryXapiRows([row],[],lookup,null,'','current','drops')[0].stale,true);
    assert.equal(failClosedPollRows([row],[],'candidates').length,0);
    const stripped={...row};delete stripped.sourceRuntimeId;delete stripped.sourceCollectorVersion;delete stripped.raw.collectorVersion;
    assert.equal(validateGroceryXapiRows([stripped],[],lookup,null,'','current','candidates').length,0);
    assert.equal(validateGroceryXapiRows([{...row,observedAt:new Date(now-3600001).toISOString()}],descriptors,lookup,null,'','current','candidates').length,0);
    lookup.byState.NV.byId.set(row.canonicalBottleId,{...lookup.byState.NV.byId.get(row.canonicalBottleId),tier:'core'});
    assert.equal(validateGroceryXapiRows([row],descriptors,lookup,null,'','current','candidates').length,0);
  } finally { Date.now=originalNow; }
});
test('sentinel counts never become exact and longer expiry needs a separate reviewed policy', () => {
  const {policy,rows,descriptors}=setup(fixtures[0]);
  assert.equal(policy.eligible({...rows[0],quantity:100,raw:{...rows[0].raw,reportedQuantity:100}}),false);
  const definition=structuredClone(descriptors[0].definition);definition.expiryHours=2;
  assert.throws(()=>compileGroceryXapiDescriptors({definitions:[definition],admissions:[descriptors[0].admission],runtimeVersion,runtimeSha256}),/Invalid XAPI definition/);
});
test('all thirteen saved product bindings can pass explicit current-state authority without activation',()=>{let count=0;for(const f of fixtures){const {policy,rows}=setup(f);for(const row of rows){assert.equal(policy.evaluate(row).eligible,true,JSON.stringify(policy.evaluate(row)));count++;}}assert.equal(count,13);});
test('empty production admission owns managed markers but leaves legacy NV alone',()=>{const p=createGroceryXapiPolicy();assert.equal(p.evaluate({sourceRuntimeId:'xapi:nv:albertsons:4024'}).eligible,false);assert.equal(p.owns({sourceCollectorVersion:'grocery-xapi-1'}),true);assert.equal(p.owns({sourceChain:'albertsons-662'}),false);});
test('identity, authority, current market, clocks, quantity and first-page boundaries fail closed',()=>{const {policy,rows}=setup(fixtures[0]);const row=rows[0];for(const patch of [{sourceConfigSha256:'b'.repeat(64)},{sourceAdmissionSha256:'b'.repeat(64)},{sourceRuntimeSha256:'b'.repeat(64)},{sourcePolicySnapshotId:'old'},{storeAddress:'other'},{canonicalBottleId:'wrong'},{sourceUrl:'https://wrong.test'},{sourceProductBinding:'bad'},{quantity:1.5},{quantity:'2'},{completeSnapshot:true},{absenceIsOutOfStock:true},{observedAt:'2026-10-26T00:00:00Z'},{observedAt:'2026-10-20T00:00:00Z'},{raw:{...row.raw,volumeMl:1750}},{raw:{...row.raw,reportedQuantity:999}}]) assert.equal(policy.eligible({...row,...patch}),false,JSON.stringify(patch));});
test('state-specific lookup required and descriptor mutation rejected',()=>{const {descriptors}=setup(fixtures[0]);assert.throws(()=>createGroceryXapiPolicy({descriptors:[{...descriptors[0],definition:{...descriptors[0].definition,host:'wrong.test'}}]}));assert.equal(createGroceryXapiPolicy({descriptors,enabledSourceIds:[descriptors[0].id],policySnapshotId:'current',now}).eligible(setup(fixtures[0]).rows[0]),false);});
test('unknown search omission is never positive inventory; explicit negatives require zero proof',()=>{const {policy,rows,descriptors,lookup}=setup(fixtures[0]);const row=rows[0];const unknown={...row,availabilityStatus:'omitted_first_page',quantity:0,canAlertAsInventory:false,sourceAvailabilityVerified:false};assert.equal(policy.evaluateObservation(unknown).eligible,true);assert.equal(policy.eligible(unknown),false);const negative={...row,availabilityStatus:'out_of_stock',quantity:0,canAlertAsInventory:false,raw:{...row.raw,reportedQuantity:0}};assert.equal(policy.evaluateObservation(negative).eligible,true);assert.equal(policy.eligible(negative),false);assert.equal(policy.evaluateObservation({...negative,raw:{...negative.raw,reportedQuantity:1}}).eligible,false);assert.equal(createGroceryXapiPolicy({descriptors:[{...descriptors[0],disabled:true}],lookup,policySnapshotId:'current',enabledSourceIds:[descriptors[0].id],now}).eligible(row),false);});

test('owned partition cannot escape policy by stripping managed markers',()=>{const {policy,rows}=setup(fixtures[0]);const row={...rows[0]};delete row.sourceRuntimeId;delete row.sourceCollectorVersion;assert.equal(policy.owns(row),true);assert.equal(policy.eligible(row),false);});
test('current global canonical deletion vetoes stale state lookup and provenance aliases conflict',()=>{const {descriptors,lookup,rows}=setup(fixtures[0]);const opts={descriptors,lookup:{...lookup,byId:new Map()},policySnapshotId:'current',enabledSourceIds:[descriptors[0].id],now};assert.equal(createGroceryXapiPolicy(opts).eligible(rows[0]),false);const {policy}=setup(fixtures[0]);for(const patch of [{configSha256:'b'.repeat(64)},{sourceObservedAt:'2026-10-26T00:00:00Z'},{raw:{...rows[0].raw,observedAt:'2026-10-20T00:00:00Z'}}])assert.equal(policy.eligible({...rows[0],...patch}),false);});
