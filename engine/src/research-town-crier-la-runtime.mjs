import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { collectionRequestSignal } from './core/collection-context.mjs';
import { fetchReviewedFirstPartyText } from './collectors/central-cityhive-transport.mjs';
import { TOWN_CRIER_LA_API_ORIGIN, TOWN_CRIER_LA_PRODUCTS, TOWN_CRIER_LA_STORES } from './collectors/town-crier-la-premises.mjs';

const HOST = 'thetowncrier.net';
const DENIALS = new Set([401, 403, 429, 435]);
const DENIAL_COOLDOWN_MS = 24 * 60 * 60_000;
const MAX_REQUESTS = 1 + TOWN_CRIER_LA_STORES.length * TOWN_CRIER_LA_PRODUCTS.length;
const sha = value => createHash('sha256').update(value).digest('hex');
const trackedTier = value => ({ regular: 'standard', common: 'standard', highly_allocated: 'unicorn', unicorn: 'unicorn', allocated: 'allocated', limited: 'limited' })[value] || null;

function fail(message) { throw new Error(`Town Crier LA research rejected: ${message}`); }

export function townCrierRequestIdentity(value) {
  const url = new URL(value);
  if (url.origin !== TOWN_CRIER_LA_API_ORIGIN || url.username || url.password || url.port || url.hash) fail('request escaped the reviewed first-party HTTPS origin');
  if (url.pathname === '/api/locations' && url.search === '') return { kind: 'locations', key: 'locations' };
  const match = url.pathname.match(/^\/api\/products\/(\d{12,14})$/);
  if (!match || url.searchParams.size !== 1 || [...url.searchParams.keys()][0] !== 'location') fail('request is not the exact reviewed location-scoped product API');
  const product = TOWN_CRIER_LA_PRODUCTS.find(item => item.upc === match[1]);
  const store = TOWN_CRIER_LA_STORES.find(item => item.id === url.searchParams.get('location'));
  if (!product || !store) fail('request UPC or store id is outside the closed reviewed cohort');
  return { kind: 'product', key: `${store.id}|${product.upc}`, product, store };
}

export function validateTownCrierJournal(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.schemaVersion !== 1 || value.state !== 'LA'
    || value.host !== HOST || Object.keys(value).some(key => !['schemaVersion', 'state', 'host', 'incident'].includes(key))) fail('incident journal is malformed');
  const incident = value.incident;
  if (incident === null) return value;
  if (!incident || !['in_flight', 'access_denied'].includes(incident.status)
    || Object.keys(incident).some(key => !['status', 'httpStatus', 'lastAttemptAt', 'nextAllowedAt', 'requestId', 'urlSha256', 'reviewRequired'].includes(key))
    || !Number.isFinite(Date.parse(incident.lastAttemptAt)) || !Number.isFinite(Date.parse(incident.nextAllowedAt))) fail('incident journal entry is malformed');
  if (incident.status === 'access_denied' && (!DENIALS.has(Number(incident.httpStatus)) || incident.reviewRequired !== true
    || Date.parse(incident.nextAllowedAt) - Date.parse(incident.lastAttemptAt) < DENIAL_COOLDOWN_MS)) fail('denial cooldown is malformed');
  if (incident.status === 'in_flight' && (incident.httpStatus !== null || !/^[a-f0-9-]{36}$/.test(incident.requestId || '')
    || !/^[a-f0-9]{64}$/.test(incident.urlSha256 || '') || Date.parse(incident.nextAllowedAt) - Date.parse(incident.lastAttemptAt) < DENIAL_COOLDOWN_MS)) fail('unfinished request latch is malformed');
  return value;
}

function writeJournal(file, journal) {
  mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try { writeFileSync(temporary, JSON.stringify(journal, null, 2)); renameSync(temporary, file); }
  finally { rmSync(temporary, { force: true }); }
}

async function readJournal(file) {
  try { return validateTownCrierJournal(JSON.parse(await readFile(file, 'utf8'))); }
  catch (error) { if (error.code === 'ENOENT') return { schemaVersion: 1, state: 'LA', host: HOST, incident: null }; throw error; }
}

function validateLocations(payload) {
  if (!Array.isArray(payload) || payload.length !== TOWN_CRIER_LA_STORES.length) fail('locations response does not equal the reviewed closed cohort');
  const byId = new Map();
  for (const row of payload) {
    const id = String(row?.store_num || '');
    if (!id || byId.has(id)) fail('locations response contains a missing or duplicate store id');
    byId.set(id, row);
  }
  for (const expected of TOWN_CRIER_LA_STORES) {
    const actual = byId.get(expected.id);
    if (!actual || actual.name !== expected.name || actual.address !== expected.address) fail(`first-party premise changed for store ${expected.id}`);
  }
  return byId;
}

function exactProduct(payload, product) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)
    || String(payload.id) !== product.upc || String(payload.upc) !== product.upc
    || payload.name !== product.sourceName || payload.category !== product.category || Number(payload.is_active) !== 1
    || !Number.isSafeInteger(Number(payload.quantity)) || Number(payload.quantity) < 0
    || !Number.isFinite(Number(payload.price)) || Number(payload.price) <= 0) fail(`product response failed exact UPC/name/activity/quantity checks for ${product.upc}`);
  if (product.upc === '088004021344' && !/aged no less than ten years/i.test(String(payload.description || '')))
    fail('Eagle Rare UPC response lacks the 10-year identity proof');
  return payload;
}

function identityFor(product, bible) {
  const matched = bible?.match?.(product.canonicalName);
  if (matched?.confidence !== 1 || matched.record?.canonical !== product.canonicalName) fail(`Bourbon Bible lacks the exact ${product.canonicalName} identity`);
  const identities = (matched.record.libraryIdentities || []).filter(identity => identity.canonicalName === product.canonicalName);
  if (identities.length !== 1) fail(`Bourbon Bible identity is missing or ambiguous for ${product.canonicalName}`);
  const marketTier = identities[0].stateOverrides?.find(item => item.jurisdiction === 'LA')?.tier || identities[0].nationalTier;
  const tier = trackedTier(marketTier);
  if (!['limited', 'allocated', 'unicorn'].includes(tier)) fail(`${product.canonicalName} is not in a tracked scarce tier`);
  return { record: matched.record, identity: identities[0], tier };
}

export function isTownCrierResearchInventory(row) {
  const product = TOWN_CRIER_LA_PRODUCTS.find(item => item.upc === String(row?.productId || ''));
  const store = TOWN_CRIER_LA_STORES.find(item => item.id === String(row?.sourceProductBinding?.locationId || ''));
  return Boolean(product && store && row.state === 'LA' && row.sourceRuntimeId === 'research:la:town-crier'
    && row.sourceProductBinding?.shadowOnly === true && row.raw?.shadowOnly === true
    && row.sourceProductBinding?.source === 'town-crier-public-product-api'
    && row.sourceProductBinding?.upc === product.upc && row.sourceProductBinding?.locationId === store.id
    && row.sourceProductBinding?.storeAddress === store.address && row.sourceProductBinding?.canonicalName === product.canonicalName
    && row.sourceProductBinding?.canonicalBottleId === row.canonicalBottleId
    && row.sourceProductBinding?.siteReportedQuantity > 0 && Number.isSafeInteger(row.sourceProductBinding?.siteReportedQuantity)
    && row.sourceProductBinding?.productIsActive === true && row.sourceProductBinding?.observedAt === row.observedAt
    && row.sourceProductBinding?.premisesVerified === true && row.sourceProductBinding?.storeResponseDoesNotEchoLocation === true
    && String(row.raw?.product?.id) === product.upc && String(row.raw?.product?.upc) === product.upc
    && row.raw?.product?.name === product.sourceName && row.raw?.product?.category === product.category && row.raw?.product?.is_active === 1
    && Number(row.raw?.product?.quantity) === row.sourceProductBinding?.siteReportedQuantity
    && Number(row.raw?.product?.price) === row.price && Number(row.sourceProductBinding?.price) === row.price
    && (product.upc !== '088004021344' || /aged no less than ten years/i.test(row.raw?.product?.description || ''))
    && ['limited', 'allocated', 'unicorn'].includes(row.tier)
    && row.storeId === `town-crier:${store.id}` && row.storeAddress === store.address
    && row.canonicalName === product.canonicalName && row.eventType === 'retailer_store_inventory_result'
    && row.sourceUrl === `${TOWN_CRIER_LA_API_ORIGIN}/api/products/${product.upc}?location=${store.id}`
    && row.availabilityStatus === 'in_stock' && row.locationPrecision === 'store_level'
    && Number.isFinite(Date.parse(row.observedAt)) && row.quantity === 0 && row.quantityIsExact === false
    && row.inventorySemantics === 'store_scoped_website_stock_periodically_updated_no_shelf_guarantee'
    && ['canAlertAsInventory', 'canAlertAsWatch', 'alertable', 'eligibleForOnSite', 'eligibleForDropFeed', 'eligibleForWatch',
      'eligibleForDelivery', 'deliveryEligible', 'eligibleForEmail', 'eligibleForSms'].every(key => row[key] === false));
}

function makeSignal({ product, store, payload, observedAt, identity }) {
  const binding = {
    schemaVersion: 1, source: 'town-crier-public-product-api', locationId: store.id, upc: product.upc,
    storeAddress: store.address, canonicalName: product.canonicalName, canonicalBottleId: identity.record.id,
    productName: payload.name, productCategory: payload.category, siteReportedQuantity: Number(payload.quantity),
    productIsActive: Number(payload.is_active) === 1, price: Number(payload.price), observedAt,
    premisesVerified: true, storeResponseDoesNotEchoLocation: true, sourceUpdatedAt: null, shadowOnly: true,
  };
  const row = {
    id: `town-crier:${store.id}:${product.upc}`, state: 'LA', stateCode: 'LA', sourceRuntimeId: 'research:la:town-crier',
    sourceLabel: 'Town Crier first-party store-scoped website inventory (research)',
    sourceUrl: `${TOWN_CRIER_LA_API_ORIGIN}/api/products/${product.upc}?location=${store.id}`,
    sourceChain: 'town-crier', merchantId: store.id, productId: product.upc, variantId: product.upc,
    canonicalBottleId: identity.record.id, canonicalName: product.canonicalName, rawName: payload.name,
    tier: identity.tier, confidence: 1, eventType: 'retailer_store_inventory_result', locationPrecision: 'store_level',
    locationName: store.name, storeName: store.name, storeId: `town-crier:${store.id}`, storeAddress: store.address,
    city: store.address.split(',').at(-2)?.trim() || '', postalCode: store.address.match(/\b\d{5}\s*$/)?.[0] || '',
    quantity: 0, quantityIsExact: false, price: Number(payload.price), observedAt, fetchedAt: observedAt,
    availabilityStatus: 'in_stock', availabilityLabel: 'Town Crier reports in stock for this selected store',
    sourceAvailabilityVerified: true, canAlertAsInventory: false, canAlertAsWatch: false, alertable: false,
    eligibleForOnSite: false, eligibleForDropFeed: false, eligibleForWatch: false, eligibleForDelivery: false,
    deliveryEligible: false, eligibleForEmail: false, eligibleForSms: false, researchOnly: true,
    inventorySemantics: 'store_scoped_website_stock_periodically_updated_no_shelf_guarantee',
    sourceInventorySemantics: 'Town Crier first-party website stock for a selected store; retailer warns inventory updates periodically and may differ from current shelf stock. The website shows a binary In Stock label when its quantity is positive.',
    evidence: `${store.name} (${store.address}) returned positive website stock for UPC ${product.upc} at ${observedAt}; verify with the store before visiting.`,
    sourceProductBinding: binding, raw: { product: { id: String(payload.id), upc: String(payload.upc), name: payload.name,
      category: payload.category, price: Number(payload.price), quantity: Number(payload.quantity), is_active: Number(payload.is_active),
      description: String(payload.description || '') }, shadowOnly: true, sourceUpdatedAt: null },
  };
  if (!isTownCrierResearchInventory(row)) fail(`research-only row contract failed for ${row.storeId}/${row.productId}`);
  return row;
}

export async function collectTownCrierLouisianaResearch({ bible, fetchText = fetchReviewedFirstPartyText,
  env = process.env, signal, now = () => new Date(), sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  incidentFile = path.resolve('out/research-source-attempts/town-crier-la-incidents.json'),
  reportDirectory = path.resolve('out/research-town-crier/LA') } = {}) {
  if (env.BOURBON_SIGNAL_SHADOW_MODE !== '1') fail('collector requires isolated shadow mode');
  if (typeof fetchText !== 'function' || typeof now !== 'function') fail('bounded transport and observation clock are required');
  const startedAt = new Date(now()).toISOString();
  const deadline = AbortSignal.timeout(180_000);
  const bounded = signal ? AbortSignal.any([signal, deadline]) : deadline;
  let journal = await readJournal(incidentFile);
  const prior = journal.incident;
  if (prior?.status === 'in_flight' || prior?.status === 'access_denied' && Date.parse(prior.nextAllowedAt) > Date.parse(startedAt)) {
    return blockedReport(startedAt, journal, 'Town Crier host has an unfinished request or active denial cooldown; no HTTP was made.');
  }
  const receipts = [], roadblocks = [];
  let pendingDenial = null;
  const request = async url => {
    const identity = townCrierRequestIdentity(url);
    const requestedAt = new Date(now()).toISOString();
    const controller = collectionRequestSignal(bounded);
    controller?.throwIfAborted();
    journal = { schemaVersion: 1, state: 'LA', host: HOST, incident: {
      status: 'in_flight', httpStatus: null, lastAttemptAt: requestedAt,
      nextAllowedAt: new Date(Date.parse(requestedAt) + DENIAL_COOLDOWN_MS).toISOString(),
      requestId: randomUUID(), urlSha256: sha(url),
    } };
    writeJournal(incidentFile, journal);
    let observedDenial = false;
    const onResponse = response => {
      if (!DENIALS.has(Number(response.status)) || observedDenial) return;
      observedDenial = true;
      const retryAfterMs = Math.max(DENIAL_COOLDOWN_MS, Number(response.retryAfterSeconds || 0) * 1000);
      pendingDenial = { status: Number(response.status), requestedAt, observedAt: new Date(now()).toISOString() };
      journal = { schemaVersion: 1, state: 'LA', host: HOST, incident: {
        status: 'access_denied', httpStatus: Number(response.status), lastAttemptAt: requestedAt,
        nextAllowedAt: new Date(Date.parse(requestedAt) + retryAfterMs).toISOString(), reviewRequired: true,
      } };
      writeJournal(incidentFile, journal);
    };
    const result = await fetchText(url, { signal: controller, timeoutMs: 10_000, maxTimeoutMs: 10_000,
      maxBytes: 256 * 1024, headers: { accept: 'application/json' }, isAllowedUrl: candidate => {
        try { const candidateId = townCrierRequestIdentity(candidate); return candidateId.key === identity.key && new URL(candidate).href === new URL(url).href; }
        catch { return false; }
      }, onResponse });
    const finalUrl = result.url || url;
    if (new URL(finalUrl).href !== new URL(url).href) fail('redirect or final URL changed');
    const status = Number(result.status) || 0;
    if (DENIALS.has(status)) onResponse(result);
    else if (status >= 100) { journal = { schemaVersion: 1, state: 'LA', host: HOST, incident: null }; writeJournal(incidentFile, journal); }
    const bytes = Buffer.from(String(result.text || ''), 'utf8');
    if (bytes.length > 256 * 1024) fail('source response exceeded the 256 KiB bound');
    const digest = sha(bytes), index = receipts.length + 1;
    const artifactPath = `town-crier/source-captures/${String(index).padStart(2, '0')}-${digest.slice(0, 12)}.json`;
    await mkdir(path.join(reportDirectory, path.dirname(artifactPath)), { recursive: true });
    await writeFile(path.join(reportDirectory, artifactPath), bytes);
    const receipt = { kind: identity.kind, key: identity.key, url, finalUrl, status, ok: result.ok === true,
      requestedAt, observedAt: new Date(now()).toISOString(), bytes: bytes.length, sha256: digest, artifactPath };
    receipts.push(receipt);
    if (observedDenial || DENIALS.has(status)) fail(`access denied with HTTP ${status}; remaining Town Crier requests were stopped`);
    if (status !== 200 || result.ok !== true) fail(`Town Crier returned HTTP ${status}; closed profile stopped without retries`);
    await sleep(250);
    controller?.throwIfAborted();
    return { identity, receipt, payload: JSON.parse(bytes.toString('utf8')) };
  };

  let locations;
  try {
    const locationResult = await request(`${TOWN_CRIER_LA_API_ORIGIN}/api/locations`);
    locations = validateLocations(locationResult.payload);
    const bibleRows = new Map(TOWN_CRIER_LA_PRODUCTS.map(product => [product.upc, identityFor(product, bible)]));
    const signals = [];
    const zeroRows = [];
    for (const store of TOWN_CRIER_LA_STORES) {
      for (const product of TOWN_CRIER_LA_PRODUCTS) {
        const url = `${TOWN_CRIER_LA_API_ORIGIN}/api/products/${product.upc}?location=${store.id}`;
        const result = await request(url);
        const payload = exactProduct(result.payload, product);
        if (Number(payload.quantity) > 0) signals.push(makeSignal({ product, store, payload, observedAt: result.receipt.observedAt, identity: bibleRows.get(product.upc) }));
        else zeroRows.push({ storeId: store.id, upc: product.upc, observedAt: result.receipt.observedAt, disposition: 'site_quantity_zero_no_physical_negative_claim' });
      }
    }
    if (receipts.length !== MAX_REQUESTS) fail('closed store/UPC matrix did not complete');
    const finishedAt = new Date(now()).toISOString();
    const source = { sourceRuntimeId: 'research:la:town-crier', label: 'Town Crier first-party store-scoped website inventory',
      url: `${TOWN_CRIER_LA_API_ORIGIN}/api/products/{upc}?location={store_num}`, ok: true, status: 200,
      signalType: 'retailer_store_inventory_result', matchedBottleCount: signals.length };
    return { state: 'LA', label: 'Louisiana Town Crier exact-store website inventory research', tier: 'B', strategy: 'retailer_store_inventory',
      cadence: 'shadow-only', startedAt, finishedAt, lastGoodAt: finishedAt, status: signals.length ? 'useful' : 'no_trusted_inventory',
      stale: false, signals, sources: [source], sourceResults: [{ ...source, sourceId: source.sourceRuntimeId, checkedAt: finishedAt,
        alertable: false, inventoryAlertable: false, watchAlertable: false }], roadblocks,
      metadata: { complete: true, profileComplete: true, requestCount: receipts.length, maxRequestCount: MAX_REQUESTS,
        storeCount: TOWN_CRIER_LA_STORES.length, productCount: TOWN_CRIER_LA_PRODUCTS.length, positiveRowCount: signals.length,
        siteQuantityZeroCount: zeroRows.length, siteQuantityZeroObservations: zeroRows, physicalNegativeClaims: 0,
        locationBinding: 'official first-party product client passes the selected location id as ?location=; response does not echo the id',
        inventorySemantics: 'store-scoped website stock, periodically updated; not confirmed physical shelf inventory or a reservation',
        freshness: 'collector response time only; upstream inventory update timestamp is not returned',
        siteCaveat: 'Town Crier states online inventory is updated periodically and may not reflect current shelf stock; call ahead to confirm.',
        shadowOnly: true, productionActivationAllowed: false, customerDeliveryAllowed: false, alertsDisabled: true,
        receipts, incidentJournal: journal, sourceUpdatedAt: null }, };
  } catch (error) {
    if (bounded.aborted) throw error;
    const finishedAt = new Date(now()).toISOString();
    const denial = pendingDenial;
    roadblocks.push({ state: 'LA', source: 'Town Crier first-party store-scoped website inventory',
      status: denial?.status || 'incomplete_closed_profile', error: error?.message || String(error),
      requestCount: receipts.length, ...(denial ? { deniedAt: denial.observedAt, retryAfter: journal.incident?.nextAllowedAt } : {}) });
    const source = { sourceRuntimeId: 'research:la:town-crier', label: 'Town Crier first-party store-scoped website inventory',
      url: `${TOWN_CRIER_LA_API_ORIGIN}/api/products/{upc}?location={store_num}`, ok: false,
      status: denial?.status || 'incomplete_closed_profile', signalType: 'retailer_store_inventory_result', matchedBottleCount: 0,
      error: error?.message || String(error) };
    return { state: 'LA', label: 'Louisiana Town Crier exact-store website inventory research', tier: 'B', strategy: 'retailer_store_inventory',
      cadence: 'shadow-only', startedAt, finishedAt, lastGoodAt: null,
      status: denial ? 'source_denied' : 'incomplete', stale: false, signals: [], sources: [source],
      sourceResults: [{ ...source, sourceId: source.sourceRuntimeId, checkedAt: finishedAt, alertable: false, inventoryAlertable: false, watchAlertable: false }],
      roadblocks, metadata: { complete: false, profileComplete: false, requestCount: receipts.length, maxRequestCount: MAX_REQUESTS,
        shadowOnly: true, productionActivationAllowed: false, customerDeliveryAllowed: false, alertsDisabled: true,
        physicalNegativeClaims: 0, receipts, incidentJournal: journal, denialStoppedRemainingRequests: Boolean(denial) } };
  }
}

function blockedReport(startedAt, journal, reason) {
  const finishedAt = new Date().toISOString();
  return { state: 'LA', label: 'Louisiana Town Crier exact-store website inventory research', tier: 'B', strategy: 'retailer_store_inventory',
    cadence: 'shadow-only', startedAt, finishedAt, lastGoodAt: null, status: 'source_parked', stale: false, signals: [],
    sources: [{ sourceRuntimeId: 'research:la:town-crier', label: 'Town Crier first-party store-scoped website inventory',
      url: `${TOWN_CRIER_LA_API_ORIGIN}/api/products/{upc}?location={store_num}`, ok: false, status: 'source_parked', matchedBottleCount: 0 }],
    sourceResults: [], roadblocks: [{ state: 'LA', source: HOST, status: 'source_parked', requestCount: 0, error: reason }],
    metadata: { complete: false, profileComplete: false, requestCount: 0, maxRequestCount: MAX_REQUESTS,
      shadowOnly: true, productionActivationAllowed: false, customerDeliveryAllowed: false, alertsDisabled: true,
      denialStoppedRemainingRequests: true, incidentJournal: journal } };
}
