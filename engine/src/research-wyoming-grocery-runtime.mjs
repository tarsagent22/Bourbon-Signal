import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { stableId } from './core/text.mjs';
import { parseBoundGroceryXapiInventory } from './collectors/grocery-xapi-identity.mjs';
import { groceryProductSnapshot, publicSearchKey } from './collectors/grocery-xapi-expansion.mjs';
import { centralCityHiveRecordMarketTier } from './collectors/central-cityhive-market-policy.mjs';
import { fetchReviewedFirstPartyText, readCityHiveIncidentJournal, persistCityHiveIncidentJournal,
  CITYHIVE_DENIAL_STATUSES, CITYHIVE_DENIAL_MINIMUM_MS } from './collectors/central-cityhive-transport.mjs';

const hostname = 'www.albertsons.com';
const endpoint = 'https://' + hostname + '/abs/pub/xapi/search/substitute';
const terms = ['bourbon', 'eagle rare'];
const visibleTiers = new Set(['limited', 'allocated', 'unicorn']);
const stores = [
  ['62', '2625 E 2nd St', 'Casper', '82609', 42.848022, -106.292475, '2625-e-2nd-st'],
  ['2061', '1825 17th St', 'Cody', '82414', 44.51785779999999, -109.055448, '1825-17th-st'],
  ['67', '2610 S Douglas Hwy', 'Gillette', '82718', 44.270564, -105.495935, '2610-s-douglas-hwy'],
  ['3435', '1005 W Coulter Ave', 'Powell', '82435', 44.748234, -108.771633, '1005-w-coulter-ave'],
].map(([merchantId, street, city, zip, lat, lng, slug]) => Object.freeze({
  state: 'WY', hostname, merchantId, street, city, zip, lat, lng, storeId: 'albertsons:' + merchantId,
  address: `${street}, ${city}, WY ${zip}`,
  locator: `https://local.albertsons.com/wy/${city.toLowerCase()}/${slug}/Beer-Wine-Liquor.html`,
}));

const label = 'Wyoming Albertsons in-store bourbon research';
const config = Object.freeze({ id: 'WY', label, tier: 'B', active: false, strategy: 'retailer_store_inventory',
  cadence: 'shadow-only', sources: [{ kind: 'api', url: endpoint, precisionOnly: true }], apiCandidates: [] });
export const wyomingGroceryResearchSourceForState = state => state === 'WY' ? config : null;
export const wyomingGroceryResearchLifecycle = {
  WY: { customerLabel: 'Wyoming', sourceLabel: label, publicStatus: 'research_only', shadowEligible: true,
    lifecycle: 'retailer_inventory_research', refinementLevel: 'store', coverageTier: 'sparse_live_store_inventory',
    inventoryAlertable: false, watchAlertable: false },
};

const runtimeId = 'research:wy:albertsons-xapi';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const bytesContain = (text, field, value) => text.includes(JSON.stringify(field) + ':' + JSON.stringify(value));

function matchesLocator(text, store) {
  const merchant = text.includes(`data-entity-id="${store.merchantId}"`);
  const groceryLink = text.includes(`loc=${store.merchantId}\\u0026`) || text.includes(`loc=${store.merchantId}&amp;`);
  return merchant && groceryLink && bytesContain(text, 'line1', store.street)
    && bytesContain(text, 'postalCode', store.zip) && bytesContain(text, 'region', 'WY')
    && bytesContain(text, 'c_hasAlcohol', true)
    && text.includes(`"geocodedCoordinate":{"lat":${store.lat},"long":${store.lng}}`);
}

function parseWyomingGrocerySearch(payload, store, term, bible, observedAt) {
  const response = payload?.response;
  const filter = response?.miscInfo?.filter;
  if (!stores.includes(store) || !terms.includes(term) || !Number.isFinite(Date.parse(observedAt))
    || payload?.appCode !== 'GR200 :: A-CT: 200' || response?.miscInfo?.query !== term || response?.start !== 0
    || typeof filter !== 'string' || !filter.includes(`(inventory(${store.merchantId}, price) >0)`)
    || !filter.includes(`(inventory(${store.merchantId},attributes.custom_type_2) = 1)`)
    || !Array.isArray(response.docs) || response.docs.length < 1 || response.docs.length > 100
    || response.docs.some(row => String(row.storeId) !== store.merchantId)) throw Error('Wyoming grocery response lost its exact store/query binding');
  return parseBoundGroceryXapiInventory(payload, store, bible).flatMap(hit => {
    const tier = centralCityHiveRecordMarketTier(hit.record, 'WY');
    if (!visibleTiers.has(tier) || !(hit.price > 0)) return [];
    const {productId, variantId} = hit;
    return [{
      id: stableId([runtimeId, store.storeId, productId]), state: 'WY', stateCode: 'WY',
      sourceRuntimeId: runtimeId, sourceLabel: label, sourceChain: 'albertsons',
      sourceUrl: `https://${hostname}/shop/product-details.${productId}.html`,
      eventType: 'retailer_store_inventory_result', locationPrecision: 'store_level',
      storeId: store.storeId, storeName: 'Albertsons ' + store.city, storeAddress: store.address,
      city: store.city, zip: store.zip, lat: store.lat, lng: store.lng,
      merchantId: store.merchantId, productId, variantId, rawName: hit.title,
      canonicalBottleId: hit.record.id, canonicalName: hit.record.canonical, tier,
      confidence: 0.86, price: hit.price, quantity: 0, quantityIsExact: false,
      inventorySemantics: 'binary_retailer_in_store_availability',
      observedAt, fetchedAt: observedAt, availabilityStatus: 'in_stock', sourceAvailabilityVerified: true,
      alertable: false, canAlertAsInventory: false, canAlertAsWatch: false, eligibleForOnSite: false,
      eligibleForDropFeed: false, eligibleForWatch: false, eligibleForDelivery: false, eligibleForEmail: false, eligibleForSms: false,
      sourceProductBinding: {schemaVersion: 1, source: 'grocery-xapi', shadowOnly: true,
        storeId: store.storeId, storeAddress: store.address, merchantId: store.merchantId, productId, variantId,
        canonicalBottleId: hit.record.id, price: hit.price, observedAt,
        premisesVerified: true, inStoreChannelVerified: true, productSnapshot: groceryProductSnapshot(hit.rawProduct)},
    }];
  });
}

export function isWyomingGroceryResearchInventory(row) {
  const store = stores.find(item => item.storeId === row?.storeId);
  const proof = row?.sourceProductBinding;
  return Boolean(store && row.state === 'WY' && row.sourceRuntimeId === runtimeId && row.storeAddress === store.address
    && row.merchantId === store.merchantId && row.locationPrecision === 'store_level'
    && row.availabilityStatus === 'in_stock' && row.sourceAvailabilityVerified === true
    && row.quantity === 0 && row.quantityIsExact === false && visibleTiers.has(row.tier)
    && proof?.shadowOnly === true && proof.premisesVerified === true && proof.inStoreChannelVerified === true
    && proof.storeId === row.storeId && proof.storeAddress === row.storeAddress && proof.merchantId === row.merchantId
    && proof.productId === row.productId && proof.variantId === row.variantId && proof.observedAt === row.observedAt
    && proof.canonicalBottleId === row.canonicalBottleId && proof.price === row.price
    && String(proof.productSnapshot?.storeId) === store.merchantId
    && proof.productSnapshot?.channelEligibility?.inStore === true
    && String(proof.productSnapshot?.channelInventory?.instore ?? proof.productSnapshot?.channelInventory?.inStore) === '1'
    && row.canAlertAsInventory === false && row.canAlertAsWatch === false && row.eligibleForOnSite === false
    && row.eligibleForDelivery === false && row.eligibleForEmail === false && row.eligibleForSms === false);
}

export async function replayWyomingGroceryReport(report, reportDirectory, bible, {nowMs = Date.now()} = {}) {
  const metadata = report?.metadata;
  const expectedStores = stores.map(store => store.storeId);
  const start = Date.parse(report?.startedAt), end = Date.parse(report?.finishedAt);
  if (report?.state !== 'WY' || report.status !== 'useful' || report.stale !== false || metadata?.complete !== true
    || metadata.shadowOnly !== true || metadata.productionActivationAllowed !== false || metadata.customerDeliveryAllowed !== false
    || JSON.stringify(metadata.verifiedPremises) !== JSON.stringify(expectedStores)
    || metadata.bibleRecordsSha256 !== digest(JSON.stringify(bible.records))
    || !Number.isFinite(start) || !Number.isFinite(end) || start > end || end > nowMs
    || !Array.isArray(metadata.receipts) || metadata.receipts.length !== stores.length * (1 + terms.length)) {
    throw Error('Incomplete or mismatched Wyoming shadow report');
  }
  const rows = new Map();
  const paths = new Set();
  let index = 0;
  async function readCapture(store, term) {
    const receipt = metadata.receipts[index++];
    const observed = Date.parse(receipt.observedAt), url = URL.parse(receipt.url);
    const routeMatches = term ? url?.origin === 'https://' + hostname && url.pathname === '/abs/pub/xapi/search/substitute'
      && url.searchParams.get('storeid') === store.merchantId && url.searchParams.get('q') === term
      && url.searchParams.get('banner') === 'albertsons' && url.searchParams.get('channel') === 'instore'
      && url.searchParams.get('start') === '0' && url.searchParams.get('rows') === '100' : url?.href === store.locator;
    if (!routeMatches || url.username || url.password || url.hash || receipt.finalUrl !== url.href || receipt.status !== 200
      || receipt.storeId !== store.storeId || receipt.term !== term || !Number.isFinite(observed) || observed < start || observed > end
      || nowMs - observed > 2 * 60 * 60_000 || !/^source-captures\/[\d]+-[a-f\d]{12}\.(html|json)$/.test(receipt.artifactPath)
      || paths.has(receipt.artifactPath)) throw Error('Wyoming capture route, location or clock does not reconcile');
    const bytes = await readFile(path.join(reportDirectory, receipt.artifactPath));
    if (bytes.length !== receipt.bytes || bytes.length > 4 * 1024 * 1024 || digest(bytes) !== receipt.sha256) {
      throw Error('Wyoming raw capture hash does not match');
    }
    paths.add(receipt.artifactPath);
    return bytes.toString('utf8');
  }
  for (const store of stores) {
    if (!matchesLocator(await readCapture(store, null), store)) throw Error('Wyoming captured locator lost its premises');
    for (const term of terms) {
      const observedAt = metadata.receipts[index].observedAt;
      const captured = await readCapture(store, term);
      for (const row of parseWyomingGrocerySearch(JSON.parse(captured), store, term, bible, observedAt)) {
        if (!rows.has(row.id)) rows.set(row.id, row);
      }
    }
  }
  const replay = [...rows.values()];
  if (!Array.isArray(report.signals) || !report.signals.every(isWyomingGroceryResearchInventory)
    || JSON.stringify(replay) !== JSON.stringify(report.signals)) throw Error('Wyoming replay changed an exact product observation');
  return replay;
}

export async function collectWyomingGroceryResearchReport(candidate, bible, {
  fetchText = fetchReviewedFirstPartyText, env = process.env, signal,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  reportDirectory = process.env.BOURBON_SIGNAL_STATE_OUT_FILE ? path.dirname(process.env.BOURBON_SIGNAL_STATE_OUT_FILE) : path.resolve('out/research-grocery/WY'),
  incidentFile = path.resolve('out/research-source-attempts/wy-albertsons.json'),
} = {}) {
  if (candidate !== config || env.BOURBON_SIGNAL_SHADOW_MODE !== '1') throw Error('Wyoming requires its registered shadow collector');
  const reviewedHosts = [...stores, {state: 'WY', hostname: 'local.albertsons.com'}];
  let journal = await readCityHiveIncidentJournal(incidentFile, 'WY', reviewedHosts);
  const now = Date.now();
  if (journal.inFlight || Object.values(journal.hosts).some(entry => Date.parse(entry.nextAllowedAt) > now)) {
    throw Error('Wyoming grocery has a retained observation or host cooldown');
  }
  const startedAt = new Date(now).toISOString(), receipts = [], verified = [], collected = new Map();
  const timeout = AbortSignal.timeout(150_000);
  const bounded = signal ? AbortSignal.any([signal, timeout]) : timeout;
  journal = {...journal, inFlight: {attemptId: randomUUID(), startedAt}};
  persistCityHiveIncidentJournal(incidentFile, journal);
  async function capture(url, store, term) {
    if (receipts.length) await sleep(1_500);
    bounded.throwIfAborted();
    const recordDenial = result => {
      if (!CITYHIVE_DENIAL_STATUSES.has(result.status)) return;
      const attempted = Date.now();
      const host = new URL(url).hostname;
      journal = {...journal, inFlight: null, hosts: {...journal.hosts, [host]: {httpStatus: result.status,
        lastAttemptAt: new Date(attempted).toISOString(),
        nextAllowedAt: new Date(attempted + Math.max(CITYHIVE_DENIAL_MINIMUM_MS, Number(result.retryAfterSeconds || 0) * 1_000)).toISOString()}}};
      persistCityHiveIncidentJournal(incidentFile, journal);
      throw Error(`Wyoming first-party source returned HTTP ${result.status}`);
    };
    const result = await fetchText(url, {signal: bounded, timeoutMs: 12_000, maxTimeoutMs: 12_000,
      maxBytes: 4 * 1024 * 1024, isAllowedUrl: checked => checked.href === url, onResponse: recordDenial,
      headers: term ? {accept: 'application/json', 'ocp-apim-subscription-key': publicSearchKey} : {}});
    recordDenial(result);
    if (!result.ok || result.status !== 200 || result.url !== url) throw Error('Wyoming first-party response was not complete or redirected');
    const observedAt = result.observedAt || new Date().toISOString(), bytes = Buffer.from(result.text);
    const sha256 = digest(bytes), artifactPath = `source-captures/${receipts.length + 1}-${sha256.slice(0, 12)}.${term ? 'json' : 'html'}`;
    await mkdir(path.dirname(path.join(reportDirectory, artifactPath)), {recursive: true});
    await writeFile(path.join(reportDirectory, artifactPath), bytes, {signal: bounded});
    receipts.push({url, finalUrl: result.url, status: result.status, observedAt, sha256, bytes: bytes.length,
      artifactPath, storeId: store.storeId, term});
    return {text: result.text, observedAt};
  }
  for (const store of stores) {
    const locator = await capture(store.locator, store, null);
    if (!matchesLocator(locator.text, store)) throw Error('Wyoming first-party locator lost its address binding for ' + store.storeId);
    verified.push(store.storeId);
    for (const term of terms) {
      const url = new URL(endpoint);
      url.search = new URLSearchParams({'request-id': String(Date.now()), url: url.origin, pageurl: url.origin,
        pagename: 'search', rows: '100', start: '0', 'search-type': 'keyword', storeid: store.merchantId,
        featured: 'true', 'search-uid': '', q: term, channel: 'instore', banner: 'albertsons'});
      const captured = await capture(url.href, store, term);
      for (const row of parseWyomingGrocerySearch(JSON.parse(captured.text), store, term, bible, captured.observedAt)) {
        if (!collected.has(row.id)) collected.set(row.id, row);
      }
    }
  }
  persistCityHiveIncidentJournal(incidentFile, {...journal, inFlight: null});
  const signals = [...collected.values()];
  const finishedAt = new Date().toISOString();
  const origin = env.GITHUB_ACTIONS === 'true' && /^\d+$/.test(env.GITHUB_RUN_ID || '') && /^[a-f\d]{40}$/.test(env.GITHUB_SHA || '')
    ? {kind: 'github_actions', repository: env.GITHUB_REPOSITORY, workflowRunId: env.GITHUB_RUN_ID, commitSha: env.GITHUB_SHA,
       runAttempt: env.GITHUB_RUN_ATTEMPT || '1'} : {kind: 'local_shadow_not_workflow_issued'};
  return {state: 'WY', label, tier: config.tier, strategy: config.strategy, cadence: config.cadence,
    startedAt, finishedAt, lastGoodAt: finishedAt, status: signals.length ? 'useful' : 'no_trusted_inventory',
    stale: false, signals, roadblocks: [],
    sources: [{sourceRuntimeId: runtimeId, label, url: endpoint, ok: true, status: 200}],
    sourceResults: [{sourceId: runtimeId, sourceLabel: label, ok: true, status: 'success', checkedAt: finishedAt,
      alertable: false, inventoryAlertable: false, watchAlertable: false}],
    metadata: {complete: true, shadowOnly: true, productionActivationAllowed: false, customerDeliveryAllowed: false,
      selectedStores: stores.map(store => store.storeId), verifiedPremises: verified, receipts, origin,
      bibleRecordsSha256: digest(JSON.stringify(bible.records))}};
}
