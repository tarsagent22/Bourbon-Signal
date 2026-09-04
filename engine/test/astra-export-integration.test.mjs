import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Fully local source-shaped synthetic fixture. No upstream or delivery calls.
const observedAt = new Date().toISOString();
const signal = { id: 'fixture', state: 'TX', stateCode: 'TX', canonicalBottleId: 'fixture-bottle', canonicalName: 'Fixture Bourbon', rawName: 'Fixture Bourbon', tier: 'allocated', eventType: 'cityhive_store_inventory_result', sourceLabel: 'Twin Liquors CityHive store inventory', sourceChain: 'twin-liquors', sourceUrl: 'https://twinliquors.com/product/fixture', merchantId: 'a'.repeat(24), storeId: `twin-liquors:${'a'.repeat(24)}`, storeName: 'Fixture Store', locationName: 'Fixture Store', productId: 'product', optionId: 'option', storeAddress: '1 Fixture St, Austin, TX 78701', city: 'Austin', locationPrecision: 'store_level', quantity: 0, quantityIsExact: false, sourceAvailabilityVerified: true, availabilityStatus: 'in_stock', canAlertAsInventory: true, canAlertAsWatch: false, observedAt, confidence: 0.9 };
async function exportFixture(root, summary, signals = [signal]) {
  await mkdir(root, { recursive: true });
  await Promise.all(Object.entries({ 'current-snapshot.json': { generatedAt: observedAt, signals }, 'bourbon-bible.json': { records: [{ id: 'fixture-bottle', canonical: 'Fixture Bourbon', tier: 'allocated' }] }, 'summary.json': summary }).map(([file, value]) => writeFile(path.join(root, file), JSON.stringify(value))));
  const result = spawnSync(process.execPath, ['src/export-site-contract.mjs'], { cwd: new URL('..', import.meta.url), env: { ...process.env, BOURBON_SIGNAL_OUT_DIR: root, BOURBON_SIGNAL_PREVIOUS_SITE_DIR: path.join(root, 'site') }, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(await readFile(path.join(root, 'site', 'alerts.json'), 'utf8'));
}
test('E11 composed exporter persists a TX opportunity across unrelated NY publication and expires it', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'astra-export-'));
  try {
    const summary = { partialRefresh: true, attemptedStateIds: ['TX'], freshStateIds: ['TX'], states: [{ state: 'TX', status: 'useful', signalCount: 1 }] };
    const first = await exportFixture(root, summary);
    assert.equal(first.alerts.length, 1, 'fixture must first produce an accepted opportunity');
    const second = await exportFixture(root, { ...summary, attemptedStateIds: ['NY'], freshStateIds: ['NY'] });
    assert.equal(second.alerts.length, 1);
    assert.equal(second.alerts[0].dedupeKey, first.alerts[0].dedupeKey);
    assert.equal(second.alerts[0].signalAt, first.alerts[0].signalAt);
    const closed = await exportFixture(root, summary, [{ ...signal, quantity: 0, availabilityStatus: 'out_of_stock', canAlertAsInventory: false }]);
    assert.equal(closed.alerts.length, 0);
  } finally { await rm(root, { recursive: true, force: true }); }
});
test('E04 composed exporter does not quarantine valid current rows just because siblings are retained', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'astra-partial-'));
  try {
    const alerts = await exportFixture(root, { partialRefresh: true, attemptedStateIds: ['TX'], freshStateIds: ['TX'], partialFallbackStateIds: ['TX'], states: [{ state: 'TX', status: 'partial_useful_quality_fallback', signalCount: 1 }] });
    assert.equal(alerts.alerts.length, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});
