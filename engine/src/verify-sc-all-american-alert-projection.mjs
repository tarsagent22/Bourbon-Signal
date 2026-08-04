function projectionIdentity(row) {
  return [
    String(row?.canonicalBottleId || row?.canonicalId || ''),
    String(row?.storeId || ''),
    String(row?.productId || ''),
    String(row?.sku || ''),
  ].join('|');
}

export function verifyAllAmericanAlertProjection({ sourceDrops = [], sourceAlerts = [] } = {}) {
  const dropIdentities = new Set(sourceDrops.map(projectionIdentity));
  if (dropIdentities.has('|||') || dropIdentities.size !== sourceDrops.length) {
    throw new Error('All American customer drops have missing or duplicate projection identities');
  }

  const currentInventoryAlerts = sourceAlerts.filter((row) =>
    row?.changeType === 'current_inventory_signal'
    && row?.gates?.includes('current_public_drop'));
  const currentAlertIdentities = new Set(currentInventoryAlerts.map(projectionIdentity));
  const missing = [...dropIdentities].filter((identity) => !currentAlertIdentities.has(identity));
  const unexpected = [...currentAlertIdentities].filter((identity) => !dropIdentities.has(identity));

  if (currentAlertIdentities.has('|||')
    || currentInventoryAlerts.length !== sourceDrops.length
    || currentAlertIdentities.size !== dropIdentities.size
    || missing.length
    || unexpected.length) {
    throw new Error(`All American current on-site projection mismatch (${currentInventoryAlerts.length} current alerts for ${sourceDrops.length} drops)`);
  }

  return { currentInventoryAlerts, additionalChangeAlerts: sourceAlerts.length - currentInventoryAlerts.length };
}
