export const CUSTOMER_SURFACE_CONTRACT_VERSION = 'bourbon-signal-customer-surface-v1';

function text(...values) {
  return values.find((value) => typeof value === 'string' && value.trim())?.trim() || null;
}

function stateOf(row) {
  return text(row?.state, row?.state_code)?.toUpperCase() || null;
}

function requested(row, fields) {
  return fields.some((field) => row?.[field] === true);
}

export function customerRecordIdentity(row) {
  return text(row?.id, row?.eventId, row?.dedupeKey, row?.sourceSignalId, row?.key);
}

export function customerRecordTimestamp(row) {
  return text(
    row?.sourceEventAt,
    row?.eventAt,
    row?.eventTime,
    row?.observedAt,
    row?.lastConfirmedAt,
    row?.displayAt,
    row?.timestamp,
  );
}

export function missingCustomerFields(row, { kind = 'drop' } = {}) {
  const missing = [];
  if (!stateOf(row)) missing.push('state');
  if (!customerRecordIdentity(row)) missing.push('identity');
  if (!text(row?.bottleName, row?.canonicalName, row?.rawName, row?.bottle, row?.title, row?.name)) missing.push('title');
  if (!customerRecordTimestamp(row) && kind !== 'event' && kind !== 'alert') missing.push('timestamp');
  const exactStoreInventory = row?.canAlertAsInventory === true && String(row?.locationPrecision || '') === 'store_level';
  if (exactStoreInventory && !text(row?.storeId, row?.storeName, row?.storeAddress, row?.locationName)) missing.push('store');
  return missing;
}

export function projectCustomerSurfaces(row, { kind = 'drop', fallback = false } = {}) {
  const stale = fallback === true
    || row?.stale === true
    || row?.sourceStale === true
    || /stale|fallback|expired|archived/iu.test(String(row?.eventStatus || row?.status || row?.freshness || ''));
  const informational = row?.informationalOnly === true || String(row?.dataLane || '') === 'informational';
  const complete = missingCustomerFields(row, { kind }).length === 0;
  const stored = Boolean(stateOf(row) && customerRecordIdentity(row));
  const visible = stored && complete && row?.eligibleForOnSite !== false;
  const feed = visible && kind !== 'event' && row?.eligibleForDropFeed !== false;
  const event = kind === 'event' || Boolean(row?.eventId || row?.category || row?.eventStatus);
  const alertIntent = String([row?.action, row?.actionabilityClass, row?.deliveryChannel, row?.policyMode].filter(Boolean).join(' '));
  const inventoryIntent = row?.canAlertAsInventory === true || (kind === 'alert' && /inventory/iu.test(alertIntent));
  const watchIntent = row?.canAlertAsWatch === true || (kind === 'alert' && /watch|lead|shipment|release|lottery|event/iu.test(alertIntent));
  const inventory = !stale && !informational && inventoryIntent
    && String(row?.locationPrecision || '') === 'store_level';
  const watch = !stale && !informational && watchIntent;
  const alertSafe = inventory || watch;
  const deliveryRequested = requested(row, ['eligibleForDelivery', 'deliveryEligible']);
  const emailRequested = requested(row, ['eligibleForEmail', 'emailEligible']);
  const smsRequested = requested(row, ['eligibleForSms', 'smsEligible']);

  return Object.freeze({
    contractVersion: CUSTOMER_SURFACE_CONTRACT_VERSION,
    stored,
    onSite: visible,
    feed,
    coverage: visible,
    watch,
    inventory,
    delivery: stored && complete && alertSafe && deliveryRequested,
    email: stored && complete && alertSafe && deliveryRequested && emailRequested,
    sms: stored && complete && alertSafe && deliveryRequested && smsRequested,
    event: visible && event,
    stale,
    alertSafe,
  });
}

export function hasUnsafeAlertFlags(row, options = {}) {
  const projection = projectCustomerSurfaces(row, options);
  const alertRequested = requested(row, [
    'alertable',
    'canAlertAsInventory',
    'canAlertAsWatch',
    'eligibleForDelivery',
    'deliveryEligible',
    'eligibleForEmail',
    'emailEligible',
    'eligibleForSms',
    'smsEligible',
  ]);
  const deliveryRequested = requested(row, [
    'eligibleForDelivery',
    'deliveryEligible',
    'eligibleForEmail',
    'emailEligible',
    'eligibleForSms',
    'smsEligible',
  ]);
  return (projection.stale && alertRequested) || (!projection.inventory && !projection.watch && deliveryRequested);
}
