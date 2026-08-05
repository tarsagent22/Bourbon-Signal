function projectionIdentity(row) {
  const canonicalBottleId = String(row?.canonicalBottleId || '');
  const canonicalId = String(row?.canonicalId || '');
  if (canonicalBottleId && canonicalId && canonicalBottleId !== canonicalId) return null;
  const parts = [
    canonicalBottleId || canonicalId,
    String(row?.storeId || ''),
    String(row?.productId || ''),
    String(row?.sku || ''),
  ];
  return parts.every(Boolean) ? parts.join('|') : null;
}

function changeProjectionIdentity(row) {
  const identity = projectionIdentity(row);
  const changeType = String(row?.changeType || '');
  return identity && changeType ? `${identity}|${changeType}` : null;
}

export function verifyAllAmericanAlertProjection({
  sourceDrops = [],
  sourceAlerts = [],
  sourceInventoryRows = sourceDrops,
  expectedAdditionalChangeRows = null,
} = {}) {
  const dropIdentities = new Set(sourceDrops.map(projectionIdentity));
  if (dropIdentities.has(null) || dropIdentities.size !== sourceDrops.length) {
    throw new Error('All American customer drops have missing or duplicate projection identities');
  }
  const inventoryIdentities = new Set(sourceInventoryRows.map(projectionIdentity));
  if (inventoryIdentities.has(null) || inventoryIdentities.size !== sourceInventoryRows.length) {
    throw new Error('All American source inventory has missing or duplicate projection identities');
  }

  const currentInventoryAlerts = sourceAlerts.filter((row) =>
    row?.changeType === 'current_inventory_signal'
    && row?.gates?.includes('current_public_drop'));
  const currentAlertIdentities = new Set(currentInventoryAlerts.map(projectionIdentity));
  const missing = [...dropIdentities].filter((identity) => !currentAlertIdentities.has(identity));
  const unexpected = [...currentAlertIdentities].filter((identity) => !dropIdentities.has(identity));

  if (currentAlertIdentities.has(null)
    || currentInventoryAlerts.length !== sourceDrops.length
    || currentAlertIdentities.size !== dropIdentities.size
    || missing.length
    || unexpected.length) {
    throw new Error(`All American current on-site projection mismatch (${currentInventoryAlerts.length} current alerts for ${sourceDrops.length} drops)`);
  }

  const additionalChangeRows = sourceAlerts.filter((row) => !currentInventoryAlerts.includes(row));
  const additionalIdentities = additionalChangeRows.map(projectionIdentity);
  const expectedRows = expectedAdditionalChangeRows ?? additionalChangeRows;
  const expectedIdentities = expectedRows.map(projectionIdentity);
  const actualChangeIdentities = additionalChangeRows.map(changeProjectionIdentity);
  const expectedChangeIdentities = expectedRows.map(changeProjectionIdentity);
  const expectedIdentitySet = new Set(expectedChangeIdentities);
  const additionalIdentitySet = new Set(actualChangeIdentities);
  if (additionalChangeRows.some((row) => !['new_signal', 'changed_signal'].includes(row?.changeType))
    || additionalIdentities.some((identity) => !identity || !inventoryIdentities.has(identity))
    || actualChangeIdentities.some((identity) => !identity)
    || additionalIdentitySet.size !== actualChangeIdentities.length
    || expectedRows.some((row) => !['new_signal', 'changed_signal'].includes(row?.changeType))
    || expectedIdentities.some((identity) => !identity || !inventoryIdentities.has(identity))
    || expectedChangeIdentities.some((identity) => !identity)
    || expectedIdentitySet.size !== expectedChangeIdentities.length
    || additionalChangeRows.length !== expectedRows.length
    || [...expectedIdentitySet].some((identity) => !additionalIdentitySet.has(identity))) {
    throw new Error('All American additional change projections are missing, duplicated, or unrelated to current source inventory');
  }

  return { currentInventoryAlerts, additionalChangeAlerts: additionalChangeRows.length };
}
