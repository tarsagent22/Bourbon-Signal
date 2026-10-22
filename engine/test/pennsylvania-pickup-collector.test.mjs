import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { BourbonBible } from '../src/core/bible.mjs';
import { confidenceForSignal } from '../src/confidence-policy.mjs';
import { buildPennsylvaniaPickupSignals } from '../src/collectors/precision-probes.mjs';

const captured = JSON.parse(await readFile(new URL('./fixtures/pennsylvania-fwgs/2026-10-22-reviewed-pickup.json', import.meta.url), 'utf8'));
const bible = await BourbonBible.load(new URL('../out/bourbon-bible.json', import.meta.url));
const config = { id: 'PA', label: 'Pennsylvania FWGS pickup fixture' };
const observedAt = captured.generatedAt;
const confidenceOptions = { nowMs: Date.parse(observedAt) + 60_000 };
const baseRow = captured.inventoryRows.find((row) => row.product.sku === '000082899');
assert.ok(baseRow, 'the captured Larceny product has a positive store row despite OUT_OF_STOCK catalog aggregate');

function artifact(row = baseRow, overrides = {}) {
  return {
    generatedAt: observedAt,
    inventoryEndpoint: '/ccstorex/custom/v1/b2b/get-inventory',
    inventoryRows: [structuredClone(row)],
    ...overrides,
  };
}

test('the actual PA row builder uses exact store pickup quantity and original time, independently of catalog stock', () => {
  assert.equal(baseRow.product.inventory.stockStatus, 'OUT_OF_STOCK');
  assert.equal(baseRow.product.inventory.inStockQuantity, 0);
  assert.ok(baseRow.quantity > 0);
  for (const country of ['US', 'USA']) {
    const row = structuredClone(baseRow);
    row.location.country = country;
    const result = buildPennsylvaniaPickupSignals(config, bible, artifact(row));
    assert.equal(result.signals.length, 1);
    const signal = result.signals[0];
    assert.equal(signal.canonicalName, 'Larceny Barrel Proof');
    assert.equal(signal.quantity, baseRow.quantity);
    assert.equal(signal.storeId, baseRow.location.locationId);
    assert.equal(signal.observedAt, observedAt);
    assert.equal(signal.raw.generatedAt, observedAt);
    assert.equal(signal.raw.quantity, baseRow.quantity);
    assert.equal(signal.sourceProductBinding.sku, baseRow.product.sku);
    assert.equal(signal.raw.fwgsBottleMatch.sourceRoute, baseRow.product.route);
    assert.equal(confidenceForSignal(signal, confidenceOptions).canAlertAsInventory, true);
    assert.equal(result.metadata.reviewedInventoryRowCount, 1);
  }
});

test('the actual PA row builder rejects invalid premises, quantities, endpoints and reviewed identity substitutions', () => {
  for (const [field, value] of Object.entries({
    type: 'warehouse', pickUp: false, inventory: false, country: 'CA',
    stateAddress: 'NJ', city: '', address1: '', postalCode: 'bad', locationId: '',
  })) {
    const row = structuredClone(baseRow);
    row.location[field] = value;
    assert.deepEqual(buildPennsylvaniaPickupSignals(config, bible, artifact(row)).signals, [], field);
  }
  for (const quantity of [undefined, null, 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, 'NaN']) {
    assert.deepEqual(buildPennsylvaniaPickupSignals(config, bible, artifact({ ...baseRow, quantity })).signals, [], `quantity ${quantity}`);
  }
  for (const inventoryEndpoint of [undefined, '', '/ccstorex/custom/v1/b2b/get-inventory?method=shipping', '/other']) {
    const result = buildPennsylvaniaPickupSignals(config, bible, artifact(baseRow, { inventoryEndpoint }));
    assert.deepEqual(result.signals, []);
    assert.equal(result.metadata.complete, false);
  }
  const wrongSku = structuredClone(baseRow);
  wrongSku.product.sku = '999999999';
  const rejected = buildPennsylvaniaPickupSignals(config, bible, artifact(wrongSku));
  assert.deepEqual(rejected.signals, []);
  assert.ok(rejected.roadblocks.some((row) => row.status === 'identity_rejected'));
});

test('the actual PA row builder requires an original valid ISO observation time and never substitutes collection time', () => {
  const unexpected = [];
  for (const generatedAt of [undefined, null, '', 'not-a-date', 0, '2026-02-30T17:03:05.073Z', '2026-10-22', new Date(Date.now() + 24 * 60 * 60_000).toISOString()]) {
    const result = buildPennsylvaniaPickupSignals(config, bible, artifact(baseRow, { generatedAt }));
    if (result.signals.length || result.metadata.complete !== false) {
      unexpected.push({ generatedAt, signalCount: result.signals.length, complete: result.metadata.complete });
    }
  }
  assert.deepEqual(unexpected, [], 'invalid source timestamps must not enter the inventory pipeline');
});

test('Licensee Service Center rows remain diagnostics after the real confidence policy', () => {
  const row = structuredClone(baseRow);
  row.location.name = 'FWGS LICENSEE SERVICE CENTER 1005';
  const result = buildPennsylvaniaPickupSignals(config, bible, artifact(row));
  assert.equal(result.signals.length, 1);
  const signal = result.signals[0];
  assert.equal(signal.eventType, 'licensee_service_center_inventory_observation');
  assert.equal(signal.raw.sampleOnly, true);
  assert.equal(signal.raw.locationKind, 'licensee_service_center');
  assert.equal(result.metadata.reviewedInventoryRowCount, 0);
  const policy = confidenceForSignal(signal, confidenceOptions);
  assert.equal(policy.canAlertAsInventory, false);
  assert.equal(policy.canAlertAsWatch, false);
  assert.ok(policy.confidence < 0.5);
});

test('actual PA precision collection makes zero HTTP calls for missing or incomplete browser artifacts', async () => {
  const collectorUrl = new URL('../src/collectors/precision-probes.mjs', import.meta.url).href;
  const code = `
    let requests = 0;
    globalThis.fetch = async () => { requests++; throw new Error('HTTP forbidden in PA artifact-only regression'); };
    const { collectPrecisionProbes } = await import(${JSON.stringify(collectorUrl)});
    const result = await collectPrecisionProbes(
      { id: 'PA', label: 'Pennsylvania missing-artifact fixture', sources: [] },
      { records: [], match: () => null, scanText: () => [] }, [],
      { sourceRunnerOptions: { schedule: false, maxAttempts: 1 } }
    );
    process.stdout.write(JSON.stringify({ requests, result }));
  `;
  const directory = await mkdtemp(path.join(tmpdir(), 'pa-pickup-collector-'));
  try {
    const outcomes = [];
    for (const mode of ['missing', 'incomplete']) {
      if (mode === 'incomplete') {
        await mkdir(path.join(directory, 'out', 'browser'), { recursive: true });
        await writeFile(path.join(directory, 'out', 'browser', 'fwgs-store-inventory.json'), JSON.stringify(artifact()));
      }
      const child = spawnSync(process.execPath, ['--input-type=module', '--eval', code], {
        cwd: directory, encoding: 'utf8', timeout: 15_000,
        env: { ...process.env, BOURBON_SIGNAL_RUN_STATES: 'PA' },
      });
      assert.equal(child.status, 0, `${mode}: ${child.stderr || child.error || child.stdout}`);
      const { requests, result } = JSON.parse(child.stdout);
      assert.equal(requests, 0, mode);
      assert.deepEqual(result.signals, [], mode);
      assert.equal(result.sourceResults[0].ok, false, mode);
      assert.equal(result.sourceResults[0].alertable, false, mode);
      outcomes.push({ mode, requests, complete: result.metadata?.complete ?? null });
    }
    assert.deepEqual(outcomes, [
      { mode: 'missing', requests: 0, complete: false },
      { mode: 'incomplete', requests: 0, complete: false },
    ], 'incomplete metadata must survive the source runtime in both failure paths');
  } finally {
    assert.equal(path.dirname(directory), path.resolve(tmpdir()));
    assert.ok(path.basename(directory).startsWith('pa-pickup-collector-'));
    await rm(directory, { recursive: true, force: true });
  }
});
