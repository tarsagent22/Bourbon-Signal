import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { verifyKansasFirstPublication } from '../src/verify-ks-first-publication.mjs';
import { STATE_LIFECYCLE_CONFIG } from '../src/state-lifecycle.mjs';
import { readFile as readFixture } from 'node:fs/promises';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { BourbonBible } from '../src/core/bible.mjs';
import { ALL_STATE_SOURCES } from '../src/state-sources.mjs';
import { collectCentralCityHiveProductionSource } from '../src/collectors/central-cityhive-production.mjs';
import { canonicalizeSignal } from '../src/operational-report.mjs';
import { buildDrops, bibleLookup } from '../src/export-site-contract.mjs';
import { syntheticCentralPromotion, bibleFile } from './helpers/synthetic-central-production.mjs';

const bible = await BourbonBible.load(bibleFile);

test('Kansas first-publication contract stays fail closed until a fresh production cohort exists', async () => {
  const manifest = JSON.parse(await readFile(new URL('../data/state-integration/KS.json', import.meta.url), 'utf8'));
  assert.equal(manifest.lifecycle.publicStatus, 'active');
  assert.equal(manifest.customerPaths.finder.status, 'verified');
  assert.equal(STATE_LIFECYCLE_CONFIG.activeStates.at(-1), 'KS');
  assert.equal(STATE_LIFECYCLE_CONFIG.states.KS.promotionStage, 'active');
  assert.equal(STATE_LIFECYCLE_CONFIG.states.KS.inventoryAlertable, false);
  assert.equal(STATE_LIFECYCLE_CONFIG.reliabilityPolicy.stateExpectedRunMs.KS, 15_000);
  assert.equal(verifyKansasFirstPublication({report:{state:'KS',status:'not_promoted',stale:false},partition:{state:'KS',count:0,drops:[]}}).ok,false);
});

test('Kansas first-publication contract rejects incomplete or cached cohorts even with allocated rows', () => {
  const report = { state:'KS',status: 'useful', stale: false, metadata: { allDeliveryDisabled: true,
    cityhive: { complete: true, cacheReused: true, selectedStores: [], verifiedPremises: [] } } };
  assert.equal(verifyKansasFirstPublication({report,partition:{state:'KS',count:0,drops:[]},workflowRunId:'1'}).ok,false);
  report.metadata.cityhive.cacheReused = false;
  report.metadata.cityhive.complete = false;
  assert.equal(verifyKansasFirstPublication({report,partition:{state:'KS',count:0,drops:[]},workflowRunId:'1'}).ok,false);
});

test('Kansas first-publication verifier accepts only its reviewed silent three-city fixture projection', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'ks-first-publish-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const nowMs = Date.now()-60_000;
  const root = new URL('./fixtures/ks-cityhive/', import.meta.url);
  const manifest = JSON.parse(await readFixture(new URL('receipts.json', root), 'utf8'));
  const captures = new Map(await Promise.all(manifest.captures.map(async receipt => [
    receipt.fixture, await readFixture(new URL(receipt.fixture, root), 'utf8'),
  ])));
  const fixtures = new Map([
    ['kingsliquorolathe.com', 'kings-weller-special-reserve.json'],
    ['vernsliquor.com', 'verns-larceny-barrel-proof.json'],
    ['rjdiscountliquor.com', 'rj-elijah-and-larceny-barrel-proof.json'],
  ]);
  const admission = syntheticCentralPromotion('KS');
  const result = await collectCentralCityHiveProductionSource(ALL_STATE_SOURCES.find(state => state.id === 'KS'), bible, {
    ...admission, nowMs, cacheDir: path.join(directory, 'cache'), incidentDir: path.join(directory, 'incidents'),
    fetchText: async url => ({ ok: true, status: 200, url,
      text: `<script type="application/json">${captures.get(fixtures.get(new URL(url).hostname))}</script>` }),
  });
  const drops = buildDrops(result.signals.map(row => canonicalizeSignal(row, bible)), bibleLookup(bible.records), result.signals);
  const report={state:'KS',status:'useful',stale:false,startedAt:new Date(nowMs-1000).toISOString(),finishedAt:new Date(nowMs+1000).toISOString(),
    lastGoodAt:result.metadata.sourceObservedAt,signals:result.signals,metadata:{cityhive:result.metadata,allDeliveryDisabled:true}};
  const check = verifyKansasFirstPublication({report,partition:{state:'KS',count:drops.length,drops},nowMs,workflowRunId:'123456'});
  assert.equal(check.ok,true,check.failures.join('; '));
  assert.equal(check.receipt.publishedStores,3);assert.equal(check.receipt.cities.length,3);assert.equal(check.receipt.publishedRows,4);
  const sparse=drops.filter(row=>row.storeId==='kings-liquor-olathe:6060f76259a44e1d9f41522d');
  const sparseCheck=verifyKansasFirstPublication({report,partition:{state:'KS',count:sparse.length,drops:sparse},nowMs,workflowRunId:'123456'});
  assert.equal(sparseCheck.ok,true,sparseCheck.failures.join('; '));assert.equal(sparseCheck.receipt.publishedStores,1);assert.equal(sparseCheck.receipt.allocatedRows,1);
  const unsafe = structuredClone(drops);
  unsafe[0].eligibleForDelivery = true;
  assert.equal(verifyKansasFirstPublication({report,partition:{state:'KS',count:unsafe.length,drops:unsafe},nowMs,workflowRunId:'123456'}).ok,false);
  const noAllocated=structuredClone(sparse);noAllocated[0].tier='standard';
  assert.equal(verifyKansasFirstPublication({report,partition:{state:'KS',count:noAllocated.length,drops:noAllocated},nowMs,workflowRunId:'123456'}).ok,false);
  const incomplete=structuredClone(report);incomplete.metadata.cityhive.requests.pop();
  assert.equal(verifyKansasFirstPublication({report:incomplete,partition:{state:'KS',count:sparse.length,drops:sparse},nowMs,workflowRunId:'123456'}).ok,false);
});
