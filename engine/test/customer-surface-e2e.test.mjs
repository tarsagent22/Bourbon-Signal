import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { verifyCustomerSurfaceClasses } from '../src/verify-customer-surface-classes.mjs';
import { attachRunIdentity } from '../src/site-run-coherence.mjs';
import { loadComparableStateQualityBaseline } from '../src/state-quality-baseline.mjs';
import { buildStateDropPartitions } from '../src/site-state-partitions.mjs';
import { buildStateQualityInputs, buildStateQualityScorecard } from '../src/state-quality-scorecard.mjs';

test('checked-in site outputs preserve representative customer and alert-safety classes end to end', async () => {
  const [drops, events] = await Promise.all([
    readFile(new URL('../out/site/drops.json', import.meta.url), 'utf8').then(JSON.parse),
    readFile(new URL('../out/site/events.json', import.meta.url), 'utf8').then(JSON.parse),
  ]);
  const result = verifyCustomerSurfaceClasses({ drops, events });
  assert.equal(result.ok, true);
  assert.equal(Object.keys(result.classes).length, 5);
});

test('targeted refresh preserves untouched published event classes from its hydrated baseline', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'bourbon-signal-targeted-export-'));
  const out = path.join(root, 'out');
  const baseline = path.join(root, 'hydrated-baseline');
  try {
    await cp(new URL('../out/site/', import.meta.url), baseline, { recursive: true });
    // July's checked-in customer-surface fixture predates state-health publication.
    // Explicit disposable metadata scaffolding, not recovered production health.
    // Keep its original run clocks and all published drop evidence unchanged.
    const identity = await readFile(path.join(baseline, 'manifest.json'), 'utf8').then(JSON.parse);
    await writeFile(path.join(baseline, 'state-health.json'), JSON.stringify(attachRunIdentity({ states: [], fixtureOnly: true }, identity)));
    // The checked-in WV partition also belongs to a later fixture run. Rebuild
    // disposable partitions losslessly from July's canonical drops and coverage,
    // using only that publication's existing identity, never new evidence clocks.
    const sourceDrops = await readFile(path.join(baseline, 'drops.json'), 'utf8').then(JSON.parse);
    const stats = await readFile(path.join(baseline, 'stats.json'), 'utf8').then(JSON.parse);
    const partitions = buildStateDropPartitions(sourceDrops.drops, { ...identity, activeStates: stats.stateCoverage.states.map(row => row.state) });
    await writeFile(path.join(baseline, 'states/index.json'), JSON.stringify(attachRunIdentity(partitions.index, identity)));
    for (const [state, payload] of partitions.payloads) {
      await mkdir(path.join(baseline, 'states', state), { recursive: true });
      await writeFile(path.join(baseline, 'states', state, 'drops.json'), JSON.stringify(attachRunIdentity(payload, identity)));
    }
    // July's scalar scorecard also claims MS drops absent from its public feed.
    // This test isolates event continuity, not accepted-quality migration: build
    // coherent fixture quality from its actual rows at the existing July clock.
    const alerts = await readFile(path.join(baseline, 'alerts.json'), 'utf8').then(JSON.parse);
    const quality = buildStateQualityScorecard(buildStateQualityInputs({ stateCoverage: stats.stateCoverage, drops: sourceDrops.drops, alerts: alerts.alerts }), { generatedAt: identity.generatedAt });
    await writeFile(path.join(baseline, 'state-quality.json'), JSON.stringify(attachRunIdentity(quality, identity)));
    assert.equal((await loadComparableStateQualityBaseline(baseline)).schemaVersion, 3);
    const baselineEvents = await readFile(path.join(baseline, 'events.json'), 'utf8').then(JSON.parse);
    const untouchedEvent = baselineEvents.events.find((event) => event.state !== 'NY' && event.category === 'barrel_pick');
    assert.ok(untouchedEvent, 'hydrated baseline must contain a truthful non-target event representative');
    await mkdir(out, { recursive: true });
    await Promise.all([
      writeFile(path.join(out, 'current-snapshot.json'), JSON.stringify({ signals: [] })),
      writeFile(path.join(out, 'summary.json'), JSON.stringify({
        partialRefresh: true,
        attemptedStateIds: ['NY'],
        freshStateIds: ['NY'],
        fallbackStateIds: [],
      })),
    ]);

    const result = spawnSync(process.execPath, ['src/export-site-contract.mjs'], {
      cwd: new URL('..', import.meta.url),
      env: {
        ...process.env,
        BOURBON_SIGNAL_OUT_DIR: out,
        BOURBON_SIGNAL_PREVIOUS_SITE_DIR: baseline,
        // Keep the checked-in source-backed board shipment inside this regression's
        // historical window so the assertion isolates event continuity.
        BOURBON_SIGNAL_HISTORY_DAYS: '365',
      },
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);

    const [drops, events] = await Promise.all([
      readFile(path.join(out, 'site', 'drops.json'), 'utf8').then(JSON.parse),
      readFile(path.join(out, 'site', 'events.json'), 'utf8').then(JSON.parse),
    ]);
    assert.deepEqual(events.events.find((event) => event.eventId === untouchedEvent.eventId), untouchedEvent);
    assert.equal(verifyCustomerSurfaceClasses({ drops, events }).ok, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
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
