import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { sameShopifyPremiseAddress, shopifyPremiseAddressSignature } from '../src/collectors/shopify-premises-identity.mjs';

const ctx = { city:'Albany', state:'NY', zip:'12207' };
const address = '12 Main Street Unit 2, Albany NY 12207';

test('supported whitespace, line breaks, country, direction and street abbreviations preserve identity', () => {
  assert.equal(sameShopifyPremiseAddress('12 North Main Street Unit 2, Albany NY 12207',
    '12 N. Main St. Unit #2<br>Albany NY 12207<br>United States',ctx),true);
  assert.equal(sameShopifyPremiseAddress(address,'12 MAIN ST Unit 2 Albany NY 12207-1234 USA',ctx),true);
  assert.equal(sameShopifyPremiseAddress(address,'12 Main Street Unit 2 Albany NY 12207 United States of America',ctx),true);
});

for (const [first, second] of [
  ['12-34 Main Street Unit 2','12 34 Main Street Unit 2'],
  ['12-34 Main Street Unit 2','12/34 Main Street Unit 2'],
  ['12 Main Street Unit 1-2','12 Main Street Unit 1/2'],
  ['12 Main Street Unit A-1','12 Main Street Unit A1'],
  ['12 Main Street Suite 100','12 Main Street APT 100'],
  ['12 Main Street Suite 100','12 Main Street Unit 100'],
  ['12 Main Street Suite 100','12 Main Street #100'],
  ['12 Main Street Suite 100','12 Main Street'],
  ['12 Main Street 100','12 Main Street Suite 100'],
  ['12 1/2 Main Street','12/2 Main Street'],
]) for (const [left, right] of [[first,second],[second,first]]) test(`numeric/unit mutation denies: ${left} versus ${right}`,()=>{
  assert.equal(sameShopifyPremiseAddress(`${left}, Albany NY 12207`,`${right}, Albany NY 12207`,ctx),false);
});

test('exact Queens hyphen and house/explicit-unit fractions survive signatures',()=>{
  const queens={city:'Queens',state:'NY',zip:'11375'};
  const first='138-44 Queens Boulevard, Queens NY 11375';
  assert.equal(sameShopifyPremiseAddress(first,'138-44 Queens Blvd.<br>Queens NY 11375<br>United States',queens),true);
  assert.equal(shopifyPremiseAddressSignature(first,queens).house,'138-44');
  assert.equal(shopifyPremiseAddressSignature('12 1/2 Main Street Unit 1/2 Albany NY 12207',ctx).house,'12 1/2');
  assert.equal(shopifyPremiseAddressSignature('12 1/2 Main Street Unit 1/2 Albany NY 12207',ctx).unit,'1/2');
});

test('same explicit unit abbreviations match; implicit numeric form remains separate authority',()=>{
  assert.equal(sameShopifyPremiseAddress('12 Main Street Ste. 100 Albany NY 12207','12 Main St Suite 100 Albany NY 12207',ctx),true);
  assert.equal(sameShopifyPremiseAddress('12 Main Street Apt. 100 Albany NY 12207','12 Main St Apartment 100 Albany NY 12207',ctx),true);
  const implicit=shopifyPremiseAddressSignature('12 Main Street 100 Albany NY 12207',ctx);
  assert.equal(implicit.unit,'100'); assert.equal(implicit.unitKind,'implicit');
  assert.equal(sameShopifyPremiseAddress('12 Main Street 100 Albany NY 12207','12 Main St<br>100<br>Albany NY 12207',ctx),true);
});

for(const invalid of [null,0,{},[], '', 'NY 12207','Albany NY 12207','Unit 100 Albany NY 12207',
  'PO Box 12 Albany NY 12207','12 PO Box Albany NY 12207','12 Unit 2 Albany NY 12207',
  '12 Main Street Unit 2 Unit 3 Albany NY 12207', '12.34 Main Street Albany NY 12207',
  '12,34 Main Street Albany NY 12207', '12 Main Street Unit ² Albany NY 12207',
  '12 Main Street Unit 1⁄2 Albany NY 12207','12 Main Street Albany NY 12207\u0000',
  '12 Main Street<span hidden>Unit 2</span>Albany NY 12207','12 Main Street &unknown; Albany NY 12207'])
  test(`incomplete/unsupported form cannot be equal to itself: ${JSON.stringify(invalid)}`,()=>{
    assert.equal(shopifyPremiseAddressSignature(invalid,ctx),null);
    assert.equal(sameShopifyPremiseAddress(invalid,invalid,ctx),false);
  });

test('city, state and ZIP come from explicit context and contradictory suffixes never match',()=>{
  for(const context of [{...ctx,city:'Other City'},{...ctx,state:'CA'},{...ctx,zip:'12208'},{...ctx,state:'ZZ'}, {},null,[]])
    assert.equal(sameShopifyPremiseAddress(address,address,context),false);
  for(const changed of ['12 Main Street Unit 2 Albany CA 12207','12 Main Street Unit 2 Albany NY 12208',
    '12 Main Street Unit 2 Other City NY 12207','12 Main Street Unit 2 Albany NY 122070'])
    assert.equal(sameShopifyPremiseAddress(address,changed,ctx),false);
});

test('no alias, duplicate handling or authority is inferred from source metadata',()=>{
  const signature=shopifyPremiseAddressSignature(address,ctx);
  assert.equal(Object.isFrozen(signature),true);
  assert.equal('sourceId' in signature,false); assert.equal('admitted' in signature,false);
  assert.equal(sameShopifyPremiseAddress([address,address],address,ctx),false);
  assert.equal(sameShopifyPremiseAddress(address,address,{...ctx,alias:{from:'Unit 2',to:'Suite 2'}}),true);
  assert.equal(sameShopifyPremiseAddress(address,address.replace('Unit','Suite'),{...ctx,alias:{from:'Unit 2',to:'Suite 2'}}),false);
});

test('numbered route identity works without inventing equivalence to another road',()=>{
  const context={city:'North Myrtle Beach',state:'SC',zip:'29582'};
  assert.equal(sameShopifyPremiseAddress('270 Highway 17 N North Myrtle Beach SC 29582','270 Hwy 17 North, North Myrtle Beach SC 29582',context),true);
  assert.equal(sameShopifyPremiseAddress('270 Hwy 17 N North Myrtle Beach SC 29582','270 Hwy 18 N North Myrtle Beach SC 29582',context),false);
});

test('all five actual hash-verified V2 pickup address paragraphs pass without a global unit alias',async()=>{
  const configs=JSON.parse(await readFile(new URL('../data/shopify-pickup-onboarding-cohort-v2.json',import.meta.url),'utf8')).sources;
  const root=new URL('./fixtures/shopify-variant-pickup/',import.meta.url), captures=new Map();
  for(const directory of[root,new URL('v2/',root)]){
    const manifest=JSON.parse(await readFile(new URL('manifest.json',directory),'utf8'));
    for(const capture of manifest.captures){
      const raw=await readFile(new URL(capture.file,directory));
      assert.equal(createHash('sha256').update(raw).digest('hex'),capture.sha256);
      captures.set(capture.requestedUrl,raw.toString());
    }
  }
  for(const source of configs){
    const store=source.stores[0], html=captures.get(source.products[0].evidence.pickup.url);
    const addresses=[...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/giu)].map(match=>match[1]).filter(value=>/\b[A-Z]{2}\s+\d{5}\b/iu.test(value));
    assert.equal(addresses.length,1,source.id);
    assert.equal(sameShopifyPremiseAddress(addresses[0],store.address,{city:store.city,state:source.state,zip:store.zip}),true,source.id);
    if(source.id==='main-street-el-cajon'){
      const signature=shopifyPremiseAddressSignature(addresses[0],{city:store.city,state:source.state,zip:store.zip});
      assert.equal(signature.unitKind,'implicit'); assert.equal(signature.unit,'100');
    }
  }
});
