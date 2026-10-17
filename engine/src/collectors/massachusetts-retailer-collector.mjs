import { createHash } from 'node:crypto';
import { MA_JULIOS_SOURCE as store, MA_JULIOS_PROBE_URLS, parseMassachusettsJulios } from './massachusetts-retailer-surfaces.mjs';

// Until normal promotion is reviewed, this source can run only in the isolated
// shadow worker. It cannot become customer inventory through an ad-hoc refresh.
export async function collectMassachusettsJulios(config, bible, {
  fetchImpl = fetch, shadowMode = process.env.BOURBON_SIGNAL_SHADOW_MODE === '1',
  now = () => new Date().toISOString(), signal,
} = {}) {
  if (config?.id !== 'MA' || !shadowMode) return {
    signals: [], sourceResults: [], sourceReports: [],
    roadblocks: [{ state: 'MA', source: "Julio's Liquors public pickup", url: store.categoryUrl,
      status: 'promotion_required', error: 'Massachusetts collection is restricted to isolated shadow research.' }],
  };
  const signals = new Map();
  const sourceReports = [];
  const sourceResults = [];
  const roadblocks = [];
  for (const [index, url] of MA_JULIOS_PROBE_URLS.entries()) {
    const observedAt = now();
    const sourceId = `precision:ma:julios-westborough:${index}`;
    let status = 0;
    let count = 0;
    let error = null;
    try {
      const timeout = AbortSignal.timeout(30_000);
      const response = await fetchImpl(url, { method: 'GET', redirect: 'error',
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
      status = response.status;
      if (!response.ok) { await response.body?.cancel(); throw new Error(`source_http_${status}`); }
      if (!response.body) throw new Error('missing_body');
      let size = 0;
      const chunks = [];
      for await (const chunk of response.body) {
        size += chunk.length;
        if (size > 2_000_000) throw new Error('source_size_limit');
        chunks.push(chunk);
      }
      for (const row of parseMassachusettsJulios(Buffer.concat(chunks).toString('utf8'))) {
        const match = bible.match(row.title);
        // A generic brand/containment match must not turn rye into bourbon,
        // add an age statement, or conflate a private barrel with a base bottle.
        if (!match?.record?.id || match.confidence !== 1) continue;
        const id = createHash('sha256').update(`MA|${row.merchantId}|${row.productId}|${row.variantId}|${match.record.id}`).digest('hex').slice(0, 24);
        count++;
        signals.set(id, {
          id, state: 'MA', sourceLabel: "Julio's Liquors Westborough public pickup", sourceUrl: row.productUrl,
          sourceRuntimeId: sourceId, sourceChain: store.id, merchantId: row.merchantId,
          productId: row.productId, variantId: row.variantId,
          rawName: row.title, canonicalName: match.record.canonical, canonicalBottleId: match.record.id,
          confidence: 1, eventType: 'cityhive_store_inventory_result',
          locationPrecision: 'store_level', storeId: store.storeId, storeName: store.storeName,
          storeAddress: store.address, city: store.city, county: store.county, lat: store.lat, lng: store.lng,
          observedAt, signalAt: observedAt, stale: false, sourceStale: false,
          price: row.price, quantity: 0, quantityIsExact: false,
          sourceAvailabilityVerified: true, availabilityStatus: 'orderable',
          availabilityLabel: 'Retailer reports pickup availability; confirm before driving.',
          inventorySemantics: 'binary_retailer_orderable_no_exact_count',
          canAlertAsInventory: true, canAlertAsWatch: false,
          alertable: false, eligibleForOnSite: false, eligibleForDelivery: false,
          eligibleForEmail: false, eligibleForSms: false,
          evidence: 'The first-party merchant option reports positive pickup orderability at the reviewed Westborough premises. No exact shelf count or guaranteed fulfillment is claimed. Shadow research only.',
          raw: { sourceProbeUrl: url, premisesVerified: true, pickupOfferVerified: true,
            sourceMatchStatus: 'exact_bible_match', shadowOnly: true },
        });
      }
    } catch (failure) {
      error = /^(source_http_\d{3}|missing_body|source_size_limit)$/.test(failure.message)
        ? failure.message : 'public_source_request_or_parse_failed';
      roadblocks.push({ state: 'MA', source: "Julio's Liquors public pickup", sourceRuntimeId: sourceId,
        url, status, error, nextRoute: 'Preserve the source failure; do not bypass protection or infer out of stock.' });
    }
    sourceReports.push({ sourceRuntimeId: sourceId, label: "Julio's Liquors public pickup",
      url, ok: !error, status, contentType: 'text/html', signalType: 'cityhive_store_inventory_result',
      matchedBottleCount: count, locationPrecision: 'store_level', error });
    sourceResults.push({ sourceId, sourceLabel: "Julio's Liquors public pickup", sourceUrl: url,
      ok: !error, status: error ? 'failed' : 'success', checkedAt: observedAt,
      lastGoodAt: error ? null : observedAt, alertable: false, inventoryAlertable: false, watchAlertable: false });
  }
  return { signals: [...signals.values()], roadblocks, sourceReports, sourceResults };
}
