import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { BourbonBible } from '../src/core/bible.mjs';
import { collectArizonaAlbertsons } from '../src/collectors/precision-probes.mjs';
import { canonicalizeSignal, candidateFromChange } from '../src/operational-report.mjs';
import { bibleLookup, buildDrops, buildAlerts, buildCurrentInventoryAlertsFromDrops, applyAlertPolicyToCandidate } from '../src/export-site-contract.mjs';
import { getStateLifecycle } from '../src/state-lifecycle.mjs';
import { diagnoseArizonaExpansionArtifact, verifyArizonaExpansionArtifact } from '../src/verify-az.mjs';

const fixture = JSON.parse(await readFile(new URL('./fixtures/arizona-xapi/2026-10-22-buffalo-trace.json', import.meta.url), 'utf8'));
const bible = await BourbonBible.load(new URL('../out/bourbon-bible.json', import.meta.url));
const lookup = bibleLookup(bible.records);
const observations = fixture.captures.map((capture) => Date.parse(capture.observedAt));
const now = Math.max(...observations) + 5 * 60_000;
const expectations = { minimumSelectedStores: 2, minimumBaselineStores: 0, minimumAddedStores: 2, minimumPositiveXapiStores: 2, minimumPublicRows: 2, minimumAddedPublicStores: 1, minimumNewSelectedStores: 0, minimumNewPublicStores: 0, minimumReviewedDepthRows: 0, minimumSmartFinalStores: 0 };

async function capturedPipeline(t, { binary = false } = {}) {
  t.mock.timers.enable({ apis: ['Date'], now });
  const signals = [];
  const metadata = { selectedStores: [], baselineStores: [], addedStores: [], requests: [], totalSearchCount: 0, bourbonSearchCount: 0, rareSearchCount: 0, maxSearchCount: 150 };
  for (const capture of fixture.captures) {
    const products = structuredClone(capture.products);
    if (binary) for (const product of products) delete product.channelInventory.instoreItemQty;
    const result = await collectArizonaAlbertsons({ id: 'AZ' }, bible, capture.observedAt, {
      zips: [capture.store.address.zipcode], maxStores: 1, nowMs: Date.parse(capture.observedAt), sleep: async () => {},
      fetchText: async (value) => {
        const url = new URL(value);
        return url.pathname.includes('/storeresolver/')
          ? { ok: true, status: 206, text: JSON.stringify({ instore: { stores: [capture.store] } }) }
          : { ok: true, status: 200, text: JSON.stringify({ response: { docs: url.searchParams.get('q') === 'bourbon' ? products : [] } }) };
      },
    });
    assert.equal(result.signals.length, 1);
    signals.push(...result.signals);
    for (const key of ['selectedStores', 'baselineStores', 'addedStores', 'requests']) metadata[key].push(...result.metadata[key]);
    for (const key of ['totalSearchCount', 'bourbonSearchCount', 'rareSearchCount']) metadata[key] += result.metadata[key];
  }
  // Explicitly retain a conservative quantity flag at the serialization boundary.
  if (binary) for (const signal of signals) signal.quantityIsExact = false;
  const operational = JSON.parse(JSON.stringify(signals.map((signal) => canonicalizeSignal(signal, bible))));
  const drops = buildDrops(operational, lookup, operational);
  const alerts = buildCurrentInventoryAlertsFromDrops(drops);
  const lifecycle = getStateLifecycle('AZ');
  return JSON.parse(JSON.stringify({
    state: { state: 'AZ', status: 'useful', stale: false, startedAt: new Date(Math.min(...observations)).toISOString(), finishedAt: new Date(Math.max(...observations)).toISOString(), signals, precisionMetadata: { xapi: metadata } },
    drops: { runId: 'captured-az-boundary', drops },
    alerts: { runId: 'captured-az-boundary', alerts },
    stats: { runId: 'captured-az-boundary', stateCoverage: { states: [{ state: 'AZ', coverageTier: lifecycle.coverageTier, publicStatus: lifecycle.publicStatus }] } },
    now, expectations,
  }));
}

function rejected(input, mutate, pattern) {
  const changed = structuredClone(input);
  mutate(changed);
  assert.throws(() => verifyArizonaExpansionArtifact(changed), pattern);
}

test('captured collector to canonical JSON to public rows passes diagnostics without lowering strict CLI defaults', async (t) => {
  const input = await capturedPipeline(t);
  const result = verifyArizonaExpansionArtifact(input);
  assert.equal(result.status, 'ok');
  assert.equal(result.publicRows, 2);
  assert.equal(result.alerts, 2);
  assert.equal(result.buffaloTracePublicRows, 2);
  assert.equal(result.addedPublicStores, 2);
  const strict = diagnoseArizonaExpansionArtifact({ ...input, expectations: undefined });
  assert.equal(strict.status, 'failed');
  assert.match(strict.errors.join('\n'), /required depth|baseline store|public inventory floor/);
});

test('verifier rejects unsafe source identity, format, stock and original timestamps', async (t) => {
  const input = await capturedPipeline(t);
  const mutations = [
    [(row) => { row.state.stale = true; }, /fresh and useful/],
    [(row) => { row.now += 3 * 60 * 60_000; }, /two hours/],
    [(row) => { row.state.signals[0].sourceUrl = 'https://unrelated.example/product'; }, /retailer identity|product URL/],
    [(row) => { row.state.signals[0].storeAddress = '1159 W Chandler Blvd, Chandler, NV 85224'; }, /premises|matching store/],
    [(row) => { row.state.signals[0].rawName = 'Buffalo Trace Bourbon 50 Ml'; }, /Miniature/],
    [(row) => { row.state.signals[0].raw.reportedQuantity = 100; }, /sentinels/],
    [(row) => { row.state.signals[0].eventType = 'cityhive_store_catalog_watch'; }, /Catalog or watch/],
    [(row) => { row.state.signals[0].observedAt = new Date(Math.min(...observations) - 1).toISOString(); }, /original timestamp/],
    [(row) => { row.state.signals[0].observedAt = new Date(now + 1).toISOString(); }, /original timestamp/],
    [(row) => { row.state.signals[0].raw.channelInventory.instore = '0'; }, /original channel evidence/],
    [(row) => { row.state.signals[0].raw.channelInventory.instoreItemQty = 0; }, /original channel evidence/],
    [(row) => { row.state.signals[0].quantityIsExact = false; }, /exact quantity/],
  ];
  for (const [mutate, pattern] of mutations) rejected(input, mutate, pattern);
});

test('verifier binds metadata to exact premises, classification and a bounded denial-aware ledger', async (t) => {
  const input = await capturedPipeline(t);
  rejected(input, (row) => { delete row.state.precisionMetadata; }, /metadata is required/);
  rejected(input, (row) => { row.state.precisionMetadata.xapi.selectedStores[1] = structuredClone(row.state.precisionMetadata.xapi.selectedStores[0]); }, /unique exact/);
  rejected(input, (row) => { row.state.precisionMetadata.xapi.selectedStores[0].address = 'Unknown'; }, /unique exact/);
  rejected(input, (row) => { row.state.precisionMetadata.xapi.baselineStores.push(row.state.precisionMetadata.xapi.addedStores.pop()); }, /misclassified/);
  rejected(input, (row) => { row.state.precisionMetadata.xapi.totalSearchCount += 1; }, /request ledger/);
  rejected(input, (row) => { row.state.precisionMetadata.xapi.requests[0].status = 403; }, /after denial/);
  rejected(input, (row) => { const req = row.state.precisionMetadata.xapi.requests.find((entry) => entry.kind === 'inventory'); req.url = req.url.replace('rows=120', 'rows=1000'); }, /bounded page/);
  rejected(input, (row) => { const req = row.state.precisionMetadata.xapi.requests.find((entry) => entry.kind === 'inventory'); const url = new URL(req.url); url.port = '444'; req.url = url.href; }, /bounded page/);
  rejected(input, (row) => { const req = row.state.precisionMetadata.xapi.requests.find((entry) => entry.kind === 'resolver'); const url = new URL(req.url); url.port = '444'; req.url = url.href; }, /configured public route/);
  rejected(input, (row) => {
    const meta = row.state.precisionMetadata.xapi;
    const rare = meta.requests.find((entry) => entry.kind === 'inventory' && entry.term !== 'bourbon');
    for (let index = 0; index < 17; index++) meta.requests.push(structuredClone(rare));
    meta.totalSearchCount += 17; meta.rareSearchCount += 17;
  }, /16 rare queries/);
});

test('previously released stores cannot satisfy the genuinely new public-store gate', async (t) => {
  const input = await capturedPipeline(t);
  assert.equal(verifyArizonaExpansionArtifact(input).newPublicStores, 0);
  rejected(input, row => { row.expectations.minimumNewPublicStores = 1; }, /Genuinely new stores/);
  rejected(input, row => { row.expectations.minimumNewSelectedStores = 1; }, /128 previously released|genuinely new store floor/);
});

test('verifier rejects lost public proof, old coverage metadata and watch or stale alerts', async (t) => {
  const input = await capturedPipeline(t);
  rejected(input, (row) => { row.drops.drops = []; }, /public inventory floor|survive public export/);
  rejected(input, (row) => { row.drops.drops[0].productId = 'wrong-sku'; }, /product.*proof/);
  rejected(input, (row) => { row.drops.drops[0].sourceUrl = row.drops.drops[0].sourceUrl.replace('960051942', '960051943'); }, /product.*proof/);
  rejected(input, (row) => { row.drops.drops[0].price += 1; }, /price.*proof/);
  rejected(input, (row) => { row.drops.drops[0].quantity = 100; }, /quantity.*proof/);
  rejected(input, (row) => { row.drops.drops[0].observedAt = new Date(now).toISOString(); }, /observation proof/);
  rejected(input, (row) => { row.stats.stateCoverage.states[0].coverageTier = 'retailer_warehouse_inventory'; }, /live_store_inventory/);
  rejected(input, (row) => { row.alerts.alerts[0].action = 'watch_alert_candidate'; }, /alerts cannot contain watch/);
  rejected(input, (row) => { row.alerts.alerts[0].stale = true; }, /alerts cannot contain watch/);
  rejected(input, (row) => { row.alerts.alerts[0].availabilityStatus = 'catalog_listed'; }, /alerts cannot contain watch/);
  rejected(input, (row) => { row.alerts.runId = 'different-export'; }, /different export runs/);
});

test('verifier preserves explicit false exact-quantity semantics without inventing binary stock counts', async (t) => {
  const input = await capturedPipeline(t, { binary: true });
  assert.ok(input.state.signals.every((row) => row.quantity === 0 && row.quantityIsExact === false));
  assert.ok(input.drops.drops.every((row) => row.quantity === 0 && row.quantityIsExact === false));
  assert.equal(input.alerts.alerts.length, 0);
  assert.equal(verifyArizonaExpansionArtifact(input).status, 'ok');
  rejected(input, (row) => { row.drops.drops[0].quantityIsExact = true; }, /quantity.*proof/);
  rejected(input, (row) => { row.state.signals[0].quantity = 17; }, /exact quantity/);
});

test('copied valid public rows cannot satisfy the 38-row floor or inflate alert candidates', async (t) => {
  const input = await capturedPipeline(t);
  const copied = structuredClone(input);
  copied.expectations.minimumPublicRows = 38;
  copied.drops.drops = Array.from({ length: 38 }, (_, index) => structuredClone(input.drops.drops[index % input.drops.drops.length]));
  const diagnostics = diagnoseArizonaExpansionArtifact(copied);
  assert.equal(diagnostics.status, 'failed');
  assert.equal(diagnostics.publicRows, 2, 'the floor counts distinct source/store/product/URL identities');
  assert.match(diagnostics.errors.join('\n'), /Duplicate published Arizona inventory/);
  assert.match(diagnostics.errors.join('\n'), /public inventory floor/);
  rejected(input, (row) => { row.alerts.alerts.push(structuredClone(row.alerts.alerts[0])); }, /candidate keys must be unique and nonempty/);
});

test('reported changes and current inventory retain distinct exporter candidate keys for the same two public identities', async (t) => {
  const input = await capturedPipeline(t);
  const operational = JSON.parse(JSON.stringify(input.state.signals.map((signal) => canonicalizeSignal(signal, bible))));
  const reported = buildAlerts({ candidates: operational.map((signal) => candidateFromChange({ type: 'new_signal', key: signal.key, before: null, after: signal }, false)) });
  const current = buildCurrentInventoryAlertsFromDrops(input.drops.drops);
  // Match the actual exporter: policy first, then dedupeKey-or-id uniqueness.
  const combined = [...new Map([...reported, ...current].map(applyAlertPolicyToCandidate)
    .map((candidate) => [candidate.dedupeKey || candidate.id, candidate])).values()].filter((candidate) => candidate.eligibleForDelivery);
  assert.equal(reported.length, 2);
  assert.equal(current.length, 2);
  assert.equal(combined.length, 4);
  assert.equal(new Set(combined.map((row) => [row.sourceLabel, row.sourceChain, row.merchantId, row.storeId, row.productId, row.sourceUrl].join('|'))).size, 2);
  assert.equal(new Set(combined.map((row) => row.dedupeKey || row.id)).size, 4);
  assert.deepEqual(new Set(combined.map((row) => row.changeType)), new Set(['new_signal', 'current_inventory_signal']));
  input.alerts.alerts = JSON.parse(JSON.stringify(combined));
  assert.equal(verifyArizonaExpansionArtifact(input).alerts, 4);
  rejected(input, (row) => { row.alerts.alerts.push(structuredClone(row.alerts.alerts[0])); }, /candidate keys must be unique and nonempty/);
  rejected(input, (row) => { delete row.alerts.alerts[0].dedupeKey; delete row.alerts.alerts[0].id; }, /candidate keys must be unique and nonempty/);
  const fallback = structuredClone(input);
  delete fallback.alerts.alerts[0].dedupeKey;
  assert.equal(verifyArizonaExpansionArtifact(fallback).alerts, 4, 'the exporter falls back to a unique candidate id');
});
