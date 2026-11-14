import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fetchReviewedFirstPartyText, CITYHIVE_DENIAL_STATUSES } from './collectors/central-cityhive-transport.mjs';
import { centralCityHiveRecordMarketTier } from './collectors/central-cityhive-market-policy.mjs';
import { stableId } from './core/text.mjs';

import {
  batchPath, city, fullAddress, origin, silent, sourceId, sources, storeId, southDakotaRetailerRequest,
} from './south-dakota-pickup-policy.mjs';
export { isSouthDakotaShadowPickup, southDakotaRetailerRequest } from './south-dakota-pickup-policy.mjs';

const label = 'Rapid City first-party pickup research';
const config = Object.freeze({
  id: 'SD', label, tier: 'B', active: false, strategy: 'retailer_store_inventory', cadence: 'shadow-only',
  value: 'Closed set of reviewed pickup stores and indexed bottle expressions in Rapid City.',
  sources: [{kind: 'api', label, url: origin + batchPath, precisionOnly: true}], apiCandidates: [],
});
export const southDakotaResearchSource = state => state === 'SD' ? config : null;
export const southDakotaResearchLifecycle = () => ({
  SD: { customerLabel: 'South Dakota', sourceLabel: label, publicStatus: 'research_only', shadowEligible: true,
    lifecycle: 'retailer_inventory_research', coverageTier: 'sparse_live_store_inventory',
    refinementLevel: 'store', inventoryAlertable: false, watchAlertable: false },
});

function reviewedStore(payload, source) {
  if (!Array.isArray(payload) || payload.length !== 3) return null;
  const [organization, checkout, catalog] = payload.map(row => row?.result?.data?.json);
  const merchant = organization?.currentStore;
  if (merchant?.id !== source.id || merchant.publicId !== source.publicId || merchant.name !== source.name
    || merchant.address !== source.address || merchant.city !== city || merchant.state !== 'SD'
    || merchant.zip !== source.zip || merchant.ecomStore?.pickupEnabled !== true
    || checkout?.storeId !== source.id || checkout.checkoutEnabled !== true || checkout.pickupEnabled !== true
    || !Number.isSafeInteger(catalog?.count) || catalog.count < 0 || !Array.isArray(catalog.data)
    || catalog.data.length !== Math.min(20,catalog.count) || catalog.data.some(row => row?.storeId !== source.id)) return null;
  return catalog;
}

export function reviewSouthDakotaPickup(payload, store, bible, observedAt, queryUrl) {
  const source = sources.find(entry => entry.id === store);
  if (!source || !source.terms.some(term => southDakotaRetailerRequest(term) === queryUrl)
    || !Number.isFinite(Date.parse(observedAt))) return null;
  const catalog = reviewedStore(payload, source);
  if (!catalog) return null;
  const signals = [];
  for (const row of catalog.data) {
    const product = source.products.find(([id,upc,title]) => row.publicId === id && row.upc === upc && row.title === title);
    if (!product || row.sizeMl_rollup !== 750 || row.isCase !== false || row.isKeg !== false
      || row.backorderEnabled !== false || (row.packSize != null && row.packSize !== 1)
      || !Array.isArray(row.channels) || !row.channels.includes('Online')
      || !Number.isSafeInteger(row.price) || row.price <= 0 || !Number.isSafeInteger(row.onlineQtyAvailable)
      || row.onlineQtyAvailable <= 0 || !Number.isSafeInteger(row.qtyAvailableStandalone)
      || !Number.isSafeInteger(row.qtyReservedOnline) || row.qtyReservedOnline < 0
      || row.qtyAvailableStandalone - row.qtyReservedOnline < row.onlineQtyAvailable) continue;
    const match = bible.match(product[3]);
    if (match?.record?.canonical !== product[3] || match.confidence !== 1) continue;
    const tier = centralCityHiveRecordMarketTier(match.record, 'SD');
    if (!['limited', 'allocated', 'unicorn'].includes(tier)) continue;
    const id = storeId(source), address = fullAddress(source);
    const price = row.price / 100;
    const proof = {source: 'mr-liquor-sante', shadowOnly: true, storeId: id, storeAddress: address,
      premiseVerified: true, pickupOfferVerified: true, productId: row.publicId, upc: row.upc,
      canonicalBottleId: match.record.id, observedAt, quantitySemantics: 'binary_retailer_orderable_no_exact_count',
      availableToOrder: row.onlineQtyAvailable};
    signals.push({
      id: stableId(['SD', id, row.publicId]), state: 'SD', stateCode: 'SD', eventType: 'retailer_store_inventory_result',
      sourceLabel: source.name + ' first-party pickup inventory', sourceUrl: queryUrl, sourceRuntimeId: sourceId(source),
      productId: row.publicId, canonicalBottleId: match.record.id, canonicalName: match.record.canonical,
      rawName: row.title, tier, locationPrecision: 'store_level', storeId: id, storeName: source.name,
      storeAddress: address, locationName: source.name, city, postalCode: source.zip, observedAt, price,
      quantity: 0, quantityIsExact: false, quantitySemantics: proof.quantitySemantics,
      availabilityStatus: 'in_stock', sourceAvailabilityVerified: true, sourceProductBinding: proof, raw: {shadowOnly:true},
      ...silent,
    });
  }
  return {signals, availableCatalogCount: catalog.count};
}

export async function collectSouthDakotaResearch(incoming, bible, {
  signal, env = process.env, fetchText = fetchReviewedFirstPartyText,
  attemptsFile = path.resolve('out/research-source-attempts/south-dakota-mr-liquor.json'),
  reportDirectory = env.BOURBON_SIGNAL_STATE_OUT_FILE ? path.dirname(env.BOURBON_SIGNAL_STATE_OUT_FILE) : null,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
} = {}) {
  if (env.BOURBON_SIGNAL_SHADOW_MODE !== '1' || incoming !== config) throw Error('South Dakota requires its registered shadow mode.');
  const startedAt = new Date().toISOString();
  const previous = await readFile(attemptsFile, 'utf8').then(JSON.parse).catch(error => {
    if (error.code !== 'ENOENT') throw error;
    return null;
  });
  if (previous !== null && !Number.isFinite(Date.parse(previous?.nextAllowedAt ?? ''))) {
    throw Error('Invalid South Dakota source attempt clock.');
  }
  const requests = [], selected = [], rows = new Map(), roadblocks = [];
  const persist = async (startedMs, delay) => {
    await mkdir(path.dirname(attemptsFile), {recursive: true});
    const temporary = attemptsFile + '.' + randomUUID() + '.tmp';
    try {
      await writeFile(temporary, JSON.stringify({
        startedAt: new Date(startedMs).toISOString(), nextAllowedAt: new Date(startedMs + delay).toISOString(),
      }));
      await rename(temporary, attemptsFile);
    } finally {
      await rm(temporary, {force: true});
    }
  };
  const now = Date.now();
  let attempted = false;
  if (Date.parse(previous?.nextAllowedAt || '') <= now || previous === null) {
    await persist(now, 30 * 60_000);
    attempted = true;
    for (const source of sources) {
      let successful = true;
      for (const term of source.terms) {
        if (requests.length) await sleep(1000);
        signal?.throwIfAborted();
        const url = southDakotaRetailerRequest(term);
        try {
          const response = await fetchText(url, {signal, timeoutMs: 9000, maxBytes: 2 * 1024 * 1024,
            headers: {accept: 'application/json', cookie: 'childStorePublicId=' + source.publicId},
            isAllowedUrl: target => target.href === url,
            onResponse: value => CITYHIVE_DENIAL_STATUSES.has(value.status) ? persist(Date.now(),
              Math.min(30 * 86_400_000, Math.max(86_400_000, (value.retryAfterSeconds || 0) * 1000))) : undefined,
          });
          const observedAt = new Date().toISOString();
          const replay = response.status === 200 && response.url === url
            ? reviewSouthDakotaPickup(JSON.parse(response.text), source.id, bible, observedAt, url) : null;
          const sha256 = replay ? createHash('sha256').update(response.text).digest('hex') : null;
          const artifactPath = sha256 && reportDirectory
            ? `source-captures/${requests.length + 1}-${sha256.slice(0,12)}.json` : null;
          const request = {storeId: storeId(source), query: term, url, status: response.status, observedAt,
            ok: Boolean(replay), sha256, artifactPath};
          requests.push(request);
          if (!replay) throw Error(`Pickup response did not verify (${response.status}).`);
          if (artifactPath) {
            // The retail response exposes operational metadata unrelated to pickup.
            // Retain only the fields the exact-store verifier needs to replay.
            const [organization, checkout, catalog] = JSON.parse(response.text).map(row => row.result.data.json);
            const publicStore = organization.currentStore;
            const capture = [{currentStore: {
              id: publicStore.id, publicId: publicStore.publicId, name: publicStore.name, address: publicStore.address,
              city: publicStore.city, state: publicStore.state, zip: publicStore.zip,
              ecomStore: {pickupEnabled: publicStore.ecomStore.pickupEnabled},
            }}, {storeId: checkout.storeId, pickupEnabled: checkout.pickupEnabled, checkoutEnabled: checkout.checkoutEnabled},
            {count: catalog.count, data: catalog.data.map(row => Object.fromEntries([
              'publicId','upc','title','storeId','price','sizeMl_rollup','isCase','isKeg','backorderEnabled',
              'packSize','channels','onlineQtyAvailable','qtyAvailableStandalone','qtyReservedOnline',
            ].map(key => [key, row[key]])))}].map(json => ({result: {data: {json}}}));
            const safeBody = JSON.stringify(capture);
            await mkdir(path.join(reportDirectory, 'source-captures'), {recursive: true});
            await writeFile(path.join(reportDirectory, artifactPath), safeBody, {flag: 'wx', signal});
            request.retainedCaptureSha256 = createHash('sha256').update(safeBody).digest('hex');
          }
          for (const row of replay.signals) rows.set(row.id,row);
        } catch (error) {
          signal?.throwIfAborted();
          successful = false;
          roadblocks.push({state: 'SD', source: source.name, status: requests.at(-1)?.status ?? 0, error: error.message});
          break;
        }
      }
      if (successful) selected.push(source);
      if (!successful) break;
    }
  }
  const checkedSources = selected.map(source => ({sourceRuntimeId: sourceId(source), label: source.name,
    url: origin, ok: true, status: 200, alertable: false, inventoryAlertable: false, watchAlertable: false}));
  const complete = selected.length === sources.length && requests.length === 3;
  const signals = [...rows.values()], finishedAt = new Date().toISOString();
  return {state: 'SD', label, tier: config.tier, strategy: config.strategy, cadence: config.cadence, startedAt, finishedAt,
    lastGoodAt: complete ? finishedAt : null, status: complete && signals.length ? 'useful' : attempted ? 'no_trusted_inventory' : 'not_due',
    stale: false, signals, sources: checkedSources, sourceResults: checkedSources, roadblocks,
    metadata: {complete, shadowOnly: true, productionActivationAllowed: false, customerDeliveryAllowed: false,
      origin: env.GITHUB_ACTIONS === 'true' ? {
        kind: 'github_actions', repository: env.GITHUB_REPOSITORY, workflowRunId: env.GITHUB_RUN_ID,
        commitSha: env.GITHUB_SHA, runAttempt: env.GITHUB_RUN_ATTEMPT,
      } : {kind: 'local_shadow_not_workflow_issued'},
      verifiedPremises: selected.map(storeId), requests}};
}
