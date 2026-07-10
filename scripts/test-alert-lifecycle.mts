import assert from 'node:assert/strict';
import {
  alertLifecycleIdentity,
  evaluateAlertLifecycle,
  updateMatchingOnSiteInventory,
  type AlertLifecycleState,
} from '../src/lib/alert-lifecycle.js';

const location = 'NC|store_level|gateway-wine-spirits';
const firstIdentity = alertLifecycleIdentity(location, [
  { bottle: "Blanton's Gold", matchKey: 'snapshot-a', dedupeKey: 'qty-8', quantity: 8 },
]);
const lowerIdentity = alertLifecycleIdentity(location, [
  { bottle: "Blanton's Gold", matchKey: 'snapshot-b', dedupeKey: 'qty-5', quantity: 5 },
]);
assert.equal(firstIdentity, lowerIdentity, 'inventory and mutable engine IDs must not change lifecycle identity');
assert.notEqual(
  firstIdentity,
  alertLifecycleIdentity(location, [{ bottle: 'Weller 12 Year', quantity: 5 }]),
  'a different bottle must retain a distinct lifecycle identity',
);

const started = evaluateAlertLifecycle(null, { quantity: 8, observedAt: '2026-07-10T12:00:00.000Z' });
assert.equal(started.shouldOpenDelivery, true);
assert.equal(started.reason, 'new_availability');
assert.equal(started.state.alertVersion, 1);

const decrease = evaluateAlertLifecycle(started.state, { quantity: 5, observedAt: '2026-07-10T13:00:00.000Z' });
assert.equal(decrease.shouldOpenDelivery, false);
assert.equal(decrease.reason, 'inventory_decrease');
assert.equal(decrease.state.alertVersion, 1);
assert.equal(decrease.state.lastObservedQuantity, 5);

const unchanged = evaluateAlertLifecycle(decrease.state, { quantity: 5, observedAt: '2026-07-10T14:00:00.000Z' });
assert.equal(unchanged.shouldOpenDelivery, false);
assert.equal(unchanged.reason, 'unchanged');

const trivialIncrease = evaluateAlertLifecycle(unchanged.state, { quantity: 7, observedAt: '2026-07-12T15:00:00.000Z' });
assert.equal(trivialIncrease.shouldOpenDelivery, false);
assert.equal(trivialIncrease.reason, 'increase_not_material');

const earlyMaterialIncrease = evaluateAlertLifecycle(unchanged.state, { quantity: 14, observedAt: '2026-07-11T12:00:00.000Z' });
assert.equal(earlyMaterialIncrease.shouldOpenDelivery, false);
assert.equal(earlyMaterialIncrease.reason, 'restock_cooldown');

const matureMaterialIncrease = evaluateAlertLifecycle(unchanged.state, { quantity: 14, observedAt: '2026-07-12T12:01:00.000Z' });
assert.equal(matureMaterialIncrease.shouldOpenDelivery, true);
assert.equal(matureMaterialIncrease.reason, 'material_restock');
assert.equal(matureMaterialIncrease.state.alertVersion, 2);

const unavailable: AlertLifecycleState = {
  ...started.state,
  lastObservedQuantity: 0,
  lastObservedAt: '2026-07-10T18:00:00.000Z',
  unavailableSince: '2026-07-10T18:00:00.000Z',
};
const tooSoonAfterDepletion = evaluateAlertLifecycle(unavailable, { quantity: 3, observedAt: '2026-07-11T04:00:00.000Z' });
assert.equal(tooSoonAfterDepletion.shouldOpenDelivery, false);
assert.equal(tooSoonAfterDepletion.reason, 'availability_reset_cooldown');
const availableAgain = evaluateAlertLifecycle(unavailable, { quantity: 3, observedAt: '2026-07-11T06:01:00.000Z' });
assert.equal(availableAgain.shouldOpenDelivery, true);
assert.equal(availableAgain.reason, 'available_again');
assert.equal(availableAgain.state.alertVersion, 2);

const existingInbox = [{
  id: 'alert-1',
  bottleName: "Blanton's Gold",
  storeLabel: 'Gateway Wine & Spirits',
  quantity: 8,
  createdAt: '2026-07-10T12:00:00.000Z',
}];
const updatedInbox = updateMatchingOnSiteInventory(existingInbox, {
  bottleName: "Blanton's Gold",
  storeLabel: 'Gateway Wine & Spirits',
  quantity: 5,
});
assert.equal(updatedInbox.updated, true);
assert.equal(updatedInbox.records[0].quantity, 5);
assert.equal(updatedInbox.records[0].createdAt, existingInbox[0].createdAt, 'silent inventory updates must not look like new alerts');
assert.equal(updateMatchingOnSiteInventory(existingInbox, {
  bottleName: 'Weller 12 Year', storeLabel: 'Gateway Wine & Spirits', quantity: 5,
}).updated, false);

console.log('Alert lifecycle tests passed.');
