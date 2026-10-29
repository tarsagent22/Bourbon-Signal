import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {BourbonBible} from '../src/core/bible.mjs';
import {NEW_ENGLAND_RESEARCH_SOURCES,parseNewEnglandResearchInventory} from '../src/collectors/new-england-research.mjs';
import {STATE_LIFECYCLE_CONFIG} from '../src/state-lifecycle.mjs';
import {STATE_SOURCES} from '../src/state-sources.mjs';
const root=new URL('../data/source-evidence/new-england-research-20261029/',import.meta.url);
const evidence=JSON.parse(await readFile(new URL('receipts.json',root),'utf8'));
const bible=new BourbonBible(JSON.parse(await readFile(new URL('./fixtures/new-england/library.json',import.meta.url),'utf8')).records);
async function capture(source){
  const receipt=evidence.receipts.find(row=>row.url===source.discoveryUrl),compressed=await readFile(new URL(receipt.artifactPath,root));
  assert.equal(createHash('sha256').update(compressed).digest('hex'),receipt.compressedSha256);
  const body=gunzipSync(compressed,{maxOutputLength:2*1024*1024});
  assert.equal(body.length,receipt.bytes);assert.equal(createHash('sha256').update(body).digest('hex'),receipt.sha256);
  return{receipt,html:body.toString('utf8')};
}
function mutateCapture(html,mutate){
  const roots=[];
  for(const match of html.matchAll(/decodeURIComponent\(\s*(["'`])([\s\S]*?)\1\s*\)/g))try{roots.push(JSON.parse(decodeURIComponent(match[2])));}catch{}
  assert.ok(roots.length>0);let count=0;
  const walk=value=>{if(++count>80000||!value||typeof value!=='object')return;mutate(value);for(const child of Object.values(value))if(child&&typeof child==='object')walk(child);};
  roots.forEach(walk);return'<script type="application/json">'+JSON.stringify(roots)+'</script>';
}
test('seven exact observed premises survive current library matching with original clocks and no customer eligibility',async()=>{
  const all=[];
  for(const source of NEW_ENGLAND_RESEARCH_SOURCES){const{receipt,html}=await capture(source),rows=parseNewEnglandResearchInventory(html,source,bible,{observedAt:receipt.observedAt,nowMs:Date.parse(receipt.observedAt)+1000});
    assert.ok(rows.length>0,source.name);all.push(...rows);
    assert.ok(rows.every(row=>row.storeId===source.storeId&&row.storeAddress===source.address&&row.observedAt===receipt.observedAt
      &&row.quantity===0&&row.quantityIsExact===false&&row.raw.shadowOnly&&row.sourceProductBinding.shadowOnly
      &&row.sourceProductBinding.optionPickupRestrictionVerified&&row.sourceProductBinding.preorderExcluded));
    for(const flag of['canAlertAsInventory','canAlertAsWatch','alertable','eligibleForOnSite','eligibleForDropFeed','eligibleForWatch','eligibleForDelivery','deliveryEligible','eligibleForEmail','eligibleForSms'])assert.ok(rows.every(row=>row[flag]===false),flag);
  }
  assert.equal(all.length,13);assert.equal(new Set(all.map(row=>row.storeId)).size,7);
  assert.equal(all.filter(row=>row.state==='CT').length,5);assert.equal(all.filter(row=>row.state==='RI').length,3);assert.equal(all.filter(row=>row.state==='MA').length,5);
  for(const state of['MA','CT','RI']){assert.equal(STATE_SOURCES.some(source=>source.id===state),STATE_LIFECYCLE_CONFIG.activeStates.includes(state));}
});
test('foreign premises, shipping-only options, preorder, stale clocks and changed coordinates fail closed',async()=>{
  const source=NEW_ENGLAND_RESEARCH_SOURCES.find(row=>row.chainId==='golds-wine'),{receipt,html}=await capture(source);
  const options={observedAt:receipt.observedAt,nowMs:Date.parse(receipt.observedAt)+1000};
  for(const mutate of[
    value=>{if(value.option_id)value.allowed_offer_types=['shipping'];},
    value=>{if(value.option_id)value.preorder_details={available_at:'2030-01-01'};},
    value=>{if(value.option_id)delete value.allowed_offer_types;},
    value=>{if(value.merchant?.address)value.merchant.address.location.coordinates[0]=0;},
    value=>{if(value.merchant?.address)value.merchant.address.full_address='999 Other Street';},
    value=>{if(value.option_id)value.merchant_id='foreign';},
    value=>{if(value.option_id)value.product_url=value.product_url?.replace(source.baseUrl,'https://foreign.invalid');},
  ])assert.deepEqual(parseNewEnglandResearchInventory(mutateCapture(html,mutate),source,bible,options),[]);
  assert.deepEqual(parseNewEnglandResearchInventory(html,{...source},bible,options),[]);
  assert.deepEqual(parseNewEnglandResearchInventory(html,source,bible,{...options,nowMs:Date.parse(receipt.observedAt)+121*60000}),[]);
  const disabled=new BourbonBible(structuredClone(bible.records).map(row=>({...row,libraryAlertEligible:false})));
  assert.deepEqual(parseNewEnglandResearchInventory(html,source,disabled,options),[]);
});
test('known denial and mismatched official address remain explicit exclusions',()=>{
  const exclusions=evidence.exclusions.map(row=>row.source);
  assert.ok(exclusions.includes('Wines and More Milford'));assert.ok(exclusions.includes('Haxtons Tollgate'));
  assert.ok(!NEW_ENGLAND_RESEARCH_SOURCES.some(row=>row.hostname==='haxtons.com'||row.hostname==='winesandmoremilford.com'));
});
