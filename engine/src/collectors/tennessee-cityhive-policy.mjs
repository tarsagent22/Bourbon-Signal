import { normalizeCityHivePremises } from './cityhive-surfaces.mjs';
import { cityHiveSafeBottleMatch } from './safe-bottle-match.mjs';

const CITYHIVE_DETAIL_PATH = /^\/shop\/product\/[a-z0-9-]+\/([a-f0-9]{24})$/i;
const ALERT_TIERS = { unicorn: 3, allocated: 2, limited: 1 };

export function tennesseeCityHiveDetailBottleMatch(name, bible) {
  const result = cityHiveSafeBottleMatch(name, bible);
  // A legacy Bible alias conflates the two Smoke Wagon releases.
  if (!ALERT_TIERS[result.record?.tier] || result.record.libraryAlertEligible === false
    || result.match.method === 'alias-containment'
    || /\bsmoke wagon uncut the younger\b/i.test(String(name))) return { ...result, record: null };
  return result;
}

function detailIdentity(value, hostname) {
  if (!URL.canParse(value)) return null;
  const url = new URL(value);
  const path = url.pathname.match(CITYHIVE_DETAIL_PATH);
  const optionId = url.searchParams.get('option-id');
  if (!path || url.origin !== `https://${hostname}` || url.username || url.password || url.hash
    || !/^[a-f0-9]{64}$/i.test(optionId || '') || [...url.searchParams].length !== 1) return null;
  return { productId: path[1], optionId };
}

export function tennesseeCityHiveDetailUrls(paths, store) {
  const origin = `https://${store.hostname}`;
  return [...new Set(paths.map((path) => `${origin}${path}`))]
    .filter((href) => detailIdentity(href, store.hostname)).slice(0, 10);
}

export function tennesseeCityHiveDetailProducts(blobs, href, store) {
  const identity = detailIdentity(href, store.hostname);
  if (!identity) return [];
  const premises = normalizeCityHivePremises(store.address);
  const products = [];
  for (const product of blobs) {
    if (product?.id !== identity.productId || typeof product.name !== 'string' || !Array.isArray(product.merchants)) continue;
    for (const merchant of product.merchants) {
      if (merchant?.merchant_id !== store.merchantId || normalizeCityHivePremises(merchant.full_address) !== premises
        || !Array.isArray(merchant.offer_types) || !merchant.offer_types.includes('pick_up')
        || !Array.isArray(merchant.product_options)) continue;
      const options = merchant.product_options.filter((option) => option?.merchant_id === store.merchantId
        && option.product_id === identity.productId && option.option_id === identity.optionId
        && option.product_url === href && normalizeCityHivePremises(option.full_address) === premises
        && /^\d+$/.test(String(option.quantity)) && Number.isSafeInteger(Number(option.quantity)));
      if (options.length) products.push({ ...product, merchants: [{ ...merchant, product_options: options }] });
    }
  }
  return products.length === 1 && products[0].merchants[0].product_options.length === 1 ? products : [];
}

function timestamp(value) {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : null;
}

export function tennesseeCityHiveSignalSourceId(signal) {
  return String(signal?.sourceChain || signal?.raw?.chain || '').trim();
}

export function hasReviewedTennesseeCityHivePayload(registeredMerchantIds = [], payloadMerchantIds = [], hasProductPayload = false) {
  if (!hasProductPayload) return false;
  const reviewed = new Set([...registeredMerchantIds].map((value) => String(value || '').trim()).filter(Boolean));
  return [...payloadMerchantIds].some((value) => reviewed.has(String(value || '').trim()));
}

function evidenceTimestamp(signal) {
  return timestamp(signal?.lastConfirmedAt || signal?.observedAt || signal?.fetchedAt);
}

export function tennesseeCityHiveSourceRefreshAt(cache = {}) {
  const result = new Map();
  for (const [sourceId, value] of Object.entries(cache?.sourceRefreshAt || {})) {
    const parsed = timestamp(value);
    if (sourceId && parsed != null) result.set(sourceId, parsed);
  }
  for (const signal of cache?.signals || []) {
    const sourceId = tennesseeCityHiveSignalSourceId(signal);
    const observedAt = evidenceTimestamp(signal);
    if (!sourceId || observedAt == null) continue;
    result.set(sourceId, Math.max(result.get(sourceId) || 0, observedAt));
  }
  return result;
}

export function tennesseeCityHiveSourceAttemptAt(cache = {}) {
  const result = new Map(tennesseeCityHiveSourceRefreshAt(cache));
  for (const [sourceId, value] of Object.entries(cache?.sourceAttemptAt || {})) {
    const parsed = timestamp(value);
    if (sourceId && parsed != null) result.set(sourceId, parsed);
  }
  return result;
}

export function selectTennesseeCityHiveSourceCohort(sources = [], {
  cache = {},
  cohortSize = 4,
  forceAll = false,
  requestedSourceIds = new Set(),
  knoxvilleSourceIds = [],
  knoxvilleSlots = 0,
  prioritySourceIds = [],
  prioritySlots = 0,
} = {}) {
  const requested = requestedSourceIds instanceof Set ? requestedSourceIds : new Set(requestedSourceIds || []);
  if (requested.size) return sources.filter((source) => requested.has(source.id));
  if (forceAll) return [...sources];
  const attemptAt = tennesseeCityHiveSourceAttemptAt(cache);
  const indexed = sources.map((source, index) => ({ source, index, attemptedAt: attemptAt.get(source.id) || 0 }));
  const oldestFirst = (left, right) => left.attemptedAt - right.attemptedAt || left.index - right.index;
  indexed.sort(oldestFirst);
  const size = Math.max(1, Math.min(sources.length, Number(cohortSize) || 1));
  const priorityIds = new Set((prioritySourceIds || []).map((value) => String(value || '')).filter(Boolean));
  const knoxvilleIds = new Set(knoxvilleSourceIds);
  const knoxville = indexed.filter(({ source }) => knoxvilleIds.has(source.id))
    .slice(0, Math.max(0, Math.min(size, knoxvilleSlots)));
  const selectedIds = new Set(knoxville.map(({ source }) => source.id));
  const rare = indexed.filter(({ source }) => priorityIds.has(source.id) && !selectedIds.has(source.id))
    .slice(0, Math.max(0, Math.min(size - knoxville.length, prioritySlots)));
  for (const { source } of rare) selectedIds.add(source.id);
  const other = indexed.filter(({ source }) => !selectedIds.has(source.id) && !priorityIds.has(source.id) && !knoxvilleIds.has(source.id));
  const otherPriority = indexed.filter(({ source }) => !selectedIds.has(source.id) && (priorityIds.has(source.id) || knoxvilleIds.has(source.id)));
  return [...knoxville, ...rare, ...other, ...otherPriority].slice(0, size).map(({ source }) => source);
}

export function mergeTennesseeCityHiveCacheSignals({
  liveSignals = [],
  cachedSignals = [],
  selectedSourceIds = new Set(),
  failedSourceIds = new Set(),
  unavailableIds = new Set(),
  observedAt = new Date().toISOString(),
  maxAgeMs,
  validate = () => true,
} = {}) {
  const nowMs = timestamp(observedAt);
  const ageLimit = Math.max(0, Number(maxAgeMs) || 0);
  const selected = selectedSourceIds instanceof Set ? selectedSourceIds : new Set(selectedSourceIds || []);
  const failed = failedSourceIds instanceof Set ? failedSourceIds : new Set(failedSourceIds || []);
  const retained = (cachedSignals || []).filter((signal) => {
    if (unavailableIds.has(signal?.id) || !validate(signal)) return false;
    const sourceId = tennesseeCityHiveSignalSourceId(signal);
    const observedMs = evidenceTimestamp(signal);
    if (!sourceId || nowMs == null || observedMs == null || observedMs > nowMs + 5 * 60_000 || nowMs - observedMs > ageLimit) return false;
    return !selected.has(sourceId) || failed.has(sourceId);
  });
  const rows = [...retained, ...(liveSignals || []).filter(validate)];
  const deduped = new Map();
  for (const signal of rows) {
    const key = String(signal?.id || [
      tennesseeCityHiveSignalSourceId(signal),
      signal?.merchantId || signal?.raw?.merchantId,
      signal?.productId,
      signal?.variantId,
      signal?.storeId,
    ].join('|'));
    const previous = deduped.get(key);
    const previousTime = evidenceTimestamp(previous) || 0;
    const nextTime = evidenceTimestamp(signal) || 0;
    if (!previous || nextTime >= previousTime) deduped.set(key, signal);
  }
  return [...deduped.values()];
}

export function updateTennesseeCityHiveSourceRefreshAt(cache = {}, completedSourceIds = new Set(), observedAt = new Date().toISOString()) {
  const result = Object.fromEntries([...tennesseeCityHiveSourceRefreshAt(cache)].map(([sourceId, value]) => [sourceId, new Date(value).toISOString()]));
  for (const sourceId of completedSourceIds || []) result[sourceId] = observedAt;
  return result;
}

export function updateTennesseeCityHiveSourceAttemptAt(cache = {}, attemptedSourceIds = new Set(), observedAt = new Date().toISOString()) {
  const result = Object.fromEntries([...tennesseeCityHiveSourceAttemptAt(cache)].map(([sourceId, value]) => [sourceId, new Date(value).toISOString()]));
  for (const sourceId of attemptedSourceIds || []) result[sourceId] = observedAt;
  return result;
}
