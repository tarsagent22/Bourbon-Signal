import assert from 'node:assert/strict';

import { isMississippiRetailerInventory, isMississippiRetailerSignalIdentity } from './mississippi-retailer-policy.mjs';

export function verifyMississippiReleasePolicy({
  lifecycle,
  signals = [],
  alerts = [],
  phase = 'research',
} = {}) {
  const sparseOnSiteOnly = lifecycle?.publicStatus === 'active'
    && lifecycle?.coverageTier === 'sparse_live_store_inventory';
  assert.ok(lifecycle?.publicStatus === 'research_only' || sparseOnSiteOnly, 'Mississippi must remain research-only or explicitly sparse on-site coverage.');
  assert.equal(lifecycle?.inventoryAlertable, false, 'Mississippi inventory alerts must remain disabled.');
  assert.equal(lifecycle?.watchAlertable, false, 'Mississippi watch alerts must remain disabled.');
  const retailer = signals.filter((row) => row?.state === 'MS'
    && /^(?:cityhive_store_inventory_result|retailer_store_inventory_result)$/iu.test(String(row.eventType || row.type || '')));
  assert.ok(retailer.every(isMississippiRetailerSignalIdentity), 'Mississippi retailer rows must preserve exact allowlisted identity.');
  assert.ok(retailer.filter((row) => !row.stale).every(isMississippiRetailerInventory), 'Fresh Mississippi retailer rows must retain guarded binary orderability.');
  assert.ok(retailer.every((row) => row.canAlertAsInventory !== true && row.canAlertAsWatch !== true && row.alertable !== true), 'Mississippi sparse/research rows must remain nonalertable.');
  assert.ok(alerts.filter((alert) => alert?.state === 'MS').every((alert) => (sparseOnSiteOnly ? alert.eligibleForDelivery !== true
    && alert.eligibleForEmail !== true
    && alert.eligibleForSms !== true
    && alert.published !== true
    : alert.eligibleForOnSite !== true
      && alert.eligibleForDelivery !== true
      && alert.eligibleForEmail !== true
      && alert.eligibleForSms !== true
      && alert.published !== true)), 'Mississippi cannot publish or deliver during research; sparse coverage can be on-site only.');
  return { status: 'ok', phase, retailerRows: retailer.length, deliverableAlerts: 0, onSiteOnly: sparseOnSiteOnly };
}
