import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { verifyCustomerSurfaceClasses } from '../src/verify-customer-surface-classes.mjs';

test('checked-in site outputs preserve representative customer and alert-safety classes end to end', async () => {
  const [drops, events] = await Promise.all([
    readFile(new URL('../out/site/drops.json', import.meta.url), 'utf8').then(JSON.parse),
    readFile(new URL('../out/site/events.json', import.meta.url), 'utf8').then(JSON.parse),
  ]);
  const result = verifyCustomerSurfaceClasses({ drops, events });
  assert.equal(result.ok, true);
  assert.equal(Object.keys(result.classes).length, 5);
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
