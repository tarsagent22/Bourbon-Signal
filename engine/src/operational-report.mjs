import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { stableId } from './core/text.mjs';
import { BourbonBible } from './core/bible.mjs';
import { confidenceForSignal, STATE_CONFIDENCE_POLICY } from './confidence-policy.mjs';
import { locationValue, precisionRank } from './location-precision.mjs';

const OUT = path.resolve('out');
const HISTORY = path.join(OUT, 'history');
const SNAPSHOTS = path.join(HISTORY, 'snapshots');

async function readJson(file, fallback = null) {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch { return fallback; }
}

async function latestSnapshot() {
  try {
    const files = (await readdir(SNAPSHOTS)).filter((f) => f.endsWith('.json')).sort();
    if (!files.length) return null;
    const file = path.join(SNAPSHOTS, files[files.length - 1]);
    return { file, snapshot: await readJson(file) };
  } catch { return null; }
}

function tsSlug(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
}

function observedAt(signal) {
  return signal.observedAt || signal.fetchedAt || signal.raw?.date || signal.raw?.listdate || null;
}

function qty(signal) {
  const n = Number(signal.quantity ?? signal.storeQty ?? signal.raw?.storeQty ?? signal.raw?.quantity ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function price(signal) {
  const n = Number(signal.price ?? signal.raw?.price ?? signal.raw?.bottlePrice ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function optionalNumber(...values) {
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function canonicalizeSignal(signal, bible) {
  const name = signal.canonicalName || signal.rawName || signal.matchedBottles?.[0]?.name || null;
  const unsafeSourceMatch = ['ID', 'IA', 'MD-MONTGOMERY', 'OH', 'UT'].includes(signal.state) && String(signal.raw?.sourceMatchStatus || signal.sourceMatchStatus || '').startsWith('source_name_kept:');
  const match = name && !unsafeSourceMatch ? bible.match(name) : null;
  const record = match?.record || null;
  const canonicalName = record?.canonical || (unsafeSourceMatch ? null : name);
  const bottleId = record?.id || signal.canonicalBottleId || null;
  const locationName = signal.storeName || signal.locationName || signal.location || signal.city || signal.county || null;
  const locationPrecision = signal.locationPrecision || 'statewide_catalog';
  const storeId = signal.storeId || signal.raw?.storeId || signal.raw?.store?.locationId || null;
  const key = [signal.state, bottleId || canonicalName || 'unknown', signal.eventType, signal.sourceLabel, locationPrecision, storeId || locationName || 'statewide'].join('|').toLowerCase();
  const policy = confidenceForSignal(signal);
  return {
    key: stableId([key]),
    sourceSignalId: signal.id,
    state: signal.state,
    bottleId,
    canonicalName,
    tier: record?.tier || null,
    producer: record?.producer || null,
    eventType: signal.eventType,
    sourceLabel: signal.sourceLabel,
    sourceUrl: signal.sourceUrl,
    observedAt: observedAt(signal),
    sourceEventAt: signal.sourceEventAt || null,
    eventDate: signal.eventDate || signal.releaseDate || signal.raw?.eventDate || signal.raw?.releaseDate || null,
    releaseDate: signal.releaseDate || signal.eventDate || signal.raw?.releaseDate || signal.raw?.eventDate || null,
    eventTime: signal.eventTime || signal.releaseTime || signal.raw?.eventTime || signal.raw?.releaseTime || null,
    releaseTime: signal.releaseTime || signal.eventTime || signal.raw?.releaseTime || signal.raw?.eventTime || null,
    locationPrecision,
    locationName,
    storeName: signal.storeName || null,
    storeId: storeId ? String(storeId) : null,
    storeAddress: signal.storeAddress || null,
    city: signal.city || null,
    county: signal.county || null,
    zip: signal.zip || signal.storeZip || signal.raw?.zip || signal.raw?.Zip || null,
    lat: optionalNumber(signal.lat, signal.latitude, signal.raw?.lat, signal.raw?.latitude, signal.raw?.Latitude),
    lng: optionalNumber(signal.lng, signal.lon, signal.longitude, signal.raw?.lng, signal.raw?.lon, signal.raw?.longitude, signal.raw?.Longitude),
    quantity: qty(signal),
    availabilityStatus: signal.availabilityStatus || signal.raw?.availability?.status || null,
    availabilityLabel: signal.availabilityLabel || signal.raw?.availability?.label || null,
    availabilityValue: signal.availabilityValue ?? signal.raw?.availability?.value ?? null,
    warehouseQty: Number(signal.warehouseQty ?? signal.raw?.warehouseQty ?? 0) || 0,
    price: price(signal),
    evidence: signal.evidence || signal.readableSummary || signal.rawName || null,
    baseConfidence: Number(signal.confidence || 0.35) || 0.35,
    confidence: policy.confidence,
    policyMode: policy.policyMode,
    inventorySemantics: policy.inventorySemantics,
    locationValue: policy.locationValue,
    canAlertAsInventory: policy.canAlertAsInventory,
    canAlertAsWatch: policy.canAlertAsWatch,
    sampleOnly: Boolean(signal.raw?.sampleOnly),
    rawName: signal.rawName || null
  };
}

function signalSort(a, b) {
  return b.confidence - a.confidence
    || precisionRank(b.locationPrecision) - precisionRank(a.locationPrecision)
    || (b.quantity || 0) - (a.quantity || 0)
    || String(b.observedAt || '').localeCompare(String(a.observedAt || ''));
}

function diffSnapshots(prev, current) {
  const previous = new Map((prev?.signals || []).map((s) => [s.key, s]));
  const currentMap = new Map((current.signals || []).map((s) => [s.key, s]));
  const changes = [];

  for (const cur of currentMap.values()) {
    const old = previous.get(cur.key);
    if (!old) {
      changes.push({ type: 'new_signal', key: cur.key, before: null, after: cur });
      continue;
    }
    const fields = [];
    for (const field of ['quantity', 'availabilityStatus', 'warehouseQty', 'price', 'locationPrecision', 'locationName', 'confidence']) {
      if ((old[field] ?? null) !== (cur[field] ?? null)) fields.push({ field, before: old[field] ?? null, after: cur[field] ?? null });
    }
    if (fields.length) changes.push({ type: 'changed_signal', key: cur.key, fields, before: old, after: cur });
  }
  for (const old of previous.values()) {
    if (!currentMap.has(old.key)) changes.push({ type: 'missing_signal', key: old.key, before: old, after: null });
  }
  return changes;
}

function changeScore(change) {
  const sig = change.after || change.before;
  if (!sig) return 0;
  let score = sig.confidence * 100;
  score += precisionRank(sig.locationPrecision) * 10;
  if (sig.tier === 'unicorn') score += 35;
  else if (sig.tier === 'allocated') score += 25;
  else if (sig.tier === 'limited') score += 15;
  if (change.type === 'new_signal') score += 25;
  if (change.type === 'changed_signal') {
    for (const f of change.fields || []) {
      if (f.field === 'quantity' && Number(f.after) > Number(f.before)) score += 20;
      if (f.field === 'warehouseQty' && Number(f.after) > Number(f.before)) score += 10;
      if (f.field === 'locationPrecision' && precisionRank(f.after) > precisionRank(f.before)) score += 20;
    }
  }
  if (change.type === 'missing_signal') score -= 20;
  return Math.round(score);
}

function hoursSince(value) {
  const ts = Date.parse(value || '');
  if (!Number.isFinite(ts)) return null;
  return Math.max(0, (Date.now() - ts) / (60 * 60 * 1000));
}

function quantityValue(sig) {
  return Number(sig.quantity || 0) + Number(sig.warehouseQty || 0);
}

function changedIncrease(change, field) {
  if (change.type !== 'changed_signal') return false;
  return (change.fields || []).some((f) => f.field === field && Number(f.after || 0) > Number(f.before || 0));
}

function reliabilityForCandidate(change, sig, score) {
  const gates = [];
  const blockers = [];
  const cautions = [];
  const ageHours = hoursSince(sig.observedAt);
  const precision = sig.locationPrecision || 'statewide_catalog';
  const precisionScore = precisionRank(precision);
  const confidence = Number(sig.confidence || 0);
  const quantity = quantityValue(sig);
  const isInventory = Boolean(sig.canAlertAsInventory);
  const isWatch = Boolean(sig.canAlertAsWatch) && !isInventory;
  const eventType = String(sig.eventType || '').toLowerCase();
  const isSourceDiscovery = /surface|policy|license|catalog|tasting|raffle/.test(eventType);
  const isIowaStoreLead = sig.state === 'IA'
    && /^(store_delivery_snapshot|store_allocation_snapshot)$/i.test(eventType)
    && String(precision).toLowerCase() === 'store_level'
    && quantity > 0;
  const isIowaNonStoreLead = sig.state === 'IA' && !isIowaStoreLead;
  const isActionableWatch = isWatch && !isSourceDiscovery && (
    isIowaStoreLead
    || (sig.state !== 'IA' && (
      quantity > 0
      || /^alabc_limited_release_store_drop$/i.test(eventType)
      || /^nc_board_shipment_snapshot$/i.test(eventType)
      || /^nc_statewide_warehouse_stock$/i.test(eventType)
    ))
  );
  const isNewOrPositive = change.type === 'new_signal'
    || changedIncrease(change, 'quantity')
    || changedIncrease(change, 'warehouseQty')
    || changedIncrease(change, 'locationPrecision')
    || (change.type === 'changed_signal' && (change.fields || []).some((f) => f.field === 'availabilityStatus' && /in_stock|limited|available|on_hand/i.test(String(f.after || ''))));

  if (!sig.bottleId && !sig.canonicalName) blockers.push('missing_bottle_match');
  else gates.push('bottle_matched');

  if (change.type === 'missing_signal') blockers.push('missing_signal_not_sendable');
  if (sig.sampleOnly) blockers.push('sample_only');
  if (!isInventory && !sig.canAlertAsWatch) blockers.push('policy_not_alertable');
  if (isSourceDiscovery) blockers.push('source_discovery_not_user_alert');
  if (isIowaNonStoreLead) blockers.push('iowa_non_store_delivery_not_alertable');
  if (isWatch && !isActionableWatch) blockers.push('watch_signal_not_actionable');

  if (ageHours == null) cautions.push('unknown_freshness');
  else if (ageHours <= 24) gates.push('fresh_24h');
  else if (ageHours <= 72) cautions.push('fresh_72h');
  else blockers.push('stale_observation');

  if (confidence >= 0.7) gates.push('confidence_high');
  else if (confidence >= 0.55) cautions.push('confidence_medium');
  else blockers.push('confidence_low');

  if (precisionScore >= precisionRank('store_level')) gates.push('store_level');
  else if (precisionScore >= precisionRank('board_county')) cautions.push('regional_not_store_level');
  else if (isInventory) cautions.push('inventory_not_store_level');

  if (isInventory && quantity <= 0 && !/in_stock|limited|available|on_hand/i.test(String(sig.availabilityStatus || sig.availabilityLabel || ''))) {
    cautions.push('no_positive_quantity');
  }

  if (!isNewOrPositive) cautions.push('not_new_or_positive_change');

  const majorTier = sig.tier === 'unicorn' || sig.tier === 'allocated';
  const hasFreshPositiveInventory = isInventory
    && quantity > 0
    && ageHours != null
    && ageHours <= 72
    && confidence >= 0.62;
  const eligible = blockers.length === 0
    && (isNewOrPositive || hasFreshPositiveInventory)
    && (isInventory ? hasFreshPositiveInventory : (isActionableWatch && confidence >= 0.55 && ageHours != null && ageHours <= 168))
    && score >= (majorTier ? 85 : isInventory ? 92 : 78);

  const priorityClass = eligible && (score >= 115 || majorTier || precisionScore >= precisionRank('store_level')) ? 'major'
    : eligible ? 'standard'
      : 'hold';

  const deliveryChannel = eligible && isInventory ? 'onsite_candidate'
    : eligible && isWatch ? 'watch_candidate'
      : 'review_only';

  return {
    reliabilityScore: Math.max(0, Math.min(100, Math.round(score * 0.45 + confidence * 45 + Math.min(20, precisionScore * 5) - blockers.length * 25 - cautions.length * 6))),
    eligibleForDelivery: eligible,
    priorityClass,
    deliveryChannel,
    freshnessHours: ageHours == null ? null : Math.round(ageHours * 10) / 10,
    gates,
    blockers,
    cautions,
    dedupeKey: stableId([sig.state, sig.bottleId || sig.canonicalName, sig.eventType, sig.sourceLabel, precision, sig.storeId || sig.locationName || 'regional', sig.availabilityStatus || '', quantity || 0]),
    matchKey: stableId([sig.state, sig.bottleId || sig.canonicalName, sig.storeId || sig.locationName || precision]),
    sendRecommendation: eligible ? 'send_to_matching_testers' : blockers.length ? 'do_not_send' : 'review_before_send'
  };
}

function candidateFromChange(change, bootstrap = false) {
  const sig = change.after || change.before;
  const score = changeScore(change);
  const action = sig.canAlertAsInventory ? 'inventory_alert_candidate' : sig.canAlertAsWatch ? 'watch_alert_candidate' : 'do_not_alert_context_only';
  const reliability = reliabilityForCandidate(change, sig, score);
  const blockers = [...(reliability.blockers || [])];
  const cautions = [...(reliability.cautions || [])];
  if (bootstrap) blockers.push('bootstrap_run_not_sendable');
  if (process.env.BOURBON_SIGNAL_MANUAL_REFRESH === '1' || process.env.BOURBON_SIGNAL_ALERT_QUARANTINE === '1') {
    blockers.push('manual_refresh_quarantine');
  }
  const eligibleForDelivery = blockers.length === 0 && reliability.eligibleForDelivery;
  return {
    id: stableId([change.type, sig.key, JSON.stringify(change.fields || [])]),
    changeType: change.type,
    action,
    score,
    state: sig.state,
    bottle: sig.canonicalName,
    tier: sig.tier,
    eventType: sig.eventType,
    sourceLabel: sig.sourceLabel,
    sourceUrl: sig.sourceUrl,
    locationPrecision: sig.locationPrecision,
    locationName: sig.locationName,
    storeName: sig.storeName,
    storeAddress: sig.storeAddress,
    quantity: sig.quantity,
    availabilityStatus: sig.availabilityStatus,
    availabilityLabel: sig.availabilityLabel,
    availabilityValue: sig.availabilityValue,
    warehouseQty: sig.warehouseQty,
    price: sig.price,
    confidence: sig.confidence,
    sampleOnly: Boolean(sig.sampleOnly),
    ...reliability,
    eligibleForDelivery,
    priorityClass: eligibleForDelivery ? reliability.priorityClass : 'hold',
    deliveryChannel: eligibleForDelivery ? reliability.deliveryChannel : 'review_only',
    blockers,
    cautions,
    sendRecommendation: eligibleForDelivery ? reliability.sendRecommendation : blockers.length ? 'do_not_send' : reliability.sendRecommendation,
    policyMode: sig.policyMode,
    inventorySemantics: sig.inventorySemantics,
    locationValue: locationValue(sig),
    bootstrap,
    reason: describeChange(change, sig),
    evidence: sig.evidence
  };
}

function diversifyCandidates(candidates, limit = 250, perStateBottleLimit = 10) {
  const selected = [];
  const counts = new Map();
  for (const candidate of candidates) {
    const key = [candidate.state, candidate.bottle || 'unknown'].join('|').toLowerCase();
    const count = counts.get(key) || 0;
    if (count >= perStateBottleLimit) continue;
    counts.set(key, count + 1);
    selected.push(candidate);
    if (selected.length >= limit) break;
  }
  return selected;
}

function describeChange(change, sig) {
  if (change.type === 'new_signal') return `New ${sig.locationPrecision} ${sig.eventType} signal for ${sig.canonicalName || 'unknown bottle'} in ${sig.state}.`;
  if (change.type === 'missing_signal') return `Previously seen signal for ${sig.canonicalName || 'unknown bottle'} in ${sig.state} is absent from current run.`;
  const bits = (change.fields || []).map((f) => `${f.field}: ${f.before ?? 'null'} → ${f.after ?? 'null'}`);
  return `Changed signal for ${sig.canonicalName || 'unknown bottle'} in ${sig.state}: ${bits.join('; ')}.`;
}

async function main() {
  await mkdir(SNAPSHOTS, { recursive: true });
  const bible = await BourbonBible.load(path.join(OUT, 'bourbon-bible.json'));
  const signalsJson = await readJson(path.join(OUT, 'signals.json'), { signals: [] });
  const previous = await latestSnapshot();
  const generatedAt = new Date().toISOString();

  const signals = (signalsJson.signals || [])
    .map((s) => canonicalizeSignal(s, bible))
    .filter((s) => s.canonicalName || s.eventType || s.sourceUrl)
    .sort(signalSort);

  const current = {
    generatedAt,
    signalCount: signals.length,
    signals
  };

  const changes = diffSnapshots(previous?.snapshot, current).sort((a, b) => changeScore(b) - changeScore(a));
  const bootstrap = !previous?.snapshot;
  const alertCandidates = diversifyCandidates((bootstrap
    ? signals.slice(0, 150).map((sig) => candidateFromChange({ type: 'new_signal', key: sig.key, before: null, after: sig }, true))
    : changes.map((change) => candidateFromChange(change, false)))
    .filter((c) => !c.sampleOnly)
    .filter((c) => c.action !== 'do_not_alert_context_only' || c.score >= 65)
    .sort((a, b) => b.score - a.score));

  const snapshotFile = path.join(SNAPSHOTS, `${tsSlug(new Date(generatedAt))}.json`);
  await writeFile(snapshotFile, JSON.stringify(current, null, 2));
  await writeFile(path.join(OUT, 'current-snapshot.json'), JSON.stringify(current, null, 2));
  await writeFile(path.join(OUT, 'diff.json'), JSON.stringify({ generatedAt, previousSnapshot: previous?.file || null, currentSnapshot: snapshotFile, bootstrap, changeCount: changes.length, changes }, null, 2));
  await writeFile(path.join(OUT, 'alert-candidates.json'), JSON.stringify({ generatedAt, previousSnapshot: previous?.file || null, bootstrap, candidateCount: alertCandidates.length, candidates: alertCandidates }, null, 2));
  await writeFile(path.join(OUT, 'confidence-policy.json'), JSON.stringify({ generatedAt, policies: STATE_CONFIDENCE_POLICY }, null, 2));

  const diffMd = ['# Bourbon Signal Run Diff', '', `Generated: ${generatedAt}`, `Previous snapshot: ${previous?.file || '[none: bootstrap run]'}`, `Changes: ${changes.length}`, ''];
  for (const change of changes.slice(0, 100)) {
    const sig = change.after || change.before;
    diffMd.push(`- **${change.type}** ${sig.state} ${sig.canonicalName || sig.eventType || 'unknown'} — ${describeChange(change, sig)}`);
  }
  if (!changes.length) diffMd.push('No signal-level changes detected against the previous snapshot.');
  await writeFile(path.join(OUT, 'diff.md'), diffMd.join('\n'));

  const alertsMd = ['# Bourbon Signal Alert Candidates', '', `Generated: ${generatedAt}`, `Bootstrap mode: ${bootstrap}`, '', 'These are candidate alerts/watch items only. State confidence policy decides whether a signal is inventory-grade, watch-grade, or context-only.', ''];
  for (const c of alertCandidates.slice(0, 100)) {
    alertsMd.push(`## ${c.state} — ${c.bottle || c.eventType}`);
    alertsMd.push(`- Action: ${c.action}; score ${c.score}; confidence ${c.confidence.toFixed(2)}`);
    alertsMd.push(`- Location: ${c.locationPrecision}${c.locationName ? ` — ${c.locationName}` : ''}${c.storeAddress ? `, ${c.storeAddress}` : ''}`);
    if (c.quantity || c.warehouseQty || c.price) alertsMd.push(`- Quantity/price: qty=${c.quantity || 0}, warehouse=${c.warehouseQty || 0}, price=${c.price || 0}`);
    alertsMd.push(`- Reason: ${c.reason}`);
    alertsMd.push(`- Policy: ${c.inventorySemantics}`);
    alertsMd.push(`- Source: ${c.sourceUrl}`);
    if (c.evidence) alertsMd.push(`- Evidence: ${String(c.evidence).replace(/\s+/g, ' ').slice(0, 500)}`);
    alertsMd.push('');
  }
  if (!alertCandidates.length) alertsMd.push('No alert candidates for this run.');
  await writeFile(path.join(OUT, 'alert-candidates.md'), alertsMd.join('\n'));

  console.log(`Operational report: ${signals.length} normalized operational signals, ${changes.length} changes, ${alertCandidates.length} alert candidates. Bootstrap=${bootstrap}.`);
}

main().catch((error) => { console.error(error); process.exit(1); });
