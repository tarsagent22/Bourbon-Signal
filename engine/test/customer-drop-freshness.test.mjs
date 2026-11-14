import assert from 'node:assert/strict';
import test from 'node:test';
import {
  currentInventoryMaxAgeMs,
  isWithinCustomerFreshnessWindow,
} from '../src/customer-drop-freshness.mjs';
import { enforceCustomerDropByteBudget, isCurrentCustomerDropEvidence, mergeHistoricalTimelineDrops, mergePartialRefreshDrops } from '../src/partial-refresh-contract.mjs';
import { buildStateDropPartitions, verifyStateDropPartitions } from '../src/site-state-partitions.mjs';
import { buildStateOperatingContract } from '../src/state-operating-contract.mjs';

const now = Date.parse('2026-11-14T08:00:00.000Z');
const hoursAgo = hours => new Date(now - hours * 60 * 60 * 1000).toISOString();

test('shared current inventory ages retain TX and verified Oregon exceptions', () => {
  const ordinary = { state: 'PA', type: 'store_inventory_result', locationPrecision: 'store_level', canAlertAsInventory: true, lastConfirmedAt: hoursAgo(1.5) };
  const texas = { ...ordinary, state: 'TX', sourceProductBinding: { source: 'texas-shopify-pickup' } };
  const oregon = {
    ...ordinary,
    state: 'OR', previewOnly: true,
    sourceUrl: 'https://www.olcc.state.or.us/pdfs/DailyStoreInventory.csv',
    sourceAvailabilityVerified: true, canAlertAsInventory: false, canAlertAsWatch: false,
    storeId: 'olcc:001', storeAddress: '1 Main St', canonicalBottleId: 'bb_test', quantity: 2,
    lastConfirmedAt: hoursAgo(24),
  };
  assert.equal(isWithinCustomerFreshnessWindow(ordinary, now, { currentInventory: true }), true);
  assert.equal(currentInventoryMaxAgeMs(texas), 60 * 60 * 1000);
  assert.equal(isWithinCustomerFreshnessWindow(texas, now, { currentInventory: true }), false);
  assert.equal(currentInventoryMaxAgeMs(oregon), 48 * 60 * 60 * 1000);
  assert.equal(isWithinCustomerFreshnessWindow(oregon, now, { currentInventory: true }), true);
  assert.equal(isCurrentCustomerDropEvidence({ ...ordinary, lastConfirmedAt: new Date(now + 20 * 60 * 1000).toISOString() }, now), false);
  assert.equal(isCurrentCustomerDropEvidence({ ...ordinary, sourceStale: true }, now), false);
  assert.equal(isCurrentCustomerDropEvidence({ ...ordinary, state: 'OH', lastConfirmedAt: hoursAgo(36) }, now), true);
  assert.equal(isCurrentCustomerDropEvidence({ ...ordinary, state: 'OH', sourceStale: true, lastConfirmedAt: hoursAgo(1) }, now), false);
  assert.equal(isCurrentCustomerDropEvidence({ source: 'verified-retailer', retailerReported: true, expiresAt: new Date(now + 30 * 60 * 1000).toISOString() }, now), true);
  assert.equal(isCurrentCustomerDropEvidence({ source: 'verified-retailer', retailerReported: true, expiresAt: new Date(now - 1).toISOString() }, now), false);
});

test('current inventory rows stay required while expired source rows become bounded context', () => {
  const fresh = {
    id: 'ca-current', state: 'CA', type: 'retailer_store_inventory_result',
    locationPrecision: 'store_level', canAlertAsInventory: true, lastConfirmedAt: hoursAgo(0.5),
  };
  const expired = {
    id: 'pa-expired', state: 'PA', type: 'store_inventory_result',
    locationPrecision: 'store_level', canAlertAsInventory: true, lastConfirmedAt: hoursAgo(3),
    evidence: 'x'.repeat(63 * 1024 * 1024),
  };
  const result = mergePartialRefreshDrops({
    currentDrops: [fresh, expired], currentSourceDrops: [fresh, expired],
    attemptedStateIds: ['CA', 'PA'], now,
  });
  assert.deepEqual(result.map(drop => drop.id), ['ca-current']);
  assert.equal(expired.lastConfirmedAt, hoursAgo(3));
  assert.equal(result[0].lastConfirmedAt, hoursAgo(0.5));
});

test('complete stale fallback partitions are retained when they fit, but never crowd out current inventory', () => {
  const fresh = {
    id: 'ca-current', state: 'CA', type: 'retailer_store_inventory_result',
    locationPrecision: 'store_level', canAlertAsInventory: true, lastConfirmedAt: hoursAgo(0.5),
  };
  const fallback = Array.from({ length: 2 }, (_, index) => ({
    id: `va-old-${index}`, state: 'VA', canAlertAsInventory: true,
    type: 'store_inventory_result', locationPrecision: 'store_level',
    lastConfirmedAt: hoursAgo(30), evidence: 'x'.repeat(32 * 1024 * 1024),
  }));
  const untouched = {
    id: 'tx-untouched-current', state: 'TX', type: 'store_inventory_result',
    locationPrecision: 'store_level', canAlertAsInventory: true,
    sourceProductBinding: { source: 'texas-shopify-pickup' }, lastConfirmedAt: hoursAgo(0.5),
  };
  const result = mergePartialRefreshDrops({
    previousDrops: [...fallback, untouched],
    currentDrops: [fresh, ...['AZ', 'ID', 'IL', 'PA', 'NV'].map(state => ({
      id: `${state}-current`, state, type: 'store_inventory_result', locationPrecision: 'store_level',
      canAlertAsInventory: true, lastConfirmedAt: hoursAgo(0.5),
    }))],
    currentSourceDrops: [fresh, ...['AZ', 'ID', 'IL', 'PA', 'NV'].map(state => ({
      id: `${state}-current`, state, type: 'store_inventory_result', locationPrecision: 'store_level',
      canAlertAsInventory: true, lastConfirmedAt: hoursAgo(0.5),
    }))],
    partialRefresh: true,
    attemptedStateIds: ['CA', 'AZ', 'ID', 'IL', 'PA', 'NV', 'VA'], fallbackStateIds: ['VA'], now,
  });
  const timeline = mergeHistoricalTimelineDrops({
    currentDrops: result,
    previousDrops: [{ id: 'va-old-timeline', state: 'VA', type: 'store_inventory_result',
      eligibleForDropFeed: true, canAlertAsInventory: true, observedAt: hoursAgo(30), lastConfirmedAt: hoursAgo(30) }],
    now: new Date(now).toISOString(),
  });
  const final = enforceCustomerDropByteBudget(timeline, {
    fallbackStateIds: ['VA'], omittedFallbackStateIds: result.budgetOmittedFallbackStateIds, now,
  });
  for (const state of ['CA', 'AZ', 'ID', 'IL', 'PA', 'NV', 'TX']) {
    assert.ok(final.some(drop => drop.state === state), `fresh ${state} row is preserved`);
  }
  assert.equal(final.some(drop => drop.state === 'VA'), false);
  assert.deepEqual(final.budgetOmittedFallbackStateIds, ['VA']);

  const partitions = buildStateDropPartitions(final, {
    contractVersion: 'fixture-v1', generatedAt: new Date(now).toISOString(), activeStates: ['CA', 'AZ', 'ID', 'IL', 'PA', 'NV', 'TX', 'VA'],
  });
  assert.equal(partitions.index.totalCount, final.length);
  assert.equal(partitions.index.states.find(entry => entry.state === 'VA')?.count, 0);
  assert.deepEqual(verifyStateDropPartitions(final, partitions), { ok: true, errors: [] });

  const health = buildStateOperatingContract({
    activeStateIds: ['VA'], generatedAt: new Date(now).toISOString(),
    summary: { attemptedStateIds: ['VA'], fallbackStateIds: ['VA'], budgetOmittedFallbackStateIds: ['VA'], states: [{ state: 'VA', status: 'stale_useful', stale: true }] },
    stateCoverage: { states: [{ state: 'VA' }] }, drops: final,
  });
  assert.equal(health.states[0].fallback.evidenceOmittedForBudget, true);
  assert.match(health.states[0].fallback.reason, /omitted from the customer drop payload/);
});

