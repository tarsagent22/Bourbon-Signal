import { markSignalStaleNonAlertable } from './stale-signal-policy.mjs';

function retainedDrop(drop, reason) {
  return {
    ...markSignalStaleNonAlertable(drop, reason),
    eligibleForDelivery: false,
    deliveryEligible: false,
    eligibleForEmail: false,
    eligibleForSms: false,
    staleSourceCaveat: typeof drop?.staleSourceCaveat === 'string' && drop.staleSourceCaveat.trim()
      ? drop.staleSourceCaveat
      : 'Last-known source evidence only; current availability is stale and not alertable. Verify directly before driving.',
  };
}

export function detectDropCollapseFallbacks(previousStateQuality, currentDrops = [], attemptedStateIds = [], minRatio = 0.5) {
  const attempted = new Set(attemptedStateIds.map((state) => String(state).toUpperCase()));
  const currentCounts = new Map();
  for (const drop of currentDrops) {
    const state = String(drop?.state || drop?.state_code || '').toUpperCase();
    currentCounts.set(state, (currentCounts.get(state) || 0) + 1);
  }
  return (previousStateQuality?.states || [])
    .filter((state) => attempted.has(String(state.state).toUpperCase()))
    .filter((state) => {
      const previousDropCount = Number(state.dropCount ?? state.input?.dropCount ?? 0);
      return previousDropCount >= 1 && (currentCounts.get(String(state.state).toUpperCase()) || 0) < Math.ceil(previousDropCount * minRatio);
    })
    .map((state) => String(state.state).toUpperCase())
    .sort();
}

function rowsOf(value) {
  return Array.isArray(value) ? value : Array.isArray(value?.drops) ? value.drops : [];
}

export function selectFreshRunDrops({ drops = [], freshStateIds = [] } = {}) {
  if (!Array.isArray(freshStateIds)) return [];
  const freshStates = new Set(freshStateIds
    .map((stateId) => String(stateId || '').trim().toUpperCase())
    .filter((stateId) => /^[A-Z]{2}(?:-[A-Z0-9]+)*$/.test(stateId)));
  return rowsOf(drops).filter((drop) => freshStates.has(String(drop?.state || drop?.state_code || '').trim().toUpperCase()));
}

function dropIdentity(drop) {
  return drop?.id || [
    String(drop?.state || drop?.state_code || '').toUpperCase(),
    drop?.canonicalId || drop?.canonical_id,
    drop?.sourceUrl,
    drop?.locationName,
    drop?.quantity,
    drop?.availabilityStatus,
    drop?.sourceEventAt,
  ].join('|');
}

function dropEventTime(drop) {
  return Date.parse(drop?.sourceEventAt || drop?.observedAt || drop?.displayAt || drop?.lastConfirmedAt || drop?.timestamp || '');
}

function informationalBoardShipmentDrop(drop) {
  return {
    ...drop,
    eligibleForOnSite: true,
    eligibleForDropFeed: true,
    eligibleForWatch: false,
    canAlertAsInventory: false,
    canAlertAsWatch: false,
    alertable: false,
    eligibleForDelivery: false,
    deliveryEligible: false,
    eligibleForEmail: false,
    eligibleForSms: false,
    dataLane: 'informational',
    informationalOnly: true,
    availabilityScope: 'board',
  };
}

function historicalBoardShipmentDrop(drop) {
  return informationalBoardShipmentDrop(retainedDrop(drop, 'historical_board_shipment'));
}

export function mergeHistoricalBoardShipmentDrops({
  currentDrops = [],
  currentSourceDrops = [],
  previousDrops = [],
  bootstrapDrops = [],
  now = new Date().toISOString(),
  historyDays = 30,
} = {}) {
  const currentRows = rowsOf(currentDrops);
  const nowMs = Date.parse(now);
  const historyMs = Number(historyDays) * 24 * 60 * 60 * 1000;
  if (!Number.isFinite(nowMs) || !Number.isFinite(historyMs) || historyMs <= 0) return currentRows;
  const cutoff = nowMs - historyMs;
  const isNcBoardShipment = (drop) => String(drop?.state || drop?.state_code || '').toUpperCase() === 'NC'
    && String(drop?.type || drop?.eventType || drop?.event_type || '').toLowerCase() === 'nc_board_shipment_snapshot';
  const withinHistory = (drop) => {
    const eventTime = dropEventTime(drop);
    return Number.isFinite(eventTime) && eventTime >= cutoff && eventTime <= nowMs;
  };
  const currentSourceKeys = new Set(rowsOf(currentSourceDrops).filter(isNcBoardShipment).map(dropIdentity));
  const normalizedCurrent = currentRows
    .filter((drop) => !isNcBoardShipment(drop) || withinHistory(drop))
    .map((drop) => {
      if (!isNcBoardShipment(drop)) return drop;
      return currentSourceKeys.has(dropIdentity(drop))
        ? informationalBoardShipmentDrop(drop)
        : historicalBoardShipmentDrop(drop);
    });
  const seen = new Set(normalizedCurrent.map(dropIdentity));
  const retained = [...rowsOf(previousDrops), ...rowsOf(bootstrapDrops)]
    .filter(isNcBoardShipment)
    .filter(withinHistory)
    .sort((a, b) => dropEventTime(b) - dropEventTime(a))
    .filter((drop) => {
      const key = dropIdentity(drop);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map(historicalBoardShipmentDrop);
  return [...normalizedCurrent, ...retained].slice(0, 10000);
}

function locationIdentity(location) {
  return location?.id || [
    String(location?.state || location?.state_code || '').toUpperCase(),
    String(location?.type || location?.locationType || '').toLowerCase(),
    String(location?.name || '').toLowerCase(),
    String(location?.address || '').toLowerCase(),
  ].join('|');
}

export function mergePartialRefreshLocations({
  previousLocations = [],
  currentLocations = [],
  partialRefresh = false,
  attemptedStateIds = [],
  fallbackStateIds = [],
} = {}) {
  const locationRowsOf = (value) => Array.isArray(value) ? value : Array.isArray(value?.locations) ? value.locations : [];
  const currentRows = locationRowsOf(currentLocations);
  const fallbackStates = new Set((fallbackStateIds || []).map((state) => String(state || '').toUpperCase()));
  if (!partialRefresh && !fallbackStates.size) return currentRows;

  const attemptedStates = new Set((attemptedStateIds || [])
    .map((state) => String(state || '').toUpperCase())
    .filter((state) => !fallbackStates.has(state)));
  const stateOf = (location) => String(location?.state || location?.state_code || '').toUpperCase();
  const merged = currentRows.filter((location) => attemptedStates.has(stateOf(location)));
  const seen = new Set(merged.map(locationIdentity));

  for (const location of locationRowsOf(previousLocations)) {
    if (attemptedStates.has(stateOf(location))) continue;
    const key = locationIdentity(location);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(location);
  }
  for (const location of currentRows) {
    if (attemptedStates.has(stateOf(location))) continue;
    if (fallbackStates.has(stateOf(location))) continue;
    const key = locationIdentity(location);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(location);
  }
  return merged;
}

function storeIdentity(store) {
  return store?.id || [
    String(store?.state || store?.state_code || '').toUpperCase(),
    String(store?.sourceStoreId || store?.storeId || '').toLowerCase(),
    String(store?.name || store?.storeName || '').toLowerCase(),
    String(store?.address || store?.storeAddress || '').toLowerCase(),
  ].join('|');
}

export function mergePartialRefreshStores({
  previousStores = [],
  currentStores = [],
  partialRefresh = false,
  attemptedStateIds = [],
  fallbackStateIds = [],
} = {}) {
  const storeRowsOf = (value) => Array.isArray(value) ? value : Array.isArray(value?.stores) ? value.stores : [];
  const currentRows = storeRowsOf(currentStores);
  const fallbackStates = new Set((fallbackStateIds || []).map((state) => String(state || '').toUpperCase()));
  if (!partialRefresh && !fallbackStates.size) return currentRows;
  const stateOf = (store) => String(store?.state || store?.state_code || '').toUpperCase();
  const attemptedStates = new Set((attemptedStateIds || [])
    .map((state) => String(state || '').toUpperCase())
    .filter((state) => !fallbackStates.has(state)));
  const merged = currentRows.filter((store) => attemptedStates.has(stateOf(store)));
  const seen = new Set(merged.map(storeIdentity));
  for (const store of storeRowsOf(previousStores)) {
    if (attemptedStates.has(stateOf(store))) continue;
    const key = storeIdentity(store);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(store);
  }
  for (const store of currentRows) {
    if (attemptedStates.has(stateOf(store)) || fallbackStates.has(stateOf(store))) continue;
    const key = storeIdentity(store);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(store);
  }
  return merged;
}

function retainedEvent(event, reason) {
  return {
    ...markSignalStaleNonAlertable(event, reason),
    canAlertAsInventory: false,
    canAlertAsWatch: false,
    eligibleForDelivery: false,
    deliveryEligible: false,
    eligibleForEmail: false,
    eligibleForSms: false,
    actionability: 'context_only',
    eventStatus: 'stale_fallback',
    staleSourceCaveat: 'Last-known event evidence only; the state verifier failed and this event is not current or alertable.',
  };
}

export function mergeScheduledFallbackEvents({ previousEvents = [], currentEvents = [], fallbackStateIds = [] } = {}) {
  const eventRowsOf = (value) => Array.isArray(value) ? value : Array.isArray(value?.events) ? value.events : [];
  const fallbackStates = new Set((fallbackStateIds || []).map((state) => String(state || '').toUpperCase()));
  if (!fallbackStates.size) return eventRowsOf(currentEvents);
  const stateOf = (event) => String(event?.state || event?.state_code || '').toUpperCase();
  const healthy = eventRowsOf(currentEvents).filter((event) => !fallbackStates.has(stateOf(event)));
  const retained = eventRowsOf(previousEvents)
    .filter((event) => fallbackStates.has(stateOf(event)))
    .map((event) => retainedEvent(event, 'scheduled_state_verification_failed'));
  return [...healthy, ...retained];
}

export function mergePartialRefreshDrops({ previousDrops = [], currentDrops = [], partialRefresh = false, attemptedStateIds = [], fallbackStateIds = [], partialFallbackStateIds = [], isSafePartialRetainedRow = () => true } = {}) {
  const previousRows = Array.isArray(previousDrops) ? previousDrops : Array.isArray(previousDrops?.drops) ? previousDrops.drops : [];
  const currentRows = Array.isArray(currentDrops) ? currentDrops : Array.isArray(currentDrops?.drops) ? currentDrops.drops : [];
  const stateOf = (drop) => String(drop?.state || drop?.state_code || '').toUpperCase();
  const preserved = new Set(fallbackStateIds.map((state) => String(state).toUpperCase()));
  const partialPreserved = new Set(partialFallbackStateIds.map((state) => String(state).toUpperCase()));
  if (!partialRefresh && !preserved.size && !partialPreserved.size) return currentRows;
  const previousStates = new Set(previousRows.map(stateOf));
  const safeStaleRows = (rows) => rows.length > 0 && rows.every((drop) => drop?.sourceStale === true
    && drop?.alertable !== true
    && drop?.canAlertAsInventory !== true
    && drop?.canAlertAsWatch !== true
    && Boolean(drop?.staleSourceCaveat));
  const newestTime = (rows) => Math.max(0, ...rows.map((drop) => Date.parse(drop?.sourceEventAt || drop?.observedAt || drop?.displayAt || drop?.lastConfirmedAt || drop?.timestamp || 0)).filter(Number.isFinite));
  const staleBootstrapStates = new Set([...preserved].filter((state) => {
    const rows = currentRows.filter((drop) => stateOf(drop) === state);
    if (!safeStaleRows(rows)) return false;
    if (!previousStates.has(state)) return true;
    const priorRows = previousRows.filter((drop) => stateOf(drop) === state);
    return safeStaleRows(priorRows) && newestTime(rows) > newestTime(priorRows);
  }));
  const effectivePreserved = new Set([...preserved].filter((state) => !staleBootstrapStates.has(state)));
  const attempted = new Set(attemptedStateIds.map((state) => String(state).toUpperCase()).filter((state) => !effectivePreserved.has(state)));
  const partialRows = previousRows
    .filter((drop) => partialPreserved.has(stateOf(drop)) && isSafePartialRetainedRow(drop))
    .map((drop) => retainedDrop(drop, 'partial_evidence_fallback'));
  const merged = [
    ...currentRows.filter((drop) => attempted.has(stateOf(drop))),
    ...partialRows,
    ...previousRows.filter((drop) => !attempted.has(stateOf(drop)) && !partialPreserved.has(stateOf(drop))),
  ];
  const seen = new Set();
  return merged.filter((drop) => {
    const key = drop?.id || [stateOf(drop), drop?.canonicalId, drop?.sourceUrl, drop?.locationName, drop?.quantity, drop?.availabilityStatus, drop?.sourceEventAt].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map((drop) => preserved.has(stateOf(drop))
    ? retainedDrop(drop, drop.staleReason || 'preserved_state_fallback')
    : drop).slice(0, 10000);
}
