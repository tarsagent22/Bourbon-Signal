import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { BourbonBible } from '../src/core/bible.mjs';
import { buildShadowEvidence } from '../src/run-expansion-shadow.mjs';
import { collectDelawareEcwidResearch, delawareEcwidResearchSource, isDelawareEcwidShadowPickup } from '../src/research-delaware-ecwid.mjs';
import { parseEcwidPickupOffer, verifyEcwidPickupPremise } from '../src/collectors/ecwid-pickup-surfaces.mjs';
import sourceData from '../data/de-ecwid-research-source.json' with { type: 'json' };

const merchant={merchantId:'130511528',name:'Banks Wines & Spirits',origin:'https://bankswinesandspirits.com',
  address:'38014 Town Center Drive, Millville, DE 19967'};
const product={productId:'813956453',sku:'081128002664',
  name:'OLD FORESTER BWS SINGLE BARREL BOURBON BARREL STRENGTH 750ML',
  url:'https://bankswinesandspirits.com/products/old-forester-bws-single-barrel-bourbon-barrel-strength-750ml'};
const initialState=JSON.stringify(JSON.stringify({profile:{profile:{storeId:130511528,storeName:'Banks Wines & Spirits',
  siteUrl:'https://bankswinesandspirits.com',countryCode:'US',storeClosed:false,storeSuspended:false}}}));
const home=`<script>window.initialState = ${initialState};</script><div class="ins-tile__address">38014 Town Center Drive, Millville, DE 19967</div><main>Convenient In-Store and Curbside Pickup available for all orders. Shipping is unavailable due to state regulations.</main>`;
const item={"@context":"http://schema.org","@type":"Product",name:product.name,sku:product.sku,gtin12:product.sku,
  image:[{"@type":"ImageObject","contentUrl":"https://d2j6dbq0eux0bg.cloudfront.net/images/130511528/products/813956453/5564781103.jpg"}],
  offers:{"@type":"Offer",priceCurrency:'USD',price:'89.0',url:product.url,availability:'http://schema.org/InStock',seller:{"@type":"Organization",name:'Banks Wines & Spirits'}}};
const productPage=`<script>window.initialState = ${initialState};</script><script type="application/ld+json">${JSON.stringify(item)}</script><meta itemprop="sku" content="081128002664" /><div class="details-product-purchase__place">In stock: 22 available</div><button>Add to Bag</button><div class="ec-iconable-block__text">Pickup: today, 12:30 PM–09:30 PM</div>`;

const bible=await BourbonBible.load(new URL('../out/bourbon-bible.json',import.meta.url));

test('held Banks captures bind one exact Millville premise and orderable 750 mL allocated expression',()=>{
  assert.equal(sourceData.product.productId,'813956453');
  assert.notEqual(sourceData.product.productId,'853683296');
  assert.equal(sourceData.product.sku,'081128002664');
  assert.equal(sourceData.product.sizeMl,750);
  assert.equal(sourceData.product.canonicalId,'old-forester-single-barrel-barrel-proof');
  assert.equal(sourceData.product.historicalObservation.captureSha256,'9ea494195dcba4825d20b9ca3ed0eaaba84d819ebc5e1b04e0b7e4350d81213f');
  assert.equal(sourceData.product.historicalObservation.libraryRecordsSha256AtReview,'2f98c28c23a9f20f10e68777e158aff1539075e60a448d32700fdd574a46c0cc');
  verifyEcwidPickupPremise(home,merchant);
  const offer=parseEcwidPickupOffer(productPage,merchant,product);
  assert.deepEqual(offer,{price:89,reportedQuantity:22,pickupWindow:'Pickup: today, 12:30 PM–09:30 PM',availableForPickup:true});
  const match=bible.match('Old Forester Single Barrel Barrel Proof');
  assert.equal(match.method,'exact-library-identity');
  assert.equal(match.record.id,sourceData.product.canonicalId);
  assert.equal(match.record.tier,'allocated');
  assert.throws(()=>verifyEcwidPickupPremise(home.replace('38014 Town Center Drive','1 Other Street'),merchant),/physical premise/);
  assert.throws(()=>parseEcwidPickupOffer(productPage.replace('081128002664','081128002665'),merchant,product),/exact product/);
  assert.throws(()=>parseEcwidPickupOffer(productPage.replace('813956453/5564781103.jpg','853683296/5564781103.jpg'),merchant,product),/exact product/);
});

test('Delaware Ecwid collector remains shadow-only and reports binary orderability with source-scoped clocks',async t=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'de-ecwid-shadow-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  const calls=[];
  const result=await collectDelawareEcwidResearch(delawareEcwidResearchSource('DE'),bible,{
    env:{BOURBON_SIGNAL_SHADOW_MODE:'1'},clocksFile:path.join(directory,'clock.json'),
      fetchText:async (url,options)=>{calls.push(url);assert.equal(options.maxBytes,2*1024*1024);return{status:200,url,text:url===sourceData.source.homeUrl?home:productPage};},
  });
  assert.equal(calls.length,2);
  assert.deepEqual(calls,[sourceData.source.homeUrl,sourceData.product.url]);
  assert.equal(result.metadata.complete,true);
  assert.equal(result.metadata.productionActivationAllowed,false);
  assert.equal(result.metadata.customerDeliveryAllowed,false);
  assert.equal(result.metadata.allDeliveryDisabled,true);
  assert.equal(result.signals.length,1);
  const [row]=result.signals;
  assert.equal(row.tier,'allocated');
  assert.equal(row.quantity,0);
  assert.equal(row.quantityIsExact,false);
  assert.equal(row.raw.reportedQuantity,22);
  assert.equal(row.price,89);
  assert.equal(isDelawareEcwidShadowPickup(row,{nowMs:Date.parse(row.observedAt)+4*60*60_000+1}),false);
  assert.equal(isDelawareEcwidShadowPickup(row,{nowMs:Date.parse(row.observedAt)}),true);
  const projection=buildShadowEvidence('DE',{state:'DE',status:'partial_useful',strategy:'retailer_store_inventory',
    startedAt:row.observedAt,finishedAt:row.observedAt,signals:[row],sources:[{ok:true,status:200}],sourceResults:[{ok:true,status:200}],
    metadata:{complete:false,shadowOnly:true,productionActivationAllowed:false,customerDeliveryAllowed:false}},
    {now:row.observedAt});
  assert.equal(projection.readiness.inventory.status,'ready');
  assert.equal(projection.readiness.inventory.trustedSignalCount,1);
  const before=calls.length;
  const notDue=await collectDelawareEcwidResearch(delawareEcwidResearchSource('DE'),bible,{
    env:{BOURBON_SIGNAL_SHADOW_MODE:'1'},clocksFile:path.join(directory,'clock.json'),
    fetchText:async()=>{calls.push('unexpected');throw Error('source should respect its own cadence');},
  });
  assert.equal(calls.length,before);
  assert.equal(notDue.status,'not_due');
  await assert.rejects(collectDelawareEcwidResearch(delawareEcwidResearchSource('DE'),bible,{
    env:{BOURBON_SIGNAL_SHADOW_MODE:'0'},clocksFile:path.join(directory,'guard.json'),
    fetchText:async()=>{throw Error('guard must run before any request');},
  }),/isolated shadow source/);
});
