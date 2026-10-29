import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { BourbonBible } from '../src/core/bible.mjs';
import { nevadaXapiPremiseMatches, parseBoundNevadaXapiInventory, resolveNevadaXapiPremises } from '../src/collectors/nevada-xapi-runtime.mjs';
import { NEVADA_RETAILER_SOURCES } from '../src/collectors/nevada-retailer-surfaces.mjs';

const fixture = JSON.parse(await readFile(new URL('./fixtures/nevada-expansion-20261028/xapi.json', import.meta.url)));
const bible = new BourbonBible(fixture.records);
const parse = products => parseBoundNevadaXapiInventory({response:{docs:products}},fixture.source,bible);

test('captured Nevada identities admit available exact expressions and reject the conflicting Blantons proof', () => {
  const rows = parse(fixture.products);
  assert.deepEqual(rows.map(row=>row.record.canonical).sort(), ['Buffalo Trace Bourbon','Penelope Four Grain Bourbon','WhistlePig PiggyBack 6 Year Bourbon'].sort());
  assert.equal(rows.find(row=>row.record.canonical === 'Buffalo Trace Bourbon').quantity,8);
  assert.equal(rows.some(row=>/Blanton/i.test(row.title)),false);
});

test('Nevada XAPI inventory rejects cross-store, unavailable, shipping-only, zero and malformed quantities', () => {
  const product=fixture.products.find(p=>p.name.startsWith('Buffalo Trace Bourbon 90 Proof'));
  for (const mutation of [
    {storeId:'662'}, {channelInventory:{instore:'0',shipping:'1'}},
    {channelEligibility:{inStore:false,shipping:true}},
    {channelInventory:{instore:'1',instoreItemQty:0}},
    {channelInventory:{instore:'1',instoreItemQty:''}},
    {channelInventory:{instore:'1',instoreItemQty:'unknown'}},
    {name:product.name.replace('90 Proof','100 Proof')},
    {dispItemPackageQty:'2'}, {upc:'wrong'}, {containsAlcohol:false},
    {name:product.name.replace('750 Ml','375 Ml'),dispItemSizeQty:'375'},
  ]) assert.deepEqual(parse([{...product,...mutation}]),[],JSON.stringify(mutation));
  assert.equal(parse([{...product,channelInventory:{instore:'1'}}])[0].quantity,0);
  assert.equal(parse([{...product,channelInventory:{instore:'1',instoreItemQty:100}}])[0].inventorySemantics,'binary_retailer_orderable_no_exact_count');
});

test('33 added premises require current exact first-party address, banner, state, and merchant', async () => {
  const baseline=new Set(['albertsons:662','vons:2511','safeway:1210']);
  assert.equal(NEVADA_RETAILER_SOURCES.filter(s=>s.platform==='albertsons-xapi'&&!baseline.has(s.store.id)).length,33);
  assert.ok(nevadaXapiPremiseMatches(fixture.source,fixture.store));
  for (const mutation of [{locationId:'662'},{domainName:'Safeway'},{polarisBannerName:'safeway'},
    {address:{...fixture.store.address,state:'CA'}},{address:{...fixture.store.address,line1:'999 Different Road'}}]) {
    assert.equal(nevadaXapiPremiseMatches(fixture.source,{...fixture.store,...mutation}),false);
  }
  const request=async()=>({ok:true,status:206,text:JSON.stringify({instore:{stores:[fixture.store]}})});
  assert.equal((await resolveNevadaXapiPremises([fixture.source],{request})).size,1);
  let calls=0;
  const conflict=async()=>({ok:true,text:JSON.stringify({instore:{stores:[calls++?{...fixture.store,address:{...fixture.store.address,line1:'Other'}}:fixture.store]}})});
  assert.equal((await resolveNevadaXapiPremises([fixture.source],{request:conflict})).size,0);
});
