import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { isCentralCityHiveCanaryOnSiteSignal } from '../src/central-cityhive-policy.mjs';

const fixtureRoot = new URL('./fixtures/ks-cityhive/', import.meta.url);
const raw = await readFile(new URL('hosted-finder-feed.json', fixtureRoot));
const feed = JSON.parse(raw.toString('utf8'));
const digest = createHash('sha256').update(raw).digest('hex');

test('protected KS preview raw feed stays byte-bound to its exact 4-row canary partition', async () => {
  assert.equal(digest, '521a3ab246497f0d93f84d0890bfae367e0497285fe1326284b6fc51d339448d');
  assert.equal(feed.snapshot, '2026-11-14T12:03:44.065Z:source:off:off:classification:8652bbbd8462fb15:retailer:none:history:0:signalOrder:0:listingOrder:1');
  assert.equal(feed.total, 4);
  assert.equal(feed.drops.length, 4);
  assert.equal(feed.hasMore, false);
  assert.deepEqual([...new Set(feed.drops.map(row => row.storeId))].sort(), [
    'kings-liquor-olathe:6060f76259a44e1d9f41522d',
    'rj-liquor:6060f6496aaeeb555664ca4f',
    'verns-liquor:61ae46168baad441363308b0',
  ]);
  assert.deepEqual([...new Set(feed.drops.map(row => row.city))].sort(), ['Olathe', 'Topeka', 'Wichita']);
  assert.ok(feed.drops.every(row => row.state === 'KS' && row.previewOnly === true
    && row.quantity === 0 && row.quantityIsExact === false
    && row.canAlertAsInventory === false && row.canAlertAsWatch === false
    && row.eligibleForDelivery === false && row.eligibleForEmail === false && row.eligibleForSms === false));
});

test('protected preview receipt matches the byte-bound partition and exact isolated deployment', async () => {
  const receipt = JSON.parse(await readFile(new URL('hosted-finder-feed-receipt.json', fixtureRoot), 'utf8'));
  const deployment = JSON.parse(await readFile(new URL('hosted-deployment-receipt.json', fixtureRoot), 'utf8'));
  assert.equal(receipt.rows, 4);
  assert.equal(receipt.total, 4);
  assert.equal(receipt.generatedAt, '2026-11-14T12:03:44.065Z');
  assert.equal(receipt.url, deployment.deployment.url);
  assert.equal(deployment.deployment.id, 'dpl_2KK9FVxMuLRPMba9mw2nQ3oCZgpY');
  assert.equal(deployment.deployment.readyState, 'READY');
  assert.equal(receipt.ksRows.length, 4);
});

test('all hosted-preview rows satisfy the same strict isolated on-site policy', () => {
  const nowMs = Date.parse('2026-11-14T14:05:06.667Z');
  assert.ok(feed.drops.every(row => isCentralCityHiveCanaryOnSiteSignal(row, { nowMs })));
});
