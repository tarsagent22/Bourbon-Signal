import assert from 'node:assert/strict';

import { isMississippiRetailerInventory, isMississippiRetailerSignalIdentity } from './mississippi-retailer-policy.mjs';

export function verifyMississippiReleasePolicy({
  lifecycle,
  signals = [],
  alerts = [],
  phase = 'research',
} = {}) {
  assert.equal(lifecycle?.publicStatus, 'research_only', 'Mississippi must remain research_only in this foundation.');
  assert.equal(lifecycle?.inventoryAlertable, false, 'Mississippi inventory alerts must remain disabled.');
  assert.equal(lifecycle?.watchAlertable, false, 'Mississippi watch alerts must remain disabled.');
  const retailer = signals.filter((row) => row?.state === 'MS'
    && /^(?:cityhive_store_inventory_result|retailer_store_inventory_result)$/iu.test(String(row.eventType || row.type || '')));
  assert.ok(retailer.every(isMississippiRetailerSignalIdentity), 'Mississippi retailer rows must preserve exact allowlisted identity.');
  assert.ok(retailer.filter((row) => !row.stale).every(isMississippiRetailerInventory), 'Fresh Mississippi retailer rows must retain guarded binary orderability.');
  assert.ok(retailer.every((row) => row.canAlertAsInventory !== true && row.canAlertAsWatch !== true && row.alertable !== true), 'Mississippi research rows must remain nonalertable.');
  assert.ok(alerts.filter((alert) => alert?.state === 'MS').every((alert) => alert.eligibleForOnSite !== true
    && alert.eligibleForDelivery !== true
    && alert.eligibleForEmail !== true
    && alert.eligibleForSms !== true
    && alert.published !== true), 'Mississippi cannot publish or deliver during research/shadow.');
  return { status: 'ok', phase, retailerRows: retailer.length, deliverableAlerts: 0 };
}
