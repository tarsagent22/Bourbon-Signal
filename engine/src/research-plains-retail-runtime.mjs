import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const CAPTURE_PATH = new URL('../data/research-captures/plains-retail-20261114.json', import.meta.url);
const CAPTURE_SHA256 = '39c8899e95e996dedf1f3b3cebe1c5eb5c54d4ab1b1ca35e69ed47f4659ecf00';
const FRESHNESS_MS = 2 * 60 * 60 * 1000;

const sourceConfigs = new Map([
  ['SD', Object.freeze({
    id: 'SD', label: 'South Dakota Mr. Liquor South retained pickup research', tier: 'B', active: false,
    strategy: 'retailer_store_inventory', cadence: 'offline-retained-capture-replay',
    value: 'One exact Rapid City premise with retained retailer pickup and product stock evidence; research only.',
    sources: Object.freeze([Object.freeze({ kind: 'retained_capture', url: 'https://www.mrliquor.com/', precisionOnly: true })]),
    premise: Object.freeze({ storeId: '5220', name: 'Mr. Liquor South', address: '5312 Black Hills Blvd', city: 'Rapid City', state: 'SD', zip: '57701' }),
    apiCandidates: [],
  })],
  ['MT', Object.freeze({
    id: 'MT', label: 'Montana Liquor Billings retained pickup research', tier: 'B', active: false,
    strategy: 'retailer_store_inventory', cadence: 'offline-retained-capture-replay',
    value: 'One exact Billings storefront premise with retained in-stock and pickup evidence; research only.',
    sources: Object.freeze([Object.freeze({ kind: 'retained_capture', url: 'https://montanaliquor.com/', precisionOnly: true })]),
    premise: Object.freeze({ storeId: 'montana-liquor-billings-1019', name: 'Montana Liquor Inc', address: '1019 1st Ave North', city: 'Billings', state: 'MT', zip: '59101' }),
    apiCandidates: [],
  })],
]);

const reviewedProducts = new Map([
  ['096749002429', { state: 'SD', canonicalName: 'Heaven Hill Bottled-in-Bond 7 Year', canonicalBottleId: 'bb_ef203a18f5f98f23', title: /^Heaven Hill\s*-\s*7 Year Bourbon\s*-\s*750ml$/i }],
  ['096749002658', { state: 'SD', canonicalName: 'Larceny Barrel Proof', canonicalBottleId: 'bb_dec2c347ba378237', title: /^Larceny Bourbon\s*-\s*Barrel Proof\s*\(Allocated\)$/i }],
  ['860006244521', { state: 'MT', canonicalName: 'Undammed Thief Creek Straight Bourbon', canonicalBottleId: 'bb_9c8cf2d251d5db7e', title: /^UNDAMMED THIEF CREEK STRAIGHT BOURBON 750ML$/i }],
]);

export function plainsRetailResearchSourceForState(state) {
  return sourceConfigs.get(state) || null;
}

export function plainsRetailResearchLifecycleEntries() {
  return Object.fromEntries([...sourceConfigs].map(([state, config]) => [state, {
    customerLabel: state === 'SD' ? 'South Dakota' : 'Montana',
    sourceLabel: config.label,
    publicStatus: 'research_only',
    shadowEligible: true,
    lifecycle: 'retailer_inventory_research',
    coverageTier: 'single_store_inventory_research',
    refinementLevel: 'store',
    inventoryAlertable: false,
    watchAlertable: false,
    customerSummary: 'Retained exact-premise retailer stock evidence for research replay. No customer alerts.',
  }]));
}

function recordFor(bible, product) {
  const record = bible?.records?.find(item => item.id === product.canonicalBottleId && item.canonical === product.canonicalName);
  if (!record) return null;
  const identity = (record.libraryIdentities || []).find(item => item.canonicalName === product.canonicalName);
  if (!identity) return null;
  const stateTier = identity.stateOverrides?.find(item => item.jurisdiction === product.state)?.tier;
  const tier = stateTier || identity.nationalTier || record.tier;
  return tier === 'limited' ? { record, tier } : null;
}

export function parsePlainsRetailResearchCapture(capture, source, bible, { now = Date.now() } = {}) {
  const premise = source?.premise;
  let captureHost = null;
  let captureUrl;
  try { captureUrl = new URL(capture?.source); captureHost = captureUrl.hostname; } catch {}
  if (sourceConfigs.get(source?.id) !== source || capture?.state !== source.id
    || capture?.researchOnly !== true || capture?.pickupEnabled !== true
    || !premise || captureUrl?.protocol !== 'https:' || captureHost !== new URL(source.sources[0].url).hostname
    || !capture?.store || String(capture.store.id) !== premise.storeId
    || capture.store.name !== premise.name || capture.store.address !== premise.address
    || capture.store.city !== premise.city || capture.store.state !== premise.state
    || capture.store.zip !== premise.zip) return [];

  const allowedStoreId = String(capture.store.id);
  const allowedHost = new URL(source.sources[0].url).hostname;
  const signals = [];
  const seen = new Set();
  for (const product of capture.products || []) {
    const expression = reviewedProducts.get(String(product?.upc || ''));
    if (!expression || expression.state !== source.id || seen.has(String(product.upc)) || !expression.title.test(String(product.title || ''))
      || product.canonicalName !== expression.canonicalName
      || product.canonicalBottleId !== expression.canonicalBottleId
      || product.tier !== 'limited'
      || String(product.storeId) !== allowedStoreId
      || Number(product.sizeMl) !== 750
      || !Number.isInteger(product.available) || product.available <= 0
      || Number(product.reserved) !== 0 || product.backorderEnabled !== false
      || !Number.isFinite(Number(product.priceCents)) || Number(product.priceCents) <= 0) continue;
    const identity = recordFor(bible, { ...product, state: source.id });
    const observedMs = Date.parse(product.observedAt || '');
    if (!identity || !Number.isFinite(observedMs)) continue;
    const stale = !Number.isFinite(now) || now - observedMs > FRESHNESS_MS || observedMs - now > 5 * 60_000;
    const productId = String(product.publicId || product.upc);
    seen.add(String(product.upc));
    signals.push({
      id: `research:${source.id.toLowerCase()}:${allowedStoreId}:${productId}`,
      state: source.id,
      sourceLabel: source.label,
      sourceUrl: source.id === 'MT' ? `https://montanaliquor.com/products/undammed-thief-creek-straight-bourbon-750ml` : source.sources[0].url,
      sourceChain: `research:${source.id.toLowerCase()}:retained-retailer-capture`,
      storeId: `${source.id.toLowerCase()}:${allowedStoreId}`,
      storeName: capture.store.name,
      storeAddress: `${capture.store.address}, ${capture.store.city}, ${capture.store.state} ${capture.store.zip}`,
      city: capture.store.city,
      zip: capture.store.zip,
      productId,
      rawName: product.title,
      canonicalBottleId: identity.record.id,
      canonicalName: identity.record.canonical,
      tier: identity.tier,
      eventType: 'retailer_store_inventory_result',
      locationPrecision: 'store_level',
      quantity: product.available,
      quantityIsExact: true,
      price: Number(product.priceCents) / 100,
      observedAt: product.observedAt,
      fetchedAt: product.observedAt,
      availabilityStatus: 'in_stock',
      availabilityLabel: `Retailer reported ${product.available} available for pickup`,
      inventorySemantics: 'exact_retailer_quantity',
      stale,
      sourceStale: stale,
      researchOnly: true,
      canAlertAsInventory: false,
      canAlertAsWatch: false,
      eligibleForDelivery: false,
      eligibleForOnSite: false,
      sourceProductBinding: { host: allowedHost, storeId: allowedStoreId, upc: product.upc, sizeMl: 750, pickupVerified: true, observedAt: product.observedAt, shadowOnly: true },
      raw: { title: product.title, upc: product.upc, available: product.available, reserved: product.reserved, backorderEnabled: false, shadowOnly: true },
    });
  }
  return signals;
}

export async function collectPlainsRetailResearchReport(config, bible, { env = process.env, now = Date.now(), capturePath = CAPTURE_PATH } = {}) {
  if (env.BOURBON_SIGNAL_SHADOW_MODE !== '1' || sourceConfigs.get(config?.id) !== config) {
    throw new Error('Plains retailer replay requires its registered isolated shadow source.');
  }
  const bytes = await readFile(capturePath);
  if (createHash('sha256').update(bytes).digest('hex') !== CAPTURE_SHA256) throw new Error('Retained retailer capture digest mismatch.');
  const fixture = JSON.parse(bytes.toString('utf8'));
  if (fixture.schemaVersion !== 1 || fixture.researchOnly !== true || fixture.productionMutation !== false) {
    throw new Error('Retained retailer capture is not research-only.');
  }
  const capture = fixture.captures[config.id];
  const signals = parsePlainsRetailResearchCapture({ ...capture, state: config.id, researchOnly: true }, config, bible, { now });
  const startedAt = new Date(now).toISOString();
  const sourceId = `research:${config.id.toLowerCase()}:retained-retailer-capture`;
  const lastGoodAt = signals.reduce((max, row) => row.observedAt > max ? row.observedAt : max, null);
  const source = { sourceRuntimeId: sourceId, label: config.label, url: config.sources[0].url, ok: true, status: 200, lastGoodAt,
    signalType: 'retailer_store_inventory_result', matchedBottleCount: signals.length, inventoryAlertable: false, watchAlertable: false };
  return {
    state: config.id, label: config.label, tier: config.tier, strategy: config.strategy, cadence: config.cadence,
    startedAt, finishedAt: startedAt, lastGoodAt,
    status: signals.length ? 'partial_useful' : 'no_trusted_inventory', stale: signals.length > 0 && signals.every(row => row.stale),
    signals: signals.map(row => ({ ...row, sourceRuntimeId: sourceId })), sources: [source],
    sourceResults: [{ sourceId, sourceLabel: config.label, sourceUrl: config.sources[0].url, ok: true, status: 'success', checkedAt: startedAt, lastGoodAt: source.lastGoodAt || null, alertable: false, inventoryAlertable: false, watchAlertable: false }],
    roadblocks: [],
    metadata: { shadowOnly: true, productionActivationAllowed: false, customerDeliveryAllowed: false,
      captureSha256: CAPTURE_SHA256, sourceObservations: signals.map(row => row.observedAt), origin: { kind: 'retained_capture_replay' } },
  };
}
