import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  INDIANA_CITYHIVE_CACHE_MAX_AGE_MS,
  INDIANA_CITYHIVE_EXPANSION_TARGETS,
  INDIANA_CITYHIVE_SOURCE_COHORT_SIZE,
  INDIANA_TARGET_STORES,
  indianaCityHivePriorityRank,
  isIndianaCityHivePriorityMarket,
  filterFreshIndianaTargetSignals,
  mergeIndianaTargetCacheSignals,
  isIndianaCityHiveCacheUsable,
  parseIndianaTargetFulfillment,
  parseIndianaTargetSearchProducts,
  selectIndianaCityHivePriorityMerchants,
  selectIndianaCityHiveRequestedSources,
  selectIndianaCityHiveSourceCohort,
  shouldWriteIndianaTargetCache,
} from '../src/collectors/indiana-retailer-surfaces.mjs';
import { cachedIndianaCityHiveSignals, collectIndiana, legacyPrecisionRuntimeOptions, mergeIndianaCityHiveRetentionCaches, mergeMissingIndianaCityHiveCacheChains, precisionExistingSignalsForState, previousIndianaCityHiveCache } from '../src/collectors/precision-probes.mjs';
import {
  isIndianaRetailerInventory,
  isIndianaRetailerSignalIdentity,
} from '../src/indiana-retailer-policy.mjs';

const INDIANA_SOURCE_OUTCOMES = new Set(['adopted', 'viable_not_adopted', 'rejected', 'blocked']);
const INDIANA_SOURCE_CLASSES = new Set(['first_party', 'delegated_marketplace', 'official_directory', 'other_public']);

const EXPECTED_TARGET_STORES = new Map([
  ['1530', ['Muncie', '3601 N Barr St, Muncie, IN 47303']],
  ['111', ['Kokomo', '1037 S Reed Rd, Kokomo, IN 46902']],
  ['1911', ['Columbus', '1865 N National Rd, Columbus, IN 47201']],
  ['139', ['New Albany', '2209 State St, New Albany, IN 47150']],
  ['2068', ['Clarksville', '1125 Veterans Pkwy, Clarksville, IN 47129']],
  ['1481', ['Evansville', '6625 E Lloyd Expy, Evansville, IN 47715']],
  ['108', ['Evansville', '4000 1st Ave, Evansville, IN 47710']],
  ['1762', ['Lafayette', '3630 South Street, Lafayette, IN 47905']],
  ['3309', ['West Lafayette', '300 W State St, Ste 100, West Lafayette, IN 47906']],
]);

const EXPECTED_BIG_RED_EXPANSION_MERCHANTS = new Map([
  ['5e92525978e8f13c2cb1e15c', ['Bloomington', '1255 S College Mall Rd, Bloomington, IN 47401, USA']],
  ['5e92525778e8f13c2cb1e158', ['Bloomington', '3207 E 3rd St, Bloomington, IN 47401, USA']],
  ['5e92506878e8f13c2cb1e154', ['Bloomington', '1870 S Walnut St, Bloomington, IN 47401, USA']],
  ['5e92547478e8f13c2cb1e1a8', ['Bloomington', '713 W 17th St, Bloomington, IN 47404, USA']],
  ['5e92547178e8f13c2cb1e1a4', ['Bloomington', '2205 N Walnut St, Bloomington, IN 47404, USA']],
  ['5e92445578e8f13c2cb1e14c', ['Bloomington', '1110 N College Ave, Bloomington, IN 47404, USA']],
  ['5e92506478e8f13c2cb1e150', ['Bloomington', '418 N College Ave, Bloomington, IN 47404, USA']],
  ['5e92545478e8f13c2cb1e17c', ['Bloomington', '2501 S Leonard Springs Rd, Bloomington, IN 47403, USA']],
  ['5e92545778e8f13c2cb1e180', ['Bloomington', '2401 W 3rd St, Bloomington, IN 47404, USA']],
  ['5e92546e78e8f13c2cb1e1a0', ['West Terre Haute', '400 National Ave, West Terre Haute, IN 47885, USA']],
  ['5e92546b78e8f13c2cb1e19c', ['Terre Haute', '2500 Maple Ave, Terre Haute, IN 47804, USA']],
  ['5e92544c78e8f13c2cb1e170', ['Terre Haute', '1701 S 3rd St, Terre Haute, IN 47802, USA']],
  ['5e92544e78e8f13c2cb1e174', ['Terre Haute', '2655 Wabash Ave, Terre Haute, IN 47803, USA']],
  ['5e92545178e8f13c2cb1e178', ['Terre Haute', '4791 S 7th St, Terre Haute, IN 47802, USA']],
  ['5e92546678e8f13c2cb1e194', ['Terre Haute', '1011 N 3rd St, Terre Haute, IN 47807, USA']],
  ['5e92546878e8f13c2cb1e198', ['Terre Haute', '226 N 13th St, Terre Haute, IN 47807, USA']],
  ['5e9254c478e8f13c2cb1e214', ['Martinsville', '1631 E Morgan St, Martinsville, IN 46151, USA']],
  ['5e9254c178e8f13c2cb1e210', ['Martinsville', '2194 Burton Ln, Martinsville, IN 46151, USA']],
  ['5e92545e78e8f13c2cb1e188', ['Martinsville', '490 Morton Ave, Martinsville, IN 46151, USA']],
  ['5e92545b78e8f13c2cb1e184', ['Bedford', '3307 16th St, Bedford, IN 47421, USA']],
]);

test('Indiana Target registry binds official store IDs to exact Indiana addresses', () => {
  assert.equal(INDIANA_TARGET_STORES.size, EXPECTED_TARGET_STORES.size);
  for (const [id, [city, address]] of EXPECTED_TARGET_STORES) {
    const store = INDIANA_TARGET_STORES.get(id);
    assert.ok(store, `missing Target store ${id}`);
    assert.equal(store.city, city);
    assert.equal(store.address, address);
    assert.match(store.zip, /^\d{5}$/);
    assert.equal(store.officialUrl, `https://www.target.com/sl/${store.slug}/${id}`);
  }
});

test('Indiana CityHive branch expansion prioritizes every Gays Hops-N-Schnapps market', () => {
  for (const city of ['Auburn', 'Fremont', 'Angola', 'LaGrange']) {
    assert.equal(isIndianaCityHivePriorityMarket(`Gays ${city}, IN`), true, city);
  }
  assert.equal(isIndianaCityHivePriorityMarket('Louisville, KY'), false);
  assert(indianaCityHivePriorityRank('Auburn') < indianaCityHivePriorityRank('unknown Indiana town'));
});

test('Indiana CityHive expansion appends exactly 20 live-proven Big Red merchants beyond the base cohort', () => {
  assert.equal(INDIANA_CITYHIVE_EXPANSION_TARGETS.length, 20);
  assert.equal(new Set(INDIANA_CITYHIVE_EXPANSION_TARGETS.map((store) => store.merchantId)).size, 20);
  for (const store of INDIANA_CITYHIVE_EXPANSION_TARGETS) {
    const expected = EXPECTED_BIG_RED_EXPANSION_MERCHANTS.get(store.merchantId);
    assert.ok(expected, `unexpected expansion merchant ${store.merchantId}`);
    assert.deepEqual([store.city, store.address], expected);
  }

  const base = Array.from({ length: 48 }, (_, index) => ({
    id: `base-${index}`,
    name: `Base store ${index}`,
    city: 'Auburn',
    address: `${index + 1} Main St, Auburn, IN 46706`,
    ordinal: index,
  }));
  const expansion = INDIANA_CITYHIVE_EXPANSION_TARGETS.map((store, index) => ({
    id: store.merchantId,
    name: store.name,
    city: store.city,
    address: store.address,
    ordinal: base.length + index,
  }));
  const excluded = [
    { id: 'french-lick', name: 'French Lick candidate', city: 'French Lick', address: '1 Main St, French Lick, IN', ordinal: 68 },
    { id: 'morgantown', name: 'Morgantown candidate', city: 'Morgantown', address: '2 Main St, Morgantown, IN', ordinal: 69 },
    { id: 'trafalgar', name: 'Trafalgar candidate', city: 'Trafalgar', address: '3 Main St, Trafalgar, IN', ordinal: 70 },
  ];
  const selected = selectIndianaCityHivePriorityMerchants([...base, ...expansion, ...excluded], { baseLimit: 48 });
  assert.equal(selected.length, 68);
  assert.deepEqual(new Set(selected.slice(48).map((store) => store.id)), new Set(EXPECTED_BIG_RED_EXPANSION_MERCHANTS.keys()));
  assert.equal(selected.some((store) => excluded.some((candidate) => candidate.id === store.id)), false);
});

test('Indiana CityHive cache expires before customer inventory cards become stale', () => {
  const now = Date.parse('2026-08-08T21:00:00.000Z');
  const inventory = { eventType: 'cityhive_store_inventory_result' };
  assert.ok(INDIANA_CITYHIVE_CACHE_MAX_AGE_MS <= 6 * 60 * 60_000);
  assert.equal(isIndianaCityHiveCacheUsable({ generatedAt: '2026-08-08T15:00:00.000Z', signals: [inventory] }, now), true);
  assert.equal(isIndianaCityHiveCacheUsable({ generatedAt: '2026-08-08T14:59:59.999Z', signals: [inventory] }, now), false);
  assert.equal(isIndianaCityHiveCacheUsable({ generatedAt: '2026-08-08T21:00:00.001Z', signals: [inventory] }, now), false);
  assert.equal(isIndianaCityHiveCacheUsable({ generatedAt: '2026-08-08T20:00:00.000Z', signals: [{ eventType: 'retailer_store_location' }] }, now), false);
  assert.equal(isIndianaCityHiveCacheUsable({ generatedAt: 'invalid', signals: [inventory] }, now), false);
});

test('Indiana CityHive source cohorts rotate without starving providers at a three-hour cadence', () => {
  const sources = Array.from({ length: 9 }, (_, index) => ({ id: `source-${index}` }));
  const first = selectIndianaCityHiveSourceCohort(sources, '2026-08-08T20:00:00.000Z');
  const second = selectIndianaCityHiveSourceCohort(sources, '2026-08-08T21:00:00.000Z');
  assert.equal(INDIANA_CITYHIVE_SOURCE_COHORT_SIZE, 3);
  assert.equal(first.length, 3);
  assert.equal(second.length, 3);
  assert.notDeepEqual(first, second);
  assert.equal(selectIndianaCityHiveSourceCohort(sources, '2026-08-08T20:00:00.000Z', { forceAll: true }).length, 9);
  for (const cohortSize of [1, 2, 3]) {
    const threeHourCoverage = new Set();
    for (let hour = 0; hour < 27; hour += 3) {
      const observedAt = new Date(Date.parse('2026-08-08T00:00:00.000Z') + hour * 60 * 60_000).toISOString();
      for (const source of selectIndianaCityHiveSourceCohort(sources, observedAt, { cohortSize })) threeHourCoverage.add(source.id);
    }
    assert.equal(threeHourCoverage.size, 9, `cohort size ${cohortSize} permanently starved a provider`);
  }
});

test('Indiana source cohort reserves a rotating rare-yield slot without starving exploration', () => {
  const sources = ['big-red', 'cap-n-cork', 'belmont-beverage', 'wise-guys', 'cork-liquors', '21st-amendment']
    .map((id) => ({ id }));
  const prioritySourceIds = ['big-red', 'cap-n-cork', 'belmont-beverage'];
  const selected = selectIndianaCityHiveSourceCohort(sources, '2026-08-09T16:00:00.000Z', {
    cohortSize: 3,
    prioritySourceIds,
    prioritySlots: 1,
  });
  assert.equal(selected.length, 3);
  assert.equal(prioritySourceIds.includes(selected[0].id), true);
  assert.equal(selected.slice(1).some((source) => !prioritySourceIds.includes(source.id)), true);
  assert.equal(new Set(selected.map((source) => source.id)).size, 3);

  const explored = new Set();
  for (let hour = 0; hour < 36; hour += 3) {
    const observedAt = new Date(Date.parse('2026-08-09T00:00:00.000Z') + hour * 60 * 60_000).toISOString();
    for (const source of selectIndianaCityHiveSourceCohort(sources, observedAt, {
      cohortSize: 3,
      prioritySourceIds,
      prioritySlots: 1,
    })) explored.add(source.id);
  }
  assert.deepEqual(explored, new Set(sources.map((source) => source.id)));
});

test('Indiana targeted CityHive source selection is bounded and fails closed on unknown providers', () => {
  const sources = [{ id: 'big-red' }, { id: 'cap-n-cork' }, { id: 'wise-guys' }];
  assert.deepEqual(selectIndianaCityHiveRequestedSources(sources, 'big-red, wise-guys'), [sources[0], sources[2]]);
  assert.deepEqual(selectIndianaCityHiveRequestedSources(sources, ''), []);
  assert.throws(() => selectIndianaCityHiveRequestedSources(sources, 'big-red,unknown-source'), /Unknown Indiana CityHive source id/);
});

test('targeted Indiana publication forces a live Big Red-only CityHive pass', async () => {
  const workflow = await readFile(new URL('../../.github/workflows/refresh-feed.yml', import.meta.url), 'utf8');
  const standaloneRefresh = await readFile(new URL('../src/refresh-in.mjs', import.meta.url), 'utf8');
  assert.match(workflow, /BOURBON_SIGNAL_IN_FORCE_CITYHIVE_LIVE:\s*\$\{\{ contains\(inputs\.states, 'IN'\) && '1' \|\| '0' \}\}/);
  assert.match(workflow, /BOURBON_SIGNAL_IN_CITYHIVE_SOURCE_IDS:\s*\$\{\{ contains\(inputs\.states, 'IN'\) && 'big-red' \|\| '' \}\}/);
  assert.match(workflow, /Verify targeted Indiana inventory expansion[\s\S]*?contains\(inputs\.states, 'IN'\)[\s\S]*?npm run verify:in/);
  assert.match(standaloneRefresh, /BOURBON_SIGNAL_IN_FORCE_CITYHIVE_LIVE:\s*'1'/);
  assert.match(standaloneRefresh, /BOURBON_SIGNAL_IN_CITYHIVE_SOURCE_IDS:\s*'big-red'/);
  assert.match(standaloneRefresh, /BOURBON_SIGNAL_FORCE_SOURCE_RUN:\s*'1'/);
});

test('Indiana CityHive fallback preserves source observation time and denies stale alerts', () => {
  const cached = cachedIndianaCityHiveSignals({
    generatedAt: '2026-08-08T21:00:00.000Z',
    signals: [
      { id: 'fresh', eventType: 'cityhive_store_inventory_result', observedAt: '2026-08-08T20:00:00.000Z', canAlertAsInventory: true, canAlertAsWatch: true, raw: { chain: 'big-red' } },
      { id: 'old', eventType: 'cityhive_store_inventory_result', observedAt: '2026-08-08T08:59:59.999Z', canAlertAsInventory: true, canAlertAsWatch: true, raw: { chain: 'cap-n-cork' } },
    ],
  }, '2026-08-08T21:00:00.000Z');
  assert.equal(cached[0].observedAt, '2026-08-08T20:00:00.000Z');
  assert.equal(cached[0].canAlertAsInventory, true);
  assert.equal(cached[1].observedAt, '2026-08-08T08:59:59.999Z');
  assert.equal(cached[1].stale, true);
  assert.equal(cached[1].sourceStale, true);
  assert.equal(cached[1].canAlertAsInventory, false);
  assert.equal(cached[1].canAlertAsWatch, false);
});

test('Indiana prior-state retention preserves its real timestamp and provenance', () => {
  const cache = previousIndianaCityHiveCache([{
    id: 'prior',
    eventType: 'cityhive_store_inventory_result',
    observedAt: '2026-08-08T20:00:00.000Z',
    canAlertAsInventory: true,
    raw: { chain: 'big-red' },
  }]);
  assert.equal(cache.generatedAt, '2026-08-08T20:00:00.000Z');
  assert.equal(cache.cacheSource, 'previous_state_report');
  const [retained] = cachedIndianaCityHiveSignals(cache, '2026-08-08T21:00:00.000Z');
  assert.equal(retained.observedAt, '2026-08-08T20:00:00.000Z');
  assert.equal(retained.raw.cacheSource, 'previous_state_report');
  assert.equal(retained.raw.cacheGeneratedAt, '2026-08-08T20:00:00.000Z');
  const unknown = previousIndianaCityHiveCache([{
    id: 'unknown-time', eventType: 'cityhive_store_inventory_result', raw: { chain: 'big-red' },
  }]);
  assert.equal(unknown.generatedAt, null);
  const [unknownRetained] = cachedIndianaCityHiveSignals(unknown, '2026-08-08T21:00:00.000Z');
  assert.equal(unknownRetained.raw.cacheGeneratedAt, null);
  assert.equal(unknownRetained.stale, true);
  assert.equal(unknownRetained.canAlertAsInventory, false);
  const inherited = previousIndianaCityHiveCache([{
    id: 'inherited',
    eventType: 'cityhive_store_inventory_result',
    observedAt: '2026-08-08T19:00:00.000Z',
    raw: { chain: 'big-red', cacheSource: 'durable-cityhive-cache', cacheGeneratedAt: '2026-08-08T19:30:00.000Z' },
  }]);
  assert.equal(inherited.generatedAt, '2026-08-08T19:30:00.000Z');
  const [inheritedRetained] = cachedIndianaCityHiveSignals(inherited, '2026-08-08T21:00:00.000Z');
  assert.equal(inheritedRetained.raw.cacheSource, 'durable-cityhive-cache');
  assert.equal(inheritedRetained.raw.cacheGeneratedAt, '2026-08-08T19:30:00.000Z');
  const mixed = previousIndianaCityHiveCache([
    { id: 'known', eventType: 'cityhive_store_inventory_result', observedAt: '2026-08-08T20:00:00.000Z', raw: { chain: 'big-red' } },
    { id: 'still-unknown', eventType: 'cityhive_store_inventory_result', raw: { chain: 'cap-n-cork' } },
  ]);
  assert.equal(mixed.generatedAt, '2026-08-08T20:00:00.000Z');
  assert.equal(mixed.signals.find((signal) => signal.id === 'still-unknown').raw.retainedCacheGeneratedAt, null);
  const projectedMixed = cachedIndianaCityHiveSignals(mixed, '2026-08-08T21:00:00.000Z');
  assert.equal(projectedMixed.find((signal) => signal.id === 'still-unknown').raw.cacheGeneratedAt, null);
});

test('Indiana targeted refresh receives prior precision rows for partial source continuity', () => {
  const current = [{ id: 'current' }];
  const prior = [{ id: 'prior' }, { id: 'current', retained: true }];
  const merged = precisionExistingSignalsForState('IN', current, {
    'precision:in': { value: { signals: prior } },
  });
  assert.deepEqual(merged, [{ id: 'prior' }, { id: 'current' }]);
  assert.equal(precisionExistingSignalsForState('OH', current, {}).length, 1);
});

test('Indiana disk cache overlays rather than replaces broader prior state evidence', () => {
  const merged = mergeIndianaCityHiveRetentionCaches(
    { generatedAt: '2026-08-08T21:00:00.000Z', signals: [{ id: 'shared', value: 'cache' }, { id: 'cache-only' }], roadblocks: [] },
    { generatedAt: '2026-08-08T20:00:00.000Z', signals: [{ id: 'shared', value: 'prior' }, { id: 'prior-only' }], roadblocks: [] },
    '2026-08-08T21:00:00.000Z',
  );
  assert.equal(merged.generatedAt, '2026-08-08T21:00:00.000Z');
  assert.deepEqual(merged.signals, [{ id: 'shared', value: 'cache' }, { id: 'prior-only' }, { id: 'cache-only' }]);
});

test('Indiana partial refresh retains missing identities from a refreshed chain only as stale context', () => {
  const signals = [{ id: 'current', eventType: 'cityhive_store_inventory_result', observedAt: '2026-08-08T21:00:00.000Z', canAlertAsInventory: true, raw: { chain: 'big-red' } }];
  const added = mergeMissingIndianaCityHiveCacheChains(signals, {
    generatedAt: '2026-08-08T20:00:00.000Z',
    signals: [
      { id: 'current', eventType: 'cityhive_store_inventory_result', observedAt: '2026-08-08T20:00:00.000Z', canAlertAsInventory: true, canAlertAsWatch: true, raw: { chain: 'big-red' } },
      { id: 'missing', eventType: 'cityhive_store_inventory_result', observedAt: '2026-08-08T20:00:00.000Z', canAlertAsInventory: true, canAlertAsWatch: true, raw: { chain: 'big-red' } },
    ],
  }, '2026-08-08T21:00:00.000Z', { refreshedSourceIds: new Set(['big-red']) });
  assert.equal(added, 1);
  assert.equal(signals.length, 2);
  assert.equal(signals[1].id, 'missing');
  assert.equal(signals[1].stale, true);
  assert.equal(signals[1].canAlertAsInventory, false);
  assert.equal(signals[1].canAlertAsWatch, false);
});

test('Indiana zero-row completed source immediately demotes its retained inventory', () => {
  const signals = [];
  const added = mergeMissingIndianaCityHiveCacheChains(signals, {
    generatedAt: '2026-08-08T20:00:00.000Z',
    signals: [{
      id: 'missing-after-refresh',
      eventType: 'cityhive_store_inventory_result',
      observedAt: '2026-08-08T20:00:00.000Z',
      canAlertAsInventory: true,
      canAlertAsWatch: true,
      raw: { chain: 'big-red' },
    }],
  }, '2026-08-08T21:00:00.000Z', { refreshedSourceIds: new Set(['big-red']) });
  assert.equal(added, 1);
  assert.equal(signals[0].stale, true);
  assert.equal(signals[0].sourceStale, true);
  assert.equal(signals[0].canAlertAsInventory, false);
  assert.equal(signals[0].canAlertAsWatch, false);
});

test('Indiana incomplete source retains missing cached identities without demoting them', () => {
  const signals = [{
    id: 'early-live-row', eventType: 'cityhive_store_inventory_result', observedAt: '2026-08-08T21:00:00.000Z',
    canAlertAsInventory: true, canAlertAsWatch: true, raw: { chain: 'big-red' },
  }];
  const added = mergeMissingIndianaCityHiveCacheChains(signals, {
    generatedAt: '2026-08-08T20:00:00.000Z',
    signals: [{
      id: 'unseen-after-429', eventType: 'cityhive_store_inventory_result', observedAt: '2026-08-08T20:00:00.000Z',
      canAlertAsInventory: true, canAlertAsWatch: true, raw: { chain: 'big-red' },
    }],
  }, '2026-08-08T21:00:00.000Z', { refreshedSourceIds: new Set() });
  assert.equal(added, 1);
  assert.equal(signals[1].stale, undefined);
  assert.equal(signals[1].canAlertAsInventory, true);
  assert.equal(signals[1].canAlertAsWatch, true);
});

test('Indiana precision collector has one bounded deadline below the parent state watchdog', () => {
  assert.deepEqual(legacyPrecisionRuntimeOptions('IN', {}, {}), { timeoutMs: 600_000, maxAttempts: 1 });
});

test('Indiana precision collector propagates runtime cancellation before network or cache work', async () => {
  const controller = new AbortController();
  controller.abort(new Error('stop Indiana precision'));
  await assert.rejects(
    collectIndiana({ id: 'IN' }, [], [], { signal: controller.signal }),
    /stop Indiana precision/,
  );
});

test('Indiana lawful-source audit is complete, stable, and machine-classifiable', async () => {
  const audit = JSON.parse(await readFile(new URL('../data/source-atlas/IN.json', import.meta.url), 'utf8'));
  assert.equal(audit.contractVersion, 'bourbon-signal-indiana-source-audit-v2');
  assert.equal(audit.knownSourceUniverseComplete, true);
  assert.equal(audit.discoveryPasses.length, 3);
  assert.equal(new Set(audit.discoveryPasses.map((pass) => pass.method)).size, audit.discoveryPasses.length);
  assert.equal(audit.inventoryExpansion.baselineFreshInventoryStores, 72);
  assert.equal(audit.inventoryExpansion.targetCount, 20);
  assert.equal(audit.inventoryExpansion.targets.length, 20);
  assert.deepEqual(
    new Set(audit.inventoryExpansion.targets.map((store) => store.merchantId)),
    new Set(INDIANA_CITYHIVE_EXPANSION_TARGETS.map((store) => store.merchantId)),
  );
  assert.ok(audit.sources.length >= 25);
  assert.equal(new Set(audit.sources.map((source) => source.sourceId)).size, audit.sources.length);
  for (const source of audit.sources) {
    assert.match(source.sourceId, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.ok(INDIANA_SOURCE_CLASSES.has(source.sourceClass), source.sourceId);
    assert.ok(INDIANA_SOURCE_OUTCOMES.has(source.outcome), source.sourceId);
    assert.match(source.reasonCode, /^[a-z0-9]+(?:_[a-z0-9]+)*$/, source.sourceId);
  }
});

test('Indiana verifier distinguishes fresh alertable rows from stale nonalertable continuity', async () => {
  const verifier = await readFile(new URL('../src/verify-in.mjs', import.meta.url), 'utf8');
  const collector = await readFile(new URL('../src/collectors/precision-probes.mjs', import.meta.url), 'utf8');
  assert.match(verifier, /liveRetailerInventoryStores\.size >= 5/);
  assert.match(verifier, /expansionTargetInventoryStores\.size === 20/);
  assert.match(verifier, /observedAtMs >= stateStartedAt/);
  assert.match(verifier, /staleRetailerInventorySignals\.every/);
  assert.match(verifier, /staleAlertableRetailerInventoryDrops\.length === 0/);
  assert.match(verifier, /siteExports\.every/);
  assert.match(verifier, /dropsExport\.engineGeneratedAt === summary\.generatedAt/);
  assert.match(verifier, /siteGeneratedAt - stateFinishedAt <= 2 \* 60 \* 60_000/);
  assert.doesNotMatch(verifier, /alertableRetailerInventorySignals\.length >= 300/);
  assert.match(collector, /sourceReachable && sourceComplete/);
  assert.match(collector, /if \(signal\?\.aborted\) throw error/);
});

test('Target response parsers fail closed on malformed reachable payloads', () => {
  for (const malformed of [null, {}, '{bad json', { data: { search: { products: {} } } }]) {
    assert.deepEqual(parseIndianaTargetSearchProducts(malformed), []);
  }
  for (const malformed of [null, {}, '{bad json', { data: { product: { fulfillment: { store_options: {} } } } }]) {
    assert.deepEqual(parseIndianaTargetFulfillment(malformed), []);
  }
  const products = [{ tcin: '1' }];
  assert.deepEqual(parseIndianaTargetSearchProducts({ data: { search: { products } } }), products);
});

test('Target partial refresh retains fresh cache for incomplete selected stores', () => {
  const live = [{ id: 'live-111', merchantId: '111' }];
  const cached = [
    { id: 'cached-1530', merchantId: '1530' },
    { id: 'cached-111', merchantId: '111' },
    { id: 'cached-1911', merchantId: '1911' },
    { id: 'live-111', merchantId: '1911' },
  ];
  const merged = mergeIndianaTargetCacheSignals(live, cached, {
    selectedStoreIds: new Set(['1530', '111']),
    completedStoreIds: new Set(['111']),
  });
  assert.deepEqual(merged.map((row) => row.id).sort(), ['cached-1530', 'cached-1911', 'live-111']);
  assert.equal(shouldWriteIndianaTargetCache(0, new Set(['111'])), true);
  assert.equal(shouldWriteIndianaTargetCache(0, new Set()), false);
});

test('Target cache freshness follows each row observation time, not a rewritten artifact timestamp', () => {
  const now = Date.parse('2026-07-14T20:00:00.000Z');
  const rows = [
    { id: 'fresh', observedAt: '2026-07-14T19:59:30.000Z' },
    { id: 'expired', observedAt: '2026-07-14T19:58:00.000Z' },
    { id: 'invalid', observedAt: 'not-a-date' },
  ];
  assert.deepEqual(filterFreshIndianaTargetSignals(rows, now, 60_000).map((row) => row.id), ['fresh']);
});

test('Target fulfillment parser accepts only known store-bound pickup or in-store availability', () => {
  const rows = parseIndianaTargetFulfillment({
    data: {
      product: {
        fulfillment: {
          store_options: [
            { location_id: '1530', location_available_to_promise_quantity: 7, order_pickup: { availability_status: 'IN_STOCK' }, in_store_only: { availability_status: 'OUT_OF_STOCK' } },
            { location_id: '111', location_available_to_promise_quantity: 5, order_pickup: { availability_status: 'OUT_OF_STOCK' }, in_store_only: { availability_status: 'OUT_OF_STOCK' } },
            { location_id: '1911', location_available_to_promise_quantity: 2, order_pickup: { availability_status: 'OUT_OF_STOCK' }, in_store_only: { availability_status: 'IN_STOCK' } },
            { location_id: '9999', location_available_to_promise_quantity: 99, order_pickup: { availability_status: 'IN_STOCK' } },
          ],
        },
      },
    },
  });

  assert.deepEqual(rows.map((row) => row.locationId), ['1530', '1911']);
  assert.equal(rows[0].availableToPromise, 7);
  assert.equal(rows[0].availabilityMode, 'order_pickup');
  assert.equal(rows[1].availabilityMode, 'in_store_only');
});

function targetSignal(overrides = {}) {
  return {
    state: 'IN',
    stateCode: 'IN',
    sourceLabel: 'Target Indiana RedSky store fulfillment',
    sourceUrl: 'https://www.target.com/p/-/A-12345678',
    sourceChain: 'target',
    merchantId: '1530',
    eventType: 'retailer_store_inventory_result',
    locationPrecision: 'store_level',
    storeId: 'target:1530',
    storeAddress: '3601 N Barr St, Muncie, IN 47303',
    city: 'Muncie',
    quantity: 0,
    availabilityStatus: 'in_stock',
    sourceAvailabilityVerified: true,
    canAlertAsInventory: true,
    canAlertAsWatch: true,
    raw: { chain: 'target', merchantId: '1530', availableToPromise: 7 },
    ...overrides,
  };
}

test('Indiana inventory policy accepts exact Target binary orderability without inventing quantity', () => {
  const signal = targetSignal();
  assert.equal(isIndianaRetailerSignalIdentity(signal), true);
  assert.equal(isIndianaRetailerInventory(signal), true);
  assert.equal(signal.quantity, 0);

  const projectedDrop = {
    ...signal,
    type: signal.eventType,
    eventType: undefined,
    source: signal.sourceLabel,
    sourceLabel: undefined,
    stateCode: undefined,
    raw: undefined,
    sourceChain: 'target',
    merchantId: '1530',
  };
  assert.equal(isIndianaRetailerSignalIdentity(projectedDrop), true);
  assert.equal(isIndianaRetailerInventory(projectedDrop), true);
});

test('Indiana inventory identity fails closed on host, store, geography, and sentinel mismatches', () => {
  assert.equal(isIndianaRetailerInventory(targetSignal({ sourceUrl: 'https://target.example/p/-/A-12345678' })), false);
  assert.equal(isIndianaRetailerInventory(targetSignal({ merchantId: '111', storeId: 'target:1530' })), false);
  assert.equal(isIndianaRetailerInventory(targetSignal({ storeAddress: '3601 N Barr St, Muncie, OH 47303' })), false);
  assert.equal(isIndianaRetailerInventory(targetSignal({ stateCode: 'OH' })), false);
  assert.equal(isIndianaRetailerInventory(targetSignal({ stale: true, canAlertAsInventory: false })), false);
  assert.equal(isIndianaRetailerInventory(targetSignal({ raw: { chain: 'target', merchantId: '1530', reportedQuantity: 1, staleFallback: true }, canAlertAsInventory: false })), false);
  assert.equal(isIndianaRetailerInventory(targetSignal({ quantity: 100, raw: { chain: 'target', merchantId: '1530', reportedQuantity: 100 } })), false);
});

test('Indiana policy binds existing first-party retailer identities and keeps DoorDash watch-only', () => {
  const bigRed = {
    state: 'IN', stateCode: 'IN', sourceLabel: 'Big Red Liquors CityHive store inventory',
    sourceUrl: 'https://bigredliquors.com/shop/product/example', eventType: 'cityhive_store_inventory_result',
    locationPrecision: 'store_level', storeId: 'big-red:5e92544978e8f13c2cb1e16c',
    storeAddress: '435 S Walnut St, Bloomington, IN 47401, USA', quantity: 2,
    availabilityStatus: 'in_stock', canAlertAsInventory: true, raw: { chain: 'big-red', reportedQuantity: 2 },
  };
  const payless = {
    state: 'IN', stateCode: 'IN', sourceLabel: 'Payless Liquors East Street barrel selections',
    sourceUrl: 'https://www.paylessliquors.info/barrel-selections', eventType: 'retailer_store_inventory_result',
    locationPrecision: 'store_level', storeId: 'payless-liquors:east-street',
    storeAddress: '3825 S. East Street, Indianapolis, IN 46227', quantity: 1,
    availabilityStatus: 'available_store_pick', canAlertAsInventory: true, raw: { chain: 'payless-liquors' },
  };
  const penguin = {
    state: 'IN', stateCode: 'IN', sourceLabel: 'Penguin Liquor Lafayette in-stock product pages',
    sourceUrl: 'https://www.penguinliquor.com/p/buffalo-trace-bourbon/1138', eventType: 'retailer_store_inventory_result',
    locationPrecision: 'store_level', storeId: 'penguin-liquor:96',
    storeAddress: '3295 Teal Road, Lafayette, IN 47905', quantity: 1,
    availabilityStatus: 'in_stock', canAlertAsInventory: true,
    raw: { source: 'penguin_liquor_gotoliquorstore_product_page', quantitySemantics: 'in_stock_no_exact_count' },
  };
  const gays = {
    ...bigRed,
    sourceLabel: "Gays Hops-N-Schnapps CityHive store inventory",
    sourceUrl: 'https://gayshopsnschnapps.com/shop/product/example',
    storeId: 'gays-hops-n-schnapps:6230bb5d71da8220ca315f14',
    storeAddress: '101 Growth Parkway, Angola, IN 46703',
    raw: { chain: 'gays-hops-n-schnapps', reportedQuantity: 2 },
  };
  const vineAndTable = {
    ...bigRed,
    sourceLabel: 'Vine & Table CityHive store inventory',
    sourceUrl: 'https://vineandtable.com/shop/product/example',
    storeId: 'vine-and-table:5f36e823c5f1fb25f240865e',
    storeAddress: '313 East Carmel Drive, Carmel, IN 46032',
    raw: { chain: 'vine-and-table', reportedQuantity: 2 },
  };
  const doorDash = {
    state: 'IN', stateCode: 'IN', sourceLabel: 'DoorDash Frontier Liquors Evansville marketplace inventory',
    sourceUrl: 'https://www.doordash.com/convenience/store/frontier-liquors-evansville-26286224/',
    eventType: 'retailer_store_inventory_result', locationPrecision: 'store_level', storeId: 'doordash:26286224',
    storeAddress: '1701 Oak Hill Road, Evansville, IN 47711', quantity: 1,
    availabilityStatus: 'marketplace_listed_not_out_of_stock', canAlertAsInventory: true,
    raw: { source: 'doordash_frontier_liquors_public_store_page' },
  };

  for (const signal of [bigRed, payless, penguin, gays, vineAndTable]) {
    assert.equal(isIndianaRetailerSignalIdentity(signal), true);
    assert.equal(isIndianaRetailerInventory(signal), true);
  }
  assert.equal(isIndianaRetailerSignalIdentity(doorDash), true);
  assert.equal(isIndianaRetailerInventory(doorDash), false);
  assert.equal(isIndianaRetailerInventory({ ...bigRed, sourceUrl: 'https://evil.example/shop/product/example' }), false);
});
