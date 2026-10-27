import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {BourbonBible} from '../src/core/bible.mjs';
import {collectArizonaCityHive} from '../src/collectors/precision-probes.mjs';
import {canonicalizeSignal} from '../src/operational-report.mjs';
import {bibleLookup,buildDrops} from '../src/export-site-contract.mjs';
import {isPublicDropFeedEligible} from '../../src/lib/public-drop-evidence.ts';
const fixture=JSON.parse(await readFile(new URL('./fixtures/arizona-cityhive/2026-10-26-a1.json',import.meta.url),'utf8'));
const bible=await BourbonBible.load(new URL('../out/bourbon-bible.json',import.meta.url));
const sourceId='a1-liquor-phoenix';

async function run(t,{mutate=()=>{},status=200}={}){
  const root=await mkdtemp(path.join(tmpdir(),'bs-a1-premise-'));
  const cwd=process.cwd();process.chdir(root);
  t.after(async()=>{process.chdir(cwd);assert.equal(path.dirname(root),path.resolve(tmpdir()));await rm(root,{recursive:true,force:true});});
  t.mock.timers.enable({apis:['Date'],now:Date.parse(fixture.observedAt)+60000});
  const products=structuredClone(fixture.products);mutate(products);
  const html=`<script>JSON.parse(decodeURIComponent("${encodeURIComponent(JSON.stringify({products}))}"))</script>`;
  const calls=[];const options={cityHiveSourceIds:[sourceId],cursorDir:path.join(root,'cursors'),sleepFn:async()=>{},fetchText:async url=>{
    calls.push(url);assert.equal(new URL(url).hostname,'a1liquorstore.com');assert.equal(new URL(url).searchParams.get('merchant-id'),'68dd5e50f9a9491455c941be');
    return {ok:status===200,status,text:status===200?html:''};
  }};
  const result=await collectArizonaCityHive({id:'AZ'},bible,fixture.observedAt,options);
  const op=result.signals.map(s=>canonicalizeSignal(s,bible));
  const drops=buildDrops(op,bibleLookup(bible.records),op).filter(isPublicDropFeedEligible);
  return {result,drops,calls,options};
}

test('captured A1 pickup inventory adds a distinct physical premise with allocated expressions and exact source quantities',async t=>{
  const {result,drops,calls}=await run(t);
  assert.equal(calls.length,8);assert(drops.length>=4);
  assert.deepEqual(new Set(drops.map(d=>d.storeId)),new Set(['a1-liquor-phoenix:68dd5e50f9a9491455c941be']));
  for(const name of ['Buffalo Trace Bourbon','Eagle Rare 10 Year',"Blanton's Original Single Barrel",'E.H. Taylor Small Batch']) assert(result.signals.some(s=>s.canonicalName===name));
  assert(drops.every(d=>d.storeAddress==='901 E Indian School Rd, Phoenix, AZ 85014, USA' && d.quantity>0));
});

for(const scenario of ['wrong-address','wrong-merchant','miniature','sentinel','no-stock'])test(`A1 ${scenario} cannot become public inventory`,async t=>{
  const {drops}=await run(t,{mutate:products=>{for(const p of products)for(const m of p.merchants||[])for(const o of m.product_options||[]){
    if(scenario==='wrong-address')o.full_address='123 Wrong Rd, Phoenix, AZ 85014, USA';
    if(scenario==='wrong-merchant')o.merchant_id='6060f68f2641d516427b8bc6';
    if(scenario==='miniature')o.option_params.size={quantity:50,measure:'ml'};
    if(scenario==='sentinel')o.quantity=100;
    if(scenario==='no-stock')o.quantity=0;
  }}});assert.equal(drops.length,0);
});

test('A1 stops on its first denial and persists the cooldown without requesting a second page or another query',async t=>{
  const {calls,options,result}=await run(t,{status:403});assert.equal(calls.length,1);
  assert.equal(result.metadata.sourceAttempts[sourceId].httpStatus,403);
  await collectArizonaCityHive({id:'AZ'},bible,fixture.observedAt,options);assert.equal(calls.length,1);
});
