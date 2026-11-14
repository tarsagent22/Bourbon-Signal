import test from 'node:test';
import assert from 'node:assert/strict';
import { bibleLookup, buildHistoricalTrends } from '../src/export-site-contract.mjs';

test('historical trend current flag uses exact state, bottle name, and source identity', () => {
  const historicalSignals = [1, 2].map((index) => ({
    key: `history-${index}`,
    state: 'CA',
    canonicalName: 'Rare Bourbon',
    rawName: 'Rare Bourbon',
    storeName: 'Shop | Downtown',
    eventType: 'store_inventory',
    quantity: 1,
    observedAt: `2026-11-14T10:0${index}:00.000Z`,
  }));
  const currentSignals = [
    { state: 'CA', canonicalName: 'Rare Bourbon', storeName: 'Shop | Downtown' },
    { state: 'CA', rawName: 'Rare Bourbon', sourceLabel: 'Shop | Downtown' },
    { state: 'CA', canonicalName: 'Rare Bourbon', storeName: 'Shop' },
    { state: 'NY', canonicalName: 'Rare Bourbon', storeName: 'Shop | Downtown' },
    { state: 'CA', canonicalName: 'Rare Bourbon Extra', storeName: 'Shop | Downtown' },
  ];
  const bible = bibleLookup([]);

  const [trend] = buildHistoricalTrends(historicalSignals, currentSignals, bible);
  assert.equal(trend?.state, 'CA');
  assert.equal(trend?.bottleName, 'Rare Bourbon');
  assert.equal(trend?.source, 'Shop | Downtown');
  assert.equal(trend?.current, true);

  const absent = buildHistoricalTrends(historicalSignals, currentSignals.slice(2), bible);
  assert.equal(absent[0]?.current, false);
});
