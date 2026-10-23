import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { BourbonBible } from '../src/core/bible.mjs';
import { collectShopifyVariantPickup, describeShopifyVariantSource, SHOPIFY_VARIANT_PICKUP_VERSION } from '../src/collectors/shopify-variant-pickup.mjs';
import { buildShopifyCohortDescriptors } from '../src/collectors/shopify-cohort-runtime.mjs';
import { createShopifyPickupPolicy, SHOPIFY_PICKUP_SOURCES } from '../src/sources/shopify-pickup-policy.mjs';
import { bibleLookup, publicSignal, buildDrops, dropHasPositiveAlertInventory, buildCurrentInventoryAlertsFromDrops } from '../src/export-site-contract.mjs';

// Actual source and capture bytes, synthetic authority only. No activation or
// live freshness inference follows from replaying a saved capture at this clock.
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const fixtureRoot = new URL('./fixtures/shopify-variant-pickup/', import.meta.url);
const configs = JSON.parse(await readFile(new URL('../data/shopify-pickup-onboarding-cohort-v2.json', import.meta.url),'utf8')).sources;
const catalogBytes = await readFile(new URL('current-bourbon-bible.json',fixtureRoot));
const records = JSON.parse(catalogBytes).records, bible = new BourbonBible(records), lookup = bibleLookup(records);
const collectorSha256 = hash(await readFile(new URL('../src/collectors/shopify-variant-pickup.mjs',import.meta.url)));
const catalogSha256 = hash(catalogBytes), bodies = new Map();
for(const directory of [fixtureRoot,new URL('v2/',fixtureRoot)]){
  const manifest=JSON.parse(await readFile(new URL('manifest.json',directory),'utf8'));
  for(const capture of manifest.captures){
    const bytes=await readFile(new URL(capture.file,directory));
    assert.equal(hash(bytes),capture.sha256); assert.equal(bytes.length,capture.bytes);
    assert.equal(capture.requestedUrl,capture.finalUrl);
    assert.equal(bodies.has(capture.requestedUrl),false,'Ambiguous fixture URL must not overwrite evidence');
    bodies.set(capture.requestedUrl,bytes.toString());
  }
}
const now=Date.now(), observedAt=new Date(now-1000).toISOString(), snapshot='synthetic-strict-premises-policy';
const example=configs.find(source=>source.id==='christies-la-crescenta');

function configured(address){const value=structuredClone(example);value.stores[0].address=address;return value;}
async function collect(config,responseAddress){
  let requests=0,replaced=0;
  const promise=collectShopifyVariantPickup(bible,config,{observedAt,fetchText:async url=>{
    requests++; assert.ok(bodies.has(url),'Only frozen exact product/pickup URLs may be requested');
    let text=bodies.get(url);
    if(responseAddress!==undefined&&!url.endsWith('.json'))text=text.replace(/<p\b([^>]*)>([\s\S]*?)<\/p>/giu,(all,attrs,body)=>{
      if(/\bCA\s+91214\b/iu.test(body)){replaced++;return `<p${attrs}>${responseAddress}</p>`;}return all;
    });
    return {ok:true,status:200,url,text};
  }});
  return {promise,counters:()=>({requests,replaced})};
}
function admission(config){
  const plan=describeShopifyVariantSource(config,{collectorSha256});
  return {schemaVersion:1,sourceId:config.runtimeId,collectorSha256,catalogSha256,configSha256:plan.configSha256,
    reviewer:'synthetic strict-premises integration only',reviewedAt:new Date(now-60000).toISOString(),productionCommit:'a'.repeat(40),policySnapshotId:'prior-synthetic-review',
    reviewArtifactSha256:'1'.repeat(64),canonicalReviewSha256:'2'.repeat(64),premisesBaselineSha256:'3'.repeat(64),livePreflightSha256:'4'.repeat(64),baselineResult:'net_new_confirmed',
    bindings:config.stores.flatMap(store=>config.products.map(product=>({storeId:store.id,productId:product.productId,variantId:product.variantId,
      canonicalBottleId:bible.match(product.canonicalName).record.id,tier:bible.match(product.canonicalName).record.tier})))};
}
function policyFor(config){
  const descriptor=buildShopifyCohortDescriptors([config],{admissions:[admission(config)],collectorSha256,catalogSha256})[0];
  assert.equal(descriptor.disabled,true,'Builder never activates the source');
  return createShopifyPickupPolicy({descriptors:[{...descriptor,disabled:false}],enabledSourceIds:[descriptor.id],collectorSha256,catalogSha256,lookup,policySnapshotId:snapshot,now});
}
async function positive(config, syntheticAddress=false){
  const {promise}=await collect(config,syntheticAddress?config.stores[0].address:undefined),result=await promise;
  assert.equal(result.signals.length,1);assert.equal(result.accounting.completeSnapshot,true);
  return {...result.signals[0],sourcePolicySnapshotId:snapshot};
}

const suffix=' La Crescenta CA 91214';
const mismatches=[
  ['unit range/fraction','3040 Foothill Boulevard Unit 1-2','3040 Foothill Boulevard Unit 1/2'],
  ['house-number hyphen/space','138-44 Foothill Boulevard','138 44 Foothill Boulevard'],
  ['Suite/APT','3040 Foothill Boulevard Suite 100','3040 Foothill Boulevard APT 100'],
  ['missing unit','3040 Foothill Boulevard Unit 2','3040 Foothill Boulevard'],
];
for(const [label,a,b]of mismatches)for(const [direction,configuredStreet,reportedStreet]of [['forward',a,b],['reverse',b,a]]){
  test(`actual collector rejects conflicting raw pickup card: ${label} ${direction}`,async()=>{
    const run=await collect(configured(configuredStreet+suffix),reportedStreet+suffix);
    await assert.rejects(run.promise,/unknown or duplicate pickup premises/iu);
    assert.deepEqual(run.counters(),{requests:2,replaced:1});
  });
  test(`actual policy and exporter veto changed consumer address while retaining ownership: ${label} ${direction}`,async()=>{
    const config=configured(configuredStreet+suffix),signal=await positive(config,true),policy=policyFor(config);
    assert.equal(policy.eligible(signal),true);
    const flat=publicSignal(signal,lookup,null,{shopifyPolicy:policy});
    assert.equal(policy.eligible(flat),true,'Actual flattened positive is a usable consumer control');
    for(const original of [signal,flat])for(const field of ['storeAddress','address','raw.pickupAddress']){
      const changed=structuredClone(original);
      if(field==='raw.pickupAddress')changed.raw={...changed.raw,pickupAddress:reportedStreet+suffix};else changed[field]=reportedStreet+suffix;
      assert.equal(policy.owns(changed),true,field);
      assert.equal(policy.evaluate(changed).reason,'premises_mismatch',field);
      assert.equal(publicSignal(changed,lookup,null,{shopifyPolicy:policy}).canAlertAsInventory,false,field);
      assert.deepEqual(buildDrops([changed],lookup,[changed],[],[changed],{shopifyPolicy:policy}),[],field);
    }
  });
}
for(const [label,responseAddress]of [
  ['wrong ZIP','3040 Foothill Boulevard La Crescenta CA 91215'],
  ['wrong state','3040 Foothill Boulevard La Crescenta NY 91214'],
  ['wrong city','3040 Foothill Boulevard Other City CA 91214'],
])test(`actual collector rejects ${label} in raw pickup card`,async()=>{
  const run=await collect(example,responseAddress);
  await assert.rejects(run.promise,/unknown or duplicate pickup premises/iu);
  assert.deepEqual(run.counters(),{requests:2,replaced:1});
});

test('exact hyphenated house identity is a positive control through collector, policy and exporter',async()=>{
  const config=configured('138-44 Foothill Boulevard'+suffix),run=await collect(config,config.stores[0].address),result=await run.promise;
  const signal={...result.signals[0],sourcePolicySnapshotId:snapshot},policy=policyFor(config);
  assert.equal(result.signals.length,1);assert.equal(policy.eligible(signal),true);
  assert.equal(publicSignal(signal,lookup,null,{shopifyPolicy:policy}).canAlertAsInventory,true);
});

for(const config of configs)test(`real saved fixture retains strict positive proof under synthetic policy: ${config.runtimeId}`,async()=>{
  const signal=await positive(config),policy=policyFor(config),drop=publicSignal(signal,lookup,null,{shopifyPolicy:policy});
  assert.equal(policy.eligible(signal),true);assert.equal(drop.canAlertAsInventory,true);
  assert.equal(drop.sourceCollectorVersion,SHOPIFY_VARIANT_PICKUP_VERSION,'Exporter must retain actual current code version');
  assert.equal(drop.quantity,0);assert.equal(drop.quantityIsExact,false);
  assert.equal(drop.availabilityLabel,'Retailer reports pickup available; exact count not published');
  assert.equal(policy.eligible(drop),true,'Flat consumer proof remains strict and usable');
});

for(const version of ['shopify-variant-pickup-v1',SHOPIFY_VARIANT_PICKUP_VERSION,'shopify-variant-pickup-v999','shopify-variant-pickup-unknown'])
  for(const position of ['raw','flat'])test(`default exporter cannot bypass admission with ${position} marker ${version}`,async()=>{
    assert.deepEqual(SHOPIFY_PICKUP_SOURCES,[]);
    const signal=await positive(example);
    if(position==='raw'){signal.raw.collectorVersion=version;delete signal.sourceCollectorVersion;}
    else{delete signal.raw.collectorVersion;signal.sourceCollectorVersion=version;}
    const empty=createShopifyPickupPolicy();
    assert.equal(empty.eligible(signal),false);
    for(const options of [undefined,{shopifyPolicy:empty}]){
      const drop=publicSignal(signal,lookup,null,options);
      assert.equal(drop.canAlertAsInventory,false);
      assert.equal(drop.canAlertAsWatch,false,'Unadmitted versions cannot escape through the watch channel');
      assert.equal(drop.sourceCollectorVersion,version);
      assert.deepEqual(buildDrops([signal],lookup,[signal],[],[signal],options),[]);
      const manufactured={...drop,canAlertAsInventory:true,quantity:10,availabilityStatus:'in_stock'};
      assert.equal(dropHasPositiveAlertInventory(manufactured,options?.shopifyPolicy),false);
      assert.deepEqual(buildCurrentInventoryAlertsFromDrops([manufactured],options),[]);
    }
  });

test('admission rejects duplicate physical premises after harmless street abbreviations',()=>{
  const first=configured('138-44 Foothill Boulevard'+suffix),second=structuredClone(first);
  second.id='second-synthetic';second.runtimeId='ca:second-synthetic';second.chain='second-synthetic';second.stores[0].id='second-synthetic-store';
  second.stores[0].address='138-44 Foothill Blvd.'+suffix;
  assert.throws(()=>buildShopifyCohortDescriptors([first,second],{admissions:[admission(first),admission(second)],collectorSha256,catalogSha256}),/duplicate admitted physical premises/iu);
  second.stores[0].address='138 44 Foothill Boulevard'+suffix;
  const descriptors=buildShopifyCohortDescriptors([first,second],{admissions:[admission(first),admission(second)],collectorSha256,catalogSha256});
  assert.equal(descriptors.length,2,'Different numeric address shapes cannot collapse into one identity');
  assert.ok(descriptors.every(source=>source.disabled),'Distinct synthetic premises do not activate anything');
});
