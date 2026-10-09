import { fetchWithMeta } from '../core/fetcher.mjs';
import { collectionRequestSignal } from '../core/collection-context.mjs';
import { MalformedSourceError, sourceErrorForHttp, TransientSourceError } from '../sources/source-error.mjs';
import { verifyCaliforniaFulfillmentPolicy, parseCaliforniaShopifyProducts } from './california-san-diego-surfaces.mjs';
import { cityHiveSafeBottleMatch } from './safe-bottle-match.mjs';
import { stableId } from '../core/text.mjs';
import { setTimeout as sleep } from 'node:timers/promises';
const CA_SAN_DIEGO_SHOPIFY_SOURCE_DELAY_MS=750;
const textFetch=(url,options)=>fetchWithMeta(url,{...options,maxBytes:4*1024*1024,signal:collectionRequestSignal(options.signal)});
async function fetchCaliforniaShopifySource(source, signal) {
  const products = [];
  for (let page = 1; page <= source.maxPages; page++) {
    const separator = source.productsUrl.includes('?') ? '&' : '?';
    const url = `${source.productsUrl}${separator}page=${page}`;
    const res = await textFetch(url, { headers: { accept: 'application/json,*/*' }, timeoutMs: 30_000, signal });
    if (!res.ok) return { ...res, url };
    let payload;
    try { payload = JSON.parse(res.text); } catch (error) {
      throw new MalformedSourceError(`${source.sourceLabel} returned malformed Shopify JSON`, { cause: error, status: res.status || 0 });
    }
    if (!Array.isArray(payload?.products)) throw new MalformedSourceError(`${source.sourceLabel} Shopify response did not contain a products array`, { status: res.status || 0 });
    products.push(...payload.products);
    if (payload.products.length < 250) break;
    await sleep(CA_SAN_DIEGO_SHOPIFY_SOURCE_DELAY_MS);
  }
  return { ok: true, status: 200, text: JSON.stringify({ products }), error: null, url: source.productsUrl };
}

function failedCaliforniaResponse(result, label) {
  const message = result?.error || `HTTP ${result?.status || 0}`;
  if (!result || Number(result.status || 0) === 0) return new TransientSourceError(`${label}: ${message}`, { status: result?.status ?? 0 });
  const error=sourceErrorForHttp(result.status, `${label}: ${message}`);
  error.details={...error.details,retryAfterSeconds:result.retryAfterSeconds};return error;
}

export async function collectCaliforniaSource(config, bible, source, observedAt, signal) {
  let fulfillmentPolicyVerified = false;
  if (source.inventoryEligible) {
    const policyRes = await textFetch(source.fulfillmentPolicyUrl, { headers: { accept: 'text/html,*/*' }, timeoutMs: 30_000, signal });
    if (!policyRes.ok) throw failedCaliforniaResponse(policyRes, `${source.sourceLabel} fulfillment policy`);
    fulfillmentPolicyVerified = verifyCaliforniaFulfillmentPolicy(source, policyRes.text);
    if (!fulfillmentPolicyVerified) {
      throw new MalformedSourceError(`${source.sourceLabel} first-party page no longer proves in-store pickup/collection for online orders`, {
        status: policyRes.status,
        details: { fulfillmentPolicyUrl: source.fulfillmentPolicyUrl },
      });
    }
  }
  const res = await fetchCaliforniaShopifySource(source, signal);
  if (!res.ok) throw failedCaliforniaResponse(res, `${source.sourceLabel} product feed`);
  const payload = JSON.parse(res.text);
  const sourceSignals = [];
  const sourceRoadblocks = [];
  const parsedRows = parseCaliforniaShopifyProducts(payload);
  for (const row of parsedRows) {
      const { match, record, unsafeReason } = cityHiveSafeBottleMatch(row.title, bible);
      if (!record) continue;
      const eventType = source.inventoryEligible ? 'retailer_store_inventory_result' : 'retailer_catalog_availability';
      const productUrl = row.handle ? `https://${source.host}/products/${encodeURIComponent(row.handle)}` : source.productsUrl;
      sourceSignals.push({
        id: stableId([config.id, 'san-diego-shopify', source.id, row.productId, row.variantId]),
        state: config.id,
        stateCode: 'CA',
        sourceLabel: source.sourceLabel,
        sourceUrl: productUrl,
        sourceChain: source.id,
        sourceRuntimeId: `ca:${source.id}`,
        merchantId: source.merchantId,
        productId: row.productId,
        variantId: row.variantId,
        rawName: row.title,
        canonicalBottleId: record.id,
        canonicalName: record.canonical,
        tier: record.tier,
        confidence: Math.max(source.inventoryEligible ? 0.82 : 0.7, Math.min(0.92, match?.confidence || 0.7)),
        eventType,
        locationPrecision: source.inventoryEligible ? 'store_level' : 'store_aggregate',
        locationName: source.store.name,
        storeName: source.store.name,
        storeId: source.store.id,
        storeAddress: source.store.address,
        city: source.store.city,
        stateCode: source.store.stateCode,
        postalCode: source.store.zip,
        zip: source.store.zip,
        quantity: 0,
        price: row.price,
        availabilityStatus: source.inventoryEligible ? 'in_stock' : 'retailer_online_available',
        availabilityLabel: source.inventoryEligible ? 'Available for retailer pickup/order' : 'Available online; local pickup not verified',
        sourceAvailabilityVerified: true,
        observedAt,
        canAlertAsInventory: source.inventoryEligible,
        canAlertAsWatch: true,
        inventorySemantics: row.inventorySemantics,
        evidence: source.inventoryEligible
          ? `${source.chainName} marks ${row.title} available on its first-party storefront and its separately fetched first-party policy publishes pickup/order fulfillment for the named San Diego premises. Exact quantity is not published.`
          : `${source.chainName} marks ${row.title} available online. Exact San Diego pickup availability is not established, so this remains watch-only.`,
        caveat: source.inventoryEligible
          ? 'Binary first-party retailer availability, not an exact shelf count. Verify pickup availability before driving.'
          : 'Online catalog availability only; local pickup is not verified.',
        raw: {
          chain: source.id,
          merchantId: source.merchantId,
          product: { id: row.productId, handle: row.handle, type: row.productType, tags: row.tags },
          variant: { id: row.variantId, sku: row.sku, size: row.size, available: true, price: row.price },
          fulfillmentPolicyUrl: source.fulfillmentPolicyUrl,
          fulfillmentPolicyVerified,
          matchGuard: unsafeReason,
        },
      });
  }
  if (!sourceSignals.length) {
    sourceRoadblocks.push({
      state: config.id,
      source: source.sourceLabel,
      sourceRuntimeId: `ca:${source.id}`,
      url: source.productsUrl,
      status: 'reachable_no_safe_inventory_rows',
      error: `Shopify returned ${payload.products.length} products but no safely matched available bourbon rows survived source, size, format, and bottle guards.`,
      nextRoute: 'Inspect product titles and variant availability without weakening bottle, format, or premises guards.',
    });
  }
  return { signals: sourceSignals, roadblocks: sourceRoadblocks };
}
