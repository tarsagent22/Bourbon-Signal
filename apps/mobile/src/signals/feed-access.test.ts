import assert from 'node:assert/strict';
import test from 'node:test';
import { allowedFeedFilters } from './feed-access';
import { DEFAULT_SIGNAL_FILTERS } from './feed-filters';

test('restored premium filters cannot issue misleading Standard/Free requests', () => {
  const saved = { ...DEFAULT_SIGNAL_FILTERS, state:'NC', area:'Triad Municipal ABC', bottle:'Willett', freshness:'24h' as const };
  for (const tier of ['free','standard',undefined] as const) {
    assert.deepEqual(allowedFeedFilters(saved,tier), {...saved,area:'',bottle:'',freshness:null});
  }
  for (const tier of ['barrel','bottled-in-bond'] as const) assert.deepEqual(allowedFeedFilters(saved,tier),saved);
  assert.equal(saved.area,'Triad Municipal ABC');
});
