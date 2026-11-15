import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {BourbonBible} from '../engine/src/core/bible.mjs';
import {bibleLookup,buildDrops,isSafePublicSignal} from '../engine/src/export-site-contract.mjs';
import {isNorthDakotaProductionOnSiteInventory} from '../engine/src/north-dakota-public-policy.mjs';
import {isPublicDropFeedEligible} from '../src/lib/public-drop-evidence.ts';
import {isUserFacingDropSignal} from '../src/lib/drop-feed-visibility.ts';

const bible=await BourbonBible.load(new URL('../engine/out/bourbon-bible.json',import.meta.url));
const held=JSON.parse(await readFile(new URL('../engine/test/fixtures/north-dakota/joint-run-43647207025.json',import.meta.url),'utf8'));
const nowMs=Date.now()-1_000;
const canonical=[];
for(const source of held.reportSignals){
  const row=structuredClone(source),cityHive=row.sourceProductBinding?.source==='central-cityhive';
  row.observedAt=new Date(nowMs).toISOString();row.fetchedAt=row.observedAt;
  row.sourceRuntimeId=cityHive?'nd:rock-cityhive':'nd:albertsons-xapi';
  row.sourceProductBinding={...row.sourceProductBinding,shadowOnly:false,productionOnSiteOnly:true,
    productionCohortSha256:'e4fe87fee52a06bd2ae78fa3c541dbc2b578321961a374acf6ae9a62760b767c',observedAt:row.observedAt};
  row.raw={...row.raw,shadowOnly:false};
  row.alertable=false;row.canAlertAsInventory=false;row.canAlertAsWatch=false;
  row.eligibleForOnSite=true;row.eligibleForDropFeed=true;row.eligibleForWatch=false;
  row.eligibleForDelivery=false;row.deliveryEligible=false;row.eligibleForEmail=false;row.eligibleForSms=false;
  assert.equal(isNorthDakotaProductionOnSiteInventory(row,{nowMs}),true);
  assert.equal(isSafePublicSignal(row),true);
  canonical.push(row);
}
const drops=buildDrops(canonical,bibleLookup(bible.records),canonical);
assert.equal(drops.length,3);
for(const drop of drops){
  const site={...drop,type:drop.type||drop.eventType||'retailer_store_inventory_result',stateCode:drop.state};
  assert.equal(isUserFacingDropSignal(site),true);
  assert.equal(isPublicDropFeedEligible(site,{asOf:new Date(nowMs).toISOString()}),true);
  assert.equal(site.canAlertAsInventory,false);
  assert.equal(site.canAlertAsWatch,false);
  assert.equal(site.eligibleForDelivery,false);
  const forged={...site,sourceProductBinding:{...site.sourceProductBinding,productionCohortSha256:'0'.repeat(64)}};
  assert.equal(isUserFacingDropSignal(forged),false);
  assert.equal(isPublicDropFeedEligible(forged,{asOf:new Date(nowMs).toISOString()}),false);
}
console.log(JSON.stringify({state:'ND',rows:drops.length,stores:new Set(drops.map(row=>row.storeId)).size,
  appVisibility:true,publicFeed:true,alerts:false,delivery:false}));
