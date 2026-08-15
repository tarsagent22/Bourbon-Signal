import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { collectCostco } from '../src/collectors/costco.mjs';
import { isActiveCustomerStateRow } from '../src/export-site-contract.mjs';
import { ALL_STATE_SOURCES, CUSTOMER_ACTIVE_STATE_IDS, STATE_SOURCES } from '../src/state-sources.mjs';
import { STATE_LIFECYCLE_CONFIG } from '../src/state-lifecycle.mjs';

const COSTCO_RESEARCH_STATES = ['MI', 'MN', 'MO', 'WA', 'WI'];

const bible = {
  match(name) {
    return /Weller C\.Y\.P\.B\./i.test(String(name || ''))
      ? { confidence: 0.98, record: { id: 'weller-cypb', canonical: 'Weller C.Y.P.B.', tier: 'unicorn' } }
      : null;
  },
};

test('five Costco-only states are honest research-only blocked lifecycle entries with retained research configuration', () => {
  const active = new Set(STATE_LIFECYCLE_CONFIG.activeStates);
  const grandfathered = new Set(STATE_LIFECYCLE_CONFIG.reliabilityPolicy.grandfatheredActiveStates);
  const runtimeStates = new Set(STATE_SOURCES.map((source) => source.id));

  for (const state of COSTCO_RESEARCH_STATES) {
    const lifecycle = STATE_LIFECYCLE_CONFIG.states[state];
    assert.equal(active.has(state), false, `${state} must not be customer-active without recurring observations`);
    assert.equal(CUSTOMER_ACTIVE_STATE_IDS.has(state), false);
    assert.equal(grandfathered.has(state), false, `${state} must not retain grandfathered-active status`);
    assert.equal(lifecycle.publicStatus, 'research_only');
    assert.equal(lifecycle.lifecycle, 'blocked_costco_inventory_research');
    assert.equal(lifecycle.coverageTier, 'blocked');
    assert.equal(lifecycle.inventoryAlertable, false);
    assert.equal(lifecycle.watchAlertable, false);
    assert.equal(lifecycle.shadowEligible, true);
    assert.match(lifecycle.customerSummary, /no recurring|research-only/i);
    assert.equal(runtimeStates.has(state), false, `${state} must not run in the customer-active state set`);

    const research = ALL_STATE_SOURCES.find((source) => source.id === state);
    assert.ok(research, `${state} research source configuration must be retained`);
    assert.equal(research.strategy, 'costco_warehouse_inventory_watch');
    assert.ok(research.sources.some((source) => source.kind === 'costco'));
  }
});

test('site retention rejects inactive states across current and legacy row shapes', () => {
  const active = new Set(['AL', 'GA']);
  assert.equal(isActiveCustomerStateRow({ state: 'AL' }, active), true);
  assert.equal(isActiveCustomerStateRow({ state_code: 'ga' }, active), true);
  assert.equal(isActiveCustomerStateRow({ state: 'MI' }, active), false);
  assert.equal(isActiveCustomerStateRow({ state_code: 'MN' }, active), false);
  assert.equal(isActiveCustomerStateRow({}, active), false);
});

test('Costco runtime distinguishes fresh monitored zero inventory from missing, stale, and invalid observations', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'bs-costco-honesty-'));
  const watchlistPath = path.join(directory, 'watchlist.json');
  const observationsPath = path.join(directory, 'observations.json');
  const previousWatchlist = process.env.COSTCO_WATCHLIST_FILE;
  const previousObservations = process.env.COSTCO_OBSERVATIONS_FILE;
  const previousAge = process.env.COSTCO_MAX_OBSERVATION_AGE_HOURS;
  process.env.COSTCO_WATCHLIST_FILE = watchlistPath;
  process.env.COSTCO_OBSERVATIONS_FILE = observationsPath;
  process.env.COSTCO_MAX_OBSERVATION_AGE_HOURS = '6';
  await writeFile(watchlistPath, JSON.stringify([{ itemNumber: '1280805', canonicalName: 'Weller C.Y.P.B.', aliases: [] }]), 'utf8');

  const base = {
    itemNumber: '1280805',
    bottleName: 'Weller C.Y.P.B.',
    storeName: 'Costco Ann Arbor',
    storeNumber: '1106',
    city: 'Ann Arbor',
    state: 'MI',
    sourceSystem: 'costco_sameday',
    sourceUrl: 'https://sameday.costco.com/store/costco/products/1280805',
  };
  const collect = async (observations) => {
    await writeFile(observationsPath, JSON.stringify({ generatedAt: new Date().toISOString(), observations }), 'utf8');
    return collectCostco({ id: 'MI', label: 'Michigan Costco research' }, bible);
  };

  try {
    const zero = await collect([{ ...base, status: 'out_of_stock', quantity: 0, observedAt: new Date().toISOString() }]);
    assert.equal(zero.signals.length, 0);
    assert.deepEqual(zero.roadblocks, []);
    assert.equal(zero.sources[0].signalType, 'costco_item_watchlist');
    assert.equal(zero.sources[0].reachabilityEligible, false);
    assert.equal(zero.sources[1].ok, true);
    assert.equal(zero.sources[1].signalType, 'costco_warehouse_no_current_inventory');
    assert.equal(zero.sources[1].validFreshObservedRowCount, 1);
    assert.equal(zero.status, 'monitored_no_current_inventory');

    const missing = await collect([]);
    assert.equal(missing.roadblocks[0].status, 'not_configured');
    assert.equal(missing.sources[1].ok, false);
    assert.equal(missing.status, 'observation_feed_missing');

    const stale = await collect([{ ...base, status: 'out_of_stock', quantity: 0, observedAt: new Date(Date.now() - 7 * 60 * 60_000).toISOString() }]);
    assert.equal(stale.roadblocks[0].status, 'stale');
    assert.equal(stale.sources[1].ok, false);
    assert.equal(stale.status, 'observation_feed_stale');

    const invalidTimestamp = await collect([{ ...base, status: 'out_of_stock', quantity: 0, observedAt: 'not-a-time' }]);
    assert.equal(invalidTimestamp.roadblocks[0].status, 'invalid_timestamp');
    assert.equal(invalidTimestamp.sources[1].ok, false);
    assert.equal(invalidTimestamp.status, 'observation_feed_invalid');

    const invalidObservation = await collect([{ ...base, storeNumber: '', status: 'out_of_stock', quantity: 0, observedAt: new Date().toISOString() }]);
    assert.equal(invalidObservation.roadblocks[0].status, 'invalid_observation');
    assert.equal(invalidObservation.sources[1].ok, false);
    assert.equal(invalidObservation.status, 'observation_feed_invalid');
  } finally {
    if (previousWatchlist == null) delete process.env.COSTCO_WATCHLIST_FILE; else process.env.COSTCO_WATCHLIST_FILE = previousWatchlist;
    if (previousObservations == null) delete process.env.COSTCO_OBSERVATIONS_FILE; else process.env.COSTCO_OBSERVATIONS_FILE = previousObservations;
    if (previousAge == null) delete process.env.COSTCO_MAX_OBSERVATION_AGE_HOURS; else process.env.COSTCO_MAX_OBSERVATION_AGE_HOURS = previousAge;
    await rm(directory, { recursive: true, force: true });
  }
});
