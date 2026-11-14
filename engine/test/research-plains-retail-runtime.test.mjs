import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { BourbonBible } from '../src/core/bible.mjs';
import { CUSTOMER_ACTIVE_STATE_IDS } from '../src/state-lifecycle.mjs';
import { buildShadowEvidence } from '../src/run-expansion-shadow.mjs';
import { withResearchLifecycle, researchSourceForState } from '../src/research-state-registry.mjs';
import {
  collectPlainsRetailResearchReport,
  parsePlainsRetailResearchCapture,
  plainsRetailResearchLifecycleEntries,
  plainsRetailResearchSourceForState,
} from '../src/research-plains-retail-runtime.mjs';

const fixture = JSON.parse(await readFile(new URL('../data/research-captures/plains-retail-20261114.json', import.meta.url)));
const bible = new BourbonBible(fixture.bibleRecords);
const mtHtml = await readFile(new URL('./fixtures/plains-retail-20261114/billings-undammed-product.html', import.meta.url), 'utf8');
const now = Date.parse('2026-11-14T12:00:00.000Z');

function billingsPageResponse(text = mtHtml, overrides = {}) {
  return async (url, options) => ({ ok: true, status: 200, url, requestedUrl: url, contentType: 'text/html; charset=utf-8',
    text, observedAt: '2026-11-14T11:58:20.269Z', options, ...overrides });
}

async function collectMt(options = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'mt-billings-shadow-'));
  try {
    return await collectPlainsRetailResearchReport(plainsRetailResearchSourceForState('MT'), bible, {
      env: { BOURBON_SIGNAL_SHADOW_MODE: '1' }, now, reportDirectory: path.join(directory, 'report'),
      attemptFile: path.join(directory, 'out/research-source-attempts/MT.json'), ...options,
    });
  } finally { await rm(directory, { recursive: true, force: true }); }
}

test('SD and MT retained exact-store pickup evidence replays only in shadow research', async () => {
  assert.equal(CUSTOMER_ACTIVE_STATE_IDS.has('SD'), false);
  assert.equal(CUSTOMER_ACTIVE_STATE_IDS.has('MT'), false);
  assert.deepEqual([...['SD', 'MT']].map(state => researchSourceForState(state, { shadowMode: true })?.id), ['SD', 'MT']);
  assert.equal(researchSourceForState('SD', { shadowMode: false }), null);

  const lifecycle = withResearchLifecycle({ activeStates: [], states: {} });
  for (const state of ['SD', 'MT']) {
    assert.equal(lifecycle.states[state].publicStatus, 'research_only');
    assert.equal(lifecycle.states[state].inventoryAlertable, false);
    assert.equal(lifecycle.states[state].watchAlertable, false);
    assert.equal(plainsRetailResearchLifecycleEntries()[state].coverageTier, 'single_store_inventory_research');

    const config = plainsRetailResearchSourceForState(state);
    const report = state === 'MT' ? await collectMt({ fetchText: billingsPageResponse() })
      : await collectPlainsRetailResearchReport(config, bible, { env: { BOURBON_SIGNAL_SHADOW_MODE: '1' }, now });
    assert.equal(report.metadata.shadowOnly, true);
    assert.equal(report.metadata.productionActivationAllowed, false);
    assert.equal(report.metadata.customerDeliveryAllowed, false);
    assert.equal(report.metadata.origin.kind, state === 'SD' ? 'retained_capture_replay' : 'local_shadow_not_workflow_issued');
    assert.equal(report.signals.every(row => row.researchOnly && !row.canAlertAsInventory && !row.canAlertAsWatch && row.observedAt === row.fetchedAt), true);
    for (const row of report.signals) assert.equal(row.stale, false);

    assert.equal(report.signals.length, state === 'SD' ? 2 : 1);
    assert.equal(new Set(report.signals.map(row => row.city)).size, 1);
  }

  const sd = await collectPlainsRetailResearchReport(plainsRetailResearchSourceForState('SD'), bible, { env: { BOURBON_SIGNAL_SHADOW_MODE: '1' }, now });
  assert.deepEqual(sd.signals.map(row => [row.canonicalName, row.quantity, row.price]).sort(), [
    ['Heaven Hill Bottled-in-Bond 7 Year', 3, 53.99],
    ['Larceny Barrel Proof', 12, 74.99],
  ].sort());
  const mtCalls = [];
  const mt = await collectMt({ fetchText: async (url, options) => { mtCalls.push({ url, options }); return billingsPageResponse()(url, options); } });
  assert.equal(mtCalls.length, 1);
  assert.equal(mtCalls[0].url, plainsRetailResearchSourceForState('MT').sources[0].url);
  assert.equal(mtCalls[0].options.maxRedirects, 0);
  assert.equal(mtCalls[0].options.maxBytes, 1_000_000);
  assert.deepEqual(mt.signals.map(row => [row.canonicalName, row.quantity, row.price]), [
    ['Undammed Thief Creek Straight Bourbon', 6, 51],
  ]);
  assert.equal(mt.signals[0].observedAt, '2026-11-14T11:58:20.269Z');
  assert.equal(mt.metadata.requests[0].sha256, 'f4d9dc5ffda5aae60af319766f7361303c8355b9e71bd0e546af243a6a6d764e');
});

test('source, premise, store, UPC, expression, size, and positive pickup quantity are all required', () => {
  const source = plainsRetailResearchSourceForState('SD');
  const capture = { ...fixture.captures.SD, state: 'SD', researchOnly: true };
  const baseline = parsePlainsRetailResearchCapture(capture, source, bible, { now });
  assert.equal(baseline.length, 2);

  const invalidCaptures = [
    { ...capture, source: 'https://mrliquor.example/' },
    { ...capture, pickupEnabled: false },
    { ...capture, store: { ...capture.store, address: '9 Wrong St' } },
    { ...capture, store: { ...capture.store, id: '5187' } },
    { ...capture, state: 'MT' },
  ];
  for (const invalid of invalidCaptures) assert.deepEqual(parsePlainsRetailResearchCapture(invalid, source, bible, { now }), []);

  const product = capture.products[0];
  for (const mutation of [
    { upc: '096749999999' },
    { title: 'Heaven Hill Bourbon' },
    { canonicalBottleId: 'bb_dec2c347ba378237' },
    { canonicalName: 'Heaven Hill 7 Year' },
    { tier: 'unicorn' },
    { storeId: '5187' },
    { sizeMl: 375 },
    { available: 0 },
    { available: 1.5 },
    { reserved: 1 },
    { backorderEnabled: true },
  ]) {
    const rows = parsePlainsRetailResearchCapture({ ...capture, products: [{ ...product, ...mutation }] }, source, bible, { now });
    assert.deepEqual(rows, [], `mutation should fail closed: ${JSON.stringify(mutation)}`);
  }
});

test('captured source observation clocks are retained and become stale instead of being refreshed at replay', async () => {
  const config = plainsRetailResearchSourceForState('SD');
  const report = await collectPlainsRetailResearchReport(config, bible, {
    env: { BOURBON_SIGNAL_SHADOW_MODE: '1' },
    now: Date.parse('2026-11-14T14:00:00.000Z'),
  });
  assert.equal(report.stale, true);
  assert.equal(report.signals.every(row => row.stale && row.sourceStale && row.observedAt === row.fetchedAt), true);
  assert.equal(report.finishedAt, '2026-11-14T14:00:00.000Z');
  assert.equal(report.signals[0].observedAt, '2026-11-14T11:50:26.105Z');
});

test('Billings shadow pickup fails closed when the page loses stock proof or returns a blocked response', async () => {
  const config = plainsRetailResearchSourceForState('MT');
  const missingStockHtml = mtHtml.replace('In stock: 6 available', 'Out of stock');
  const missing = await collectMt({ fetchText: billingsPageResponse(missingStockHtml) });
  assert.equal(missing.signals.length, 0);
  assert.equal(missing.status, 'no_trusted_inventory');
  assert.equal(missing.metadata.requests.length, 1);

  const malformedProduct = mtHtml.replace('860006244521', '000000000000');
  const mismatched = await collectMt({ fetchText: billingsPageResponse(malformedProduct) });
  assert.equal(mismatched.signals.length, 0);

  let calls = 0;
  const denied = await collectMt({ fetchText: async url => { calls += 1; return { ok: false, status: 403, url, requestedUrl: url, observedAt: '2026-11-14T11:58:20.269Z', contentType: 'text/html', text: 'blocked' }; } });
  assert.equal(calls, 1);
  assert.equal(denied.signals.length, 0);
  assert.equal(denied.status, 'source_blocked');
});

test('Billings rechecks one product URL and uses the new response clock instead of replaying an expired clock', async () => {
  const config = plainsRetailResearchSourceForState('MT');
  const later = Date.parse('2026-11-14T14:00:00.000Z');
  const retained = parsePlainsRetailResearchCapture({ ...fixture.captures.MT, state: 'MT', researchOnly: true }, config, bible, { now: later });
  assert.equal(retained[0].stale, true);

  let calls = 0;
  const report = await collectMt({ now: later,
    fetchText: async (url, options) => {
      calls += 1;
      assert.equal(url, config.sources[0].url);
      assert.equal(options.maxRedirects, 0);
      return billingsPageResponse(mtHtml, { observedAt: '2026-11-14T14:00:00.000Z' })(url, options);
    },
  });
  assert.equal(calls, 1);
  assert.equal(report.signals.length, 1);
  assert.equal(report.signals[0].stale, false);
  assert.equal(report.signals[0].observedAt, '2026-11-14T14:00:00.000Z');
  assert.equal(report.metadata.requests.length, 1);
});

test('Billings persists a daily attempt before requesting, writes a bounded HTML receipt, and fails closed on a malformed ledger', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'mt-billings-ledger-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const attemptFile = path.join(directory, 'out/research-source-attempts/MT.json');
  const reportDirectory = path.join(directory, 'report');
  const options = { env: { BOURBON_SIGNAL_SHADOW_MODE: '1' }, now, attemptFile, reportDirectory };
  let calls = 0;
  const response = async (url, requestOptions) => {
    calls += 1;
    const ledger = JSON.parse(await readFile(attemptFile, 'utf8'));
    assert.equal(ledger.status, 'reserved');
    assert.equal(ledger.inFlight, true);
    assert.equal(requestOptions.maxBytes, 1_000_000);
    return billingsPageResponse()(url, requestOptions);
  };
  const first = await collectPlainsRetailResearchReport(plainsRetailResearchSourceForState('MT'), bible, { ...options, fetchText: response });
  assert.equal(first.signals.length, 1);
  assert.equal(first.metadata.complete, true);
  assert.equal(first.metadata.origin.kind, 'local_shadow_not_workflow_issued');
  assert.equal(first.metadata.pickupEvidence, 'reviewed_single_store_binding; retained product page has no visible store selector');
  assert.equal(first.metadata.receipts[0].artifactPath, 'source-captures/001-f4d9dc5ffda5.html');
  assert.equal((await readFile(path.join(reportDirectory, first.metadata.receipts[0].artifactPath), 'utf8')), mtHtml);
  assert.equal(buildShadowEvidence('MT', first, { now: first.finishedAt }).complete, true);
  for (const mutation of [
    { storeAddress: '99 Wrong Rd, Billings, MT 59101' },
    { productId: '000000000000' },
    { sourceProductBinding: { ...first.signals[0].sourceProductBinding, pickupVerified: false } },
    { canAlertAsInventory: true },
    { quantity: 0 },
  ]) {
    const changed = { ...first, signals: first.signals.map(row => ({ ...row, ...mutation })) };
    assert.equal(buildShadowEvidence('MT', changed, { now: first.finishedAt }).complete, false, JSON.stringify(mutation));
  }
  const second = await collectPlainsRetailResearchReport(plainsRetailResearchSourceForState('MT'), bible, { ...options, fetchText: response });
  assert.equal(second.sources[0].status, 'not_due');
  assert.equal(second.metadata.complete, false);
  assert.equal(calls, 1);

  await rm(attemptFile);
  await (await import('node:fs/promises')).writeFile(attemptFile, '{bad json');
  await assert.rejects(() => collectPlainsRetailResearchReport(plainsRetailResearchSourceForState('MT'), bible, { ...options, fetchText: response }), /malformed/);
  assert.equal(calls, 1);
});

