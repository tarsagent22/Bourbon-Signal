import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStores } from '../src/export-site-contract.mjs';

test('buildStores counts inventory with the same ID-first and location fallback semantics', () => {
  const common = {
    state: 'NC',
    locationPrecision: 'store_level',
    sourceAvailabilityVerified: true,
    canAlertAsInventory: true,
    storeName: 'Example Liquor',
    storeAddress: '10 Main St',
  };
  const signals = [
    { ...common, storeId: 'id-1', id: 'directory-id-1', canAlertAsInventory: false, eventType: 'retailer_store_location' },
    { ...common, storeId: 'id-1', id: 'inventory-id-1', eventType: 'retailer_store_inventory_result' },
    // When both rows have IDs, a matching address must not override a different ID.
    { ...common, storeId: 'id-2', id: 'inventory-id-2', eventType: 'retailer_store_inventory_result' },
    // A missing ID uses the existing state/name/address fallback on either side.
    { ...common, storeId: undefined, id: 'inventory-no-id', eventType: 'retailer_store_inventory_result' },
    // A store without an ID falls back across all IDs at the same exact location.
    { ...common, storeId: undefined, id: 'directory-no-id', sourceAvailabilityVerified: false, eventType: 'retailer_store_location' },
    // The existing both-ID comparison intentionally keys only on storeId.
    { ...common, state: 'KY', storeId: 'id-1', id: 'other-state', eventType: 'retailer_store_inventory_result' },
  ];

  const rows = buildStores(signals);
  assert.equal(rows.find((row) => row.id === 'id-1')?.signalCount, 3);
  assert.equal(rows.find((row) => row.id === 'id-2')?.signalCount, 2);
  const noIdStore = rows.find((row) => row.state === 'NC' && row.address === '10 Main St' && !['id-1', 'id-2'].includes(row.id));
  assert.equal(noIdStore?.signalCount, 3);
});
