import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { BourbonBible } from '../src/core/bible.mjs';
import { collectShopifyVariantPickup, describeShopifyVariantSource, SHOPIFY_VARIANT_PICKUP_VERSION } from '../src/collectors/shopify-variant-pickup.mjs';
import { buildShopifyCohortDescriptors } from '../src/collectors/shopify-cohort-runtime.mjs';
import { createShopifyPickupPolicy, SHOPIFY_PICKUP_SOURCES } from '../src/sources/shopify-pickup-policy.mjs';
import { bibleLookup, publicSignal } from '../src/export-site-contract.mjs';

// Frozen public pairs and synthetic authority ONLY. Fixture clocks are retained;
// a simulated collector observation cannot establish present source readiness.
const root=new URL('./fixtures/shopify-variant-pickup/next-five-20261023T1647/',import.meta.url);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const configBytes=await readFile(new URL('reviewed-configurations.fixture.json',root));
assert.equal(hash(configBytes),'2a44588d58137fb4463a116fc1612f1888ad391d7829982530b8f9f7ebbf5679');
const config=JSON.parse(configBytes),catalog=await readFile(new URL('../current-bourbon-bible.json',root));
const bible=new BourbonBible(JSON.parse(catalog).records),lookup=bibleLookup(JSON.parse(catalog).records);
const collectorSha256=hash(await readFile(new URL('../src/collectors/shopify-variant-pickup.mjs',import.meta.url)));
const captures=JSON.parse(await readFile(new URL('manifest.json',root),'utf8')).captures,bodies=new Map();
for(const capture of captures){
  const bytes=await readFile(new URL(capture.file,root));assert.equal(hash(bytes),capture.sha256);assert.equal(bytes.length,capture.bytes);
  assert.equal(capture.requestedUrl,capture.finalUrl);assert.equal(bodies.has(capture.requestedUrl),false);bodies.set(capture.requestedUrl,bytes);
}
assert.deepEqual(config.sources.map(s=>s.runtimeId),['ca:remedy-glendale','ca:main-street-el-cajon','fl:spirits4less-miami','ny:vino-lexington','tx:hot-spot-austin']);
for(const source of config.sources)test(`next-five frozen pair uses strict shared runtime without admission: ${source.runtimeId}`,async()=>{
  const now=Date.now(),plan=describeShopifyVariantSource(source,{collectorSha256});let requests=0;
  const result=await collectShopifyVariantPickup(bible,source,{observedAt:new Date(now-1000).toISOString(),fetchText:async url=>{
    requests++;assert.ok(bodies.has(url));return {ok:true,status:200,url,text:bodies.get(url).toString('utf8')};
  }});
  assert.equal(requests,2);assert.equal(result.signals.length,1);assert.equal(result.accounting.completeSnapshot,true);
  const seed=source.products[0],store=source.stores[0],record=bible.match(seed.canonicalName).record;
  const admission={schemaVersion:1,sourceId:source.runtimeId,collectorSha256,catalogSha256:hash(catalog),configSha256:plan.configSha256,
    reviewer:'synthetic runtime closure fixture test only',reviewedAt:new Date(now-1000).toISOString(),productionCommit:'a'.repeat(40),policySnapshotId:'synthetic-pinned-policy',
    reviewArtifactSha256:'1'.repeat(64),canonicalReviewSha256:'2'.repeat(64),premisesBaselineSha256:'3'.repeat(64),livePreflightSha256:'4'.repeat(64),baselineResult:'directory_reuse_confirmed',
    bindings:[{storeId:store.id,productId:seed.productId,variantId:seed.variantId,canonicalBottleId:record.id,tier:record.tier}]};
  const descriptor=buildShopifyCohortDescriptors([source],{admissions:[admission],collectorSha256,catalogSha256:hash(catalog)})[0];
  assert.equal(descriptor.disabled,true);assert.deepEqual(SHIFY(),[]);
  const policy=createShopifyPickupPolicy({descriptors:[{...descriptor,disabled:false}],enabledSourceIds:[descriptor.id],collectorSha256,catalogSha256:hash(catalog),lookup,policySnapshotId:'synthetic-pinned-policy',now});
  const signal={...result.signals[0],sourcePolicySnapshotId:'synthetic-pinned-policy'};
  const flat=publicSignal(signal,lookup,null,{shopifyPolicy:policy});
  assert.equal(policy.eligible(signal),true);assert.equal(policy.eligible(flat),true);assert.equal(flat.sourceCollectorVersion,SHOPIFY_VARIANT_PICKUP_VERSION);
  assert.equal(flat.quantity,0);assert.equal(flat.quantityIsExact,false);
  assert.equal(createShopifyPickupPolicy().eligible(signal),false,'Empty real registry never admits a frozen fixture');
});
function SHIFY(){return SHOPIFY_PICKUP_SOURCES;}
