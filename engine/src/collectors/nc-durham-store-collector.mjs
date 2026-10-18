import { stableId } from '../core/text.mjs';
import { DURHAM_STORE_PRODUCTS, parseDurhamStoreInventory } from './nc-durham-store-surfaces.mjs';

export async function collectDurhamStoreInventory(config, bible, { fetchPage, now = () => new Date().toISOString() } = {}) {
  if (config?.id !== 'NC' || typeof fetchPage !== 'function') throw new Error('Durham requires the NC public collection transport.');
  const signals = [], sourceReports = [], roadblocks = [];
  for (const product of DURHAM_STORE_PRODUCTS) {
    const checkedAt = now();
    let status = 0, error = null, parsed = null, finalUrl = null;
    try {
      const response = await fetchPage(product.url);
      status = response.status || 0;
      finalUrl = response.url || null;
      if (!response.ok || response.url !== product.url) throw new Error('source_unavailable');
      parsed = parseDurhamStoreInventory(response.text, product.url);
      if (!parsed) throw new Error('source_identity_or_schema_unverified');
      const match = bible.match(parsed.productName);
      if (match?.confidence !== 1 || match.record?.id !== product.bibleId || !['limited', 'allocated', 'unicorn'].includes(match.record.tier)) throw new Error('bible_identity_unverified');
      for (const store of parsed.stores.filter(row => row.inStock && row.reportedQuantity > 0)) {
        signals.push({ id: stableId(['NC', 'durham-store-inventory', product.ncCode, store.storeNumber, match.record.id]),
          state: 'NC', sourceLabel: 'Durham ABC official store inventory', sourceUrl: product.url,
          rawName: parsed.productName, canonicalName: match.record.canonical, canonicalBottleId: match.record.id,
          confidence: 1, eventType: 'store_inventory_result', locationPrecision: 'store_level',
          storeId: store.storeId, storeName: store.storeName, storeAddress: store.storeAddress, storeUrl: store.storeUrl,
          city: store.city, county: null, lat: store.lat, lng: store.lng, ncCode: product.ncCode,
          price: parsed.price, quantity: store.reportedQuantity, reportedQuantity: store.reportedQuantity,
          quantityIsExact: false, sourceAvailabilityVerified: true, availabilityStatus: 'in_stock',
          availabilityLabel: 'Durham ABC reports stock at this store. Confirm before driving.',
          observedAt: checkedAt, fetchedAt: checkedAt, stale: false, sourceStale: false,
          canAlertAsInventory: true, canAlertAsWatch: false,
          inventorySemantics: 'Retailer-reported on-hand inventory; shelf availability and exact quantities are not guaranteed.',
          evidence: `The first-party product page binds PLU ${product.ncCode}, the reviewed 750 ml bottle and this individual store's published on-hand status, address and map coordinates.`,
          raw: { sourceProductUrl: product.url, sourceProductPlu: product.ncCode, sourceProductName: parsed.productName,
            sourceStoreNumber: store.storeNumber, sourceStoreAddress: store.storeAddress,
            sourceReportedQuantity: store.reportedQuantity, sourceReportedBoardTotal: parsed.reportedTotal,
            sourceCoordinates: 'first_party_published_directions', sourceMatchStatus: 'exact_bible_match',
            sourceCountyUnknown: true, snapshotCoherenceVerified: true },
        });
      }
    } catch (failure) {
      error = ['source_unavailable', 'source_identity_or_schema_unverified', 'bible_identity_unverified'].includes(failure.message)
        ? failure.message : 'public_source_request_failed';
      roadblocks.push({ state: 'NC', source: 'Durham ABC official store inventory', url: product.url, status,
        error, nextRoute: 'Review the current first-party product/store snapshot. Unavailable evidence is not out of stock; do not bypass access controls.' });
    }
    sourceReports.push({ url: product.url, finalUrl, ok: !error, status, checkedAt, error,
      capabilities: error ? [] : ['official_exact_store_inventory'],
      parserHealth: { status: error ? 'unverified' : 'parsed', parsedCount: parsed?.stores.length || 0 },
      ncCode: product.ncCode, positiveStoreCount: error ? 0 : parsed.stores.filter(row => row.inStock).length });
  }
  const premises = new Map(), conflicts = new Set();
  for (const row of signals) {
    const identity = JSON.stringify([row.storeAddress, row.lat, row.lng]);
    if (premises.has(row.storeId) && premises.get(row.storeId) !== identity) conflicts.add(row.storeId);
    premises.set(row.storeId, identity);
  }
  if (conflicts.size) {
    const affectedUrls = new Set(signals.filter(row => conflicts.has(row.storeId)).map(row => row.sourceUrl));
    for (const report of sourceReports.filter(row => affectedUrls.has(row.url))) {
      report.ok = false; report.error = 'cross_product_premises_conflict';
      report.positiveStoreCount = signals.filter(row => row.sourceUrl === report.url && !conflicts.has(row.storeId)).length;
      report.capabilities = [];
    }
    roadblocks.push({ state: 'NC', source: 'Durham ABC official store inventory', status: 'cross_product_premises_conflict',
      error: 'Product pages disagree on a store premise; those store observations were excluded.' });
  }
  return { signals: signals.filter(row => !conflicts.has(row.storeId)), sourceReports, roadblocks };
}
