import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { atomicWriteJson } from './fwgs-artifact-policy.mjs';
import { stableId } from './core/text.mjs';
import { fetchReviewedFirstPartyText, CITYHIVE_DENIAL_STATUSES } from './collectors/central-cityhive-transport.mjs';
import { centralCityHiveRecordMarketTier } from './collectors/central-cityhive-market-policy.mjs';
import { isOldVineNebraskaResearchRow, NE_OLD_VINE_RESEARCH_SOURCE, parseOldVineBladeAndBowResearchPage } from './research-ne-oldvine-runtime.mjs';

const state = 'NE';
const label = 'World Liquor NW Omaha first-party pickup';
const city = 'Bennington';
const street = '15601 Whiting Street';
const zip = '68007';
const address = `${street}, ${city}, ${state} ${zip}`;
const latitude = 41.335044;
const longitude = -96.159201;
const slug = 'bz_worldliquor';
const name = 'World Liquor NW Omaha';
const storeId = 'bottlezoo:ne:bz_worldliquor';
const runtimeId = 'research:ne:bottlezoo:world-liquor';
const origin = 'https://worldliquornwomaha.com';
const pickupProduct = Object.freeze({
  id: '2826', codeId: '2828', upc: '096749472215',
  name: 'Elijah Craig Barrel Proof 750ml', canonical: 'Elijah Craig Barrel Proof',
});
const sourcePath = `/store/${slug}/p/${pickupProduct.id}`;
const sourceUrl = origin + sourcePath;
const oldVine = NE_OLD_VINE_RESEARCH_SOURCE;
const oldVineRuntimeId = 'research:ne:old-vine-woocommerce';
const config = Object.freeze({
  id: state, label, tier: 'B', active: false, strategy: 'retailer_store_inventory', cadence: 'shadow-only',
  sources: Object.freeze([
    {kind: 'html', label, url: sourceUrl, precisionOnly: true},
    {kind: 'html', label: oldVine.label, url: oldVine.productUrl, precisionOnly: true},
  ]),
  apiCandidates: Object.freeze([]),
});
const silent = Object.freeze({
  alertable: false, canAlertAsInventory: false, canAlertAsWatch: false, eligibleForOnSite: false,
  eligibleForDropFeed: false, eligibleForWatch: false, eligibleForDelivery: false,
  eligibleForEmail: false, eligibleForSms: false,
});
const quantitySemantics = 'binary_retailer_orderable_no_exact_count';
const sha = value => createHash('sha256').update(value).digest('hex');
const normalized = value => String(value || '').trim().replace(/\s+/g, ' ');
const time = 30 * 60_000;

export function nebraskaRetailerSource(id) { return id === state ? config : null; }
export function nebraskaRetailerLifecycle() {
  return {[state]: {
    customerLabel: 'Nebraska', sourceLabel: label, publicStatus: 'research_only', shadowEligible: true,
    lifecycle: 'retailer_inventory_research', coverageTier: 'blocked', refinementLevel: 'store',
    inventoryAlertable: false, watchAlertable: false,
  }};
}

// The retailer's public page can contain configuration unrelated to pickup.
// Keep only the store and product fields the offline verifier actually reads.
export function captureNebraskaPickup(html) {
  const json = /<script\b[^>]*\bid="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/u.exec(html)?.[1];
  if (!json) throw Error('BottleZoo product page has no server-rendered state.');
  const {page, query, props} = JSON.parse(json);
  const raw = props?.pageProps?.pageData?.product;
  const store = props?.pageProps?.appData?.config;
  const capture = {
    page, query: {storeSlug: query?.storeSlug, productId: query?.productId},
    pickupCartVisible: /<span[^>]*>\s*Add to Cart\s*<\/span>/iu.test(html),
    store: {
      name: normalized(store?.bizname), address: store?.bizaddress, city: store?.bizsuburb,
      state: store?.bizstate, zip: store?.bizpostcode, pickup: store?.enable_pickup_from_store === true,
      enabled: store?.webstoreenabled === true, latitude: Number(store?.bizlatitude), longitude: Number(store?.bizlongitude),
    },
    product: {
      id: raw?.id, url: raw?.url, name: raw?.name, price: raw?.price, quantity: raw?.total_stocks,
      stock: raw?.stocklevel, codes: Array.isArray(raw?.code) ? raw.code.map(code => ({
        id: code.id, upc: code.upcfull, stock: code.stocklevel,
      })) : [], sizes: Array.isArray(raw?.sizes) ? raw.sizes.map(size => ({id: size.id, text: size.text})) : [],
    },
  };
  return capture;
}

export function parseNebraskaPickup(capture, bible, observedAt) {
  const {page, query, product, store, pickupCartVisible} = capture || {};
  if (page !== '/store/[storeSlug]/p/[productId]' || query?.storeSlug !== slug
    || query.productId !== pickupProduct.id || store?.name !== name || store?.address !== street
    || store.city !== city || store.state !== state || store.zip !== zip || store.pickup !== true || store.enabled !== true
    || store.latitude !== latitude || store.longitude !== longitude || product?.id !== pickupProduct.id
    || product.url !== sourcePath || product.name !== pickupProduct.name
    || product.sizes?.length !== 1 || product.sizes[0].text !== '750ML'
    || product.codes?.length !== 1 || product.codes[0].id !== pickupProduct.codeId
    || product.codes[0].upc !== pickupProduct.upc || !Number.isFinite(Date.parse(observedAt))) {
    throw Error('BottleZoo product, size, UPC or exact pickup premises changed.');
  }
  const price = Number(product.price);
  if (!Number.isFinite(price) || price <= 0 || !Number.isSafeInteger(product.quantity)
    || product.quantity < 0 || product.quantity !== product.stock || product.stock !== Number(product.codes[0].stock)) {
    throw Error('BottleZoo price or product-level stock is incomplete.');
  }
  if (product.stock === 0) return [];
  if (pickupCartVisible !== true) throw Error('BottleZoo positive stock has no orderable product offer.');
  const match = bible.match(pickupProduct.canonical);
  const tier = centralCityHiveRecordMarketTier(match?.record, state);
  if (match?.confidence !== 1 || match.record?.canonical !== pickupProduct.canonical
    || !['allocated', 'limited', 'unicorn'].includes(tier)) return [];
  const binding = {
    source: 'world-liquor-bottlezoo', shadowOnly: true, storeId, storeAddress: address, productId: pickupProduct.id,
    upc: pickupProduct.upc, canonicalBottleId: match.record.id, observedAt, quantitySemantics,
    availableToOrder: product.stock, pickupOfferVerified: true, premisesVerified: true, coordinatesVerified: true,
  };
  return [{
    id: stableId([state, storeId, pickupProduct.id]), state, stateCode: state, eventType: 'retailer_store_inventory_result',
    sourceLabel: label, sourceUrl, sourceRuntimeId: runtimeId, observedAt, productId: pickupProduct.id,
    canonicalBottleId: match.record.id, canonicalName: match.record.canonical, rawName: product.name, tier, price,
    locationPrecision: 'store_level', storeId, storeName: name, locationName: name, storeAddress: address, city,
    postalCode: zip, lat: latitude, lng: longitude, quantity: 0, quantityIsExact: false, quantitySemantics,
    availabilityStatus: 'in_stock', sourceAvailabilityVerified: true, sourceProductBinding: binding,
    raw: {shadowOnly: true}, ...silent,
  }];
}

export function isNebraskaShadowPickup(row) {
  if (row?.sourceRuntimeId === oldVineRuntimeId) {
    return isOldVineNebraskaResearchRow(row) && row.sourceUrl === oldVine.productUrl
      && row.sourceProductBinding?.observedAt === row.observedAt && row.sourceProductBinding?.shadowOnly === true
      && row.raw?.shadowOnly === true && Object.keys(silent).every(flag => row[flag] === false);
  }
  const proof = row?.sourceProductBinding;
  return Boolean(row?.state === state && row.sourceRuntimeId === runtimeId && row.sourceUrl === sourceUrl
    && row.storeId === storeId && row.storeAddress === address && row.city === city && row.postalCode === zip
    && row.lat === latitude && row.lng === longitude && row.productId === pickupProduct.id
    && row.rawName === pickupProduct.name && row.canonicalName === pickupProduct.canonical
    && row.availabilityStatus === 'in_stock' && row.sourceAvailabilityVerified === true
    && row.quantity === 0 && row.quantityIsExact === false && row.quantitySemantics === quantitySemantics
    && proof?.source === 'world-liquor-bottlezoo' && proof.shadowOnly === true && row.raw?.shadowOnly === true
    && proof.premisesVerified === true && proof.pickupOfferVerified === true && proof.storeId === storeId
    && proof.storeAddress === address && proof.productId === row.productId && proof.upc === pickupProduct.upc
    && proof.observedAt === row.observedAt && proof.canonicalBottleId === row.canonicalBottleId
    && Number.isSafeInteger(proof.availableToOrder) && proof.availableToOrder > 0
    && Object.keys(silent).every(flag => row[flag] === false));
}

export async function collectNebraskaRetailer(incoming, bible, {
  signal, env = process.env, fetchText = fetchReviewedFirstPartyText,
  attemptsFile = path.resolve('out/research-source-attempts/nebraska-retailers.json'),
  reportDirectory = env.BOURBON_SIGNAL_STATE_OUT_FILE ? path.dirname(env.BOURBON_SIGNAL_STATE_OUT_FILE) : null,
} = {}) {
  if (env.BOURBON_SIGNAL_SHADOW_MODE !== '1' || incoming !== config) throw Error('Nebraska requires its registered shadow source.');
  const now = Date.now(), startedAt = new Date(now).toISOString();
  const fromHost = env.GITHUB_ACTIONS === 'true' ? {
    kind: 'github_actions', repository: env.GITHUB_REPOSITORY, workflowRunId: env.GITHUB_RUN_ID,
    commitSha: env.GITHUB_SHA, runAttempt: env.GITHUB_RUN_ATTEMPT,
  } : {kind: 'local_shadow_not_workflow_issued'};
  const prior = await readFile(attemptsFile, 'utf8').then(JSON.parse).catch(error => {
    if (error.code !== 'ENOENT') throw error;
    return null;
  });
  const attempts = prior?.sources ?? {};
  if (prior && (prior.schemaVersion !== 1 || !prior.sources || Array.isArray(prior.sources)
    || Object.values(attempts).some(clock => !Number.isFinite(Date.parse(clock?.nextAllowedAt))))) {
    throw Error('Invalid Nebraska source attempt clocks.');
  }
  const persist = async (id, at, delay) => {
    attempts[id] = {lastAttemptAt: new Date(at).toISOString(), nextAllowedAt: new Date(at + delay).toISOString()};
    await mkdir(path.dirname(attemptsFile), {recursive: true});
    await atomicWriteJson(attemptsFile, {schemaVersion: 1, sources: attempts});
  };
  const reviewed = [
    {id: runtimeId, label, url: sourceUrl, storeId, file: 'world-liquor-product-2826.json',
      parse(text, at) {
        const capture = captureNebraskaPickup(text);
        return {rows: parseNebraskaPickup(capture, bible, at), retained: JSON.stringify(capture)};
      }},
    {id: oldVineRuntimeId, label: oldVine.label, url: oldVine.productUrl, storeId: 'ne:retail-c:113941',
      parse(text, at) {
        const row = parseOldVineBladeAndBowResearchPage(text, bible, {observedAt: at});
        if (!row) throw Error('Old Vine product lacks a verified currently orderable pickup offer.');
        // The full WooCommerce document is held only for the original local review.
        return {rows: [{...row, sourceRuntimeId: oldVineRuntimeId, ...silent}], retained: null};
      }},
  ];
  const requests = [], signals = [], roadblocks = [], verifiedPremises = [], sources = [];
  for (const source of reviewed) {
    if (Date.parse(attempts[source.id]?.nextAllowedAt) > now) continue;
    await persist(source.id, Date.now(), time);
    const receipt = {url: source.url};
    requests.push(receipt);
    try {
      const response = await fetchText(source.url, {
        signal, maxBytes: 2 * 1024 * 1024, isAllowedUrl: url => url.href === source.url,
        onResponse: metadata => {
          receipt.status = metadata.status;
          if (CITYHIVE_DENIAL_STATUSES.has(metadata.status)) {
            return persist(source.id, Date.now(), Math.min(30 * 86_400_000,
              Math.max(86_400_000, (metadata.retryAfterSeconds || 0) * 1000)));
          }
        },
      });
      receipt.status = response.status;
      receipt.observedAt = new Date().toISOString();
      if (response.status !== 200 || response.url !== source.url) throw Error('Nebraska product request did not verify.');
      const {rows, retained} = source.parse(response.text, receipt.observedAt);
      receipt.sha256 = sha(response.text);
      if (reportDirectory && retained) {
        receipt.artifactPath = 'source-captures/' + source.file;
        receipt.retainedCaptureSha256 = sha(retained);
        await mkdir(path.join(reportDirectory, 'source-captures'), {recursive: true});
        await writeFile(path.join(reportDirectory, receipt.artifactPath), retained, {flag: 'wx', signal});
      }
      signals.push(...rows);
      receipt.ok = true;
      verifiedPremises.push(source.storeId);
    } catch (error) {
      signal?.throwIfAborted();
      receipt.ok = false;
      roadblocks.push({state, source: source.label, status: receipt.status || 0, error: error.message});
    }
    sources.push({sourceRuntimeId: source.id, label: source.label, url: source.url, status: receipt.status || 0,
      ok: receipt.ok, alertable: false, inventoryAlertable: false, watchAlertable: false});
  }
  const complete = verifiedPremises.length === reviewed.length;
  const finishedAt = new Date().toISOString();
  return {
    state, label, tier: config.tier, strategy: config.strategy, cadence: config.cadence, startedAt, finishedAt,
    lastGoodAt: complete ? finishedAt : null, status: signals.length ? complete ? 'useful' : 'partial_useful'
      : requests.length ? 'no_trusted_inventory' : 'not_due',
    stale: false, signals, sources, sourceResults: sources, roadblocks,
    metadata: {complete, shadowOnly: true, productionActivationAllowed: false, customerDeliveryAllowed: false,
      origin: fromHost, verifiedPremises, requests},
  };
}
