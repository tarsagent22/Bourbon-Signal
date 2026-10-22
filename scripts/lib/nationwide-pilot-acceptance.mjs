/** Evaluate supplied receipts; this does not authenticate or collect production evidence. */
export const NATIONWIDE_PILOT_EVIDENCE_VERSION = 'nationwide-pilot-evidence@1';
const SOURCES = Object.freeze({
  'ca:mission-trails-wine-spirits': { state: 'CA', host: 'missiontrailswineandspirits.com', storeId: 'mission-trails-wine-spirits:8181-mission-gorge', address: '8181 Mission Gorge Rd, Ste A, San Diego, CA 92120' },
  'fl:jensens-miami': { state: 'FL', host: 'jensensliquors.com', storeId: 'jensens-liquors:1646-sw-27th', address: '1646 SW 27th Ave, Miami, FL 33145' },
});
const text = value => typeof value === 'string' && value.trim().length > 0;
const stamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? Date.parse(value) : NaN;
const addressKey = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const integer = value => Number.isSafeInteger(value) && value >= 0;
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
function provenance(row) {
  try { return digest(row?.sha256) && new URL(row.url).protocol === 'https:'; } catch { return false; }
}

/**
 * allowedBottleIds is a trusted canonical-catalog input, never taken from evidence.
 * candidateKeys describe newly emitted candidates, not the retained projection.
 */
export function evaluateNationwidePilotAcceptance(evidence, { now = new Date().toISOString(), allowedBottleIds = [] } = {}) {
  const failures = [], acceptedSources = [], premises = new Set(), emittedKeys = new Set(), runIds = new Set();
  const fail = message => failures.push(message);
  const nowMs = stamp(now), catalog = new Set(allowedBottleIds);
  if (!Number.isFinite(nowMs)) fail('Invalid evaluation time.');
  if (!catalog.size || [...catalog].some(id => !text(id))) fail('Trusted canonical bottle allowlist is required.');
  if (evidence?.contractVersion !== NATIONWIDE_PILOT_EVIDENCE_VERSION) fail('Unsupported evidence contract.');
  const sources = Array.isArray(evidence?.sources) ? evidence.sources : [];
  if (sources.length !== 2 || new Set(sources.map(s => s?.sourceId)).size !== 2) fail('Exactly the two distinct reviewed pilot sources are required.');
  for (const source of sources) {
    const id = source?.sourceId, policy = SOURCES[id];
    if (!policy || source.state !== policy.state) { fail(`Unreviewed source/state: ${id}.`); continue; }
    const cadence = source.cadenceSeconds;
    if (!integer(cadence) || cadence < 1800 || cadence > 3600) fail(`${id}: cadence must be 1800-3600 seconds.`);
    const runs = Array.isArray(source.runs) ? source.runs : [];
    if (runs.length < 2) fail(`${id}: two unattended accepted runs are required.`);
    let previousStart = -Infinity, previousFinish = -Infinity, previousDue = -Infinity, previousObservation = -Infinity, previousGeneration = -Infinity;
    for (const [runIndex, suppliedRun] of runs.entries()) {
      const run = suppliedRun && typeof suppliedRun === 'object' ? suppliedRun : {};
      const label = `${id}/${run?.runId || 'missing-run'}`;
      const started = stamp(run?.startedAt), finished = stamp(run?.finishedAt), due = stamp(run?.dueAt);
      if (!text(run?.runId) || runIds.has(run.runId)) fail(`${label}: missing or reused run id.`);
      runIds.add(run?.runId);
      if (!integer(run?.generation) || run.generation <= previousGeneration) fail(`${label}: generation must advance.`);
      if (run?.status !== 'accepted' || run?.trigger !== 'scheduled' || run?.manualDueReset !== false) fail(`${label}: a genuinely scheduled accepted collection is required.`);
      if (![started, finished, due].every(Number.isFinite) || due > started || started < previousFinish || finished < started || finished > nowMs
        || started - previousStart < cadence * 1000 || due - previousDue < cadence * 1000) fail(`${label}: invalid or non-advancing due/collection clock.`);
      if (!integer(run?.requests) || run.requests < 1 || run.requests > 6 || !integer(run?.bytes) || run.bytes > 4 * 1024 * 1024
        || !Number.isFinite(run?.durationMs) || run.durationMs < 0 || run.durationMs > 50_000 || Math.abs(finished - started - run.durationMs) > 1000) fail(`${label}: measured collection bounds missing or exceeded.`);
      if (!provenance(run?.provenance)) fail(`${label}: immutable run provenance is required.`);
      if (typeof run?.bootstrap !== 'boolean' || !integer(run?.candidateCount) || !Array.isArray(run?.candidateKeys)
        || run.candidateKeys.length !== run.candidateCount || (run.bootstrap && run.candidateCount !== 0)) fail(`${label}: invalid candidate accounting or bootstrap emission.`);
      for (const key of Array.isArray(run.candidateKeys) ? run.candidateKeys : []) {
        if (!text(key) || emittedKeys.has(key)) fail(`${label}: duplicate or missing emitted candidate key.`);
        emittedKeys.add(key);
        const matching = (Array.isArray(run.customerReceipts) ? run.customerReceipts : []).filter(receipt => receipt?.surface === 'candidate'
          && receipt.sourceId === id && receipt.runId === run.runId && receipt.generation === run.generation && receipt.candidateKey === key);
        if (matching.length !== 1 || !provenance(matching[0]?.provenance) || !Number.isFinite(stamp(matching[0]?.receivedAt))
          || stamp(matching[0]?.receivedAt) < finished || stamp(matching[0]?.receivedAt) > nowMs
          || !(Array.isArray(run.observations) ? run.observations : []).some(observation => observation
            && matching[0].storeId === observation.storeId && matching[0].canonicalBottleId === observation.canonicalBottleId
            && String(matching[0].productId) === String(observation.productId) && String(matching[0].variantId) === String(observation.variantId)
            && matching[0].observedAt === observation.observedAt)) fail(`${label}: emitted candidate requires a matching canonical customer receipt.`);
      }
      const observations = Array.isArray(run?.observations) ? run.observations : [];
      if (!observations.length) fail(`${label}: fresh exact-store positive availability is required.`);
      const identities = new Set();
      let newestObservation = -Infinity;
      for (const suppliedObservation of observations) {
        const observation = suppliedObservation && typeof suppliedObservation === 'object' ? suppliedObservation : {};
        const observed = stamp(observation?.observedAt), identity = [observation?.storeId, observation?.canonicalBottleId, observation?.productId, observation?.variantId].join('|');
        if (identities.has(identity)) fail(`${label}: duplicate store/bottle/product observation.`);
        identities.add(identity);
        let url;
        try { url = new URL(observation?.sourceUrl); } catch { /* invalid source URL below */ }
        if (observation?.state !== policy.state || observation?.storeId !== policy.storeId || addressKey(observation?.storeAddress) !== addressKey(policy.address)
          || observation?.locationPrecision !== 'store_level' || !url || url.protocol !== 'https:' || url.hostname !== policy.host || !url.pathname.startsWith('/products/')) fail(`${label}: exact reviewed source/product/premises binding missing.`);
        if (!catalog.has(observation?.canonicalBottleId) || !text(String(observation?.productId ?? '')) || !text(String(observation?.variantId ?? ''))
          || observation?.availability !== 'in_stock' || observation?.quantitySemantics !== 'binary_orderability' || observation?.quantityIsExact !== false || observation?.quantity !== 0) fail(`${label}: allowed canonical bottle and binary availability proof required.`);
        const explicitSize = observation.sizeMl !== null && observation.sizeMl !== undefined;
        if (explicitSize && (!Number.isFinite(observation.sizeMl) || !(observation.sizeMl > 375 && observation.sizeMl <= 1750)
          || observation.sizeEvidenceType !== 'source_metadata')) fail(`${label}: explicit volume must be source metadata within reviewed formats.`);
        if (id === 'ca:mission-trails-wine-spirits' && (observation.fulfillmentEvidenceType !== 'retailer_pickup_policy'
          || observation.fulfillmentPolicyVerified !== true || observation.pickupVerified === true
          || (!explicitSize && observation.sizeEvidenceType !== 'not_published'))) fail(`${label}: CA requires general retailer pickup policy evidence without claiming a variant pickup offer.`);
        if (id === 'fl:jensens-miami' && (observation.fulfillmentEvidenceType !== 'variant_pickup_offer'
          || observation.pickupVerified !== true || !explicitSize)) fail(`${label}: FL requires exact variant pickup and explicit bottle volume.`);
        if (id === 'fl:jensens-miami' && (String(observation?.productId) !== '15414448390218' || String(observation?.variantId) !== '67703590977610'
          || url?.pathname !== '/products/elijah-craig-single-barrel-18-years-bourbon-whiskey')) fail(`${label}: Jensen product is outside the reviewed pilot.`);
        if (!Number.isFinite(observed) || observed < started || observed > finished || (runIndex === runs.length - 1 && nowMs - observed > 3600_000)
          || observed <= previousObservation) fail(`${label}: observation is stale, outside collection, or does not advance.`);
        newestObservation = Math.max(newestObservation, observed);
        premises.add(`${policy.state}|${addressKey(observation?.storeAddress)}`);
        for (const surface of ['feed', 'coverage']) {
          const receipts = (Array.isArray(run?.customerReceipts) ? run.customerReceipts : []).filter(r => r?.surface === surface && r.sourceId === id
            && r.runId === run.runId && r.generation === run.generation && r.storeId === observation.storeId
            && r.canonicalBottleId === observation.canonicalBottleId && String(r.productId) === String(observation.productId)
            && String(r.variantId) === String(observation.variantId) && r.observedAt === observation.observedAt);
          if (receipts.length !== 1 || !provenance(receipts[0]?.provenance) || stamp(receipts[0]?.receivedAt) < finished || stamp(receipts[0]?.receivedAt) - observed > 3600_000
            || stamp(receipts[0]?.receivedAt) > nowMs || !Number.isFinite(stamp(receipts[0]?.receivedAt))) fail(`${label}: matching immutable source-specific ${surface} receipt required.`);
        }
      }
      previousStart = started; previousFinish = finished; previousDue = due; previousGeneration = run?.generation; previousObservation = newestObservation;
    }
    acceptedSources.push(id);
  }
  for (const id of Object.keys(SOURCES)) if (!acceptedSources.includes(id)) fail(`Missing reviewed source ${id}.`);
  if (premises.size < 2) fail('At least two unique reviewed physical premises across CA and FL are required.');
  const maintenance = evidence?.maintenance;
  for (const check of ['boundedBackoff', 'fencedLeases', 'sourceIsolationVerified', 'staleSuppressionVerified', 'rollbackVerified']) {
    if (maintenance?.[check] !== true || !provenance(maintenance?.receipts?.[check])) fail(`Maintenance proof missing: ${check}.`);
  }
  const monitored = stamp(maintenance?.monitorReceiptAt);
  if (!Number.isFinite(monitored) || monitored > nowMs || nowMs - monitored > 15 * 60_000 || !provenance(maintenance?.monitorProvenance)) fail('Fresh independent monitor receipt required.');
  return { contractVersion: 'nationwide-pilot-acceptance@1', ok: failures.length === 0, evaluatedAt: now, evidenceScope: 'supplied_receipts', failures,
    counts: { sources: acceptedSources.length, states: new Set(acceptedSources.map(id => SOURCES[id].state)).size, physicalPremises: premises.size, runs: runIds.size, emittedCandidateKeys: emittedKeys.size } };
}
