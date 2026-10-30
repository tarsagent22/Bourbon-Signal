import assert from 'node:assert/strict';
import {isVerifiedActiveRenewalCanary} from '../../engine/src/active-renewal-capture-proof.mjs';

const sortedUnique=values=>[...new Set(values)].sort();
const locationIdentity=row=>[row.id,row.storeId,row.state,row.name,row.storeName,row.address,row.storeAddress,
  row.city??null,row.zip??null,row.lat??null,row.lng??null];
const rowIdentity=row=>[row.id,row.state,row.storeId,row.productId,row.observedAt];

// This assertion layer consumes the core raw-replay proof. A caller's empty
// flag, preview lifecycle clone or filtered-out malformed row is no authority.
export function assertVerifiedCanaryProjection({state,candidate,partition,accepted,locations,lifecycle,nowMs}){
  assert.equal(candidate?.state,state,'Canary input must belong to the requested state');
  assert.ok(Array.isArray(candidate.drops)&&Array.isArray(candidate.locations)&&candidate.locations.length>0);
  assert.ok(Array.isArray(partition?.drops)&&Array.isArray(accepted)&&Array.isArray(locations));
  assert.deepEqual(partition.drops,candidate.drops,'Preview must preserve every prepared candidate row and original clock');
  const verifiedActiveRenewal=isVerifiedActiveRenewalCanary(candidate,{lifecycle,nowMs});
  if(Object.hasOwn(candidate,'activeRenewalProof'))assert.ok(verifiedActiveRenewal,'Active-renewal capture authority is invalid');
  const verifiedNegativeRenewal=verifiedActiveRenewal&&candidate.activeRenewalProof.rawQualifiedRows===0
    &&candidate.activeRenewalProof.candidateRows===0&&candidate.drops.length===0;
  assert.ok(accepted.length>0||verifiedNegativeRenewal,
    'Current app-eligible output is required unless full raw replay proves an admitted active-four negative renewal');

  assert.equal(new Set(candidate.drops.map(row=>row.id)).size,candidate.drops.length,'Duplicate candidate row identity');
  assert.equal(new Set(candidate.locations.map(row=>row.id)).size,candidate.locations.length,'Duplicate candidate premise');
  assert.ok(candidate.locations.every(row=>row.state===state&&row.id&&row.id===row.storeId
    &&row.name&&row.name===row.storeName&&row.address&&row.address===row.storeAddress),'Candidate premise identity is incomplete');
  const previewLocations=locations.filter(row=>row.state===state);
  assert.deepEqual(previewLocations.map(locationIdentity).sort(),candidate.locations.map(locationIdentity).sort(),
    'Every reviewed premise must remain searchable without inventing a location');
  const storeIds=sortedUnique(candidate.locations.map(row=>row.id));
  const rawIdentities=new Set(candidate.drops.map(row=>JSON.stringify(rowIdentity(row))));
  for(const row of candidate.drops){
    assert.ok(row.state===state&&storeIds.includes(row.storeId)&&row.previewOnly===true
      &&row.eligibleForOnSite===true&&row.eligibleForDropFeed===true
      &&['canAlertAsInventory','canAlertAsWatch','eligibleForWatch','eligibleForDelivery','eligibleForEmail','eligibleForSms']
        .every(key=>row[key]===false)
      &&!['can_alert_as_inventory','can_alert_as_watch','alertable'].some(key=>row[key]===true),
    'Every candidate, including filtered-out rows, must preserve on-site-only canary isolation');
  }
  assert.equal(new Set(accepted.map(row=>row.id)).size,accepted.length,'Duplicate accepted public row');
  assert.ok(accepted.every(row=>rawIdentities.has(JSON.stringify(rowIdentity(row)))),
    'A public row must come from the exact prepared source reparse');
  const positiveStoreIds=sortedUnique(accepted.map(row=>row.storeId));
  return{verifiedActiveRenewal,verifiedNegativeRenewal,positiveStoreIds,
    knownWithoutCurrentStoreIds:storeIds.filter(id=>!positiveStoreIds.includes(id)),storeIds};
}

export function assertCanaryCoverageProjection(coverage,projection){
  assert.ok(coverage,'Requested state must remain present in Coverage');
  assert.equal(coverage.capabilities.currentBottleAvailability,projection.positiveStoreIds.length>0);
  assert.equal(coverage.capabilities.restockAlerts,false);
  assert.ok(coverage.scope.searchableStores>=projection.storeIds.length,'Reviewed premises must remain searchable');
  assert.equal(coverage.scope.inventoryMonitoredStores,projection.positiveStoreIds.length,
    'Only stores with current accepted bottle evidence may be counted as monitored');
}

export function assertCanaryStoreSearch(results,location,projection){
  const expected=projection.positiveStoreIds.includes(location.id)?'actively-monitored':'known-expansion-candidate';
  const matches=results.filter(row=>row.kind==='store'&&row.storeId===location.id);
  assert.ok(matches.length>0&&matches.every(row=>row.status===expected),
    `${location.id} must remain searchable with its actual current-evidence status (${expected})`);
}
