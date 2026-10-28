import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { BourbonBible } from '../src/core/bible.mjs';
import { PHOENIX_METRO_RETAILERS, parseLiquorWheelProduct, parseMetroWooProduct, wooPremiseMap, metroBottleMatch, isMetroRetailerProof, collectMetroWooCommerce, collectLiquorWheelPhoenix } from '../src/collectors/arizona-metro-retailers.mjs';
import { metroLibraryTier } from '../src/collectors/arizona-metro-retailer-proof.mjs';
import { isArizonaRetailerInventory } from '../src/arizona-retailer-policy.mjs';
import { canonicalizeSignal } from '../src/operational-report.mjs';
import { bibleLookup, buildDrops } from '../src/export-site-contract.mjs';
import { isPublicDropFeedEligible } from '../../src/lib/public-drop-evidence.ts';
const fixture=JSON.parse(await readFile(new URL('./fixtures/arizona-metro/2026-10-27.json',import.meta.url)));
const bible=new BourbonBible(fixture.records);
const now=fixture.observedAt;
// Replay source observations at their captured clock, independent of the run date.
beforeEach(t=>t.mock.timers.enable({apis:['Date'],now:Date.parse(now)}));
const clone=value=>structuredClone(value);
const html=w=>`<script type="application/ld+json">${JSON.stringify(w.premise)}</script><script type="application/ld+json">${JSON.stringify(w.product)}</script><script>const product = ${JSON.stringify(w.publishedProduct)};</script>${w.pickupAvailable?'<span class="pickup-only-label widget-label">In-Store Pickup Available</span>':''}`;
const wheel=name=>fixture.wheel.find(w=>w.product.name===name);
const mesa=PHOENIX_METRO_RETAILERS[0];
const larceny=fixture.woo.mesa.products.find(p=>p.name==='Larceny Bbn Brl Proof 750ml');
const wooOptions={observedAt:now,premiseMapQuery:wooPremiseMap(fixture.woo.mesa.contactMapHtml,mesa),productQueryUrl:mesa.baseUrl+'/wp-json/wc/store/v1/products?category=237&per_page=100&page=1'};

test('captured Phoenix pickup rows and abbreviated Mesa releases survive the actual public pipeline',()=>{
  const signals=[...fixture.wheel.map(w=>parseLiquorWheelProduct(html(w),w.url,bible,{observedAt:now})),...fixture.woo.mesa.products.map(p=>parseMetroWooProduct(p,mesa,bible,wooOptions))].filter(Boolean);
  assert(signals.some(s=>s.canonicalName==='Larceny Barrel Proof'));
  assert(signals.some(s=>s.canonicalName==='E.H. Taylor Jr. Straight Rye Whiskey'));
  assert.equal(signals.filter(s=>s.sourceChain==='liquor-wheel-2-phoenix').length,3);
  for(const s of signals){assert(isArizonaRetailerInventory(s));assert.equal(s.quantity,0);assert.equal(s.quantityIsExact,false);}
  const op=signals.map(s=>canonicalizeSignal(s,bible));
  const drops=JSON.parse(JSON.stringify(buildDrops(op,bibleLookup(bible.records),op))).filter(isPublicDropFeedEligible);
  assert(drops.some(d=>d.rawName==='Larceny Bbn Brl Proof 750ml'&&d.tier==='limited'),'the actual library limited tier must win over the old PA standard seed for a proven exact identity');
  assert(drops.some(d=>d.rawName==="Blanton's Bourbon"));
  assert(drops.filter(d=>d.sourceChain==='liquor-wheel-2-phoenix').every(d=>d.lat===33.4712824&&d.lng===-112.0474803),'published first-party coordinates must survive nearby-feed export');
  for(const d of drops){assert(isMetroRetailerProof(d));assert.equal(d.quantity,0);assert.equal(d.quantityIsExact,false);}
  assert(drops.filter(d=>d.sourceChain==='mesa-liquor').every(d=>d.storeAddress==='1930 E Broadway Rd, Mesa, AZ 85204'));
});

test('current contact maps bind the actual Mesa and Tempe premises, not stale template addresses',()=>{
  assert(wooPremiseMap(fixture.woo.mesa.contactMapHtml,mesa));
  assert(wooPremiseMap(fixture.woo.best.contactMapHtml,PHOENIX_METRO_RETAILERS[1]));
  assert.equal(wooPremiseMap(fixture.woo.mesa.contactMapHtml.replaceAll('1930','7143'),mesa),null);
  assert.equal(wooPremiseMap(fixture.woo.mesa.contactMapHtml.replaceAll('1930','11930'),mesa),null);
  assert.equal(parseMetroWooProduct(larceny,mesa,bible,{...wooOptions,premiseMapQuery:'7143 E Southern Ave, Mesa, AZ 85209'}),null);
  assert.equal(parseMetroWooProduct(larceny,mesa,bible,{...wooOptions,premiseMapQuery:'1930 E Broadway Rd, Mesa, NV 85204'}),null);
});

test('WooCommerce stock, price, product URL, format and proof mutations fail closed',()=>{
  assert(parseMetroWooProduct(larceny,mesa,bible,wooOptions));
  for(const patch of[{is_in_stock:false},{is_purchasable:false},{is_on_backorder:true},{id:0},{permalink:'https://attacker.example/product/larceny/'},{prices:{...larceny.prices,currency_code:'CAD'}},{prices:{...larceny.prices,price:'0'}},{name:'Larceny Bbn Brl Proof 50ml'},{name:'Larceny Bbn Brl Proof 750ml Case'}])assert.equal(parseMetroWooProduct({...larceny,...patch},mesa,bible,wooOptions),null,JSON.stringify(patch));
  const s=parseMetroWooProduct(larceny,mesa,bible,wooOptions);
  for(const mutate of[s=>s.price++,s=>s.storeAddress='7143 E Southern Ave, Mesa, AZ 85209',s=>s.quantity=1,s=>s.quantityIsExact=true,s=>s.sourceProductBinding.product.is_in_stock=false,s=>s.sourceProductBinding.productQueryUrl='https://attacker.example/products',s=>s.sourceProductBinding.product.prices.price='1']){const altered=clone(s);mutate(altered);assert.equal(isMetroRetailerProof(altered),false);}
});

test('complete expression matching keeps rye, barrel proof, age and ambiguous aliases distinct',()=>{
  assert.equal(metroBottleMatch('Larceny Bbn Brl Proof 750ml',bible)?.canonical,'Larceny Barrel Proof');
  for(const name of['Larceny Bbn 92P 750ml','Larceny Bbn Brl Proof Private Barrel 750ml','Larceny Bbn Brl Proof 2026 750ml','Old Fitzgerald Bbn 7Year 750ml','Eagle Rare Single Barrel 750ml','E H Taylor Single Barrel 750ml'])assert.equal(metroBottleMatch(name,bible),null,name);
  const records=clone(fixture.records);records.push({...clone(records.find(r=>r.canonical==='Larceny Barrel Proof')),id:'other',libraryIdentities:[{id:'other-expression',canonicalName:'Other Larceny',aliases:['Larceny Barrel Proof'],nationalTier:'allocated',isAlertEligible:true}]});
  // Canonical identity still outranks a borrowed alias; the short LBP alias
  // colliding with another distinct library expression stays excluded.
  assert.equal(metroBottleMatch('Larceny Barrel Proof',new BourbonBible(records))?.canonical,'Larceny Barrel Proof');
  records.at(-1).libraryIdentities[0].aliases.push('LBP');assert.equal(metroBottleMatch('LBP',new BourbonBible(records)),null);
});

test('mislabeled George T. Stagg stays excluded and Blantons needs its reviewed image binding',()=>{
  const conflict=wheel('George T. Stagg Barrel Proof- unfiltered');assert.equal(parseLiquorWheelProduct(html(conflict),conflict.url,bible,{observedAt:now}),null);
  const good=wheel("Blanton's Bourbon");assert(parseLiquorWheelProduct(html(good),good.url,bible,{observedAt:now}));
  const changed=clone(good);changed.product.image='https://attacker.example/blantons.png';assert.equal(parseLiquorWheelProduct(html(changed),changed.url,bible,{observedAt:now}),null);
});

test('Phoenix product details must corroborate exact seller, store, stock, product identity and pickup',()=>{
  const good=wheel('Eagle Rare 10 Year');
  for(const mutate of[w=>w.pickupAvailable=false,w=>w.product.offers.availability='https://schema.org/OutOfStock',w=>w.product.offers.seller.url='https://attacker.example/',w=>w.product.offers.price='1',w=>w.premise.address.streetAddress='Other street',w=>w.premise.address.addressRegion='NV',w=>w.publishedProduct.name='Eagle Rare 12 Year',w=>w.publishedProduct.internal_sku='other']){const changed=clone(good);mutate(changed);assert.equal(parseLiquorWheelProduct(html(changed),changed.url,bible,{observedAt:now}),null);}
});

test('catalog-disabled library identities cannot be promoted by the reviewed source tier',()=>{
  const records=clone(fixture.records);const target=records.find(r=>r.canonical==='Larceny Barrel Proof');target.libraryAlertEligible=false;target.libraryIdentities.forEach(b=>b.isAlertEligible=false);const b=new BourbonBible(records);
  const signal=parseMetroWooProduct(larceny,mesa,b,wooOptions);assert(signal);const op=canonicalizeSignal(signal,b);assert.equal(op.canAlertAsInventory,false);assert.equal(buildDrops([op],bibleLookup(b.records),[op]).filter(isPublicDropFeedEligible).length,0);
});

test('a retailer denial ends the source before category pages, library searches or product details',async()=>{
  for(const kind of['woo','wheel']){const calls=[];const options={fetchText:async url=>{calls.push(url);return{ok:false,status:403,text:''};},sleep:async()=>{},cursorDir:null};const r=kind==='woo'?await collectMetroWooCommerce({id:'AZ'},bible,now,mesa,options):await collectLiquorWheelPhoenix({id:'AZ'},bible,now,options);assert.equal(calls.length,1);assert.equal(r.signals.length,0);assert.equal(r.roadblocks[0].status,403);}
});

test('unrecognized product URL slugs rotate through detail verification instead of becoming a permanent blind spot',async t=>{
  const directory=await mkdtemp(path.join(tmpdir(),'az-metro-rotation-'));
  t.after(async()=>{assert.equal(path.dirname(directory),path.resolve(tmpdir()));assert(path.basename(directory).startsWith('az-metro-rotation-'));await rm(directory,{recursive:true,force:true});});
  const known=wheel('Eagle Rare 10 Year');const opaque=Array.from({length:20},(_,i)=>`https://liquorwheel2.com/phoenix-liquor-delivery/opaque-label-${i}.html`);
  const seen=new Set();const fetchText=async url=>{
    if(url.includes('/liquor/?'))return{ok:true,status:200,text:[known.url,...opaque].map(u=>`<a href="${u}">Bottle</a>`).join('')};
    seen.add(url);const w=clone(known);w.product.offers.seller.url=url;return{ok:true,status:200,text:html(w)};
  };
  for(let attempt=0;attempt<2;attempt++){
    const r=await collectLiquorWheelPhoenix({id:'AZ'},bible,now,{fetchText,sleep:async()=>{},cursorDir:directory});
    assert.equal(r.metadata.requests.length,16);assert.equal(r.metadata.exhaustiveRetrievalVerified,false);
    assert(r.metadata.selectedProductUrls.includes(known.url));assert(r.signals.some(s=>s.rawName==='Eagle Rare 10 Year'));
  }
  assert(opaque.every(url=>seen.has(url)),'both sweeps together inspect every opaque product detail URL');
});


test('obsolete accepted Metro history cannot reenter publication after retailer proof changes', async()=>{
  const previous=JSON.parse(await readFile(new URL('./fixtures/arizona-metro/2026-10-27-previous-operational.json',import.meta.url)));
  assert.equal(previous.signals.length,5);
  assert(previous.signals.some(s=>s.storeAddress==='7143 E Southern Ave, Mesa, AZ 85209'));
  const current=[...fixture.wheel.map(w=>parseLiquorWheelProduct(html(w),w.url,bible,{observedAt:now})),
    ...PHOENIX_METRO_RETAILERS.flatMap((r,i)=>fixture.woo[i===0?'mesa':'best'].products.map(p=>parseMetroWooProduct(p,r,bible,{
      observedAt:now,premiseMapQuery:wooPremiseMap(fixture.woo[i===0?'mesa':'best'].contactMapHtml,r),
      productQueryUrl:r.baseUrl+'/wp-json/wc/store/v1/products?category=237&per_page=100&page=1',
    })))].filter(Boolean).map(s=>canonicalizeSignal(s,bible));
  const lookup=bibleLookup(bible.records);
  const fresh=buildDrops(current,lookup,current);
  const older=clone(current);
  for(const row of older){row.observedAt='2026-10-26T15:00:00.000Z';row.sourceProductBinding.observedAt=row.observedAt;}
  assert(older.every(isArizonaRetailerInventory),'the old positive proofs remain valid but cannot replace current observations');
  const merged=buildDrops([...previous.signals,...older,...current],lookup,current);
  assert.equal(fresh.length,11);
  const inventory=rows=>rows.map(r=>({store:r.storeId,name:r.rawName,observedAt:r.observedAt,price:r.price,quantity:r.quantity,inventory:r.canAlertAsInventory})).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
  assert.deepEqual(inventory(merged),inventory(fresh),'history may preserve first seen dates but cannot replace current stock observations');
  assert(merged.every(r=>r.observedAt===now));
  assert(merged.every(isPublicDropFeedEligible));
  assert(merged.every(isArizonaRetailerInventory));
});

test('proven Metro classification honors regular, highly allocated and Arizona override tiers',()=>{
  for(const [nationalTier,stateOverrides,expected] of [
    ['regular',[],'standard'],['highly_allocated',[],'unicorn'],['allocated',[],'allocated'],
    ['regular',[{jurisdiction:'AZ',tier:'allocated'}],'allocated'],
    ['allocated',[{jurisdiction:'AZ',tier:'regular'}],'standard'],
  ]){
    const records=clone(fixture.records);const record=records.find(r=>r.canonical==='Larceny Barrel Proof');
    record.tier='allocated';Object.assign(record.libraryIdentities[0],{nationalTier,stateOverrides});
    const b=new BourbonBible(records);const signal=parseMetroWooProduct(larceny,mesa,b,wooOptions);
    assert(signal);assert.equal(metroLibraryTier(signal,b),expected);
    const op=canonicalizeSignal(signal,b);assert.equal(op.tier,expected);
    const drops=buildDrops([op],bibleLookup(b.records),[op]).filter(isPublicDropFeedEligible);
    assert.equal(drops.length,expected==='standard'?0:1);
  }
});
