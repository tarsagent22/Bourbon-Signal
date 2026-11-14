import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { BourbonBible } from '../src/core/bible.mjs';
import { collectCentralCityHiveExpansion } from '../src/collectors/central-cityhive-expansion.mjs';
import { CENTRAL_CITYHIVE_PRODUCTION_SOURCES } from '../src/collectors/central-cityhive-premises.mjs';
import { CENTRAL_CITYHIVE_PRODUCTION_COHORTS } from '../src/collectors/central-cityhive-premises.mjs';
import { centralCityHiveProductionCohortKey, CENTRAL_CITYHIVE_PRODUCTION_BUDGETS, CENTRAL_CITYHIVE_PRODUCTION_STATES } from '../src/central-cityhive-production-config.mjs';
import { collectCentralCityHiveProductionSource, centralCityHiveProductionAllowed } from '../src/collectors/central-cityhive-production.mjs';
import { STATE_LIFECYCLE_CONFIG } from '../src/state-lifecycle.mjs';
import { verifyMarylandFirstPublication } from '../src/verify-md-first-publication.mjs';

const fixtureRoot=new URL('./fixtures/md-cityhive/',import.meta.url);
const fixtureByStore=new Map([
  ['greenbelt-liquors-md:6060f47c27f7c71989f0749c','greenbelt-blantons-original.json'],
  ['ye-old-spirit-shop:66b394ae65806d296ede036c','frederick-eagle-rare-10.json'],
  ['west-o-bottle-shop:60e51c65666bdc65c3bcda63','ocean-city-elijah-craig-bp.json'],
  ['euro-liquors-md:60456c4f88762f7bda9d7be0','owings-mills-elijah-craig-bp.json'],
]);
const bible=await BourbonBible.load(new URL('../out/bourbon-bible.json',import.meta.url));

test('Maryland runtime stays dormant and has a closed four-premise eight-request budget',async()=>{
  const sources=CENTRAL_CITYHIVE_PRODUCTION_SOURCES.filter(source=>source.state==='MD');
  assert.ok(CENTRAL_CITYHIVE_PRODUCTION_STATES.includes('MD'));
  assert.equal(sources.length,4);
  assert.equal(centralCityHiveProductionCohortKey('MD'),CENTRAL_CITYHIVE_PRODUCTION_COHORTS.MD);
  assert.deepEqual(sources.map(source=>source.storeId),[
    'greenbelt-liquors-md:6060f47c27f7c71989f0749c','ye-old-spirit-shop:66b394ae65806d296ede036c',
    'west-o-bottle-shop:60e51c65666bdc65c3bcda63','euro-liquors-md:60456c4f88762f7bda9d7be0',
  ]);
  assert.deepEqual(CENTRAL_CITYHIVE_PRODUCTION_BUDGETS.MD,{sourceMs:50_000,stateMs:60_000,maxRequests:8,requestTimeoutMs:4_000});
  assert.equal(STATE_LIFECYCLE_CONFIG.activeStates.includes('MD'),false);
  assert.equal(centralCityHiveProductionAllowed('MD',STATE_LIFECYCLE_CONFIG),false);
  let requests=0;
  const result=await collectCentralCityHiveProductionSource({id:'MD'},bible,{fetchText:async()=>{requests++;throw Error('inactive Maryland must not perform HTTP');}});
  assert.equal(result.metadata.blockedByPromotion,true);
  assert.equal(requests,0);
});

test('Maryland first publication binds exact MD inventory and the separate Montgomery aggregate partition',async t=>{
  const directory=await mkdtemp(path.join(tmpdir(),'md-first-publish-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  const nowMs=Date.now()-60_000,observedAt=new Date(nowMs).toISOString();
  const responses=new Map(await Promise.all([...fixtureByStore].map(async([storeId,file])=>{
    const source=CENTRAL_CITYHIVE_PRODUCTION_SOURCES.find(row=>row.state==='MD'&&row.storeId===storeId);
    return[source.hostname,await readFile(new URL(file,fixtureRoot),'utf8')];
  })));
  const collected=await collectCentralCityHiveExpansion({id:'MD'},bible,{
    observedAt,nowMs,cursorDir:path.join(directory,'cursor'),sleep:async()=>{},
    fetchText:async url=>({ok:true,status:200,url,text:`<script type="application/json">${responses.get(new URL(url).hostname)}</script>`}),
  });
  assert.equal(collected.metadata.complete,true);
  assert.equal(collected.metadata.requests.length,8);
  const cohort=centralCityHiveProductionCohortKey('MD');
  const signals=collected.signals.map(row=>({...row,sourceRuntimeId:'md:central-cityhive',canAlertAsInventory:false,
    can_alert_as_inventory:false,canAlertAsWatch:false,can_alert_as_watch:false,alertable:false,
    eligibleForOnSite:true,eligibleForDropFeed:true,eligibleForWatch:false,eligibleForDelivery:false,deliveryEligible:false,
    eligibleForEmail:false,eligibleForSms:false,
    sourceProductBinding:{...row.sourceProductBinding,productionOnSiteOnly:true,productionCohortSha256:cohort}}));
  const meta={...collected.metadata,cohortSha256:cohort,sourceObservedAt:observedAt,productionAlertDeliveryAllowed:false};
  const report={state:'MD',status:'useful',stale:false,startedAt:new Date(nowMs-1000).toISOString(),finishedAt:new Date(nowMs+1000).toISOString(),
    lastGoodAt:observedAt,signals,metadata:{cityhive:meta,allDeliveryDisabled:true}};
  const partition={state:'MD',count:signals.length,drops:signals};
  const countyPartition={state:'MD-MONTGOMERY',generatedAt:observedAt,count:1,drops:[{
    state:'MD-MONTGOMERY',type:'county_inventory_aggregate',locationPrecision:'store_aggregate',observedAt,
    canAlertAsInventory:false,canAlertAsWatch:false,eligibleForOnSite:false,eligibleForDelivery:false,eligibleForEmail:false,eligibleForSms:false,
  }]};
  const check=verifyMarylandFirstPublication({report,partition,countyPartition,nowMs,workflowRunId:'43626153633'});
  assert.equal(check.ok,true,check.failures.join('; '));
  assert.equal(check.receipt.publishedStores,4);
  assert.equal(check.receipt.allocatedRows>0,true);
  assert.equal(check.receipt.countyPartition.rows,1);
  assert.equal(check.receipt.allDeliveryChannelsDisabled,true);
  assert.match(check.receipt.sourceReportSha256,/^[a-f0-9]{64}$/);
  assert.match(check.receipt.partitionSha256,/^[a-f0-9]{64}$/);
  assert.match(check.receipt.countyPartition.sha256,/^[a-f0-9]{64}$/);

  const countyMixed=structuredClone(partition);countyMixed.drops.push({...countyPartition.drops[0]});countyMixed.count++;
  assert.equal(verifyMarylandFirstPublication({report,partition:countyMixed,countyPartition,nowMs,workflowRunId:'43626153633'}).ok,false);
  const countyIdentity=structuredClone(countyPartition);countyIdentity.drops[0].storeId='fake-exact-store';
  assert.equal(verifyMarylandFirstPublication({report,partition,countyPartition:countyIdentity,nowMs,workflowRunId:'43626153633'}).ok,false);
  const partial=structuredClone(partition);partial.drops=partial.drops.slice(0,2);partial.count=partial.drops.length;
  assert.equal(verifyMarylandFirstPublication({report,partition:partial,countyPartition,nowMs,workflowRunId:'43626153633'}).ok,false);
  const badQuery=structuredClone(report);badQuery.metadata.cityhive.requests[1].url=badQuery.metadata.cityhive.requests[0].url;
  assert.equal(verifyMarylandFirstPublication({report:badQuery,partition,countyPartition,nowMs,workflowRunId:'43626153633'}).ok,false);
  const enabled=structuredClone(report);enabled.signals[0].eligibleForDelivery=true;
  assert.equal(verifyMarylandFirstPublication({report:enabled,partition,countyPartition,nowMs,workflowRunId:'43626153633'}).ok,false);
});
