import assert from 'node:assert/strict';
import test from 'node:test';
import { searchCoverageTargets } from '../src/lib/coverage-model.ts';

test('Finder describes scheduled pickup checks without claiming current stock', () => {
  const store = {
    id: 'top-ten-liquors:andover', state: 'MN', type: 'store', name: 'Top Ten Liquors', city: 'Andover',
    address: '13627 Quinn St NW, Andover, MN 55304, USA', source: 'First-party pickup inventory',
    collectorAttached: true, inventoryCapability: 'exact_store_source_registered',
  };
  const state = { customerLabel: 'Minnesota', publicStatus: 'active', coverageTier: 'sparse_live_store_inventory' };
  const runFinder = (location = store, publicStatus = state.publicStatus) => searchCoverageTargets({
    stateCode: 'MN', query: 'Top Ten Liquors', locations: [location],
    lifecycle: { activeStates: publicStatus === 'active' ? ['MN'] : [], states: { MN: { ...state, publicStatus } } },
  }).find(row => row.kind === 'store');

  const scheduled = runFinder();
  assert.equal(scheduled?.status, 'known-expansion-candidate');
  assert.match(scheduled?.detail || '', /included in scheduled pickup checks/);
  assert.match(scheduled?.detail || '', /no current bottle listing/);
  assert.doesNotMatch(runFinder(store, 'research_only')?.detail || '', /scheduled pickup checks/);
  assert.doesNotMatch(runFinder({ ...store, source: 'Official store directory' })?.detail || '', /scheduled pickup checks/);
});
