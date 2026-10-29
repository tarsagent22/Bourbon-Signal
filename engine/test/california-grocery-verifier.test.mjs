import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { BourbonBible } from '../src/core/bible.mjs';
import { CALIFORNIA_GROCERY_SOURCES } from '../src/collectors/california-grocery-premises.mjs';
import { CALIFORNIA_SAN_DIEGO_SHOPIFY_SOURCES } from '../src/collectors/california-san-diego-surfaces.mjs';
import { parseGroceryExpansionInventory } from '../src/collectors/grocery-xapi-expansion.mjs';
import { canonicalizeSignal } from '../src/operational-report.mjs';
import { bibleLookup, buildDrops, buildCurrentInventoryAlertsFromDrops } from '../src/export-site-contract.mjs';

const fixture=JSON.parse(readFileSync(new URL('./fixtures/california-grocery-expansion/identity.json',import.meta.url),'utf8'));
const bible=new BourbonBible(fixture.records);

function runVerifier(t,mutate=()=>{}) {
  const observedAt=new Date().toISOString(),sources=CALIFORNIA_GROCERY_SOURCES.slice(0,3);
  // Synthetic outputs exercise the actual release verifier; these are not live source observations.
  const signals=sources.flatMap(source=>{
    const products=structuredClone(fixture.products);
    for(const product of products)product.storeId=source.merchantId;
    return parseGroceryExpansionInventory({response:{docs:products}},source,bible,{observedAt});
  });
  const operational=signals.map(row=>canonicalizeSignal(row,bible));
  const drops=buildDrops(operational,bibleLookup(bible.records),operational);
  assert.equal(drops.length,15);
  const stores=sources.map(source=>({id:source.storeId,state:'CA',address:source.address,city:source.city}));
  const files={
    'out/states/CA.json':{state:'CA',status:'useful',stale:false,signals:structuredClone(signals),roadblocks:[]},
    'data/store-universe/CA.json':{stores:Array.from({length:3},()=>({city:'San Diego'}))},
    'out/site/states/CA/drops.json':{drops},
    'out/site/stores.json':{stores},
    'out/site/locations.json':{locations:stores},
    'out/site/alerts.json':{alerts:buildCurrentInventoryAlertsFromDrops(drops)},
    'out/site/state-quality.json':{states:[{state:'CA',releaseEligible:true,score:80,threshold:65}]},
  };
  mutate(files);
  const temporaryRoot=realpathSync(tmpdir()),directory=mkdtempSync(path.join(temporaryRoot,'bs-ca-verifier-'));
  assert.ok(realpathSync(directory).startsWith(temporaryRoot+path.sep));
  t.after(()=>rmSync(directory,{recursive:true,force:true}));
  for(const[relative,value]of Object.entries(files)){
    const target=path.join(directory,relative);mkdirSync(path.dirname(target),{recursive:true});
    writeFileSync(target,JSON.stringify(value));
  }
  return spawnSync(process.execPath,[fileURLToPath(new URL('../src/verify-ca.mjs',import.meta.url)),'--require-complete'],{
    cwd:directory,encoding:'utf8',windowsHide:true,timeout:10_000,
  });
}

test('California release verification accepts reviewed grocery raw and compact product identities',t=>{
  const result=runVerifier(t);
  assert.equal(result.status,0,result.stderr||result.error?.message);
  assert.equal(JSON.parse(result.stdout).stores,3);
});

test('California grocery verification preserves the existing normalized Shopify drop shape',t=>{
  const source=CALIFORNIA_SAN_DIEGO_SHOPIFY_SOURCES.find(source=>source.inventoryEligible);
  const result=runVerifier(t,files=>{
    files['out/site/states/CA/drops.json'].drops.push({
      state:'CA',storeId:source.store.id,storeAddress:source.store.address,city:source.store.city,
      sourceChain:source.id,merchantId:source.merchantId,productId:'101',variantId:'201',
      sourceAvailabilityVerified:true,fulfillmentPolicyVerified:true,
      inventorySemantics:'binary_retailer_orderable_no_exact_count',quantity:0,
    });
  });
  assert.equal(result.status,0,result.stderr||result.error?.message);
});

test('California release verification rejects compact product proof changed after source validation',t=>{
  const result=runVerifier(t,files=>{
    files['out/site/states/CA/drops.json'].drops[0].sourceProductBinding.productSnapshot.storeId='unreviewed-store';
  });
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/closed-registry source, product, quantity and availability proof/);
});
