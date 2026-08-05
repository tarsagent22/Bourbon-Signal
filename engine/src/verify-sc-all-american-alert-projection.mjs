function projectionIdentity(row) {
  const parts = [
    String(row?.canonicalBottleId || row?.canonicalId || ''),
    String(row?.storeId || ''),
    String(row?.productId || ''),
    String(row?.sku || ''),
  ];
  return parts.every(Boolean) ? parts.join('|') : null;
}

export function verifyAllAmericanAlertProjection({
  sourceDrops = [],
  sourceAlerts = [],
  sourceInventoryRows = sourceDrops,
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
  if (additionalChangeRows.some((row) => !['new_signal', 'changed_signal'].includes(row?.changeType))
    || additionalIdentities.some((identity) => !identity || !inventoryIdentities.has(identity))
    || new Set(additionalIdentities).size !== additionalIdentities.length) {
    throw new Error('All American additional change projections are missing, duplicated, or unrelated to current source inventory');
  }

  return { currentInventoryAlerts, additionalChangeAlerts: additionalChangeRows.length };
}
