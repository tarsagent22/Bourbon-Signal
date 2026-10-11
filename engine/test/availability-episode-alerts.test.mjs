import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  availabilityEpisodeIdentity,
  buildAvailabilityEpisodeIndex,
  buildCurrentInventoryAlertsFromDrops,
  buildDrops,
} from '../src/export-site-contract.mjs';

const fixture = JSON.parse(await readFile(new URL('./fixtures/availability-episodes.json', import.meta.url), 'utf8'));

function observations(name) {
  return fixture.cases[name].map((observation) => ({ ...fixture.identity, ...observation }));
}

function episode(name, options = {}) {
  const rows = observations(name);
  const index = buildAvailabilityEpisodeIndex(rows, options);
  return index.get(availabilityEpisodeIdentity(rows.at(-1)));
}

test('first detection opens an alert-worthy availability episode', () => {
  const state = episode('firstDetection');
  assert.equal(state.available, true);
  assert.equal(state.kind, 'first_detection');
  assert.equal(state.startedAt, '2026-08-29T12:00:00.000Z');
  assert.equal(state.firstSeenAt, state.startedAt);
  assert.equal(state.lastConfirmedAt, state.startedAt);
  assert.ok(state.id);
});

test('quantity changes and reconfirmations retain one episode identity', () => {
  const first = episode('firstDetection');
  const quantityChange = episode('quantityChange');
  const reconfirmation = episode('reconfirmation');

  assert.equal(quantityChange.id, first.id);
  assert.equal(reconfirmation.id, first.id);
  assert.equal(quantityChange.startedAt, first.startedAt);
  assert.equal(reconfirmation.startedAt, first.startedAt);
  assert.equal(quantityChange.lastConfirmedAt, '2026-08-29T12:15:00.000Z');
  assert.equal(reconfirmation.lastConfirmedAt, '2026-08-29T12:30:00.000Z');
});

test('only a known price change advances listing time, and the next check preserves it', () => {
  const rows = observations('reconfirmation');
  const first = { ...rows[0], price: 100 };
  const reduced = { ...rows[1], price: 90 };
  const check = { ...reduced, observedAt: '2026-08-29T13:00:00.000Z' };
  const state = buildAvailabilityEpisodeIndex([first, reduced, check]).get(availabilityEpisodeIdentity(first));
  assert.equal(state.firstSeenAt, first.observedAt);
  assert.equal(state.lastConfirmedAt, check.observedAt);
  assert.equal(state.listingChangedAt, reduced.observedAt);
  assert.equal(state.listingChange, 'price_drop');
  const missingPrice = buildAvailabilityEpisodeIndex([first, { ...check, price: 0 }]).get(availabilityEpisodeIdentity(first));
  assert.equal(missingPrice.listingChangedAt, first.observedAt);
  assert.equal(missingPrice.listingChange, 'first_detection');
  const previous = { ...fixture.identity, availabilityEpisodeId: state.id, firstSeenAt: state.firstSeenAt, lastConfirmedAt: state.lastConfirmedAt, listingChangedAt: state.listingChangedAt, listingChange: state.listingChange, price: 90 };
  const next = { ...check, observedAt: '2026-08-29T14:00:00.000Z' };
  const resumed = buildAvailabilityEpisodeIndex([next], { previousDrops: [previous] }).get(availabilityEpisodeIdentity(next));
  assert.equal(resumed.id, state.id);
  assert.equal(resumed.listingChangedAt, reduced.observedAt, 'snapshot seeding must preserve the last meaningful change');
  assert.notEqual(availabilityEpisodeIdentity({ ...first, variantId: '750ml' }), availabilityEpisodeIdentity({ ...first, variantId: '1l' }), 'different bottle sizes must not share an episode');
});

test('only explicit unavailable evidence closes an episode and makes a later available observation a restock', () => {
  const first = episode('firstDetection');
  const restock = episode('restock');
  const afterMissingRun = episode('missingRun');

  assert.equal(restock.available, true);
  assert.equal(restock.kind, 'restock');
  assert.equal(restock.startedAt, '2026-08-29T12:40:00.000Z');
  assert.notEqual(restock.id, first.id);
  assert.equal(afterMissingRun.kind, 'first_detection');
  assert.equal(afterMissingRun.startedAt, first.startedAt);
  assert.equal(afterMissingRun.id, first.id);
});

test('a persisted prior episode survives snapshot-window gaps without becoming a restock', () => {
  const [current] = observations('firstDetection').map((row) => ({ ...row, observedAt: '2026-09-29T12:00:00.000Z' }));
  const prior = {
    ...fixture.identity,
    availabilityEpisodeId: 'persisted-episode-id',
    availabilityEpisodeStartedAt: '2026-08-29T12:00:00.000Z',
    availabilityEpisodeKind: 'first_detection',
    lastConfirmedAt: '2026-08-29T13:00:00.000Z',
  };
  const state = buildAvailabilityEpisodeIndex([current], { previousDrops: [prior] })
    .get(availabilityEpisodeIdentity(current));

  assert.equal(state.id, prior.availabilityEpisodeId);
  assert.equal(state.startedAt, prior.availabilityEpisodeStartedAt);
  assert.equal(state.kind, 'first_detection');
  assert.equal(state.lastConfirmedAt, current.observedAt);
});

test('current drop projection consumes explicit unavailable evidence from engine snapshot history', () => {
  const firstSeenAt = new Date(Date.now() - 40 * 60_000).toISOString();
  const unavailableAt = new Date(Date.now() - 20 * 60_000).toISOString();
  const restockedAt = new Date().toISOString();
  const base = {
    ...fixture.identity,
    state: 'VA',
    id: 'availability-history-projection',
    rawName: 'Eagle Rare 10 Year',
    canonicalName: 'Eagle Rare 10 Year',
    tier: 'allocated',
    canAlertAsInventory: true,
    sourceAvailabilityVerified: true,
    quantityIsExact: true,
  };
  const history = [
    { ...base, observedAt: firstSeenAt, availabilityStatus: 'in_stock', quantity: 1 },
    { ...base, observedAt: unavailableAt, availabilityStatus: 'out_of_stock', quantity: 0 },
    { ...base, observedAt: restockedAt, availabilityStatus: 'in_stock', quantity: 4 },
  ];
  const current = history.at(-1);
  const record = { id: base.canonicalBottleId, canonical: base.canonicalName, aliases: [], tier: base.tier };
  const bible = { byId: new Map([[record.id, record]]), byName: new Map() };
  const [drop] = buildDrops([current], bible, [current], [], history);

  assert.ok(drop);
  assert.equal(drop.availabilityEpisodeKind, 'restock');
  assert.equal(drop.availabilityEpisodeStartedAt, restockedAt);
  assert.equal(drop.firstSeenAt, restockedAt);
  assert.equal(drop.lastConfirmedAt, restockedAt);
  assert.equal(drop.listingChangedAt, restockedAt);
  assert.equal(drop.listingChange, 'restock');
});

test('public inventory export keeps first discovery and latest check around a price change', () => {
  const start = new Date(Date.now() - 3 * 60 * 60_000).toISOString();
  const changed = new Date(Date.now() - 60 * 60_000).toISOString();
  const checked = new Date().toISOString();
  const base = { ...fixture.identity, state: 'VA', id: 'price-projection', rawName: 'Eagle Rare 10 Year', canonicalName: 'Eagle Rare 10 Year', tier: 'allocated', canAlertAsInventory: true, sourceAvailabilityVerified: true, quantityIsExact: true, availabilityStatus: 'in_stock', quantity: 2 };
  const history = [{ ...base, observedAt: start, price: 100 }, { ...base, observedAt: changed, price: 90 }, { ...base, observedAt: checked, price: 90 }];
  const record = { id: base.canonicalBottleId, canonical: base.canonicalName, aliases: [], tier: base.tier };
  const bible = { byId: new Map([[record.id, record]]), byName: new Map() };
  const [drop] = buildDrops([history.at(-1)], bible, [history.at(-1)], [], history);
  assert.equal(drop.firstSeenAt, start);
  assert.equal(drop.lastConfirmedAt, checked);
  assert.equal(drop.displayAt, changed);
  assert.equal(drop.listingChange, 'price_drop');
});

test('engine alert projection dedupes mutable metadata by availability episode', () => {
  const observedAt = new Date().toISOString();
  const base = {
    id: 'drop-eagle-rare',
    state: 'VA',
    canonicalId: 'bottle-eagle-rare-10',
    bottleName: 'Eagle Rare 10 Year',
    tier: 'allocated',
    type: 'retailer_store_inventory_result',
    canAlertAsInventory: true,
    locationPrecision: 'store_level',
    locationName: 'Example Retailer Atlanta',
    storeId: 'example-retailer:atlanta',
    availabilityStatus: 'in_stock',
    observedAt,
    availabilityEpisodeId: 'episode-first',
    availabilityEpisodeStartedAt: observedAt,
    availabilityEpisodeKind: 'first_detection',
  };
  const [first] = buildCurrentInventoryAlertsFromDrops([{ ...base, quantity: 1 }]);
  const [quantityChange] = buildCurrentInventoryAlertsFromDrops([{ ...base, quantity: 12, lastConfirmedAt: new Date().toISOString() }]);
  const [restock] = buildCurrentInventoryAlertsFromDrops([{
    ...base,
    quantity: 4,
    availabilityEpisodeId: 'episode-restock',
    availabilityEpisodeStartedAt: new Date().toISOString(),
    availabilityEpisodeKind: 'restock',
  }]);

  assert.equal(first.eventIdentityKey, 'availability-episode:episode-first');
  assert.equal(quantityChange.eventIdentityKey, first.eventIdentityKey);
  assert.equal(quantityChange.dedupeKey, first.dedupeKey);
  assert.equal(first.changeType, 'current_inventory_signal');
  assert.equal(first.availabilityEpisodeKind, 'first_detection');
  assert.equal(restock.availabilityEpisodeKind, 'restock');
  assert.notEqual(restock.dedupeKey, first.dedupeKey);
});
