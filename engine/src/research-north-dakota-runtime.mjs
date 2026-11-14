import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { stableId } from './core/text.mjs';
import { parseBoundGroceryXapiInventory } from './collectors/grocery-xapi-identity.mjs';
import { groceryProductSnapshot, publicSearchKey } from './collectors/grocery-xapi-expansion.mjs';
import { centralCityHiveAllocatedQueryFilter, centralCityHiveRecordMarketTier } from './collectors/central-cityhive-market-policy.mjs';
import { CITYHIVE_DENIAL_STATUSES, CITYHIVE_DENIAL_MINIMUM_MS, fetchReviewedFirstPartyText,
  persistCityHiveIncidentJournal, readCityHiveIncidentJournal } from './collectors/central-cityhive-transport.mjs';
import { librarySourceSearchPlan } from './library-search-runtime.mjs';
import { cityHiveResearchSourceForState, collectCityHiveResearchReport } from './research-cityhive-runtime.mjs';
import { allowedTiers, groceryId, isNorthDakotaGroceryResearchInventory, williston } from './north-dakota-retail-policy.mjs';
export { isNorthDakotaGroceryResearchInventory } from './north-dakota-retail-policy.mjs';

const cityHive = cityHiveResearchSourceForState('ND');
const endpoint = 'https://www.albertsons.com/abs/pub/xapi/search/substitute';
const hosts = [williston.locator, endpoint].map(url => ({ state: 'ND', hostname: new URL(url).hostname }));
const config = Object.freeze({ ...cityHive, label: 'North Dakota exact-store retailer research',
  sources: Object.freeze([...cityHive.sources, { kind: 'html', url: williston.locator, precisionOnly: true },
    { kind: 'api', url: endpoint, precisionOnly: true }]) });

export const northDakotaResearchSourceForState = state => state === 'ND' ? config : null;

export function matchesNorthDakotaGroceryLocator(body) {
  return body.includes('data-entity-id="28"')
    && (body.includes('loc=28\\u0026') || body.includes('loc=28&amp;'))
    && body.includes('"line1":"20 26th St E"') && body.includes('"postalCode":"58801"')
    && body.includes('"region":"ND"') && body.includes('"c_hasAlcohol":true')
    && body.includes('"geocodedCoordinate":{"lat":48.167667,"long":-103.622448}');
}

export function parseNorthDakotaGrocerySearch(payload, term, bible, observedAt) {
  const response = payload?.response;
  const filter = response?.miscInfo?.filter;
  const exactSearch = response?.miscInfo?.query === term && response.start === 0 && typeof filter === 'string'
    && filter.includes('(inventory(28, price) >0)') && filter.includes('(inventory(28,attributes.custom_type_2) = 1)');
  if (payload?.appCode === 'GR204' && exactSearch && response.numFound === 0 && !Object.hasOwn(response, 'docs')) {
    return { confirmed: true, signals: [] };
  }
  if (term !== 'bourbon' && payload?.appCode === 'GR204' && payload.appMsg === 'GR : Google Retail returned empty response..'
    && Object.keys(payload).length === 2) return { confirmed: false, signals: [] };
  if (payload?.appCode !== 'GR200 :: A-CT: 200' || !exactSearch || !Number.isFinite(Date.parse(observedAt))
    || !Array.isArray(response.docs) || response.docs.length < 1 || response.docs.length > 100
    || response.docs.some(row => String(row.storeId) !== williston.merchantId)) {
    throw new Error('Williston inventory response did not echo the exact store and search');
  }
  const signals = parseBoundGroceryXapiInventory(payload, williston, bible).flatMap(hit => {
    const tier = centralCityHiveRecordMarketTier(hit.record, 'ND');
    if (!allowedTiers.has(tier) || !(hit.price > 0)) return [];
    const { storeId, address: storeAddress, name: storeName, city, zip, lat, lng, merchantId, sourceLabel } = williston;
    const { productId, variantId, price } = hit;
    const canonicalBottleId = hit.record.id;
    return [{
      id: stableId(['ND', groceryId, storeId, productId]), state: 'ND', stateCode: 'ND', sourceRuntimeId: groceryId,
      sourceLabel, sourceChain: 'albertsons', sourceUrl: `https://www.albertsons.com/shop/product-details.${productId}.html`,
      eventType: 'retailer_store_inventory_result', locationPrecision: 'store_level', storeId, storeName, storeAddress,
      city, zip, lat, lng, merchantId, productId, variantId, rawName: hit.title, canonicalBottleId,
      canonicalName: hit.record.canonical, tier, price, confidence: .86, quantity: 0, quantityIsExact: false,
      inventorySemantics: 'binary_retailer_in_store_availability', availabilityStatus: 'in_stock',
      sourceAvailabilityVerified: true, observedAt, fetchedAt: observedAt, alertable: false,
      canAlertAsInventory: false, canAlertAsWatch: false, eligibleForOnSite: false, eligibleForDropFeed: false,
      eligibleForWatch: false, eligibleForDelivery: false, eligibleForEmail: false, eligibleForSms: false,
      sourceProductBinding: { schemaVersion: 1, source: 'grocery-xapi', shadowOnly: true, storeId, storeAddress,
        merchantId, productId, variantId, canonicalBottleId, price, observedAt, premisesVerified: true,
        inStoreChannelVerified: true, productSnapshot: groceryProductSnapshot(hit.rawProduct) },
    }];
  });
  return { confirmed: true, signals };
}

function grocerySearchUrl(term) {
  const url = new URL(endpoint);
  url.search = new URLSearchParams({ 'request-id': String(Date.now()), url: url.origin, pageurl: url.origin,
    pagename: 'search', rows: '100', start: '0', 'search-type': 'keyword', storeid: williston.merchantId,
    featured: 'true', 'search-uid': '', q: term, channel: 'instore', banner: 'albertsons' });
  return url.href;
}

export async function collectNorthDakotaGroceryObservation(bible, {
  fetchText = fetchReviewedFirstPartyText, signal, cursorDir, reportDirectory,
  incidentFile = path.resolve('out/research-source-attempts/north-dakota-albertsons.json'),
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
} = {}) {
  let journal = await readCityHiveIncidentJournal(incidentFile, 'ND', hosts);
  if (journal.inFlight || Object.values(journal.hosts).some(entry => Date.parse(entry.nextAllowedAt) > Date.now())) {
    throw new Error('Williston inventory remains in durable source cooldown or has an unresolved observation');
  }
  const timeout = AbortSignal.timeout(55_000), bounded = signal ? AbortSignal.any([signal, timeout]) : timeout;
  const plan = await librarySourceSearchPlan(bible, { sourceKey: 'ND:albertsons-xapi', budget: 1, broadTerms: [],
    queryFilter: centralCityHiveAllocatedQueryFilter(bible, 'ND'), cursorDir });
  if (plan.terms.length !== 1) throw new Error('Williston inventory requires an indexed allocated search');
  const startedAt = new Date().toISOString(), receipts = [], signals = new Map(), unconfirmedQueries = [];
  journal = { ...journal, inFlight: { attemptId: randomUUID(), startedAt } };
  persistCityHiveIncidentJournal(incidentFile, journal);
  let denied = false;
  async function capture(url, term) {
    if (receipts.length) await sleep(1_500);
    bounded.throwIfAborted();
    function observeDenial(response) {
      if (!CITYHIVE_DENIAL_STATUSES.has(response.status)) return;
      denied = true;
      const now = Date.now(), host = new URL(url).hostname;
      const backoff = Math.max(CITYHIVE_DENIAL_MINIMUM_MS, (Number(response.retryAfterSeconds) || 0) * 1000);
      persistCityHiveIncidentJournal(incidentFile, { ...journal, inFlight: null, hosts: { ...journal.hosts,
        [host]: { httpStatus: response.status, lastAttemptAt: new Date(now).toISOString(),
          nextAllowedAt: new Date(Math.min(now + backoff, 8_640_000_000_000_000)).toISOString() } } });
      throw new Error(`Williston first-party source returned HTTP ${response.status}`);
    }
    const result = await fetchText(url, { signal: bounded, timeoutMs: 12_000, maxTimeoutMs: 12_000,
      maxBytes: 4 * 1024 * 1024, isAllowedUrl: checked => checked.href === url, onResponse: observeDenial,
      headers: term ? { accept: 'application/json', 'ocp-apim-subscription-key': publicSearchKey } : {} });
    observeDenial(result);
    bounded.throwIfAborted();
    if (!result.ok || result.status !== 200 || result.url !== url) throw new Error('Williston first-party response was incomplete');
    const observedAt = result.observedAt ?? new Date().toISOString(), bytes = Buffer.from(result.text);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const artifactPath = `source-captures/williston-${receipts.length + 1}-${sha256.slice(0, 12)}.${term ? 'json' : 'html'}`;
    if (reportDirectory) {
      const filename = path.join(reportDirectory, artifactPath);
      await mkdir(path.dirname(filename), { recursive: true });
      await writeFile(filename, bytes, { signal: bounded });
    }
    receipts.push({ url, finalUrl: result.url, status: result.status, observedAt, sha256, bytes: bytes.length,
      ...(reportDirectory ? { artifactPath } : {}), storeId: williston.storeId, term });
    return { body: result.text, observedAt };
  }
  try {
    const locator = await capture(williston.locator, null);
    if (!matchesNorthDakotaGroceryLocator(locator.body)) throw new Error('Williston locator lost exact premise binding');
    for (const term of ['bourbon', plan.terms[0].toLowerCase()]) {
      const captureResult = await capture(grocerySearchUrl(term), term);
      const result = parseNorthDakotaGrocerySearch(JSON.parse(captureResult.body), term, bible, captureResult.observedAt);
      if (!result.confirmed) unconfirmedQueries.push(term);
      for (const row of result.signals) if (!signals.has(row.id)) signals.set(row.id, row);
    }
    bounded.throwIfAborted();
    return { signals: [...signals.values()], receipts, plan, unconfirmedQueries };
  } finally {
    if (!denied) persistCityHiveIncidentJournal(incidentFile, { ...journal, inFlight: null });
  }
}

export async function collectNorthDakotaResearchReport(candidate, bible, options = {}) {
  const env = options.env ?? process.env;
  if (candidate !== config || env.BOURBON_SIGNAL_SHADOW_MODE !== '1' || process.env.BOURBON_SIGNAL_SHADOW_MODE !== '1') {
    throw new Error('North Dakota requires its registered shadow collector');
  }
  const reportDirectory = options.reportDirectory ?? (env.BOURBON_SIGNAL_STATE_OUT_FILE
    ? path.dirname(env.BOURBON_SIGNAL_STATE_OUT_FILE) : path.resolve('out/research-north-dakota'));
  const startedAt = new Date().toISOString();
  const [rock, grocery] = await Promise.allSettled([
    collectCityHiveResearchReport(cityHive, bible, { signal: options.signal, ...options.cityHiveOptions, env, reportDirectory }),
    collectNorthDakotaGroceryObservation(bible, { signal: options.signal, ...options.groceryOptions, reportDirectory }),
  ]);
  const finishedAt = new Date().toISOString();
  const rockReport = rock.status === 'fulfilled' ? rock.value : null;
  const groceryReport = grocery.status === 'fulfilled' ? grocery.value : null;
  const exact = groceryReport?.signals ?? [];
  if (!exact.every(isNorthDakotaGroceryResearchInventory)) throw new Error('Williston rows failed source proof');
  const signals = [...(rockReport?.signals ?? []), ...exact];
  const complete = rockReport?.metadata?.complete === true && groceryReport !== null;
  const grocerySource = { sourceRuntimeId: groceryId, label: williston.sourceLabel, url: endpoint,
    ok: groceryReport !== null, status: groceryReport ? 200 : 0, matchedBottleCount: exact.length,
    error: groceryReport ? null : grocery.reason?.message ?? 'Williston observation failed' };
  const failures = [grocerySource, ...(rockReport ? [] : [{ sourceRuntimeId: 'research:nd:rock-bottle-shop',
    label: 'The Rock Bottle Shop', ok: false, status: 0, error: rock.reason?.message ?? 'Grand Forks observation failed' }])];
  const sourceResults = failures.map(source => ({ ...source, sourceId: source.sourceRuntimeId,
    alertable: false, inventoryAlertable: false, watchAlertable: false }));
  return {
    state: 'ND', label: config.label, tier: config.tier, strategy: config.strategy, cadence: config.cadence, stale: false,
    startedAt, finishedAt, lastGoodAt: complete ? finishedAt : null,
    status: signals.length ? complete ? 'useful' : 'partial_useful' : 'no_trusted_inventory', signals,
    sources: [...(rockReport?.sources ?? []), ...failures],
    sourceResults: [...(rockReport?.sourceResults ?? []), ...sourceResults],
    roadblocks: [...(rockReport?.roadblocks ?? []), ...failures.filter(source => !source.ok)],
    metadata: { ...rockReport?.metadata, complete, shadowOnly: true, productionActivationAllowed: false,
      selectedStores: [...(rockReport?.metadata?.selectedStores ?? []), williston.storeId],
      verifiedPremises: [...(rockReport?.metadata?.verifiedPremises ?? []), ...(groceryReport ? [williston.storeId] : [])],
      customerDeliveryAllowed: false, receipts: [...(rockReport?.metadata?.receipts ?? []), ...(groceryReport?.receipts ?? [])],
      cityHive: rockReport?.metadata ?? null, grocery: groceryReport ? {
        verifiedPremises: [williston.storeId], plan: groceryReport.plan, unconfirmedQueries: groceryReport.unconfirmedQueries,
        receipts: groceryReport.receipts,
      } : null },
  };
}
