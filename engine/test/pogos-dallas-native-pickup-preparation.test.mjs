import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
import {BourbonBible} from '../src/core/bible.mjs';import {collectShopifyVariantPickup,validateShopifyVariantSource} from '../src/collectors/shopify-variant-pickup.mjs';import {sameShopifyPremiseAddress} from '../src/collectors/shopify-premises-identity.mjs';import {SHOPIFY_PICKUP_SOURCES} from '../src/sources/shopify-pickup-policy.mjs';
const root=new URL('./fixtures/pogos-dallas-native-pickup/',import.meta.url),read=name=>readFile(new URL(name,root),'utf8');
const candidate=JSON.parse(await readFile(new URL('../data/research/pogos-dallas-native-pickup.json',import.meta.url),'utf8'));
const source=validateShopifyVariantSource(candidate.source),product=await read('product.json'),pickup=await read('pickup.html'),bible=new BourbonBible(JSON.parse(await read('bible.json')).records),sha=s=>createHash('sha256').update(s).digest('hex');
const replay=async({definition=source,productText=product,pickupText=pickup}={})=>{let calls=0;const value=await collectShopifyVariantPickup(bible,definition,{observedAt:candidate.currentEvidence.conservativeObservationClock,
 fetchText:async url=>{calls++;assert.ok([source.products[0].evidence.product.url,source.products[0].evidence.pickup.url].includes(url));return{ok:true,status:200,url,text:url.endsWith('.json')?productText:pickupText};}});return{value,calls};};

test('exact captured native product and addressed pickup reparse as one Dallas candidate with original clocks and no invented quantity',async()=>{
 assert.equal(candidate.productionActivated,false);assert.equal(candidate.customerCoverageAdded,0);assert.ok(!SHOPIFY_PICKUP_SOURCES.some(row=>row.id===source.id));
 assert.equal(sha(product),source.products[0].evidence.product.sha256);assert.equal(sha(pickup),source.products[0].evidence.pickup.sha256);
 assert.equal(bible.match(source.products[0].title),null,'Raw strict matcher remains unchanged');
 const {value,calls}=await replay();assert.equal(calls,2);assert.equal(value.signals.length,1);const row=value.signals[0];
 assert.equal(row.canonicalName,'E.H. Taylor Small Batch');assert.equal(row.productId,'7702997237969');assert.equal(row.variantId,'42977940144337');assert.equal(row.storeId,'tx-tabc-100118646');
 assert.equal(row.price,63.98);assert.equal(row.size,'750 ml');assert.equal(row.quantity,0);assert.equal(row.quantityIsExact,false);assert.equal(row.observedAt,'2026-10-29T16:42:36.025Z');
 // This pure collector replay is source-format validation, never publication.
 assert.equal(candidate.scope,'inactive_source_preparation_not_production_admission');
});

test('literal EHT mapping cannot accept changed expression, proof, volume, variant, pickup premise or unavailable offer',async()=>{
 const changed=JSON.parse(product);changed.product.title=changed.product.title.replace('Small Batch','Single Barrel');await assert.rejects(()=>replay({productText:JSON.stringify(changed)}));
 for(const pair of [['100 Proof','90 Proof'],['750ml','1L']])await assert.rejects(()=>replay({productText:product.replace(...pair)}));
 await assert.rejects(()=>replay({pickupText:pickup.replaceAll('Suite 200','Suite 220')}));
 await assert.rejects(()=>replay({pickupText:pickup.replaceAll('Small Batch','Single Barrel')}));
 const wrongVariant=JSON.parse(product);wrongVariant.product.variants[0].id=42977940144338;await assert.rejects(()=>replay({productText:JSON.stringify(wrongVariant)}));
 const noMapping=structuredClone(source);delete noMapping.products[0].titleMapping;await assert.rejects(()=>replay({definition:noMapping}),/reviewed mapping/);
 const negative=await replay({pickupText:pickup.replaceAll('Pickup available','Pickup unavailable')});assert.equal(negative.value.signals.length,0);
});

test('official active package-store permit binds exact suite and Dallas county, excluding neighboring restaurant',async()=>{
 const rows=JSON.parse(await read('tabc-address.json')),official=rows.find(row=>row.license_id==='100118646'),neighbor=rows.find(row=>row.license_id==='101498204'),store=source.stores[0];
 assert.equal(official.license_type,'P');assert.equal(official.license_status,'Active');assert.equal(official.county,'Dallas');assert.equal(store.county,'Dallas');
 assert.equal(sameShopifyPremiseAddress(store.address,`${official.address}, ${official.city}, ${official.state} ${official.zip.slice(0,5)}`,{city:official.city,state:official.state,zip:official.zip.slice(0,5)}),true);
 assert.equal(sameShopifyPremiseAddress(store.address,`${neighbor.address}, ${neighbor.city}, ${neighbor.state} ${neighbor.zip.slice(0,5)}`,{city:neighbor.city,state:neighbor.state,zip:neighbor.zip.slice(0,5)}),false);
 assert.equal(store.officialDirectoryProof.name,"PO-GO'S");assert.equal(store.officialDirectoryProof.id,'tx-tabc-100118646');
});
