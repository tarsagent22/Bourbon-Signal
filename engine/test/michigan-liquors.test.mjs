import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {researchSourceForState,withResearchLifecycle,collectResearchStateReport} from '../src/research-state-registry.mjs';
import {
 MICHIGAN_LIQUORS_DC_BUDGET,MICHIGAN_LIQUORS_DC_SOURCE,collectMichiganLiquorsDC,
 parseMichiganLiquorsAllocatedIndex,parseMichiganLiquorsProduct,
} from '../src/collectors/michigan-liquors.mjs';

const productUrl='https://www.michiganliquors.com/spirits/Hardin-s-Creek-Clermont-Ks-Bbn-17-Yr-m9765';
const store={'@type':'LiquorStore',name:'Michigan Liquors',address:{streetAddress:'3934 12th St NE',addressLocality:'Washington',addressRegion:'DC',postalCode:'20017'},geo:{latitude:38.925525,longitude:-76.990439}};
const product=(name='Hardin\'s Creek Clermont Ks Bbn 17 Yr',size='750 mL',url=productUrl)=>({'@type':'Product',name,url,sku:'9765',size,offers:{price:'299.99',priceCurrency:'USD',availability:'https://schema.org/InStock'}});
const detailHtml=(name,size,url,quantity=2)=>'<script type="application/ld+json">'+JSON.stringify(store)+'</script><script type="application/ld+json">'+JSON.stringify(product(name,size,url))+'</script><p>'+size+' Allocated Liquor</p><span>Only <!-- -->'+quantity+'<!-- --> left in stock</span>';
const observedAt='2026-11-14T12:00:00.000Z';

test('accepts exact premise product detail with explicit current bottle count',()=>{
 const row=parseMichiganLiquorsProduct(detailHtml(undefined,undefined),{url:productUrl,observedAt});
 assert.equal(row.storeId,MICHIGAN_LIQUORS_DC_SOURCE.storeId);
 assert.equal(row.name,"Hardin's Creek Clermont Ks Bbn 17 Yr");
 assert.equal(row.quantity,2);
 assert.equal(row.price,299.99);
 assert.equal(row.availabilityStatus,'in_stock');
});

test('rejects category listing, wrong premise, sold-out and non-bottle products',()=>{
 const html=detailHtml(undefined,undefined);
 assert.equal(parseMichiganLiquorsProduct(html,{url:'https://www.michiganliquors.com/allocated',observedAt}),null);
 assert.equal(parseMichiganLiquorsProduct(html.replace('3934 12th St NE','3934 Other St NE'),{url:productUrl,observedAt}),null);
 assert.equal(parseMichiganLiquorsProduct(html.replace('Only <!-- -->2<!-- --> left in stock','Sold Out'),{url:productUrl,observedAt}),null);
 const giftUrl='https://www.michiganliquors.com/spirits/1792-Bourbon-Basic-Set-m7216';
 assert.equal(parseMichiganLiquorsProduct(detailHtml('1792 Bourbon Basic Set','EACH',giftUrl),{url:giftUrl,observedAt}),null);
});

test('candidate index requires exact allocated category cards and never implies stock',()=>{
 const html='<a href="/spirits/Blantons-Bourbon-m3062"><h3>Blantons Bourbon</h3><p>Allocated Liquor</p><span>$<!-- -->89.99</span></a>'
  +'<a href="/spirits/Standard-Bourbon-m1"><h3>Buffalo Trace Bourbon</h3><p>Bourbon</p><span>$29.99</span></a>';
 const rows=parseMichiganLiquorsAllocatedIndex(html);
 assert.equal(rows.length,1);
 assert.equal(rows[0].name,'Blantons Bourbon');
 assert.equal(rows[0].price,89.99);
 assert.equal('quantity' in rows[0],false);
 assert.deepEqual(parseMichiganLiquorsAllocatedIndex('x'.repeat(MICHIGAN_LIQUORS_DC_BUDGET.maxCategoryBytes+1)),[]);
});

test('bounded daily collector caps product requests and returns research-only lower bound',async()=>{
 const cards=Array.from({length:12},(_,i)=>'<a href="/spirits/Bourbon-'+i+'-m'+i+'"><h3>Bourbon '+i+' Bourbon</h3><p>Allocated Liquor</p><span>$<!-- -->49.99</span></a>').join('');
 const calls=[];
 const fetchText=async(url)=>{
  calls.push(url);
  if(url===MICHIGAN_LIQUORS_DC_SOURCE.inventoryUrl)return{ok:true,status:200,url,text:'12 in stock right now '+cards};
  const i=Number(url.match(/Bourbon-(\d+)-m/)[1]);
  return{ok:true,status:200,url,text:detailHtml('Bourbon '+i+' Bourbon','750 mL',url,1)};
 };
 const result=await collectMichiganLiquorsDC({fetchText,observedAt,nowMs:Date.parse(observedAt),bible:{match:()=>null}});
 assert.equal(result.status,'research_only');
 assert.equal(result.metadata.candidateCount,12);
 assert.equal(result.metadata.allocatedBourbonCandidates,12);
 assert.equal(result.metadata.reportedInStockItemCount,12);
 assert.equal(result.metadata.productRequests,MICHIGAN_LIQUORS_DC_BUDGET.maxProductRequestsPerDay);
 assert.equal(result.metadata.verifiedDistinctExpressionsLowerBound,8);
 assert.equal(result.signals.length,8);
 assert.ok(result.signals.every(row=>row.researchOnly&&!row.alertable&&!row.canAlertAsInventory&&!row.canAlertAsWatch&&!row.eligibleForDelivery));
 assert.equal(calls.length,9);
 const next=await collectMichiganLiquorsDC({fetchText,observedAt:new Date(Date.parse(observedAt)+60_000).toISOString(),nowMs:Date.parse(observedAt)+60_000,attempts:result.attempts,bible:{match:()=>null}});
 assert.equal(next.status,'not_due');
 assert.equal(next.metadata.requests.length,0);
 assert.equal(next.signals.length,8);
 assert.equal(next.signals[0].observedAt,observedAt);
});

test('DC shadow registration stays non-active and emits no alert-eligible rows',async()=>{
 const previous=process.env.BOURBON_SIGNAL_SHADOW_MODE;
 process.env.BOURBON_SIGNAL_SHADOW_MODE='1';
 const dir=await mkdtemp(path.join(os.tmpdir(),'bs-michigan-liquors-'));
 try{
  const registered=researchSourceForState('DC',{shadowMode:true});
  const lifecycle=withResearchLifecycle({activeStates:['NC'],states:{}});
  assert.ok(registered);
  assert.equal(lifecycle.activeStates.includes('DC'),false);
  assert.equal(lifecycle.states.DC.publicStatus,'research_only');
  assert.equal(lifecycle.states.DC.inventoryAlertable,false);
  const url='https://www.michiganliquors.com/spirits/Test-Bourbon-m1';
  const card='<a href="/spirits/Test-Bourbon-m1"><h3>Test Bourbon</h3><p>Allocated Liquor</p><span>$<!-- -->49.99</span></a>';
  const fetchText=async requestUrl=>requestUrl===MICHIGAN_LIQUORS_DC_SOURCE.inventoryUrl
   ?{ok:true,status:200,url:requestUrl,text:card}
   :{ok:true,status:200,url:requestUrl,text:detailHtml('Test Bourbon','750 mL',url,1)};
  const report=await collectResearchStateReport(registered,{match:()=>null},{fetchText,attemptsFile:path.join(dir,'attempts.json'),observedAt,nowMs:Date.parse(observedAt)});
  assert.equal(report.status,'partial_useful');
  assert.equal(report.metadata.researchOnly,true);
  assert.equal(report.metadata.productionActivationAllowed,false);
  assert.equal(report.metadata.customerDeliveryAllowed,false);
  assert.equal(report.signals.length,1);
  assert.ok(report.signals.every(row=>row.canAlertAsInventory===false&&row.canAlertAsWatch===false&&row.eligibleForDelivery===false));
 }finally{
  await rm(dir,{recursive:true,force:true});
  if(previous===undefined)delete process.env.BOURBON_SIGNAL_SHADOW_MODE;else process.env.BOURBON_SIGNAL_SHADOW_MODE=previous;
 }
});
