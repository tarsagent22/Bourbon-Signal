import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { classifyShadowReadiness } from '../src/run-expansion-shadow.mjs';
import { PEARSONS_DC_RESEARCH_CONFIG, PEARSONS_DC_SOURCE, collectPearsonsDcResearchReport,
  parsePearsonsDcCapture } from '../src/collectors/pearsons-dc-research.mjs';
import { collectResearchStateReport, researchSourceForState } from '../src/research-state-registry.mjs';

const fixture = await readFile(new URL('./fixtures/pearsons-dc/product-page.html', import.meta.url));
const headers = 'HTTP/1.1 200 OK\r\nAge: 0\r\nDate: Sat, 14 Nov 2026 17:40:21 GMT\r\n';
const expectedId = 'blantons-original';
const bible = { match: name => name === PEARSONS_DC_SOURCE.canonicalName
  ? { confidence: 1, record: { id: expectedId, canonical: PEARSONS_DC_SOURCE.canonicalName, tier: 'allocated' } } : null };
const parse = (bytes = fixture, options = {}) => parsePearsonsDcCapture(bytes, {
  url: PEARSONS_DC_SOURCE.productUrl, headers, bible, ...options,
});

test('Pearson retained storefront evidence binds exact DC premise, bottle, variant, pickup and clock', () => {
  const row = parse();
  assert.ok(row);
  assert.equal(row.storeId, PEARSONS_DC_SOURCE.storeId);
  assert.equal(row.storeAddress, '2436 Wisconsin Avenue NW, Washington, DC 20007');
  assert.equal(row.canonicalBottleId, expectedId);
  assert.equal(row.tier, 'allocated');
  assert.equal(row.price, 99.99);
  assert.equal(row.observedAt, '2026-11-14T17:40:21.000Z');
  assert.equal(row.sourceProductBinding.sourcePageSha256, createHash('sha256').update(fixture).digest('hex'));
  assert.equal(row.sourceProductBinding.variantId, '45949567795418');
  assert.equal(row.sourceProductBinding.storeGraphId, 'https://pearsonswine.com/#store');
  assert.equal(row.sourceAvailabilityVerified, true);
  assert.equal(row.pickupOfferVerified, true);
  assert.equal(row.quantityIsExact, false);
  assert.equal(row.inventorySemantics, 'storefront_orderable_pickup_offer_no_shelf_count');
  assert.equal(row.canAlertAsInventory, false);
  assert.equal(row.canAlertAsWatch, false);
  assert.equal(row.eligibleForDelivery, false);
  const readiness = classifyShadowReadiness({ state: 'DC', status: 'useful', strategy: 'retailer_store_inventory',
    signals: [row], sources: [{ ok: true }], metadata: { complete: true, shadowOnly: true,
      productionActivationAllowed: false, customerDeliveryAllowed: false } }, { now: row.observedAt });
  assert.equal(readiness.inventory.ready, true, 'the exact current row is eligible for isolated shadow readiness');
});

test('Pearson parser fails closed on wrong premise, product variant, seller, pickup or source clock', () => {
  const edits = [
    [fixture.toString().replace('2436 Wisconsin Avenue NW', '2436 Other Avenue NW'), null],
    [fixture.toString().replace('45949567795418', '45949567795419'), null],
    [fixture.toString().replace('https://pearsonswine.com/#store', 'https://other.example/#store'), null],
    [fixture.toString().replace('Pick up at Wisconsin Ave NW', 'Delivery only'), null],
    [fixture.toString().replace('Ready within 30 minutes.', 'Ships in 5 days.'), null],
  ];
  for (const [changed] of edits) assert.equal(parse(Buffer.from(changed)), null);
  assert.equal(parse(fixture, { headers: headers.replace('200 OK', '429 Too Many Requests') }), null);
  assert.equal(parse(fixture, { url: 'https://pearsonswine.com/products/unreviewed' }), null);
  assert.equal(parse(fixture, { expectedSha256: '0'.repeat(64) }), null);
  assert.equal(parse(fixture, { bible: { match: () => null } }), null);
});

test('scheduled Pearson collector makes one bounded shadow request then honors its source clock', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'pearsons-dc-'));
  try {
    const attemptFile = path.join(directory, 'attempt.json'), calls = [];
    const nowMs = Date.now();
    const options = { attemptFile, captureRoot: path.join(directory,'source-captures'), env: { BOURBON_SIGNAL_SHADOW_MODE: '1' }, now: () => new Date(nowMs),
      fetchText: async (url, requestOptions) => { calls.push({ url, requestOptions }); return { ok: true, status: 200, url, text: fixture.toString() }; } };
    const first = await collectPearsonsDcResearchReport(PEARSONS_DC_RESEARCH_CONFIG, bible, options);
    assert.equal(calls.length, 1);
    assert.equal(first.metadata.complete, true);
    assert.equal(first.metadata.requestCount,1);
    assert.equal(first.metadata.shadowOnly, true);
    assert.equal(first.metadata.productionActivationAllowed, false);
    assert.equal(first.metadata.customerDeliveryAllowed, false);
    assert.equal(first.signals.length, 1);
    assert.equal(first.signals[0].canAlertAsInventory, false);
    assert.equal(first.signals[0].eligibleForDelivery, false);
    assert.equal(first.signals[0].sourceRuntimeId, 'research:dc:pearsons-shopify');
    assert.equal(first.metadata.receipts[0].sha256, createHash('sha256').update(fixture).digest('hex'));
    assert.equal(first.metadata.receipts[0].artifactPath,`source-captures/pearsons-${first.metadata.receipts[0].sha256.slice(0,12)}.html`);
    assert.equal(createHash('sha256').update(await readFile(path.join(directory,first.metadata.receipts[0].artifactPath))).digest('hex'),first.metadata.receipts[0].sha256);
    const second = await collectPearsonsDcResearchReport(PEARSONS_DC_RESEARCH_CONFIG, bible, options);
    assert.equal(calls.length, 1, 'a source inside its 30-minute cadence must not receive another request');
    assert.equal(second.sources[0].cadenceStatus, 'not_due');
    assert.equal(second.metadata.requestCount,0);
    assert.equal(second.signals.length, 1);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('scheduled Pearson collector persists a denial cooldown and never repeats the denied request', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'pearsons-dc-denied-'));
  try {
    const attemptFile = path.join(directory, 'attempt.json'), calls = [];
    const nowMs = Date.now();
    const options = { attemptFile, env: { BOURBON_SIGNAL_SHADOW_MODE: '1' }, now: () => new Date(nowMs),
      fetchText: async (url, requestOptions) => { calls.push({ url, requestOptions }); return { ok: false, status: 429, url, retryAfterSeconds: 10, text: '' }; } };
    const first = await collectPearsonsDcResearchReport(PEARSONS_DC_RESEARCH_CONFIG, bible, options);
    assert.equal(calls.length, 1);
    assert.equal(first.metadata.complete, false);
    assert.equal(first.sources[0].status, 429);
    assert.equal(first.signals.length, 0);
    const journal = JSON.parse(await readFile(attemptFile, 'utf8'));
    assert.equal(journal.lastStatus, 429);
    assert.equal(Date.parse(journal.nextAllowedAt) - nowMs, 24 * 60 * 60_000);
    const second = await collectPearsonsDcResearchReport(PEARSONS_DC_RESEARCH_CONFIG, bible, options);
    assert.equal(calls.length, 1, 'a persisted denial must suppress another HTTP request');
    assert.equal(second.sources[0].cadenceStatus, 'not_due');
    assert.equal(second.sources[0].ok, false);
    assert.equal(second.metadata.complete, false);
    assert.equal(second.signals.length, 0);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('a malformed current Pearson page closes the source clock without reusing a cached positive', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'pearsons-dc-malformed-'));
  try {
    const attemptFile = path.join(directory, 'attempt.json'), calls = [];
    let nowMs = Date.now(), body = fixture.toString();
    const options = { attemptFile, env: { BOURBON_SIGNAL_SHADOW_MODE: '1' }, now: () => new Date(nowMs),
      fetchText: async url => { calls.push(url); return { ok: true, status: 200, url, text: body }; } };
    const first = await collectPearsonsDcResearchReport(PEARSONS_DC_RESEARCH_CONFIG, bible, options);
    assert.equal(first.signals.length, 1);
    nowMs += 31 * 60_000;
    body = fixture.toString().replace('45949567795418', '45949567795419');
    const failed = await collectPearsonsDcResearchReport(PEARSONS_DC_RESEARCH_CONFIG, bible, options);
    assert.equal(calls.length, 2);
    assert.equal(failed.metadata.complete, false);
    assert.equal(failed.signals.length, 0);
    nowMs += 60_000;
    const cooled = await collectPearsonsDcResearchReport(PEARSONS_DC_RESEARCH_CONFIG, bible, options);
    assert.equal(calls.length, 2);
    assert.equal(cooled.metadata.complete, false);
    assert.equal(cooled.signals.length, 0);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('DC composite stops before Pearson after a CityHive denial', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'dc-composite-denied-'));
  const priorMode = process.env.BOURBON_SIGNAL_SHADOW_MODE;
  process.env.BOURBON_SIGNAL_SHADOW_MODE = '1';
  try {
    const requests = [], config = researchSourceForState('DC', { shadowMode: true });
    const report = await collectResearchStateReport(config, { records: [], match: () => null }, {
      env: { BOURBON_SIGNAL_SHADOW_MODE: '1' }, reportDirectory: directory,
      incidentFile: path.join(directory, 'cityhive-journal.json'),
      readAttempts: async () => ({}), writeAttempts: async () => {}, persistIncidentJournal: async () => {},
      fetchText: async url => { requests.push(url); return { ok: false, status: 403, url, text: '' }; },
      attemptFile: path.join(directory, 'pearsons-attempt.json'),
    });
    assert.equal(requests.length, 2, 'each separate CityHive host is stopped after its own first denial');
    assert.ok(requests.every(url => new URL(url).hostname !== 'pearsonswine.com'));
    assert.equal(report.signals.length, 0);
    assert.equal(report.metadata.complete, false);
    assert.equal(report.metadata.productionActivationAllowed, false);
    assert.equal(report.metadata.customerDeliveryAllowed, false);
    assert.equal(report.metadata.pearsons, null, 'Pearson is not consulted after the CityHive cohort fails');
  } finally {
    if (priorMode === undefined) delete process.env.BOURBON_SIGNAL_SHADOW_MODE;
    else process.env.BOURBON_SIGNAL_SHADOW_MODE = priorMode;
    await rm(directory, { recursive: true, force: true });
  }
});
