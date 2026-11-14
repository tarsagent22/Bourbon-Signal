import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { BourbonBible } from '../src/core/bible.mjs';
import { collectTownCrierLouisianaResearch, isTownCrierResearchInventory, townCrierRequestIdentity } from '../src/research-town-crier-la-runtime.mjs';
import { TOWN_CRIER_LA_PRODUCTS, TOWN_CRIER_LA_STORES, TOWN_CRIER_LA_API_ORIGIN } from '../src/collectors/town-crier-la-premises.mjs';
import { buildShadowEvidence, classifyShadowReadiness } from '../src/run-expansion-shadow.mjs';

const fixtureDir = fileURLToPath(new URL('./fixtures/town-crier-la/', import.meta.url));
const manifest = JSON.parse(await readFile(path.join(fixtureDir, 'manifest.json'), 'utf8'));
const bible = await BourbonBible.load();
const products = new Map(TOWN_CRIER_LA_PRODUCTS.map(product => [product.upc, product]));
const stores = new Map(TOWN_CRIER_LA_STORES.map(store => [store.id, store]));
const fixtureResponses = new Map();
fixtureResponses.set(`${TOWN_CRIER_LA_API_ORIGIN}/api/locations`, await readFile(path.join(fixtureDir, 'locations.json'), 'utf8'));
for (const item of manifest.observedResults) fixtureResponses.set(item.requestUrl, await readFile(path.join(fixtureDir, item.artifact), 'utf8'));

function replay({ mutate, denyAt } = {}) {
  const requested = [];
  const fetchText = async url => {
    requested.push(url);
    if (url === denyAt) return { ok: false, status: 403, url, text: '', retryAfterSeconds: 0 };
    const exact = fixtureResponses.get(url);
    if (exact === undefined) throw new Error(`Unrecorded Town Crier request: ${url}`);
    let text = exact;
    if (mutate) text = mutate(url, text);
    return { ok: true, status: 200, url, text };
  };
  return { requested, fetchText };
}

async function temporaryRun(options, callback) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'town-crier-la-research-'));
  try {
    const report = await collectTownCrierLouisianaResearch({ bible, env: { BOURBON_SIGNAL_SHADOW_MODE: '1' },
      incidentFile: path.join(directory, 'incidents.json'), reportDirectory: path.join(directory, 'report'),
      now: () => new Date('2026-11-14T09:30:00.000Z'), sleep: async () => {}, ...options });
    await callback(report, directory);
  } finally { await rm(directory, { recursive: true, force: true }); }
}

test('reviewed Town Crier cohort and UPCs are exact and request URLs bind one selected store', () => {
  assert.deepEqual(TOWN_CRIER_LA_STORES.map(row => row.id), ['1', '2', '4', '7', '8', '12', '17', '18']);
  assert.equal(manifest.counts.stores, 8);
  assert.equal(manifest.counts.requests, 16);
  assert.deepEqual(TOWN_CRIER_LA_PRODUCTS.map(row => row.upc), ['088004021344', '088004005498']);
  const valid = townCrierRequestIdentity(`${TOWN_CRIER_LA_API_ORIGIN}/api/products/088004021344?location=2`);
  assert.equal(valid.store.id, '2');
  assert.equal(valid.product.canonicalName, 'Eagle Rare 10 Year');
  assert.throws(() => townCrierRequestIdentity(`${TOWN_CRIER_LA_API_ORIGIN}/api/products/088004021344?location=999`), /closed reviewed cohort/);
  assert.throws(() => townCrierRequestIdentity(`${TOWN_CRIER_LA_API_ORIGIN}/api/products/088004021344?location=2&quantity=1`), /exact reviewed location-scoped/);
  assert.throws(() => townCrierRequestIdentity(`${TOWN_CRIER_LA_API_ORIGIN}/api/products/000000000000?location=2`), /closed reviewed cohort/);
});

test('full saved API replay emits only exact store-bound binary research positives and records zero without a physical negative', async () => {
  const { requested, fetchText } = replay();
  await temporaryRun({ fetchText }, async (report, directory) => {
    assert.equal(requested.length, 17, JSON.stringify(report.roadblocks));
    assert.deepEqual(requested[0], `${TOWN_CRIER_LA_API_ORIGIN}/api/locations`);
    assert.deepEqual(requested.slice(1), TOWN_CRIER_LA_STORES.flatMap(store => TOWN_CRIER_LA_PRODUCTS.map(product =>
      `${TOWN_CRIER_LA_API_ORIGIN}/api/products/${product.upc}?location=${store.id}`)));
    assert.equal(report.metadata.complete, true);
    assert.equal(report.metadata.requestCount, 17);
    assert.equal(report.metadata.positiveRowCount, 15);
    assert.equal(report.metadata.siteQuantityZeroCount, 1);
    assert.equal(report.metadata.physicalNegativeClaims, 0);
    assert.equal(report.metadata.sourceUpdatedAt, null);
    assert.match(report.metadata.freshness, /collector response time only/);
    assert.match(report.metadata.siteCaveat, /periodically and may not reflect current shelf stock/);
    assert.equal(report.metadata.productionActivationAllowed, false);
    assert.equal(report.metadata.customerDeliveryAllowed, false);
    assert.deepEqual(report.signals.map(row => `${row.storeId}|${row.productId}`).sort(),
      manifest.observedResults.filter(row => row.available).map(row => `town-crier:${row.storeId}|${row.upc}`).sort());
    for (const row of report.signals) {
      const store = stores.get(row.sourceProductBinding.locationId);
      const product = products.get(row.productId);
      assert.equal(row.storeAddress, store.address);
      assert.equal(row.storeName, store.name);
      assert.equal(row.canonicalName, product.canonicalName);
      assert.equal(row.quantity, 0);
      assert.equal(row.quantityIsExact, false);
      assert.equal(row.sourceProductBinding.siteReportedQuantity > 0, true);
      assert.equal(row.sourceProductBinding.storeResponseDoesNotEchoLocation, true);
      assert.equal(row.sourceProductBinding.sourceUpdatedAt, null);
      assert.equal(isTownCrierResearchInventory(row), true);
      for (const flag of ['canAlertAsInventory', 'canAlertAsWatch', 'alertable', 'eligibleForOnSite', 'eligibleForDropFeed',
        'eligibleForWatch', 'eligibleForDelivery', 'deliveryEligible', 'eligibleForEmail', 'eligibleForSms']) assert.equal(row[flag], false);
    }
    assert.equal(report.signals.some(row => row.productId === '088004021344' && row.sourceProductBinding.locationId === '2'), false);
    const readiness = classifyShadowReadiness(report, { now: '2026-11-14T09:31:00.000Z' });
    assert.equal(readiness.discovery.status, 'succeeded');
    assert.equal(readiness.inventory.ready, true);
    assert.equal(readiness.inventory.trustedSignalCount, 15);
    const shadowEvidence = buildShadowEvidence('LA', report, { now: '2026-11-14T09:31:00.000Z' });
    assert.equal(shadowEvidence.complete, true);
    assert.equal(shadowEvidence.publication.allowed, false);
    assert.equal(shadowEvidence.publication.productionSnapshotTouched, false);
    assert.equal(shadowEvidence.alerts.deliveryAttempted, false);
    assert.equal(shadowEvidence.metrics.alertCandidateCount, 0);
    for (const receipt of report.metadata.receipts) {
      const body = await readFile(path.join(directory, 'report', receipt.artifactPath));
      assert.equal(createHash('sha256').update(body).digest('hex'), receipt.sha256);
    }
  });
});

test('locations must still equal the exact public address cohort before any product lookup', async () => {
  const { requested, fetchText } = replay({ mutate: (url, text) => url.endsWith('/api/locations')
    ? JSON.stringify(JSON.parse(text).map(row => row.store_num === '2' ? { ...row, address: '2 Fake Road, Slidell, LA 70461' } : row)) : text });
  await temporaryRun({ fetchText }, report => {
    assert.equal(requested.length, 1);
    assert.equal(report.metadata.complete, false);
    assert.equal(report.signals.length, 0);
    assert.equal(report.roadblocks[0].status, 'incomplete_closed_profile');
    assert.match(report.roadblocks[0].error, /premise changed/);
  });
});

test('a wrong returned UPC stops the closed profile without later lookups or positive rows', async () => {
  const firstProduct = `${TOWN_CRIER_LA_API_ORIGIN}/api/products/088004021344?location=1`;
  const { requested, fetchText } = replay({ mutate: (url, text) => url === firstProduct
    ? JSON.stringify({ ...JSON.parse(text), id: '000000000000' }) : text });
  await temporaryRun({ fetchText }, report => {
    assert.equal(requested.length, 2);
    assert.equal(report.metadata.complete, false);
    assert.equal(report.signals.length, 0);
    assert.match(report.roadblocks[0].error, /exact UPC\/name\/activity/);
  });
});

test('access denial is journaled and stops the run and the next call before any retry', async () => {
  const { requested, fetchText } = replay({ denyAt: `${TOWN_CRIER_LA_API_ORIGIN}/api/locations` });
  const directory = await mkdtemp(path.join(os.tmpdir(), 'town-crier-la-denial-'));
  try {
    const options = { bible, env: { BOURBON_SIGNAL_SHADOW_MODE: '1' }, fetchText,
      incidentFile: path.join(directory, 'incidents.json'), reportDirectory: path.join(directory, 'report'),
      now: () => new Date('2026-11-14T09:30:00.000Z'), sleep: async () => {} };
    const denied = await collectTownCrierLouisianaResearch(options);
    assert.equal(denied.status, 'source_denied');
    assert.equal(denied.metadata.denialStoppedRemainingRequests, true);
    assert.equal(denied.metadata.requestCount, 1);
    assert.equal(requested.length, 1);
    assert.equal(denied.metadata.incidentJournal.incident.httpStatus, 403);
    assert.equal(Date.parse(denied.metadata.incidentJournal.incident.nextAllowedAt) - Date.parse(denied.metadata.incidentJournal.incident.lastAttemptAt), 24 * 60 * 60_000);
    const second = await collectTownCrierLouisianaResearch(options);
    assert.equal(second.status, 'source_parked');
    assert.equal(second.metadata.requestCount, 0);
    assert.equal(requested.length, 1, 'cooldown must suppress subsequent HTTP');
  } finally { await rm(directory, { recursive: true, force: true }); }
});
