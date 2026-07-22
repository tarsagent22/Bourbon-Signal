import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { gzipSync } from 'node:zlib';
import { loadOhioInventoryRecoverySeed, seedOhioInventoryCacheSignals } from '../src/collectors/ohio-inventory-recovery.mjs';

test('Ohio cold runners seed stale non-alerting inventory from the hydrated state report', () => {
  const observedAt = '2026-07-21T12:00:00.000Z';
  const seeded = seedOhioInventoryCacheSignals({
    finishedAt: '2026-07-21T12:05:00.000Z',
    staleReason: 'OHLQ browser challenge',
    signals: [
      {
        id: 'positive-oh-row',
        state: 'OH',
        sourceLabel: 'OHLQ browser-assisted product availability API',
        sourceUrl: 'https://www.ohlq.com/api/product-availability/2880b',
        rawName: 'Eagle Rare 10 Year',
        canonicalName: 'Eagle Rare 10 Year',
        eventType: 'browser_assisted_store_inventory_limited_supply',
        locationPrecision: 'store_level',
        storeId: '42',
        storeName: 'Example Agency',
        observedAt,
        availabilityStatus: 'limited_supply',
        canAlertAsInventory: true,
        raw: { availability: { bucket: 'L' } },
      },
      {
        id: 'sample-only',
        state: 'OH',
        eventType: 'browser_captured_store_inventory_sample',
        locationPrecision: 'store_level',
        storeId: '43',
        availabilityStatus: 'limited_supply',
      },
      {
        id: 'other-state',
        state: 'VA',
        eventType: 'browser_assisted_store_inventory_in_stock',
        locationPrecision: 'store_level',
        storeId: '44',
        availabilityStatus: 'in_stock',
      },
    ],
  });

  assert.equal(seeded.generatedAt, '2026-07-21T12:05:00.000Z');
  assert.equal(seeded.signals.length, 1);
  assert.equal(seeded.signals[0].id, 'positive-oh-row');
  assert.equal(seeded.signals[0].observedAt, observedAt);
  assert.equal(seeded.signals[0].stale, true);
  assert.equal(seeded.signals[0].sourceStale, true);
  assert.equal(seeded.signals[0].canAlertAsInventory, false);
  assert.equal(seeded.signals[0].canAlertAsWatch, false);
  assert.equal(seeded.signals[0].raw.staleFallback, true);
  assert.match(seeded.signals[0].staleSourceCaveat, /verify .*before driving/i);
  const provenance = seedOhioInventoryCacheSignals({
    finishedAt: '2026-07-22T12:00:00.000Z',
    lastGoodAt: '2026-07-20T12:00:00.000Z',
    signals: [{ ...seeded.signals[0], canAlertAsInventory: true }],
  });
  assert.equal(provenance.generatedAt, '2026-07-20T12:00:00.000Z', 'fallback generation must retain source last-good provenance');
});

test('Ohio recovery seed restores a bounded fresh capture as stale non-alerting rows', async () => {
  const seeded = await loadOhioInventoryRecoverySeed('data/ohlq-recovery-seed-2026-07-22.json.gz');
  assert.ok(seeded.signals.length >= 1000);
  assert.ok(seeded.signals.length <= 2000);
  assert.ok(seeded.signals.every((signal) => signal.state === 'OH'));
  assert.ok(seeded.signals.every((signal) => signal.sourceStale === true));
  assert.ok(seeded.signals.every((signal) => signal.canAlertAsInventory === false));
});

test('Ohio recovery seed loader enforces compressed and decoded bounds', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ohlq-seed-bounds-'));
  try {
    const compressedOverflow = join(dir, 'compressed-overflow.json.gz');
    await writeFile(compressedOverflow, Buffer.alloc(33));
    await assert.rejects(
      loadOhioInventoryRecoverySeed(compressedOverflow, { maxCompressedBytes: 32 }),
      /compressed-size limit/,
    );

    const signalOverflow = join(dir, 'signal-overflow.json.gz');
    await writeFile(signalOverflow, gzipSync(JSON.stringify({
      signals: Array.from({ length: 3 }, (_, index) => ({ state: 'OH', id: String(index) })),
    })));
    await assert.rejects(
      loadOhioInventoryRecoverySeed(signalOverflow, { maxSignals: 2 }),
      /signal-count limit/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
