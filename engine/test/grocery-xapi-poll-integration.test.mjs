import test, {mock, after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compileGroceryXapiDescriptors,createGroceryXapiPolicy,groceryXapiHash} from '../src/sources/grocery-xapi-policy.mjs';
import {buildGroceryXapiPollProjection as build} from '../src/sources/grocery-xapi-poll-projection.mjs';
import {collectGroceryXapiPoll} from '../src/collectors/grocery-xapi-poll-runtime.mjs';
import {BourbonBible} from '../src/core/bible.mjs';
const fixtures=JSON.parse(readFileSync(new URL('./fixtures/grocery-xapi/2026-10-25-five-prospects-six-premises-derived.json',import.meta.url))).sources.filter(s=>s.state!=='AZ');
fixtures.push(JSON.parse(readFileSync(new URL('./fixtures/grocery-xapi/2026-10-25-safeway1749-derived.json',import.meta.url))).source);
const integrationNow=Date.parse('2026-10-25T10:00:00.000Z'),runtimeVersion='grocery-xapi-1',runtimeSha256='a'.repeat(64);
// Saved fixture capture clocks remain untouched; these runtime clocks simulate fresh observations for deterministic integration checks, not new provider proof.
mock.method(Date,'now',()=>integrationNow);
after(()=>mock.restoreAll());
function setup(f) {
 const bindings=f.products.map(({product,expected})=>({productId:expected.productId,variantId:expected.variantId || expected.productId,canonicalBottleId:expected.canonicalId,canonicalName:expected.canonicalName || expected.canonical,rawName:product.name,volumeMl:750,packageCount:1}));
 // Canonical spelling is fixture evidence; current policy is supplied separately.
 for(let i=0;i<bindings.length;i++) bindings[i].canonicalName ||= f.products[i].expected.bottleName || 'Current canonical';
 const d={id:f.sourceId,state:f.state,banner:f.host.split('.')[1],host:f.host,merchantId:f.merchantId,premise:f.premise,expiryHours:1,bindings};
 const admission={sourceId:d.id,configSha256:groceryXapiHash(d),bindingsSha256:groceryXapiHash(bindings),runtimeVersion,runtimeSha256,reviewedAt:'2026-10-25T09:30:00.000Z',expiresAt:'2026-10-26T09:30:00.000Z'};
 const descriptors=compileGroceryXapiDescriptors({definitions:[d],admissions:[admission],runtimeVersion,runtimeSha256});
 const lookup={byState:{[d.state]:{byId:new Map(bindings.map(b=>[b.canonicalBottleId,{id:b.canonicalBottleId,canonical:b.canonicalName,tier:'allocated'}]))}}};
 lookup.byId=lookup.byState[d.state].byId;
 const policy=createGroceryXapiPolicy({descriptors,lookup,policySnapshotId:'current',enabledSourceIds:[d.id],now:integrationNow});
 const rows=bindings.map((b,i)=>({sourceRuntimeId:d.id,sourceChain:descriptors[0].chain,state:d.state,stateCode:d.state,merchantId:d.merchantId,...{storeId:d.premise.storeId,storeName:d.premise.name,storeAddress:d.premise.address,city:d.premise.city,zip:d.premise.zip},productId:b.productId,variantId:b.variantId,canonicalBottleId:b.canonicalBottleId,canonicalName:b.canonicalName,rawName:b.rawName,tier:'allocated',sourceUrl:`https://${d.host}/shop/product-details.${b.productId}.html`,sourceProductBinding:groceryXapiHash(b),sourceConfigSha256:descriptors[0].configSha256,sourceAdmissionSha256:descriptors[0].admissionSha256,sourceRuntimeSha256:runtimeSha256,sourceCollectorVersion:runtimeVersion,sourcePolicySnapshotId:'current',observedAt:new Date(integrationNow-600000).toISOString(),eventType:'retailer_store_inventory_result',locationPrecision:'store_level',sourceAvailabilityVerified:true,availabilityStatus:'in_stock',quantity:f.products[i].expected.quantity,quantityIsExact:true,inventorySemantics:'exact_retailer_quantity',completeSnapshot:false,absenceIsOutOfStock:false,raw:{volumeMl:750,packageCount:1,fulfillmentPolicyVerified:true,reportedQuantity:f.products[i].expected.quantity}}));
 return {policy,rows,descriptors,lookup};
}
function assemble(f,prior,status='in_stock',offset=0,quantityDelta=0) {
 const {policy,rows,descriptors,lookup}=setup(f);
 const observations=rows.map(row=>({...row,confidence:.9,canAlertAsInventory:status==='in_stock',canAlertAsWatch:false,
   observedAt:new Date(Date.parse(row.observedAt)+offset).toISOString(),availabilityStatus:status,
   quantity:status==='in_stock'?row.quantity+quantityDelta:0,sourceAvailabilityVerified:status==='in_stock'||status==='out_of_stock',
   raw:{...row.raw,reportedQuantity:status==='in_stock'?row.quantity+quantityDelta:0}}));
 const source=descriptors[0];
 const market=lookup.byState[source.state];
 return {source,ctx:{snapshotId:'current',lookup:{...market,byState:lookup.byState},drops:[]},lease:{generation:2,projection:prior},result:{signals:status==='in_stock'?observations:[],observations,metadata:{scope:'one_store_bourbon_search_first_page',completeSnapshot:false,absenceIsOutOfStock:false}},owner:'test',groceryPolicy:policy,now:integrationNow};
}
test('all five saved premises produce real drops and a silent bootstrap',()=>{for(const f of fixtures){const input=assemble(f);const output=build(input);assert.equal(output.drops.length,f.products.length);assert.deepEqual(output.candidates,[]);assert(output.drops.every(row=>row.availabilityEpisodeId));}});
test('unchanged positives preserve episode clocks; changed quantities do not fake restock',()=>{const f=fixtures[0];const first=build(assemble(f));const unchanged=build(assemble(f,first.projection,'in_stock',1000));const changed=build(assemble(f,unchanged.projection,'in_stock',2000,1));for(let i=0;i<first.drops.length;i++){assert.equal(unchanged.drops[i].availabilityEpisodeId,first.drops[i].availabilityEpisodeId);assert.equal(unchanged.drops[i].firstSeenAt,first.drops[i].firstSeenAt);assert.equal(changed.drops[i].availabilityEpisodeId,first.drops[i].availabilityEpisodeId);assert.notEqual(unchanged.drops[i].lastConfirmedAt,first.drops[i].lastConfirmedAt);}assert.deepEqual(changed.candidates,[]);});
test('explicit bound negative then positive opens a new episode',()=>{const f=fixtures[0];const first=build(assemble(f));const negative=build(assemble(f,first.projection,'out_of_stock',1000));assert.equal(negative.drops.length,0);const restock=build(assemble(f,negative.projection,'in_stock',2000));assert(restock.drops.every((row,i)=>row.availabilityEpisodeId!==first.drops[i].availabilityEpisodeId));});
test('unknown or omitted pages remove stock but never manufacture restock',()=>{for(const status of ['unknown','omitted_first_page']){const f=fixtures[0];const first=build(assemble(f));const empty=build(assemble(f,first.projection,status,1000));assert.deepEqual(empty.drops,[]);assert.deepEqual(empty.candidates,[]);const again=build(assemble(f,empty.projection,'in_stock',2000));assert(again.drops.every((row,i)=>row.availabilityEpisodeId===first.drops[i].availabilityEpisodeId));assert.deepEqual(again.candidates,[]);}});
test('current state canonical withdrawal rejects even formerly positive observations',()=>{const input=assemble(fixtures[0]);const {descriptors}=setup(fixtures[0]);input.groceryPolicy=createGroceryXapiPolicy({descriptors,lookup:{byState:{}},enabledSourceIds:[input.source.id],policySnapshotId:'current',now:integrationNow});assert.throws(()=>build(input),/unreviewed/);});
test('runtime disabled or withdrawn policy fails before transport',async()=>{const f=fixtures[0];const {policy,descriptors,lookup}=setup(f);let calls=0;const options={groceryPolicy:policy,marketLookup:lookup.byState[f.state],policySnapshotId:'current',clock:()=>integrationNow,fetchText:async()=>{calls++;throw new Error('unexpected fetch');}};await assert.rejects(collectGroceryXapiPoll(new BourbonBible([]),{...descriptors[0],disabled:true},options));await assert.rejects(collectGroceryXapiPoll(new BourbonBible([]),descriptors[0],{...options,groceryPolicy:{evaluateObservation:()=>({eligible:false})}}));assert.equal(calls,0);});
test('runtime wrapper serves saved five premises through the same bounded request and current market tiers',async()=>{
 const records=JSON.parse(readFileSync(new URL('./fixtures/shopify-variant-pickup/current-bourbon-bible.json',import.meta.url))).records;
 const bible=new BourbonBible(records);
 for(const f of fixtures){const {policy,descriptors,lookup}=setup(f);let calls=0;
 const result=await collectGroceryXapiPoll(bible,descriptors[0],{groceryPolicy:policy,marketLookup:lookup.byState[f.state],policySnapshotId:'current',clock:()=>integrationNow,
 fetchText:async(url,options)=>{calls++;assert.equal(new URL(url).searchParams.get('storeid'),f.merchantId);assert.equal(options.maxBytes,2097152);assert.equal(options.retries,0);return {ok:true,status:200,text:JSON.stringify({response:{docs:f.products.map(row=>row.product)}})};}});
 assert.equal(calls,1);assert.equal(result.signals.length,f.products.length);assert(result.signals.every(row=>row.tier==='allocated'));assert.equal(result.metadata.completeSnapshot,false);
 }
});
test('transport failure yields no projection and preserves the last committed episode seed',async()=>{
 const f=fixtures[0],{policy,descriptors,lookup}=setup(f);const first=build(assemble(f));const before=JSON.stringify(first.projection);
 await assert.rejects(collectGroceryXapiPoll(new BourbonBible([]),descriptors[0],{groceryPolicy:policy,marketLookup:lookup.byState[f.state],policySnapshotId:'current',clock:()=>integrationNow,fetchText:async()=>{throw new Error('transport failure');}}));
 assert.equal(JSON.stringify(first.projection),before);
 const resumed=build(assemble(f,first.projection,'in_stock',1000));assert(resumed.drops.every((row,i)=>row.availabilityEpisodeId===first.drops[i].availabilityEpisodeId));assert.deepEqual(resumed.candidates,[]);
});
