import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { verifyCustomerSurfaceClasses } from '../src/verify-customer-surface-classes.mjs';
import { attachRunIdentity } from '../src/site-run-coherence.mjs';
import { loadComparableStateQualityBaseline } from '../src/state-quality-baseline.mjs';
import { buildStateDropPartitions } from '../src/site-state-partitions.mjs';
import { buildStateQualityInputs, buildStateQualityScorecard } from '../src/state-quality-scorecard.mjs';
import { hasUnsafeAlertFlags, projectCustomerSurfaces } from '../src/customer-surface-policy.mjs';

const fixtureDirectory = new URL('./fixtures/customer-surfaces/', import.meta.url);
const readFixture = () => readFile(new URL('published-representatives.json', fixtureDirectory), 'utf8').then(JSON.parse);
const writeJson = (file, payload) => writeFile(file, JSON.stringify(payload));
const fixtureEnvironment = overrides => ({
  ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^BOURBON_SIGNAL_/i.test(key)
    && !/^(PA_STORE_INVENTORY|FAST_STORE_INVENTORY|VA_STORE_INVENTORY|OH_STORE_INVENTORY_FEED|CURRENT_INVENTORY_ALERT)_MAX_AGE_HOURS$/i.test(key))),
  ...overrides,
});

async function hydrateBaseline(baseline, fixture) {
  const { identity, drops, events } = fixture;
  const stateCoverage = { states: [
    { state: 'AL', coverageTier: 'shipment_drop_intelligence', status: 'useful', signalCount: 0, roadblockCount: 0 },
    { state: 'NC', coverageTier: 'live_store_inventory', status: 'useful', signalCount: 2, roadblockCount: 0 },
    { state: 'OH', coverageTier: 'live_store_inventory', status: 'stale_useful', signalCount: 1, roadblockCount: 0 },
    { state: 'NY', coverageTier: 'live_store_inventory', status: 'awaiting_current_source_run', signalCount: 0, roadblockCount: 0 },
  ] };
  const partitions = buildStateDropPartitions(drops, { ...identity, activeStates: stateCoverage.states.map(row => row.state) });
  const quality = buildStateQualityScorecard(buildStateQualityInputs({ stateCoverage, drops, alerts: [] }), { generatedAt: identity.generatedAt });
  await mkdir(path.join(baseline, 'states'), { recursive: true });
  const payloads = {
    'manifest.json': identity,
    'stats.json': { stateCoverage },
    'state-health.json': { states: [], fixtureOnly: true },
    'drops.json': { drops },
    'events.json': { events },
    'alerts.json': { alerts: [] },
    'stores.json': { stores: [] },
    'locations.json': { locations: [] },
    'state-quality.json': quality,
    'states/index.json': partitions.index,
  };
  for (const [file, payload] of Object.entries(payloads)) {
    await writeJson(path.join(baseline, file), attachRunIdentity(payload, identity));
  }
  for (const [state, payload] of partitions.payloads) {
    await mkdir(path.join(baseline, 'states', state), { recursive: true });
    await writeJson(path.join(baseline, 'states', state, 'drops.json'), attachRunIdentity(payload, identity));
  }
}

test('frozen representatives preserve customer and alert-safety classes end to end', async () => {
  const { drops, events } = await readFixture();
  const result = verifyCustomerSurfaceClasses({ drops, events });
  assert.equal(result.ok, true);
  assert.deepEqual(result.classes, {
    exactStoreInventory: '51639e4d28f05c00',
    ncBoardShipment: '377dfbaec55dfce6',
    announcementOrLottery: '0129ecdeb7a062ac',
    event: 'd174e0c763e5472a',
    staleFallback: '16e99cde741ccf51',
  });
});

test('targeted refresh preserves untouched published event classes from its hydrated baseline', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'bourbon-signal-targeted-export-'));
  const out = path.join(root, 'out');
  const baseline = path.join(root, 'hydrated-baseline');
  try {
    const fixture = await readFixture();
    // A hidden expired announcement is valid stored history, not a required
    // visible representative. Preserve its visibility and original evidence clocks.
    const hiddenEvent = {
      ...fixture.events[0], id: 'fixture-hidden-expired', eventId: 'fixture-hidden-expired',
      eligibleForOnSite: false, eligibleForDropFeed: false, eventStatus: 'expired',
      canAlertAsInventory: false, canAlertAsWatch: false,
      eligibleForDelivery: false, eligibleForEmail: false, eligibleForSms: false,
    };
    fixture.events.push(hiddenEvent);
    await hydrateBaseline(baseline, fixture);
    assert.equal((await loadComparableStateQualityBaseline(baseline)).schemaVersion, 3);
    await mkdir(out, { recursive: true });
    await Promise.all([
      writeJson(path.join(out, 'current-snapshot.json'), { generatedAt: fixture.identity.engineGeneratedAt, signals: [] }),
      writeJson(path.join(out, 'summary.json'), {
        generatedAt: fixture.identity.engineGeneratedAt,
        partialRefresh: true,
        attemptedStateIds: ['NY'],
        freshStateIds: ['NY'],
        fallbackStateIds: [],
      }),
    ]);

    const exporter = await realpath(new URL('../src/export-site-contract.mjs', import.meta.url));
    const result = spawnSync(process.execPath, ['--import', new URL('clock.mjs', fixtureDirectory).href, exporter], {
      cwd: new URL('..', import.meta.url),
      env: fixtureEnvironment({
        BOURBON_SIGNAL_OUT_DIR: out,
        BOURBON_SIGNAL_PREVIOUS_SITE_DIR: baseline,
        BOURBON_SIGNAL_RUN_STATES: 'NY',
        // Evaluate historical evidence at its original publication clock.
        CUSTOMER_SURFACE_FIXTURE_NOW: fixture.identity.generatedAt,
      }),
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);

    const [drops, events] = await Promise.all([
      readFile(path.join(out, 'site', 'drops.json'), 'utf8').then(JSON.parse),
      readFile(path.join(out, 'site', 'events.json'), 'utf8').then(JSON.parse),
    ]);
    assert.deepEqual(events.events, fixture.events);
    assert.equal(projectCustomerSurfaces(events.events.find(event => event.eventId === hiddenEvent.eventId), { kind: 'event' }).onSite, false);
    assert.deepEqual(drops.drops.find(drop => drop.id === fixture.drops[0].id), fixture.drops[0]);
    const shipment = drops.drops.find(drop => drop.id === fixture.drops[1].id);
    assert.equal(shipment.observedAt, fixture.drops[1].observedAt);
    assert.equal(shipment.eventAt, fixture.drops[1].eventAt);
    assert.equal(projectCustomerSurfaces(shipment).inventory, false);
    assert.equal(projectCustomerSurfaces(shipment).delivery, false);
    assert.equal(verifyCustomerSurfaceClasses({ drops, events }).ok, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('generated output mutation cannot alter frozen representative or targeted refresh checks', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'bourbon-signal-surface-mutation-'));
  try {
    await mkdir(path.join(root, 'test'), { recursive: true });
    await cp(fileURLToPath(import.meta.url), path.join(root, 'test', 'customer-surface-e2e.test.mjs'));
    await cp(fixtureDirectory, path.join(root, 'test', 'fixtures', 'customer-surfaces'), { recursive: true });
    await symlink(fileURLToPath(new URL('../src/', import.meta.url)), path.join(root, 'src'), process.platform === 'win32' ? 'junction' : 'dir');
    const generatedSite = path.join(root, 'out', 'site');
    await mkdir(generatedSite, { recursive: true });
    const fixture = await readFixture();
    const generatedEvents = [
      { id: 'hidden-live-lottery', state: 'VA', title: 'Hidden lottery', category: 'lottery', eligibleForOnSite: false },
      fixture.events[1],
    ];
    assert.throws(() => verifyCustomerSurfaceClasses({ drops: fixture.drops, events: generatedEvents }), /onSite expected true, got false/);
    // These are actual disposable generated files with no visible announcement,
    // plus damaged run provenance. They cannot satisfy the representative checks.
    await Promise.all([
      writeJson(path.join(generatedSite, 'drops.json'), { drops: fixture.drops }),
      writeJson(path.join(generatedSite, 'events.json'), { events: generatedEvents }),
      writeJson(path.join(generatedSite, 'manifest.json'), { runId: 'unrelated-current-publication' }),
      writeJson(path.join(generatedSite, 'state-quality.json'), { schemaVersion: -1 }),
    ]);
    const env = {
      ...process.env,
      BOURBON_SIGNAL_RUN_STATES: 'SC',
      BOURBON_SIGNAL_REFRESH_SOURCES: 'sc-southern-spirits',
      BOURBON_SIGNAL_DISABLED_STATES: 'NY,NC,OH,AL',
      BOURBON_SIGNAL_QUARANTINED_STATES: 'NY,NC,OH,AL',
      BOURBON_SIGNAL_OUT_DIR: path.join(root, 'out'),
      BOURBON_SIGNAL_PREVIOUS_SITE_DIR: generatedSite,
      BOURBON_SIGNAL_HISTORY_DAYS: '0',
    };
    delete env.NODE_TEST_CONTEXT;
    const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', '--test-name-pattern=^(frozen representatives|targeted refresh preserves)', 'test/customer-surface-e2e.test.mjs'], {
      cwd: root, env, encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /frozen representatives preserve/);
    assert.match(result.stdout, /targeted refresh preserves/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('fixture hydration still rejects mixed publication provenance', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'bourbon-signal-surface-provenance-'));
  try {
    const fixture = await readFixture();
    await hydrateBaseline(root, fixture);
    await writeJson(path.join(root, 'events.json'), attachRunIdentity({ events: fixture.events }, { ...fixture.identity, runId: 'unrelated-run' }));
    await assert.rejects(loadComparableStateQualityBaseline(root), /events\.json runId mismatch/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('frozen stale inventory cannot authorize inventory or delivery', async () => {
  const { drops } = await readFixture();
  const stale = { ...drops[2], eligibleForDelivery: true, eligibleForEmail: true, eligibleForSms: true };
  const projection = projectCustomerSurfaces(stale);
  assert.equal(projection.onSite, true);
  for (const surface of ['inventory', 'watch', 'delivery', 'email', 'sms']) assert.equal(projection[surface], false, surface);
  assert.equal(hasUnsafeAlertFlags(stale), true);
});

test('event and announcement rows remain visible but cannot directly request delivery', () => {
  const drops = {
    drops: [
      {
        id: 'store-inventory', state: 'VA', bottleName: 'Store bottle', observedAt: '2026-08-13T12:00:00Z',
        locationPrecision: 'store_level', storeId: 'VA-1', canAlertAsInventory: true,
      },
      {
        id: 'nc-shipment', state: 'NC', bottleName: 'Board bottle', observedAt: '2026-08-13T12:00:00Z',
        type: 'nc_board_shipment_snapshot', locationPrecision: 'board_warehouse', eligibleForDropFeed: true,
      },
    ],
  };
  const events = {
    events: [
      {
        eventId: 'lottery', state: 'VA', title: 'Lottery', category: 'lottery', canAlertAsWatch: true,
        eligibleForDelivery: true, eligibleForEmail: true, eligibleForSms: true,
      },
      {
        eventId: 'barrel-pick', state: 'KY', title: 'Barrel pick', category: 'barrel_pick', canAlertAsWatch: true,
        eligibleForDelivery: true, eligibleForEmail: true, eligibleForSms: true,
      },
    ],
  };
  assert.equal(verifyCustomerSurfaceClasses({ drops, events }).ok, true);
});

test('a fully healthy publication does not require a stale fallback representative', () => {
  const drops = {
    drops: [
      {
        id: 'store-inventory', state: 'VA', bottleName: 'Store bottle', observedAt: '2026-08-13T12:00:00Z',
        locationPrecision: 'store_level', storeId: 'VA-1', canAlertAsInventory: true,
      },
      {
        id: 'nc-shipment', state: 'NC', bottleName: 'Board bottle', observedAt: '2026-08-13T12:00:00Z',
        type: 'nc_board_shipment_snapshot', locationPrecision: 'board_warehouse', eligibleForDropFeed: true,
      },
      {
        id: 'hidden-stale', state: 'GA', bottleName: 'Hidden stale row', observedAt: '2026-08-01T12:00:00Z',
        stale: true, eligibleForOnSite: false, eligibleForDropFeed: false,
      },
    ],
  };
  const events = {
    events: [
      { eventId: 'lottery', state: 'VA', title: 'Lottery', category: 'lottery' },
      { eventId: 'barrel-pick', state: 'KY', title: 'Barrel pick', category: 'barrel_pick' },
    ],
  };
  const result = verifyCustomerSurfaceClasses({ drops, events });
  assert.equal(result.ok, true);
  assert.equal(result.classes.staleFallback, null);
});
