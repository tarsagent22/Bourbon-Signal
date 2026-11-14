import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {verifyMinnesotaFirstPublication} from '../src/verify-mn-first-publication.mjs';

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

test('first publication CI migration uses a source-proven canary site and keeps lifecycle dormant',async()=>{
  const [migration,wrapper,manifest,workflow]=await Promise.all([
    readFile(new URL('../../scripts/prepare-legacy-site-fixture-ci.mjs',import.meta.url),'utf8'),
    readFile(new URL('../../scripts/verify-active-state-integration-ci.mjs',import.meta.url),'utf8'),
    readFile(new URL('../data/state-integration/MN.json',import.meta.url),'utf8').then(JSON.parse),
    readFile(new URL('../../.github/workflows/refresh-feed.yml',import.meta.url),'utf8'),
  ]);
  assert.match(migration,/VERIFIED_LATER_ADDITIONS=\[[^\]]*'MN'/);
  assert.match(wrapper,/\['MN',MN_SITE\]/);assert.match(wrapper,/reviewedSite===MN_SITE/);
  assert.equal(manifest.lifecycle.publicStatus,'research_only');
  assert.match(workflow,/startsWith\(inputs\.incident_key, 'minnesota-first-publication-'\)/);
});
