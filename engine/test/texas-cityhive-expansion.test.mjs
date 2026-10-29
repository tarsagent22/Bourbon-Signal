import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {BourbonBible} from '../src/core/bible.mjs';
import {TEXAS_CITYHIVE_EXPANSION_SOURCES,parseCentralCityHiveInventory} from '../src/collectors/central-cityhive-expansion.mjs';
import {collectTexasCityHiveExpansion,isTexasExpansionSignalIdentity} from '../src/collectors/texas-cityhive-expansion.mjs';
import {isTexasRetailerInventory} from '../src/texas-retailer-policy.mjs';
import {canonicalizeSignal} from '../src/operational-report.mjs';
import {bibleLookup,buildDrops,buildCurrentInventoryAlertsFromDrops} from '../src/export-site-contract.mjs';

const bible=await BourbonBible.load(new URL('../out/bourbon-bible.json',import.meta.url));
const captures=Object.fromEntries(await Promise.all([...new Set(TEXAS_CITYHIVE_EXPANSION_SOURCES.map(s=>s.chainId))].map(async id=>[id,JSON.parse(await readFile(new URL(`./fixtures/texas-cityhive-expansion/${id}.json`,import.meta.url),'utf8'))])));
const html=f=>`<script>JSON.parse(decodeURIComponent("${encodeURIComponent(JSON.stringify(f))}"))</script>`;
const at=Object.values(captures)[0].capturedAt;
const replay=()=>TEXAS_CITYHIVE_EXPANSION_SOURCES.flatMap(s=>parseCentralCityHiveInventory(html(captures[s.chainId]),s,bible,{observedAt:at}));

test('captured new Texas premises survive operational, public drop and current alert projection',t=>{
  t.mock.timers.enable({apis:['Date'],now:Date.parse(at)+60000});
  const signals=replay();
  assert.ok(signals.length>=4);
  assert.equal(new Set(signals.map(r=>r.storeId)).size,4);
  assert.ok(signals.every(isTexasRetailerInventory));
  const operational=signals.map(r=>canonicalizeSignal(r,bible));
  const drops=buildDrops(operational,bibleLookup(bible.records),operational);
  const current=buildCurrentInventoryAlertsFromDrops(drops);
  assert.equal(new Set(current.map(r=>r.storeId)).size,4);
  assert.ok(current.every(r=>r.quantity===0&&r.quantityIsExact===false));
  assert.ok(current.every(r=>Number.isFinite(r.lat)&&Number.isFinite(r.lng)));
  assert.ok(current.every(isTexasRetailerInventory));
});

test('Texas expansion proof rejects changed address, variant, source and product binding',()=>{
  const row=replay()[0];assert.ok(row);
  for(const change of [
    {storeAddress:'Other Address'}, {sourceUrl:'https://attacker.invalid/shop/product/x/y'},
    {optionId:'wrong'}, {productId:'wrong'}, {merchantId:'wrong'},
    {quantity:100}, {quantityIsExact:true}, {sourceProductBinding:{...row.sourceProductBinding,price:1}},
    {lat:0},{lng:0},
  ])assert.equal(isTexasExpansionSignalIdentity({...row,...change}),false);
});

test('changed runtime merchant coordinates cannot reuse a reviewed premise geocode',()=>{
  const source=TEXAS_CITYHIVE_EXPANSION_SOURCES[0],capture=structuredClone(captures[source.chainId]);
  capture.merchant_configs.find(c=>c.merchant.id===source.merchantId).merchant.address.location.coordinates[0]=0;
  assert.deepEqual(parseCentralCityHiveInventory(html(capture),source,bible,{observedAt:at}),[]);
});

test('bounded Texas refresh checks two terms per reviewed store and reuses only original fresh evidence',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'tx-expansion-'));let calls=0;
  try{
    const options={cacheFile:path.join(dir,'cache.json'),cursorDir:path.join(dir,'cursors'),observedAt:at,nowMs:Date.parse(at),sleep:async()=>{},
      fetchText:async url=>{calls++;const s=TEXAS_CITYHIVE_EXPANSION_SOURCES.find(s=>s.merchantId===new URL(url).searchParams.get('merchant-id'));return{ok:true,status:200,text:html(captures[s.chainId])}}};
    const first=await collectTexasCityHiveExpansion({id:'TX'},bible,options);
    assert.equal(calls,TEXAS_CITYHIVE_EXPANSION_SOURCES.length*2);
    assert.ok(first.signals.length>=4);
    const second=await collectTexasCityHiveExpansion({id:'TX'},bible,{...options,nowMs:Date.parse(at)+60000,observedAt:new Date(Date.parse(at)+60000).toISOString()});
    assert.equal(calls,TEXAS_CITYHIVE_EXPANSION_SOURCES.length*2);
    assert.equal(second.signals.length,first.signals.length);
    assert.ok(second.signals.every(r=>r.observedAt===at));
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('one chain denial ends every remaining store request on that hostname',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'tx-expansion-denial-'));const hosts=[];
  try{
    await collectTexasCityHiveExpansion({id:'TX'},bible,{cacheFile:path.join(dir,'cache.json'),cursorDir:path.join(dir,'cursors'),observedAt:at,nowMs:Date.parse(at),sleep:async()=>{},fetchText:async url=>{hosts.push(new URL(url).hostname);return{ok:false,status:403,text:''}}});
    assert.equal(hosts.length,4);assert.equal(new Set(hosts).size,4);
  }finally{await rm(dir,{recursive:true,force:true});}
});
