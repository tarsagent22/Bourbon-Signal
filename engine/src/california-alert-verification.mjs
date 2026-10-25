import assert from 'node:assert/strict';
import {bibleLookup,buildDrops,buildCurrentInventoryAlertsFromDrops} from './export-site-contract.mjs';

export function californiaAlertIdentity(row) {
  return [row.state, row.canonicalId || row.canonicalBottleId, row.storeId, row.productId, row.variantId].map(v=>String(v||'')).join('|');
}

/** Pure local projection. Caller retains all state, identity, freshness and strict release assertions. */
export function expectedCaliforniaInventoryAlerts(signals, records, {nowMs=Date.now(),maxAgeMs=2*60*60*1000}={}) {
  const fresh=signals.filter(row=>row.state==='CA' && row.eventType==='retailer_store_inventory_result'
    && Number.isFinite(Date.parse(row.observedAt||'')) && nowMs>=Date.parse(row.observedAt)
    && nowMs-Date.parse(row.observedAt)<=maxAgeMs);
  const drops=buildDrops(fresh,bibleLookup(records),fresh);
  return buildCurrentInventoryAlertsFromDrops(drops).sort((a,b)=>californiaAlertIdentity(a).localeCompare(californiaAlertIdentity(b)));
}

export function assertCaliforniaInventoryAlertIdentities(expected, actual, {minimumCap=12,allowMissing=false}={}) {
  assert.ok(Number.isSafeInteger(minimumCap)&&minimumCap>0);
  const required=[...new Map(expected.map(row=>[californiaAlertIdentity(row),row])).values()]
    .sort((a,b)=>californiaAlertIdentity(a).localeCompare(californiaAlertIdentity(b))).slice(0,minimumCap);
  const expectedIdentities=new Set(expected.map(californiaAlertIdentity));
  const inventoryActual=actual.filter(row=>row.state==='CA'&&(row.actionabilityClass==='store_inventory'||row.changeType==='current_inventory_signal'));
  for(const row of inventoryActual) assert.ok(expectedIdentities.has(californiaAlertIdentity(row)),`unexpected California inventory alert identity ${californiaAlertIdentity(row)}`);
  const actualIdentities=new Set(inventoryActual.filter(row=>row.eligibleForOnSite===true).map(californiaAlertIdentity));
  if(!allowMissing) for(const row of required) assert.ok(actualIdentities.has(californiaAlertIdentity(row)),`fresh California inventory must expose on-site orderability alert identity ${californiaAlertIdentity(row)}`);
  return {expectedEligible:expected.length,requiredIdentityCount:required.length};
}
