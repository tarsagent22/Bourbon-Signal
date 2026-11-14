import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { BourbonBible } from '../src/core/bible.mjs';
import { NEW_JERSEY_CITYHIVE_RESEARCH_SOURCES } from '../src/collectors/central-cityhive-research-premises.mjs';
import { parseCentralCityHiveInventory, centralCityHiveLibraryTier } from '../src/collectors/central-cityhive-expansion.mjs';
import {
  CENTRAL_CITYHIVE_STATE_IDS,
  centralCityHiveSourceForSignal,
  isCentralCityHiveResearchInventory,
  isCentralCityHiveCanaryOnSiteSignal,
  isCentralCityHiveProductionOnSiteSignal,
} from '../src/central-cityhive-policy.mjs';
import { classifyShadowReadiness } from '../src/run-expansion-shadow.mjs';

const fixtureRoot = new URL('./fixtures/nj-silverton-hosted-43654491498/', import.meta.url);
const report = JSON.parse(await readFile(new URL('report.json', fixtureRoot), 'utf8'));
const bible = await BourbonBible.load(new URL('../out/bourbon-bible.json', import.meta.url));
const source = NEW_JERSEY_CITYHIVE_RESEARCH_SOURCES.find(row => row.id === 'buyrite-silverton-nj-research');

test('hosted Silverton responses replay at the captured clock as research-only trusted inventory', async () => {
  assert.ok(source);
  assert.equal(CENTRAL_CITYHIVE_STATE_IDS.has('NJ'), false, 'NJ must not enter the production source-state registry');
  assert.equal(report.metadata.origin.workflowRunId, '43654491498');
  assert.equal(report.metadata.origin.commitSha, 'a0279db54c265596ca15d1e764e9de66856c89b8');

  const replayed = new Map();
  for (const receipt of report.metadata.receipts) {
    assert.equal(receipt.status, 200);
    const body = await readFile(new URL(receipt.artifactPath, fixtureRoot));
    assert.equal(body.length, receipt.bytes);
    assert.equal(createHash('sha256').update(body).digest('hex'), receipt.sha256);
    const rows = parseCentralCityHiveInventory(body.toString('utf8'), source, bible, {
      observedAt: report.signals[0].observedAt,
    });
    for (const row of rows) replayed.set(row.id, row);
  }

  assert.deepEqual([...replayed.values()].map(row => row.canonicalName).sort(), ["Blanton's Gold", 'Weller Single Barrel']);
  for (const saved of report.signals) {
    const row = replayed.get(saved.id);
    assert.ok(row, `raw replay should produce ${saved.canonicalName}`);
    for (const key of ['sourceUrl', 'merchantId', 'productId', 'optionId', 'rawName', 'canonicalBottleId', 'canonicalName', 'storeId', 'storeAddress', 'price', 'observedAt']) {
      assert.equal(row[key], saved[key], `${saved.canonicalName} ${key}`);
    }
    assert.equal(row.sourceProductBinding.reportedQuantity, saved.sourceProductBinding.reportedQuantity);
    assert.equal(row.sourceProductBinding.quantitySemantics, 'binary_retailer_orderable_no_exact_count');
    assert.equal(saved.quantity, 0);
    assert.equal(saved.quantityIsExact, false);
    assert.equal(saved.lat, source.lat);
    assert.equal(saved.lng, source.lng);
    assert.equal(centralCityHiveLibraryTier(row, bible), saved.tier);
    assert.equal(centralCityHiveSourceForSignal(saved), source);
    assert.equal(isCentralCityHiveResearchInventory(saved, { nowMs: Date.parse(report.finishedAt) }), true);
    assert.equal(isCentralCityHiveCanaryOnSiteSignal(saved, { nowMs: Date.parse(report.finishedAt) }), false);
    assert.equal(isCentralCityHiveProductionOnSiteSignal(saved, { nowMs: Date.parse(report.finishedAt) }), false);
    assert.equal(saved.canAlertAsInventory, false);
    assert.equal(saved.alertable, false);
    assert.equal(saved.sourceProductBinding.reportedQuantity > 0, true);
  }

  const readiness = classifyShadowReadiness(report, { now: report.finishedAt });
  assert.equal(readiness.inventory.status, 'ready');
  assert.equal(readiness.inventory.trustedSignalCount, 2);
});
