import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {BourbonBible} from '../src/core/bible.mjs';
import {collectShopifyVariantPickup,validateShopifyVariantSource} from '../src/collectors/shopify-variant-pickup.mjs';
import reviewed from '../data/independent-shopify-pickup-sources.json' with {type:'json'};

// Current public captures exercise the existing collector. This research file
// does not admit a source, register a runtime or publish customer inventory.
const root=new URL('./fixtures/independent-shopify-pickup/',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('manifest.json',root),'utf8'));
const bible=await BourbonBible.load(new URL('../out/bourbon-bible.json',import.meta.url));
const captures=new Map();
for(const capture of manifest.captures){
  const text=await readFile(new URL(capture.file,root),'utf8');
  assert.equal(createHash('sha256').update(text).digest('hex'),capture.sha256);
  assert.equal(Buffer.byteLength(text),capture.bytes);
  assert.equal(capture.requestedUrl,capture.finalUrl);
  assert.equal(capture.status,200);
  captures.set(capture.requestedUrl,{capture,text});
}

test('independent pickup research remains unactivated and binds every primary capture',()=>{
  assert.equal(reviewed.scope,'research_only_no_runtime_activation');
  assert.deepEqual(reviewed.sources.map(s=>s.state),['TX','MI']);
  for(const source of reviewed.sources){
    validateShopifyVariantSource(source);
    for(const seed of source.products)for(const [kind,evidence]of Object.entries(seed.evidence)){
      const {capture}=captures.get(evidence.url);
      assert.equal(capture.sourceId,source.id);
      assert.equal(capture.kind,kind);
      assert.equal(capture.sha256,evidence.sha256);
      assert.equal(capture.capturedAt,evidence.capturedAt);
    }
  }
});

for(const source of reviewed.sources)test(`unchanged strict collector proves addressed pickup: ${source.runtimeId}`,async()=>{
  let requests=0;
  const observedAt=source.products.map(seed=>seed.evidence.pickup.capturedAt).sort().at(-1);
  const result=await collectShopifyVariantPickup(bible,source,{observedAt,fetchText:async url=>{
    requests++;assert.ok(captures.has(url));return {ok:true,status:200,url,text:captures.get(url).text};
  }});
  assert.equal(requests,source.products.length*2);
  assert.equal(result.signals.length,source.products.length);
  assert.equal(result.accounting.completeSnapshot,true);
  for(const row of result.signals){
  const seed=source.products.find(seed=>seed.variantId===row.variantId),store=source.stores[0];
  assert.equal(row.storeId,store.id);
  assert.equal(row.storeAddress,store.address);
  assert.equal(row.productId,seed.productId);
  assert.equal(row.variantId,seed.variantId);
  assert.equal(row.canonicalName,seed.canonicalName);
  assert.equal(row.observedAt,observedAt);
  assert.equal(row.pickupOfferVerified,true);
  assert.equal(row.premisesVerified,true);
  assert.equal(row.quantity,0);
  assert.equal(row.quantityIsExact,false);
  }
});

test('Livonia capture cannot prove a changed premise or a different Blanton edition',async()=>{
  const source=reviewed.sources.find(s=>s.state==='MI');
  for(const change of ['premise','edition','variant'])await assert.rejects(
    collectShopifyVariantPickup(bible,source,{fetchText:async url=>{
      let text=captures.get(url).text;
      if(change==='premise'&&!url.endsWith('.json'))text=text.replace('Livonia MI 48154','Livonia MI 48155');
      if(change==='edition'&&url.endsWith('.json'))text=text.replace('Blantons Bourbon Original Single Barrel','Blantons Gold Edition');
      if(change==='variant'&&url.endsWith('.json')){const payload=JSON.parse(text);payload.product.variants[0].id++;text=JSON.stringify(payload);}
      return {ok:true,status:200,url,text};
    }}),/pickup premises|reviewed product changed|variant\/product binding/);
});
