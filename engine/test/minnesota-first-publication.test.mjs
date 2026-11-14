import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {verifyMinnesotaFirstPublication} from '../src/verify-mn-first-publication.mjs';
import {MINNESOTA_CITYHIVE_PRODUCTION_SOURCES as sources,selectMinnesotaProductionSources} from '../src/minnesota-cityhive-production-config.mjs';

test('actual hosted MN canary partition cannot satisfy a first-production check',async()=>{
  const base=new URL('../data/canary-site/minnesota-20261114/',import.meta.url);
  const [proofBytes,partitionBytes]=await Promise.all(['source-proof.json','states/MN/drops.json'].map(file=>readFile(new URL(file,base))));
  const proof=JSON.parse(proofBytes),partition=JSON.parse(partitionBytes);
  assert.equal(proof.mode,'reviewed_ci_only_canary_extract');assert.equal(proof.productionSnapshotTouched,false);
  assert.equal(proof.runs[0].canaryRunId,'43594988302');
  assert.equal(proof.runs[0].partitionSha256,createHash('sha256').update(partitionBytes).digest('hex'));
  const result=verifyMinnesotaFirstPublication({workflowRunId:'43594988302',nowMs:Date.parse('2026-11-14T12:27:52.000Z'),
    stateReport:{state:'MN',status:'useful',stale:false,startedAt:'2026-11-14T12:27:14.000Z',finishedAt:'2026-11-14T12:27:51.000Z',
      signals:partition.drops,metadata:{allDeliveryDisabled:true,cityhive:{}}},partition,reportBytes:Buffer.from('{}'),partitionBytes});
  assert.equal(result.ok,false);assert.equal(result.receipt,null);
  assert.ok(result.failures.some(failure=>failure.includes('production-bound MN pickup rows')));
  assert.ok(result.failures.some(failure=>failure.includes('complete fresh bounded source observation')));
});

test('first publication CI migration uses source-proven canary site and requires an explicit production first-publication check',async()=>{
  const [migration,wrapper,manifest,workflow]=await Promise.all([
    readFile(new URL('../../scripts/prepare-legacy-site-fixture-ci.mjs',import.meta.url),'utf8'),
    readFile(new URL('../../scripts/verify-active-state-integration-ci.mjs',import.meta.url),'utf8'),
    readFile(new URL('../data/state-integration/MN.json',import.meta.url),'utf8').then(JSON.parse),
    readFile(new URL('../../.github/workflows/refresh-feed.yml',import.meta.url),'utf8'),
  ]);
  assert.match(migration,/VERIFIED_LATER_ADDITIONS=\[[^\]]*'MN'/);
  assert.match(wrapper,/\['MN',MN_SITE\]/);assert.match(wrapper,/reviewedSite===MN_SITE/);
  assert.equal(manifest.lifecycle.publicStatus,'active');
  assert.equal(manifest.evidence.production.status,'awaiting_first_publication');
  assert.match(workflow,/startsWith\(inputs\.incident_key, 'minnesota-first-publication-'\)/);
});

test('first publication verifier rejects requests outside each selected MN merchant scope',()=>{
  const selected=selectMinnesotaProductionSources(0);
  const requestRows=selected.flatMap(source=>[0,1].map(index=>({sourceId:source.id,ok:true,status:200,
    url:`${source.baseUrl}/shop/?ch-query=${encodeURIComponent(index?'eagle rare':'barrel proof')}&merchant-id=${source.merchantId}`})));
  const meta={complete:true,selectedStores:selected.map(row=>row.storeId),verifiedPremises:selected.map(row=>row.storeId),
    rotationIndex:0,requests:requestRows,cohortSha256:'f8966ff41632ffe3d8f9dc06136bcaa453c7e0177cd3bc991dbd96baae197c74',
    fullCohortStoreCount:sources.length,rotationBatchSize:selected.length,sourceObservedAt:'2026-11-14T13:00:00.000Z',exhaustiveCatalogVerified:false};
  const base={stateReport:{state:'MN',status:'useful',stale:false,startedAt:'2026-11-14T12:59:00.000Z',finishedAt:'2026-11-14T13:01:00.000Z',
    lastGoodAt:meta.sourceObservedAt,metadata:{allDeliveryDisabled:true,cityhive:meta},signals:[]},partition:{state:'MN',count:0,drops:[]},workflowRunId:'999999'};
  const good=verifyMinnesotaFirstPublication({...base,nowMs:Date.parse('2026-11-14T13:02:00.000Z')});
  assert.ok(good.failures.some(failure=>failure.includes('production-bound MN pickup rows')));
  assert.equal(good.failures.some(failure=>failure.includes('scoped to the selected merchants')),false,'exact merchant request profile should pass its own gate');
  const wrongMerchant={...meta,requests:requestRows.map((row,index)=>index===0?{...row,url:row.url.replace(/merchant-id=[^&]+/,'merchant-id=unreviewed')}:row)};
  const rejected=verifyMinnesotaFirstPublication({...base,stateReport:{...base.stateReport,metadata:{...base.stateReport.metadata,cityhive:wrongMerchant}},
    nowMs:Date.parse('2026-11-14T13:02:00.000Z')});
  assert.ok(rejected.failures.some(failure=>failure.includes('scoped to the selected merchants')));
  const wrongSource={...meta,requests:requestRows.map((row,index)=>index===0?{...row,sourceId:'unreviewed:merchant'}:row)};
  const sourceRejected=verifyMinnesotaFirstPublication({...base,stateReport:{...base.stateReport,metadata:{...base.stateReport.metadata,cityhive:wrongSource}},
    nowMs:Date.parse('2026-11-14T13:02:00.000Z')});
  assert.ok(sourceRejected.failures.some(failure=>failure.includes('scoped to the selected merchants')));
});
