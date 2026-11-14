import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fetchReviewedFirstPartyText, CITYHIVE_DENIAL_STATUSES } from './collectors/central-cityhive-transport.mjs';
import { centralCityHiveRecordMarketTier } from './collectors/central-cityhive-market-policy.mjs';
import { parseEcwidPickupOffer, verifyEcwidPickupPremise } from './collectors/ecwid-pickup-surfaces.mjs';
import { atomicWriteJson } from './fwgs-artifact-policy.mjs';
import { stableId } from './core/text.mjs';

const state = 'MT';
const sourceRuntimeId = 'research:mt:ecwid:120273622';
const merchant = Object.freeze({
  merchantId: '120273622', name: 'Montana Liquor', origin: 'https://montanaliquor.com',
  storeId: 'ecwid:mt:120273622', address: '1019 1st Ave North, Billings, MT 59101', city: 'Billings', zip: '59101',
});
const product = Object.freeze({
  productId: '763398701', sku: '860006244521', name: 'UNDAMMED THIEF CREEK STRAIGHT BOURBON 750ML',
  canonical: 'Undammed Thief Creek Straight Bourbon', canonicalId: 'bb_9c8cf2d251d5db7e',
  url: `${merchant.origin}/products/undammed-thief-creek-straight-bourbon-750ml`,
});
const sourceLabel = 'Montana Liquor first-party pickup';
const premiseUrl = `${merchant.origin}/`;
const urls = [premiseUrl, product.url];
const config = Object.freeze({
  id: state, label: sourceLabel, tier: 'B', strategy: 'retailer_store_inventory', active: false,
  cadence: 'shadow-only', sources: urls.map(url => ({ kind: 'html', url, precisionOnly: true })), apiCandidates: [],
});
const shadowFlags = Object.freeze({
  alertable: false, canAlertAsInventory: false, canAlertAsWatch: false, eligibleForOnSite: false,
  eligibleForDropFeed: false, eligibleForWatch: false, eligibleForDelivery: false, eligibleForEmail: false, eligibleForSms: false,
});
const quantitySemantics = 'binary_retailer_orderable_no_exact_count';
const sha = value => createHash('sha256').update(value).digest('hex');
const cadenceMs = 30 * 60_000;
const denialMs = 86_400_000;

export function montanaRetailerSource(id) { return id === state ? config : null; }

export function montanaRetailerLifecycle() {
  return { [state]: { customerLabel: 'Montana', sourceLabel, publicStatus: 'research_only', shadowEligible: true,
    lifecycle: 'retailer_inventory_research', coverageTier: 'blocked', refinementLevel: 'store',
    inventoryAlertable: false, watchAlertable: false } };
}

export function isMontanaShadowPickup(row) {
  const proof = row?.sourceProductBinding;
  return row?.state === state && row.sourceRuntimeId === sourceRuntimeId && row.sourceUrl === product.url
    && row.storeId === merchant.storeId && row.storeAddress === merchant.address && row.productId === product.productId
    && row.canonicalBottleId === product.canonicalId && row.canonicalName === product.canonical && row.tier === 'limited'
    && row.availabilityStatus === 'in_stock' && row.sourceAvailabilityVerified === true && row.quantity === 0
    && row.quantityIsExact === false && row.quantitySemantics === quantitySemantics && row.raw?.shadowOnly === true
    && proof?.merchantId === merchant.merchantId && proof.sku === product.sku && proof.observedAt === row.observedAt
    && proof.premisesVerified === true && proof.pickupOfferVerified === true
    && Object.keys(shadowFlags).every(flag => row[flag] === false);
}

function inventoryRow(offer, bible, observedAt) {
  if (!offer) return null;
  const match = bible.match(product.canonical);
  if (match?.method !== 'exact-library-identity' || match.record.id !== product.canonicalId
    || match.record.canonical !== product.canonical || centralCityHiveRecordMarketTier(match.record, state) !== 'limited') {
    throw Error('Montana pickup product did not match its current reviewed library identity and tier.');
  }
  return {
    id: stableId([state, merchant.storeId, product.productId]), state, stateCode: state,
    eventType: 'retailer_store_inventory_result', sourceLabel, sourceUrl: product.url, sourceRuntimeId,
    observedAt, productId: product.productId, canonicalBottleId: product.canonicalId, canonicalName: product.canonical,
    rawName: product.name, tier: 'limited', price: offer.price, locationPrecision: 'store_level',
    storeId: merchant.storeId, storeName: merchant.name, locationName: merchant.name, storeAddress: merchant.address,
    city: merchant.city, postalCode: merchant.zip, quantity: 0, quantityIsExact: false, quantitySemantics,
    availabilityStatus: 'in_stock', sourceAvailabilityVerified: true, raw: { shadowOnly: true }, ...shadowFlags,
    sourceProductBinding: {
      merchantId: merchant.merchantId, storeId: merchant.storeId, storeAddress: merchant.address,
      productId: product.productId, sku: product.sku, canonicalBottleId: product.canonicalId, observedAt,
      premisesVerified: true, pickupOfferVerified: true, quantitySemantics,
    },
  };
}

export async function collectMontanaRetailer(incoming, bible, {
  signal, env = process.env, fetchText = fetchReviewedFirstPartyText,
  clocksFile = path.resolve('out/research-source-attempts/montana-ecwid.json'),
  reportDirectory = env.BOURBON_SIGNAL_STATE_OUT_FILE ? path.dirname(env.BOURBON_SIGNAL_STATE_OUT_FILE) : null,
} = {}) {
  if (env.BOURBON_SIGNAL_SHADOW_MODE !== '1' || incoming !== config) throw Error('Montana requires its isolated research source.');
  const startedAt = new Date().toISOString();
  const requests = [], roadblocks = [], signals = [];
  const prior = await readFile(clocksFile, 'utf8').then(JSON.parse).catch(error => {
    if (error.code !== 'ENOENT') throw error;
    return null;
  });
  if (prior && (prior.schemaVersion !== 1 || prior.hostname !== new URL(merchant.origin).hostname
    || !Number.isFinite(Date.parse(prior.nextAllowedAt)))) throw Error('Montana pickup attempt clock is malformed.');
  const recordClock = async (time, delay) => atomicWriteJson(clocksFile, {
    schemaVersion: 1, hostname: new URL(merchant.origin).hostname,
    lastAttemptAt: new Date(time).toISOString(), nextAllowedAt: new Date(time + delay).toISOString(),
  });
  const due = !prior || Date.parse(prior.nextAllowedAt) <= Date.parse(startedAt);
  let complete = false;
  if (due) {
    await recordClock(Date.now(), cadenceMs);
    let offer;
    for (const [index, url] of urls.entries()) {
      const receipt = { url };
      requests.push(receipt);
      try {
        const response = await fetchText(url, {
          signal, maxBytes: 512 * 1024, isAllowedUrl: candidate => candidate.href === url,
          onResponse: status => {
            receipt.status = status.status;
            if (CITYHIVE_DENIAL_STATUSES.has(status.status)) {
              return recordClock(Date.now(), Math.min(30 * denialMs, Math.max(denialMs, (status.retryAfterSeconds || 0) * 1000)));
            }
          },
        });
        receipt.status = response.status;
        receipt.observedAt = new Date().toISOString();
        if (response.status !== 200 || response.url !== url) throw Error('Montana pickup URL did not return a first-party selection.');
        if (index === 0) verifyEcwidPickupPremise(response.text, merchant);
        else offer = parseEcwidPickupOffer(response.text, merchant, product);
        receipt.sha256 = sha(response.text);
        receipt.bytes = Buffer.byteLength(response.text);
        if (reportDirectory) {
          receipt.artifactPath = `source-captures/${index === 0 ? 'premise' : 'product'}.html`;
          const destination = path.join(reportDirectory, receipt.artifactPath);
          await mkdir(path.dirname(destination), { recursive: true });
          await writeFile(destination, response.text, { flag: 'wx', signal });
        }
        receipt.ok = true;
      } catch (error) {
        signal?.throwIfAborted();
        receipt.ok = false;
        roadblocks.push({ state, source: sourceLabel, status: receipt.status || 0, error: error.message });
        break;
      }
    }
    complete = requests.length === urls.length && requests.every(request => request.ok === true);
    if (complete) {
      const row = inventoryRow(offer, bible, requests.at(-1).observedAt);
      if (row) signals.push(row);
    }
  }
  const finishedAt = new Date().toISOString();
  const sources = requests.map(receipt => ({ sourceRuntimeId, label: sourceLabel, url: receipt.url,
    status: receipt.status || 0, ok: receipt.ok, alertable: false, inventoryAlertable: false, watchAlertable: false }));
  return {
    state, label: sourceLabel, tier: config.tier, strategy: config.strategy, cadence: config.cadence, startedAt, finishedAt,
    lastGoodAt: complete ? finishedAt : null, status: signals.length ? 'useful' : due ? 'no_trusted_inventory' : 'not_due',
    stale: false, signals, sources, sourceResults: sources, roadblocks,
    metadata: { complete, shadowOnly: true, productionActivationAllowed: false, customerDeliveryAllowed: false,
      verifiedPremises: complete ? [merchant.storeId] : [], requests },
  };
}
