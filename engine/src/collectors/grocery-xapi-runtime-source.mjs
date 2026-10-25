import { fetchWithMeta } from '../core/fetcher.mjs';
import { collectionRequestSignal } from '../core/collection-context.mjs';
import { stableId } from '../core/text.mjs';
import { MalformedSourceError, TransientSourceError, SourceTimeoutError, sourceErrorForHttp } from '../sources/source-error.mjs';
import { collectGroceryXapiSources, validGroceryXapiSource } from './grocery-xapi.mjs';

// Adapter for the existing Nevada registry. This does not register any source.
export function groceryXapiSourceFromNevada(source) {
  if (source?.platform !== 'albertsons-xapi' || source.store?.stateCode !== 'NV') return null;
  return { ...source, state: 'NV', premise: {
    state: 'NV', storeId: source.store.id, name: source.store.name,
    address: source.store.address, city: source.store.city, zip: source.store.zip,
  } };
}

export function serializeGroceryXapiCandidate(candidate, source) {
  const { premise } = source;
  const legacyNevada = source.platform === 'albertsons-xapi' && source.state === 'NV';
  const chain = source.sourceChain || source.id || `${source.banner}:${source.merchantId}`;
  const record = candidate.record;
  return {
    id: stableId(legacyNevada
      ? ['NV', 'nevada-retailer', chain, candidate.productId, candidate.variantId]
      : [source.state, 'grocery-xapi', premise.storeId, candidate.productId, candidate.variantId]),
    state: source.state, stateCode: source.state,
    sourceLabel: source.sourceLabel || `${source.banner} ${source.state} XAPI store inventory`,
    sourceUrl: candidate.sourceUrl, sourceChain: chain,
    ...(source.runtimeId ? { sourceRuntimeId: source.runtimeId } : {}),
    merchantId: source.merchantId, productId: candidate.productId, variantId: candidate.variantId,
    rawName: candidate.title, canonicalBottleId: record.id, canonicalName: record.canonical, tier: record.tier,
    confidence: legacyNevada ? 0.82 : 0.86, eventType: 'retailer_store_inventory_result', locationPrecision: 'store_level',
    locationName: `${premise.name} — ${premise.address}`, storeName: premise.name,
    storeId: premise.storeId, storeAddress: premise.address, address: premise.address,
    city: premise.city, postalCode: premise.zip, zip: premise.zip,
    quantity: candidate.quantity, quantityIsExact: candidate.inventorySemantics === 'exact_retailer_quantity',
    price: candidate.price, availabilityStatus: 'in_stock',
    availabilityLabel: candidate.quantity > 0 ? `${candidate.quantity} reported available` : 'Retailer reports in-store availability',
    sourceAvailabilityVerified: true, observedAt: candidate.observedAt,
    canAlertAsInventory: true, canAlertAsWatch: true, inventorySemantics: candidate.inventorySemantics,
    evidence: `${premise.name} reports ${candidate.title} available for the configured in-store channel at ${premise.address}.`,
    caveat: 'Retailer-reported availability may change. Verify before driving.',
    raw: { chain, platform: 'grocery-xapi', merchantId: source.merchantId,
      product: { id: candidate.productId, pid: candidate.product.pid, upc: candidate.product.upc },
      variant: { id: candidate.variantId, size: candidate.size, available: true, price: candidate.price },
      reportedQuantity: candidate.reportedQuantity ?? null,
      fulfillmentPolicyUrl: source.fulfillmentPolicyUrl || null, fulfillmentPolicyVerified: true,
      matchMethod: candidate.matchMethod, volumeMl: candidate.volumeMl, packageCount: 1 },
  };
}

// One request, no retry, bounded body/timeout, typed failure. Admission and current
// bottle policy are supplied by the owning registry; neither is inferred here.
export async function collectGroceryXapiSource(bible, source, {
  policies, signal, fetchText = fetchWithMeta, clock = Date.now, subscriptionKey,
} = {}) {
  if (!validGroceryXapiSource(source)) throw new TypeError('Invalid grocery XAPI source');
  const requestSignal = collectionRequestSignal(signal);
  requestSignal?.throwIfAborted();
  let requestCount = 0, bytes = 0, elapsedMs = 0, originalError, response;
  const measuredFetch = async (url, options) => {
    requestSignal?.throwIfAborted();
    requestCount++;
    try {
      response = await fetchText(url, { ...options, signal: requestSignal, maxRedirects: 0,
        reviewedSeedUrls: [url], headers: { accept: 'application/json',
          ...(subscriptionKey ? { 'ocp-apim-subscription-key': subscriptionKey } : {}) } });
      requestSignal?.throwIfAborted();
      bytes += Buffer.byteLength(response.text || '');
      elapsedMs += Math.max(0, Number(response.elapsedMs) || 0);
      if (!response.ok && response.error) {
        if (/timeout|timed out|aborted/i.test(response.error)) throw new SourceTimeoutError(source.id, 12_000);
        if (/exceed|too large|body.*limit/i.test(response.error)) throw new MalformedSourceError('Grocery XAPI body exceeded reviewed limit');
        if (!response.status || response.status === 200) throw new TransientSourceError('Grocery XAPI response could not be acquired completely');
      }
      if (bytes > 2_097_152) throw new MalformedSourceError('Grocery XAPI body exceeded reviewed limit');
      if (response.ok && response.status === 200) {
        let payload;
        try { payload = JSON.parse(response.text); } catch {
          throw new MalformedSourceError('Grocery XAPI returned malformed JSON', { status: 200 });
        }
        if (!Array.isArray(payload?.response?.docs)) throw new MalformedSourceError('Grocery XAPI missing response.docs', { status: 200 });
      }
      return response;
    } catch (error) {
      error.details = { ...(error.details || {}), requestCount, bytes, elapsedMs };
      originalError = error; throw error;
    }
  };
  const result = await collectGroceryXapiSources({ sources: [source], bible, policies,
    fetchText: measuredFetch, pace: async () => {}, clock, signal: requestSignal,
    serialize: serializeGroceryXapiCandidate });
  requestSignal?.throwIfAborted();
  if (originalError) throw originalError;
  if (!response?.ok || response.status !== 200) {
    const error = response?.status
      ? sourceErrorForHttp(response.status, 'Grocery XAPI request failed')
      : new TransientSourceError('Grocery XAPI transport failed');
    error.details = { ...(error.details || {}), retryAfterSeconds: response?.retryAfterSeconds || 0,
      requestCount, bytes, elapsedMs };
    throw error;
  }
  return { signals: result.signals, roadblocks: [],
    metadata: { completeSnapshot: false, scope: 'one_store_bourbon_search_first_page',
      absenceIsOutOfStock: false },
    accounting: { requestCount, bytes, elapsedMs, completeSnapshot: false } };
}
