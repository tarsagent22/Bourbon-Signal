const BUFFALO_SOURCE_IDS = new Set(['five-star-wine-spirits-buffalo', 'bailey-discount-liquor-wine']);
const DEFAULT_METRO_REFRESH_CADENCE_MS = 4 * 60 * 60_000;

export const BUFFALO_CITYHIVE_DISCOVERY_BUDGETS = Object.freeze({
  maxRequests: 10,
  maxElapsedMs: 25_000,
  maxBodyBytes: 1_024 * 1_024,
  maxTotalBytes: 6 * 1_024 * 1_024,
  maxProducts: 300,
  requestTimeoutMs: 10_000,
  delayMs: 250,
});

export const BUFFALO_CITYHIVE_SEARCH_TERMS = Object.freeze([
  'weller', 'van winkle', 'single barrel', 'barrel proof', 'bottled in bond', 'limited edition', 'rare',
]);

function positiveFinite(value, fallback, label) {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`Buffalo CityHive ${label} must be positive and finite.`);
  return parsed;
}

function normalizedBudgets(overrides = {}) {
  return {
    maxRequests: Math.floor(positiveFinite(overrides.maxRequests, BUFFALO_CITYHIVE_DISCOVERY_BUDGETS.maxRequests, 'request budget')),
    maxElapsedMs: positiveFinite(overrides.maxElapsedMs, BUFFALO_CITYHIVE_DISCOVERY_BUDGETS.maxElapsedMs, 'elapsed budget'),
    maxBodyBytes: Math.floor(positiveFinite(overrides.maxBodyBytes, BUFFALO_CITYHIVE_DISCOVERY_BUDGETS.maxBodyBytes, 'body budget')),
    maxTotalBytes: Math.floor(positiveFinite(overrides.maxTotalBytes, BUFFALO_CITYHIVE_DISCOVERY_BUDGETS.maxTotalBytes, 'total body budget')),
    maxProducts: Math.floor(positiveFinite(overrides.maxProducts, BUFFALO_CITYHIVE_DISCOVERY_BUDGETS.maxProducts, 'product budget')),
    requestTimeoutMs: positiveFinite(overrides.requestTimeoutMs, BUFFALO_CITYHIVE_DISCOVERY_BUDGETS.requestTimeoutMs, 'request timeout'),
    delayMs: Number.isFinite(Number(overrides.delayMs)) && Number(overrides.delayMs) >= 0 ? Number(overrides.delayMs) : BUFFALO_CITYHIVE_DISCOVERY_BUDGETS.delayMs,
  };
}

function isReviewedSource(source) {
  return source?.platform === 'cityhive'
    && source?.area === 'Buffalo'
    && BUFFALO_SOURCE_IDS.has(String(source?.id || ''))
    && source?.depthDiscovery
    && Array.isArray(source?.stores)
    && source.stores.length === 1
    && Boolean(source.stores[0]?.merchantId);
}

function exactMerchantUrl(source, params) {
  const url = new URL('/shop/', source.baseUrl);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  url.searchParams.set('merchant-id', source.stores[0].merchantId);
  return url.href;
}

function discoveryPages(source, searchTerms) {
  const pages = [
    { kind: 'bourbon_category', required: true, url: exactMerchantUrl(source, { subtype: 'Bourbon' }) },
    ...(Number(source.depthDiscovery.maxCategoryPages) >= 2 ? [{ kind: 'bourbon_category_page', page: 2, required: false, url: exactMerchantUrl(source, { subtype: 'Bourbon', page: '2' }) }] : []),
    ...(source.depthDiscovery.includeWhiskey ? [{ kind: 'whiskey_category', required: false, url: exactMerchantUrl(source, { subtype: 'whiskey' }) }] : []),
    ...searchTerms.map((term) => ({ kind: 'family_search', term, required: false, url: exactMerchantUrl(source, { 'ch-query': term }) })),
  ];
  return [...new Map(pages.map((page) => [page.url, page])).values()];
}

function rowKey(row) { return `${row.merchantId}:${row.productId}:${row.variantId}`; }

function discoveryRoute(page) { return page.term ? `${page.kind}:${page.term}` : page.kind; }

function hasReviewedMerchantIdentity(html, source) {
  const merchantId = source.stores[0].merchantId;
  const escaped = merchantId.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  return typeof html === 'string' && new RegExp(`data-ch-merchant-id=["']${escaped}["']`, 'u').test(html);
}

export function selectMetroSourcesForRefresh(sources, cachedSignals, { nowMs = Date.now(), forceLive = false, fallbackCadenceMs = DEFAULT_METRO_REFRESH_CADENCE_MS } = {}) {
  if (forceLive) return [...sources];
  return [...sources].filter((source) => {
    const observed = (cachedSignals || [])
      .filter((signal) => signal?.sourceChain === source.id)
      .map((signal) => Date.parse(String(signal.observedAt || '')))
      .filter(Number.isFinite);
    if (!observed.length) return true;
    const configuredCadenceMs = Number(source.depthDiscovery?.refreshCadenceMs);
    const cadenceMs = Number.isFinite(configuredCadenceMs) && configuredCadenceMs > 0
      ? configuredCadenceMs
      : fallbackCadenceMs;
    const latest = Math.max(...observed);
    return latest > nowMs || nowMs - latest >= cadenceMs;
  });
}

export async function collectBuffaloCityHiveRows(source, {
  fetchText,
  parseHtml,
  signal,
  sleepFn = async () => {},
  now = Date.now,
  budgets: budgetOverrides,
  searchTerms = source?.depthDiscovery?.queryTerms || BUFFALO_CITYHIVE_SEARCH_TERMS,
} = {}) {
  if (!isReviewedSource(source)) throw new Error('Buffalo CityHive discovery requires one exact reviewed Buffalo source and merchant.');
  if (typeof fetchText !== 'function' || typeof parseHtml !== 'function') throw new Error('Buffalo CityHive discovery requires fetch and parser functions.');
  const budgets = normalizedBudgets({ ...source.depthDiscovery, ...budgetOverrides });
  const startedAt = now();
  const rows = [];
  const seenRows = new Set();
  const categoryFingerprints = new Set();
  const successfulDiscoveryRoutes = new Set();
  const unavailableVariantKeys = new Set();
  const attempts = [];
  const optionalFailures = [];
  let requestCount = 0;
  let totalBytes = 0;
  let candidateRows = 0;
  let stoppedReason = null;

  const terms = [...new Set(searchTerms.map((term) => String(term || '').trim()).filter(Boolean))];
  for (const page of discoveryPages(source, terms)) {
    signal?.throwIfAborted?.();
    if (requestCount >= budgets.maxRequests) { stoppedReason = 'request_budget'; break; }
    if (now() - startedAt >= budgets.maxElapsedMs) { stoppedReason = 'elapsed_budget'; break; }
    let response;
    try {
      requestCount += 1;
      response = await fetchText(page.url, { headers: { accept: 'text/html,*/*' }, timeoutMs: Math.min(budgets.requestTimeoutMs, Math.max(1_000, budgets.maxElapsedMs - (now() - startedAt))), maxBytes: budgets.maxBodyBytes, signal });
      if (!response?.ok) throw new Error(response?.error || `HTTP ${response?.status || 0}`);
      const effectiveUrl = new URL(response.url || page.url);
      if (effectiveUrl.protocol !== 'https:' || effectiveUrl.hostname !== source.host || !/^\/shop\/?$/u.test(effectiveUrl.pathname)) throw new Error('response left the reviewed first-party shop URL');
      const bytes = Buffer.byteLength(String(response.text || ''), 'utf8');
      if (bytes > budgets.maxBodyBytes) throw new Error(`response exceeded the ${budgets.maxBodyBytes} byte body budget`);
      if (totalBytes + bytes > budgets.maxTotalBytes) { stoppedReason = 'total_body_budget'; break; }
      totalBytes += bytes;
      if (!hasReviewedMerchantIdentity(response.text, source)) throw new Error('response did not preserve the reviewed CityHive merchant identity');
      const parsed = parseHtml(response.text, source);
      if (!Array.isArray(parsed)) throw new Error('parser returned a malformed response');
      const route = discoveryRoute(page);
      successfulDiscoveryRoutes.add(route);
      for (const key of parsed.unavailableVariantKeys || []) unavailableVariantKeys.add(key);
      candidateRows += parsed.length;
      const fingerprint = [...new Set(parsed.map(rowKey))].sort().join('|');
      if (page.kind === 'bourbon_category_page' && (!parsed.length || categoryFingerprints.has(fingerprint))) {
        stoppedReason = parsed.length ? 'repeated_category_page' : 'empty_category_page';
        attempts.push({ kind: page.kind, page: page.page, url: page.url, status: response.status || 200, bytes, candidateRows: parsed.length, newRows: 0, outcome: parsed.length ? 'repeated_page' : 'healthy_empty_page' });
        await sleepFn(budgets.delayMs, signal);
        continue;
      }
      if (page.kind === 'bourbon_category') categoryFingerprints.add(fingerprint);
      let newRows = 0;
      for (const row of parsed) {
        const key = rowKey(row);
        if (seenRows.has(key)) continue;
        seenRows.add(key);
        rows.push({ ...row, discoveryRoute: route });
        newRows += 1;
        if (rows.length >= budgets.maxProducts) break;
      }
      attempts.push({ kind: page.kind, term: page.term || null, url: page.url, status: response.status || 200, bytes, candidateRows: parsed.length, newRows, outcome: parsed.length ? 'success' : 'healthy_zero' });
      if (rows.length >= budgets.maxProducts) { stoppedReason = 'product_budget'; break; }
    } catch (error) {
      if (signal?.aborted) throw error;
      const failure = { kind: page.kind, term: page.term || null, url: page.url, status: response?.status || 0, error: error instanceof Error ? error.message : String(error) };
      attempts.push(failure);
      if (page.required) throw new Error(`${source.sourceLabel} required Buffalo bourbon page failed: ${failure.error}`);
      optionalFailures.push(failure);
    }
    if (now() - startedAt >= budgets.maxElapsedMs) { stoppedReason = 'elapsed_budget'; break; }
    await sleepFn(budgets.delayMs, signal);
  }

  const completeSnapshot = optionalFailures.length === 0 && !['request_budget', 'elapsed_budget', 'total_body_budget', 'product_budget'].includes(stoppedReason);
  return {
    rows,
    fulfillmentPolicyVerified: true,
    metadata: {
      discoveryMode: 'buffalo_bounded_cityhive_categories_and_public_search', requestCount,
      elapsedMs: Math.max(0, now() - startedAt), totalBytes, candidateRows, uniqueRows: rows.length,
      completeSnapshot, stoppedReason, optionalFailures, attempts, budgets,
      successfulDiscoveryRoutes: [...successfulDiscoveryRoutes].sort(),
      unavailableVariantKeys: [...unavailableVariantKeys].sort(),
    },
  };
}
