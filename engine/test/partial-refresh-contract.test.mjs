import assert from 'node:assert/strict';
import test from 'node:test';
import { detectDropCollapseFallbacks, mergePartialRefreshDrops } from '../src/partial-refresh-contract.mjs';

test('drop collapse detection marks attempted states for safe publication fallback', () => {
  const previous = { states: [{ state: 'IN', dropCount: 72 }, { state: 'TN', dropCount: 35 }] };
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
