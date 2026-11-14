import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { buildDrops, dropHasPositiveAlertInventory, isSafePublicSignal } from '../src/export-site-contract.mjs';
import { NORTH_DAKOTA_PUBLIC_COHORT_SHA256, isNorthDakotaProductionOnSiteInventory } from '../src/north-dakota-public-policy.mjs';
import { NORTH_DAKOTA_RETAIL_COHORT_SHA256 } from '../src/collectors/north-dakota-retail-production.mjs';

const held = JSON.parse(await readFile(new URL('./fixtures/north-dakota/joint-run-43647207025.json', import.meta.url), 'utf8'));
const nowMs = Date.parse(held.reportFinishedAt) + 30_000;

function productionRows() {
  return held.reportSignals.map(signal => {
    const row = structuredClone(signal);
    const cityHive = row.sourceProductBinding.source === 'central-cityhive';
    row.sourceRuntimeId = cityHive ? 'nd:rock-cityhive' : 'nd:albertsons-xapi';
    row.sourceProductBinding = { ...row.sourceProductBinding, shadowOnly: false, productionOnSiteOnly: true,
      productionCohortSha256: NORTH_DAKOTA_PUBLIC_COHORT_SHA256 };
    row.raw = { ...row.raw, shadowOnly: false };
    row.eligibleForOnSite = true;
    row.eligibleForDropFeed = true;
    row.eligibleForWatch = false;
    row.eligibleForDelivery = false;
    row.deliveryEligible = false;
    row.eligibleForEmail = false;
    row.eligibleForSms = false;
    return row;
  });
}

function minimalBible(rows) {
  const byId = new Map(rows.map(row => [row.canonicalBottleId, {
    id: row.canonicalBottleId, canonical: row.canonicalName, tier: row.tier, aliases: [],
  }]));
  return { byId, byName: new Map(), byExactName: new Map(), records: [...byId.values()] };
}

test('North Dakota source policy matches the collector cohort and publishes both families as on-site only', () => {
  assert.equal(NORTH_DAKOTA_PUBLIC_COHORT_SHA256, NORTH_DAKOTA_RETAIL_COHORT_SHA256);
  const rows = productionRows();
  assert.equal(rows.length, 3);
  assert.ok(rows.every(row => isNorthDakotaProductionOnSiteInventory(row, { nowMs })));
  const drops = buildDrops(rows, minimalBible(rows), rows, [], rows);
  assert.equal(drops.length, 3);
  assert.deepEqual(new Set(drops.map(drop => drop.city)), new Set(['Grand Forks', 'Williston']));
  assert.ok(drops.every(drop => drop.dataLane === 'onsite_inventory'
    && drop.eligibleForOnSite === true && drop.eligibleForDropFeed === true
    && drop.canAlertAsInventory === false && drop.canAlertAsWatch === false && drop.alertable === false
    && drop.eligibleForWatch === false && drop.eligibleForDelivery === false
    && drop.deliveryEligible === false && drop.eligibleForEmail === false && drop.eligibleForSms === false
    && dropHasPositiveAlertInventory(drop) === false));
});

test('North Dakota public policy rejects shadow, misbound, stale, and alertable rows from both families', () => {
  for (const row of productionRows()) {
    assert.equal(isSafePublicSignal(row), true);
    for (const mutate of [
      candidate => { candidate.sourceProductBinding.shadowOnly = true; },
      candidate => { candidate.sourceProductBinding.productionCohortSha256 = '0'.repeat(64); },
      candidate => { candidate.storeAddress = 'Wrong address'; },
      candidate => { candidate.observedAt = new Date(nowMs - 2 * 60 * 60_000 - 1).toISOString(); },
      candidate => { candidate.canAlertAsInventory = true; },
      candidate => { candidate.eligibleForDelivery = true; },
    ]) {
      const invalid = structuredClone(row);
      mutate(invalid);
      assert.equal(isNorthDakotaProductionOnSiteInventory(invalid, { nowMs }), false);
      assert.equal(isSafePublicSignal(invalid), false);
      assert.deepEqual(buildDrops([invalid], minimalBible([row]), [invalid], [], [invalid]), []);
    }
  }
});
