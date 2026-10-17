import assert from 'node:assert/strict';
import test from 'node:test';
import { allowedFeedFilters } from './feed-access';
import { DEFAULT_SIGNAL_FILTERS } from './feed-filters';

test('all paid billing plans retain full filters while Free is restricted', () => {
  const saved = { ...DEFAULT_SIGNAL_FILTERS, state:'NC', area:'Triad Municipal ABC', bottle:'Willett', freshness:'24h' as const };
  assert.deepEqual(allowedFeedFilters(saved,'standard'), saved);
  for (const tier of ['free', undefined] as const) assert.deepEqual(allowedFeedFilters(saved,tier), {...saved,state:'',area:'',bottle:'',freshness:null,rarities:[]});
  for (const tier of ['barrel','bottled-in-bond'] as const) assert.deepEqual(allowedFeedFilters(saved,tier),saved);
  assert.equal(saved.area,'Triad Municipal ABC');
});
