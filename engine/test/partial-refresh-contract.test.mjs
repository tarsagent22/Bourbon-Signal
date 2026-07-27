import assert from 'node:assert/strict';
import test from 'node:test';
import { detectDropCollapseFallbacks, mergePartialRefreshDrops } from '../src/partial-refresh-contract.mjs';

test('drop collapse detection marks attempted states for safe publication fallback', () => {
  const previous = { states: [{ state: 'IN', input: { dropCount: 72 } }, { state: 'TN', input: { dropCount: 35 } }] };
  const current = [
    ...Array.from({ length: 7 }, (_, index) => ({ id: `in-${index}`, state: 'IN' })),
    ...Array.from({ length: 35 }, (_, index) => ({ id: `tn-${index}`, state: 'TN' })),
  ];
  assert.deepEqual(detectDropCollapseFallbacks(previous, current, ['IN', 'TN']), ['IN']);
});

test('partial refresh replaces attempted states and preserves untouched published drops', () => {
  const previousDrops = { drops: [
    { id: 'nc-old', state: 'NC' },
    { id: 'il-old', state: 'IL' },
    { id: 'tn-old', state: 'TN' },
  ] };
  const currentDrops = [
    { id: 'nc-new', state: 'NC' },
    { id: 'az-new', state: 'AZ' },
  ];
  const merged = mergePartialRefreshDrops({
    previousDrops,
    currentDrops,
    partialRefresh: true,
    attemptedStateIds: ['NC', 'AZ'],
  });
  assert.deepEqual(merged.map((drop) => drop.id), ['nc-new', 'az-new', 'il-old', 'tn-old']);
});

test('attempted fallback states retain their last published drops', () => {
  const merged = mergePartialRefreshDrops({
    previousDrops: { drops: [{ id: 'tn-old', state: 'TN' }, { id: 'il-old', state: 'IL' }] },
    currentDrops: [{ id: 'tn-collapsed', state: 'TN' }],
    partialRefresh: true,
    attemptedStateIds: ['TN'],
    fallbackStateIds: ['TN'],
  });
  assert.deepEqual(merged.map((drop) => drop.id), ['tn-old', 'il-old']);
  const fallback = merged.find((drop) => drop.id === 'tn-old');
  assert.equal(fallback.stale, true);
  assert.equal(fallback.sourceStale, true);
  assert.equal(fallback.alertable, false);
  assert.equal(fallback.canAlertAsInventory, false);
  assert.equal(fallback.canAlertAsWatch, false);
});

test('partial evidence fallback publishes fresh rows and retains only missing prior rows as stale context', () => {
  const merged = mergePartialRefreshDrops({
    previousDrops: {
      drops: [
        { id: 'tn-same', state: 'TN', canAlertAsInventory: true },
        { id: 'tn-old-only', state: 'TN', canAlertAsInventory: true },
        { id: 'tn-unsafe', state: 'TN', canAlertAsInventory: true },
        { id: 'il-old', state: 'IL', canAlertAsInventory: true },
      ],
    },
    currentDrops: [
      { id: 'tn-same', state: 'TN', canAlertAsInventory: true, observedAt: '2026-07-27T12:05:00.000Z' },
      { id: 'tn-new', state: 'TN', canAlertAsInventory: true, observedAt: '2026-07-27T12:06:00.000Z' },
    ],
    partialRefresh: true,
    attemptedStateIds: ['TN'],
    partialFallbackStateIds: ['TN'],
    isSafePartialRetainedRow: (drop) => drop.id !== 'tn-unsafe',
  });
  assert.deepEqual(merged.map((drop) => drop.id), ['tn-same', 'tn-new', 'tn-old-only', 'il-old']);
  assert.equal(merged[0].canAlertAsInventory, true);
  assert.equal(merged[1].canAlertAsInventory, true);
  assert.equal(merged[2].sourceStale, true);
  assert.equal(merged[2].canAlertAsInventory, false);
  assert.equal(merged[2].canAlertAsWatch, false);
  assert.equal(merged[2].staleReason, 'partial_evidence_fallback');
});

test('a fallback state with no prior customer rows may bootstrap only explicitly stale non-alerting context', () => {
  const safe = mergePartialRefreshDrops({
    previousDrops: [{ id: 'pa-old', state: 'PA' }],
    currentDrops: [{
      id: 'oh-stale', state: 'OH', sourceStale: true, stale: true,
      alertable: false, canAlertAsInventory: false, canAlertAsWatch: false,
      staleSourceCaveat: 'Verify with OHLQ before driving.',
    }],
    partialRefresh: true,
    attemptedStateIds: ['OH'],
    fallbackStateIds: ['OH'],
  });
  assert.deepEqual(safe.map((drop) => drop.id), ['oh-stale', 'pa-old']);

  const newerSafe = mergePartialRefreshDrops({
    previousDrops: [{
      id: 'oh-older-stale', state: 'OH', sourceStale: true, alertable: false,
      canAlertAsInventory: false, canAlertAsWatch: false, staleSourceCaveat: 'Old cached OHLQ row.',
      observedAt: '2026-07-21T12:00:00.000Z',
    }],
    currentDrops: [{
      id: 'oh-newer-stale', state: 'OH', sourceStale: true, alertable: false,
      canAlertAsInventory: false, canAlertAsWatch: false, staleSourceCaveat: 'Newer cached OHLQ row.',
      observedAt: '2026-07-22T12:00:00.000Z',
    }],
    partialRefresh: true,
    attemptedStateIds: ['OH'],
    fallbackStateIds: ['OH'],
  });
  assert.deepEqual(newerSafe.map((drop) => drop.id), ['oh-newer-stale']);

  const healthyPrior = mergePartialRefreshDrops({
    previousDrops: [{ id: 'oh-live', state: 'OH', sourceStale: false, canAlertAsInventory: true }],
    currentDrops: [{
      id: 'oh-newer-stale', state: 'OH', sourceStale: true, alertable: false,
      canAlertAsInventory: false, canAlertAsWatch: false, staleSourceCaveat: 'Newer cached OHLQ row.',
      observedAt: '2026-07-22T12:00:00.000Z',
    }],
    partialRefresh: true,
    attemptedStateIds: ['OH'],
    fallbackStateIds: ['OH'],
  });
  assert.deepEqual(healthyPrior.map((drop) => drop.id), ['oh-live']);

  const unsafe = mergePartialRefreshDrops({
    previousDrops: [],
    currentDrops: [{ id: 'oh-unsafe', state: 'OH', sourceStale: true, alertable: true }],
    partialRefresh: true,
    attemptedStateIds: ['OH'],
    fallbackStateIds: ['OH'],
  });
  assert.deepEqual(unsafe, []);
});

test('full refresh never retains rows solely from the previous contract', () => {
  const merged = mergePartialRefreshDrops({
    previousDrops: [{ id: 'old', state: 'IL' }],
    currentDrops: [{ id: 'new', state: 'IL' }],
    partialRefresh: false,
    attemptedStateIds: ['IL'],
  });
  assert.deepEqual(merged, [{ id: 'new', state: 'IL' }]);
});
