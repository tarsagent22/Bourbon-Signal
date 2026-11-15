import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {BourbonBible} from '../engine/src/core/bible.mjs';
import {canonicalizeSignal} from '../engine/src/operational-report.mjs';
import {reviewSouthDakotaPickup} from '../engine/src/research-south-dakota-retailer.mjs';
import {sources,storeId,fullAddress,southDakotaRetailerRequest,isSouthDakotaProductionOnSiteSignal,productionCohortSha256} from '../engine/src/south-dakota-pickup-policy.mjs';
import {SOUTH_DAKOTA_PRODUCTION_COHORT_SHA256,southDakotaProductionRuntimeId} from '../engine/src/collectors/south-dakota-production.mjs';
import {buildDrops,bibleLookup} from '../engine/src/export-site-contract.mjs';
import {verifySouthDakotaFirstPublication} from '../engine/src/verify-sd-first-publication.mjs';
import * as evidenceModule from '../src/lib/public-drop-evidence.ts';
import * as contractModule from '../src/lib/site-engine-contract.ts';
import * as classificationModule from '../src/lib/drop-classification.ts';

const {derivePublicDropEvidence,isPublicDropFeedEligible,normalizePublicDropEvidenceInput}=evidenceModule.default||evidenceModule;
const {normalizeDropForSite}=contractModule.default||contractModule;
const {classifyPublicDrop,getDropClassificationIndex}=classificationModule.default||classificationModule;
const fixtureByTerm=new Map([['Wild Turkey','west.json'],['Heaven Hill','south-heaven-hill.json'],['Larceny','south-larceny.json']]);
const nowMs=Date.now(),startedAt=new Date(nowMs-10_000).toISOString(),observedAt=new Date(nowMs-1000).toISOString();
const bible=await BourbonBible.load('engine/out/bourbon-bible.json');
const rows=[],requests=[];
for(const source of sources)for(const term of source.terms){
  const file=new URL(`../engine/test/fixtures/south-dakota-sante/${fixtureByTerm.get(term)}`,import.meta.url);
  const bytes=await readFile(file),payload=JSON.parse(bytes),url=southDakotaRetailerRequest(term);
  const reviewed=reviewSouthDakotaPickup(payload,source.id,bible,observedAt,url);
  assert.ok(reviewed,`retained source fixture must still match ${source.name} / ${term}`);
  for(const row of reviewed.signals)rows.push({...row,sourceRuntimeId:southDakotaProductionRuntimeId,
    sourceProductBinding:{...row.sourceProductBinding,shadowOnly:false,productionOnSiteOnly:true,productionCohortSha256:SOUTH_DAKOTA_PRODUCTION_COHORT_SHA256},
    raw:{productionOnSiteOnly:true},canAlertAsInventory:false,canAlertAsWatch:false,alertable:false,
    eligibleForOnSite:true,eligibleForDropFeed:true,eligibleForWatch:false,eligibleForDelivery:false,eligibleForEmail:false,eligibleForSms:false,
    sourceStale:false,stale:false,quarantined:false,previewOnly:false});
  requests.push({storeId:storeId(source),query:term,url,status:200,ok:true,observedAt,sha256:createHash('sha256').update(bytes).digest('hex')});
}
assert.equal(productionCohortSha256,SOUTH_DAKOTA_PRODUCTION_COHORT_SHA256);
assert.ok(rows.every(row=>isSouthDakotaProductionOnSiteSignal(row,{nowMs})));
const report={state:'SD',status:'useful',stale:false,startedAt,finishedAt:new Date(nowMs).toISOString(),lastGoodAt:observedAt,signals:rows,
  metadata:{allDeliveryDisabled:true,southDakota:{complete:true,selectedStores:sources.map(storeId),verifiedPremises:sources.map(storeId),requests,
    sourceObservedAt:observedAt,cohortSha256:SOUTH_DAKOTA_PRODUCTION_COHORT_SHA256,productionAlertDeliveryAllowed:false}}};
const canonicalSignals=report.signals.map(row=>canonicalizeSignal(row,bible));
assert.ok(canonicalSignals.every(row=>isSouthDakotaProductionOnSiteSignal(row,{nowMs})),'backend canonicalization must preserve strict SD proof');
const drops=buildDrops(canonicalSignals,bibleLookup(bible.records),canonicalSignals);
assert.equal(drops.length,3,'normal engine export must preserve all verified SD rows');
const partition={state:'SD',count:drops.length,drops};
const reportBytes=JSON.stringify(report),partitionBytes=JSON.stringify(partition);
const firstPublication=verifySouthDakotaFirstPublication({report,partition,reportBytes,partitionBytes,nowMs,workflowRunId:'43643508900'});
assert.equal(firstPublication.ok,true,firstPublication.failures.join('; '));

const classification=JSON.parse(await readFile(new URL('../src/data/drop-feed-classification.generated.json',import.meta.url),'utf8'));
const index=getDropClassificationIndex(classification.records);
const projected=drops.map(row=>normalizePublicDropEvidenceInput(classifyPublicDrop(normalizeDropForSite(row),index)));
assert.ok(projected.every(row=>row.quantity===0&&row.quantityIsExact===false),'website normalization preserves binary pickup zero');
assert.ok(projected.every(row=>isPublicDropFeedEligible(row,{asOf:nowMs})),'classified server output remains customer-eligible');
const coverage=derivePublicDropEvidence(projected,nowMs).get('SD');
assert.equal(coverage.currentInventoryStores.length,2);
assert.equal(coverage.currentInventoryCities,1);
assert.equal(coverage.alertableInventoryStores.length,0);
assert.equal(coverage.freshPublicSignalCount,3);
assert.deepEqual(new Set(coverage.currentInventoryStores.map(row=>row.address)),new Set(drops.map(row=>row.storeAddress)));
assert.ok(projected.every(row=>row.canAlertAsInventory===false&&row.canAlertAsWatch===false
  &&row.eligibleForDelivery===false&&row.eligibleForEmail===false&&row.eligibleForSms===false));
console.log(JSON.stringify({state:'SD',path:'collector fixture -> canonicalizeSignal -> buildDrops -> first-publication -> normalizeDropForSite -> classifyPublicDrop -> Coverage',
  rows:drops.length,currentStores:coverage.currentInventoryStores.length,cities:coverage.currentInventoryCities,
  alertableStores:coverage.alertableInventoryStores.length,allDeliveryDisabled:true}));
