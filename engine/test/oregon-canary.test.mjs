import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {stableId} from '../src/core/text.mjs';
import {OREGON_DAILY_INVENTORY_URL} from '../src/or-daily-inventory.mjs';
import {isOregonDailyCanaryPreviewEvidence} from '../src/oregon-daily-production-policy.mjs';
import {prepareOregonCanary} from '../src/prepare-oregon-canary.mjs';
import {validateStateFixtures} from '../src/verify-state-fixtures.mjs';
import {executeOregonResearchFixtures} from '../src/oregon-research-fixtures.mjs';
import {validateOregonShadowOrigin} from '../../scripts/download-oregon-shadow.mjs';

const observedAt='2026-11-13T08:00:00.000Z',generatedAt='2026-11-14T06:17:18.980Z',sourceReportDate='11/13/2026';
const record={id:'eagle-rare',canonical:'Eagle Rare 10 Year',tier:'allocated',libraryAlertEligible:true,aliases:['Eagle Rare 10 Year']};
const bible={records:[record],match(name){return /eagle rare/i.test(String(name))?{record,method:'exact-normalized-alias',confidence:1}:null;}};
const sourceReport=()=>({schemaVersion:'bourbon-signal-or-product-availability-v1',status:'ready',sourceUrl:OREGON_DAILY_INVENTORY_URL,
  generatedAt,sourceReportDate,sourceBytes:1234,sourceSha256:'a'.repeat(64),bible:{mode:'live'},products:[{itemCode:'2170B',newItemCode:'N2170B',name:'EAGLE RARE S/B BOURBON',identityCandidate:'Eagle Rare 10 Year',
    canonicalBottleId:record.id,canonicalName:record.canonical,rarityTier:'allocated',size:'750 ML',proof:90,bottlePrice:82.95,stores:[{storeNo:'1001',storeName:'Condon',address:'225 S Main Street',city:'CONDON',zip:'97823',quantity:3,inventoryObservedAt:observedAt,inventoryDate:'11/13/2026'}]}]});
const shadowSummary=()=>({mode:'shadow',complete:true,generatedAt:'2026-11-14T06:17:31.300Z',results:[{state:'OR',complete:true,outcome:'complete',
  publication:{allowed:false,productionSnapshotTouched:false},alerts:{disabled:true,deliveryAttempted:false}}]});
const shadowReport=()=>({state:'OR',status:'useful',startedAt:'2026-11-14T06:17:31.194Z',finishedAt:'2026-11-14T06:17:31.228Z',
  sources:[{ok:true,url:OREGON_DAILY_INVENTORY_URL}],signals:[{id:stableId(['OR','or-daily-store',record.id,'750 ML',90,'1001']),state:'OR',sourceUrl:OREGON_DAILY_INVENTORY_URL,
    sourceLabel:'Oregon OLCC Daily Store Inventory',fetchedAt:generatedAt,raw:{sourceReportDate},sourceAvailabilityVerified:true,canAlertAsInventory:false,
    canAlertAsWatch:false,eligibleForDelivery:false,eligibleForEmail:false,eligibleForSms:false,locationPrecision:'store_level',storeId:'1001',
    storeAddress:'225 S Main Street, CONDON, OR, 97823',quantity:3,canonicalBottleId:record.id,canonicalName:record.canonical,rawName:'EAGLE RARE S/B BOURBON',observedAt}]});
const provenance={status:'verified_github_oregon_report_artifacts',state:'OR',repository:'tarsagent22/Bourbon-Signal',workflowRunId:'123',
  headSha:'b'.repeat(40),sourceArtifactDigest:'c'.repeat(64),shadowArtifactDigest:'d'.repeat(64)};

test('Oregon official report replays exact rows, retains source clocks, and disables every alert channel',()=>{
  const result=prepareOregonCanary({sourceReport:sourceReport(),shadowSummary:shadowSummary(),shadowReport:shadowReport(),provenance,bible,nowMs:Date.parse('2026-11-14T07:00:00.000Z')});
  assert.equal(result.drops.length,1);assert.equal(result.drops[0].observedAt,observedAt);assert.equal(result.sourceReportDate,sourceReportDate);
  for(const key of ['canAlertAsInventory','canAlertAsWatch','alertable','eligibleForDelivery','deliveryEligible','eligibleForEmail','eligibleForSms'])assert.equal(result.drops[0][key],false);
  assert.equal(result.drops[0].previewOnly,true);assert.equal(result.policy.productionActivationAllowed,false);
  assert.equal(isOregonDailyCanaryPreviewEvidence(result.drops[0]),true);
  for(const mutation of [{sourceProductBinding:{...result.drops[0].sourceProductBinding,reportSha256:'not-a-sha256'}},
    {quantity:result.drops[0].quantity+1},{raw:{...result.drops[0].raw,shadowOnly:true}},{canAlertAsInventory:true}])
    assert.equal(isOregonDailyCanaryPreviewEvidence({...result.drops[0],...mutation}),false);
});

test('Oregon canary rejects stale report dates, changed revisions, or alert-authorizing summaries',()=>{
  const args={sourceReport:sourceReport(),shadowSummary:shadowSummary(),shadowReport:shadowReport(),provenance,bible,nowMs:Date.parse('2026-11-14T07:00:00.000Z')};
  assert.throws(()=>prepareOregonCanary({...args,nowMs:Date.parse('2026-11-17T07:00:00.000Z')}),/stale|freshness/);
  const changed=shadowReport();changed.signals[0].raw.sourceReportDate='11/12/2026';
  assert.throws(()=>prepareOregonCanary({...args,shadowReport:changed}),/official report revision/);
  const active=shadowSummary();active.results[0].publication.allowed=true;
  assert.throws(()=>prepareOregonCanary({...args,shadowSummary:active}),/nonpublishing OR observation with alerts disabled/);
});

test('Oregon downloader provenance binds both artifacts and the exact saved report revision',()=>{
  const run={id:123,conclusion:'success',status:'completed',repository:{full_name:'tarsagent22/Bourbon-Signal'},path:'.github/workflows/state-expansion-shadow.yml',head_sha:'b'.repeat(40)};
  const artifact=(name,id,digest)=>({name,id:String(id),digest:`sha256:${digest}`,size_in_bytes:100,expired:false});
  const result=validateOregonShadowOrigin({run,sourceArtifact:artifact('oregon-inventory-source-123',456,'c'.repeat(64)),
    shadowArtifact:artifact('state-expansion-shadow-123',789,'d'.repeat(64)),currentHead:run.head_sha,shadowSummary:shadowSummary(),
    sourceReport:sourceReport(),shadowReport:shadowReport()});
  assert.equal(result.status,'verified_github_oregon_report_artifacts');assert.equal(result.workflowRunId,'123');
  assert.throws(()=>validateOregonShadowOrigin({run,sourceArtifact:artifact('wrong',456,'c'.repeat(64)),
    shadowArtifact:artifact('state-expansion-shadow-123',789,'d'.repeat(64)),currentHead:run.head_sha,shadowSummary:shadowSummary(),
    sourceReport:sourceReport(),shadowReport:shadowReport()}),/artifact/);
});

test('Oregon fixture contract executes the source parser, identity, date, and alert semantics',async()=>{
  const fixture=JSON.parse(await readFile(new URL('../data/state-fixtures/OR.json',import.meta.url),'utf8'));
  assert.equal(validateStateFixtures(fixture).ok,true);assert.deepEqual(executeOregonResearchFixtures(fixture,{bible}),{ok:true,failures:[]});
});
