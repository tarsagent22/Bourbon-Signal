import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {BourbonBible} from '../src/core/bible.mjs';
import {collectArizonaCityHive} from '../src/collectors/precision-probes.mjs';
import {PHOENIX_CITYHIVE_EXPANSION_SOURCES as sources,isPhoenixCityHiveExpansionProof} from '../src/collectors/phoenix-cityhive-expansion.mjs';
import {canonicalizeSignal} from '../src/operational-report.mjs';
import {bibleLookup,buildDrops} from '../src/export-site-contract.mjs';
import {isPublicDropFeedEligible} from '../../src/lib/public-drop-evidence.ts';
import {diagnosePhoenixMetroExpansion} from '../src/verification/phoenix-metro-expansion-verifier.mjs';
const fixture=JSON.parse(gunzipSync(await readFile(new URL('./fixtures/phoenix-cityhive-20261102.json.gz',import.meta.url))));
const bible=await BourbonBible.load(new URL('../out/bourbon-bible.json',import.meta.url));
const normalize=url=>{const u=new URL(url);u.searchParams.sort();return u.href;};
const pages=new Map(fixture.pages.map(p=>[normalize(p.url),p]));

async function run(t,{mutate=()=>{},denyHost=null,advanceMs=0}={}){
  const root=await mkdtemp(path.join(tmpdir(),'bs-phoenix-expansion-'));
  const previous=process.cwd();process.chdir(root);
  t.after(async()=>{process.chdir(previous);assert.equal(path.dirname(root),path.resolve(tmpdir()));await rm(root,{recursive:true,force:true});});
  t.mock.timers.enable({apis:['Date'],now:Date.parse(fixture.capturedAt)+60_000});
  const calls=[];
  const result=await collectArizonaCityHive({id:'AZ'},bible,fixture.capturedAt,{cityHiveSourceIds:sources.map(s=>s.id),cursorDir:path.join(root,'cursors'),sleepFn:async()=>{},fetchText:async(url,settings)=>{
    calls.push(url);assert.equal(settings.timeoutMs,10_000);
    const source=sources.find(s=>new URL(url).origin===s.baseUrl);assert(source);
    assert.equal(new URL(url).searchParams.get('merchant-id'),source.merchantIds[0]);
    if(new URL(url).hostname===denyHost)return {ok:false,status:403,text:''};
    const page=structuredClone(pages.get(normalize(url))||{...fixture.pages.find(p=>new URL(p.url).origin===source.baseUrl),products:[]});
    mutate(page);t.mock.timers.setTime(Date.now()+advanceMs);
    return {ok:true,status:200,text:`<script>JSON.parse(decodeURIComponent("${encodeURIComponent(JSON.stringify({products:page.products,merchant_configs:page.merchant_configs}))}"))</script>`};
  }});
  const op=result.signals.map(s=>canonicalizeSignal(s,bible));
  const all=JSON.parse(JSON.stringify(buildDrops(op,bibleLookup(bible.records),op)));
  const drops=all.filter(isPublicDropFeedEligible);
  return {result,all,drops,calls};
}

test('captured new metro premises survive the real operational and public projections with bounded distinct pages',async t=>{
  const {result,drops,calls}=await run(t);
  assert.equal(new Set(drops.map(r=>r.storeId)).size,2);assert(drops.length>=10);
  assert(drops.some(r=>r.canonicalName==='Buffalo Trace Bourbon'));
  assert(drops.some(r=>r.canonicalName==='E.H. Taylor Small Batch'));
  assert(drops.every(isPhoenixCityHiveExpansionProof));
  for(const s of sources){const urls=calls.filter(u=>new URL(u).origin===s.baseUrl);assert(urls.length<=19);assert(urls.some(u=>new URL(u).searchParams.get('skip')==='18'&&new URL(u).searchParams.get('limit')==='18'));assert(urls.some(u=>new URL(u).searchParams.has('ch-query')));}
  const state={signals:result.signals,precisionMetadata:{cityhive:result.metadata}};
  const check=diagnosePhoenixMetroExpansion({state,drops,bibleRecords:bible.records,required:true});
  assert.equal(check.status,'ok',check.errors.join('\n'));
  const stale=structuredClone({state,drops});stale.drops.forEach(r=>r.observedAt='2020-01-01T00:00:00Z');
  assert.equal(diagnosePhoenixMetroExpansion({...stale,bibleRecords:bible.records,required:true}).status,'failed');
  const copied=structuredClone(drops);copied.push(structuredClone(drops[0]));
  assert.equal(diagnosePhoenixMetroExpansion({state,drops:copied,bibleRecords:bible.records,required:true}).status,'failed');
  const missing=structuredClone(state);missing.precisionMetadata.cityhive.phoenixExpansionRequests=[];
  assert.equal(diagnosePhoenixMetroExpansion({state:missing,drops,bibleRecords:bible.records,required:true}).status,'failed');
});

for(const scenario of ['premise','merchant','product','miniature','large-format','zero','sentinel','fraction','price','fulfillment','bundle','shipping-only','preorder'])test(`new metro ${scenario} evidence cannot become public inventory`,async t=>{
  const {drops}=await run(t,{mutate:page=>{
    if(scenario==='premise')page.merchant_configs.forEach(c=>c.merchant.address.full_address='1 Wrong St, Mesa, AZ 85210, USA');
    if(scenario==='fulfillment')page.merchant_configs.forEach(c=>{c.merchant.pickup=false;c.merchant.delivery=false;});
    for(const p of page.products)for(const m of p.merchants||[])for(const o of m.product_options||[]){
      if(scenario==='merchant')o.merchant_id='000000000000000000000000';
      if(scenario==='product')o.product_id='000000000000000000000000';
      if(scenario==='miniature')o.option_params.size={measure:'ml',quantity:'50'};
      if(scenario==='large-format')o.option_params.size={measure:'l',quantity:'3'};
      if(scenario==='zero')o.quantity=0;if(scenario==='sentinel')o.quantity=100;if(scenario==='fraction')o.quantity=1.5;
      if(scenario==='price')o.price=0;if(scenario==='bundle')o.option_display_data.name+=' Bundle';
      if(scenario==='shipping-only')o.allowed_offer_types=['shipping'];if(scenario==='preorder')o.preorder_details={date:'2027-01-01'};
    }
  }});assert.equal(drops.length,0);
});

test('a retailer denial persists and prevents a second attempt while the independent new retailer continues',async t=>{
  const {calls,drops,result}=await run(t,{denyHost:'fiestaliquormesa.com'});
  assert.equal(calls.filter(u=>new URL(u).hostname==='fiestaliquormesa.com').length,1);
  assert(drops.some(r=>r.sourceChain===sources[1].id));assert(!drops.some(r=>r.sourceChain===sources[0].id));
  assert.equal(result.metadata.sourceAttempts[sources[0].id].httpStatus,403);
  const again=await collectArizonaCityHive({id:'AZ'},bible,fixture.capturedAt,{cityHiveSourceIds:[sources[0].id],fetchText:async()=>{throw Error('Cooldown must not issue a retailer request');}});
  assert.equal(again.metadata.requestCount,0);
});

test('slow new retailer responses cannot exhaust the Arizona parent runtime',async t=>{
  const {calls}=await run(t,{advanceMs:30_000});
  for(const s of sources)assert(calls.filter(u=>new URL(u).origin===s.baseUrl).length<=4);
});
