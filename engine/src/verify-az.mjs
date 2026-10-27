import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { isArizonaRetailerInventory } from './arizona-retailer-policy.mjs';
import classification from '../../src/data/drop-feed-classification.generated.json' with { type: 'json' };
import { librarySearchPool } from './library-query-plan.mjs';
import { libraryIdentityKey } from './core/library-catalog.mjs';
import { stripHtml } from './core/text.mjs';
import { arizonaXapiLibraryIdentity } from './collectors/arizona-xapi-library-identity.mjs';
import { metroBottleMatch } from './collectors/arizona-metro-retailer-proof.mjs';
import { isPublicDropFeedEligible } from '../../src/lib/public-drop-evidence.ts';
import { ARIZONA_XAPI_BASELINE_STORE_IDS, ARIZONA_XAPI_PREVIOUS_STORE_IDS, ARIZONA_XAPI_SEARCH_LIMIT, ARIZONA_XAPI_SEARCH_ROWS, ARIZONA_XAPI_RARE_QUERY_LIMIT } from './collectors/arizona-xapi.mjs';

export const ARIZONA_EXPANSION_EXPECTATIONS = Object.freeze({
  minimumSelectedStores: 134, minimumBaselineStores: 24, minimumAddedStores: 110,
  minimumPositiveXapiStores: 120, minimumAddedPublicStores: 95, minimumPublicRows: 450,
  minimumNewSelectedStores: 6, minimumNewPublicStores: 4,
  minimumReviewedDepthRows: 120, minimumSmartFinalStores: 2,
  maximumSearchCount: ARIZONA_XAPI_SEARCH_LIMIT, maximumRareSearchCount: ARIZONA_XAPI_RARE_QUERY_LIMIT, maximumAgeMs: 2 * 60 * 60_000,
});
const inventoryType = (row) => /^(?:cityhive|retailer)_store_inventory_result$/.test(String(row?.eventType || row?.type || ''));
const xapiType = (row) => /^(?:Safeway|Albertsons) Arizona XAPI store inventory$/.test(String(row?.sourceLabel || row?.source || ''));
const text = (value) => String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
const productId = (row) => String(row?.productId || row?.raw?.product?.id || row?.raw?.option?.product_id || '');
const identity = (row) => [row?.sourceLabel || row?.source, row?.sourceChain, row?.merchantId, row?.storeId, productId(row), row?.sourceUrl].join('|');
const rows = (payload, key) => Array.isArray(payload) ? payload : Array.isArray(payload?.[key]) ? payload[key] : [];
const numericStatus = (value) => Number(String(value || '').match(/^(?:http[_ -]?)?(\d{3})$/i)?.[1] || 0);

function miniature(row) {
  const size = row?.raw?.option?.option_params?.size;
  const explicit = size && Number(size.quantity) * (String(size.measure).toLowerCase() === 'l' ? 1000 : 1);
  if (explicit > 0 && explicit < 375) return true;
  return [...`${row?.rawName || ''} ${row?.canonicalName || ''} ${row?.bottleName || ''}`.matchAll(/\b(\d+(?:\.\d+)?)\s*(ml|l|liter)\b/gi)]
    .some((match) => Number(match[1]) * (/^l/i.test(match[2]) ? 1000 : 1) < 375);
}

function sentinelPromotion(row) {
  if (Number(row?.raw?.reportedQuantity || 0) < 100) return false;
  const option = row?.raw?.option;
  const detail = row?.raw?.detailEvidence;
  return Number(row?.quantity || 0) !== 0 || row?.sourceAvailabilityVerified !== true
    || row?.raw?.quantitySemantics !== 'binary_detail_availability'
    || !option?.option_id || String(detail?.productID || '') !== String(option.option_id)
    || detail?.availability !== 'http://schema.org/InStock';
}

function validPremises(entry) {
  return /^(?:safeway|albertsons):\d{2,6}$/.test(String(entry?.storeId || ''))
    && typeof entry?.city === 'string' && /[a-z]/i.test(entry.city)
    && typeof entry?.address === 'string' && /^\d[^,]*,\s*[^,]+,\s*AZ\s+\d{5}(?:-\d{4})?$/.test(entry.address)
    && text(entry.address.match(/,\s*([^,]+),\s*AZ\s+\d{5}/)?.[1]) === text(entry.city);
}

export function diagnoseArizonaExpansionArtifact({ state, drops, stats, alerts, now = Date.now(), expectations = {}, libraryRecords = classification.records, bibleRecords } = {}) {
  const errors = [];
  const check = (condition, message) => { if (!condition) errors.push(message); };
  const expected = { ...ARIZONA_EXPANSION_EXPECTATIONS, ...expectations };
  const libraryBible = { records: bibleRecords || libraryRecords.map(bottle => ({ id: bottle.id, canonical: bottle.canonicalName, libraryIdentities: [bottle] })) };
  const allowedTerms = new Set(['bourbon', 'whiskey', "blanton's", 'weller', 'buffalo trace', 'e.h. taylor', ...librarySearchPool({records:libraryRecords.map(bottle => ({libraryIdentities:[bottle]}))})]);
  for (const [key, value] of Object.entries(expected)) check(Number.isSafeInteger(value) && value >= 0, `Invalid verifier expectation: ${key}.`);
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  const startMs = Date.parse(state?.startedAt);
  const finishMs = Date.parse(state?.finishedAt);
  const ageLimit = Math.min(ARIZONA_EXPANSION_EXPECTATIONS.maximumAgeMs, expected.maximumAgeMs);
  const currentObservation = (row) => {
    const at = Date.parse(row?.observedAt);
    return Number.isFinite(at) && at >= startMs && at <= finishMs && at <= nowMs && nowMs - at <= ageLimit;
  };
  const signals = Array.isArray(state?.signals) ? state.signals : [];
  const inventory = signals.filter(inventoryType);
  const xapi = inventory.filter(xapiType);
  const metadata = state?.precisionMetadata?.xapi;
  check(Number.isFinite(nowMs), 'Current verification time must be valid.');
  check(state?.state === 'AZ' && state?.status === 'useful' && state?.stale !== true, 'Arizona state must be fresh and useful.');
  check(Number.isFinite(startMs) && Number.isFinite(finishMs) && startMs <= finishMs && finishMs <= nowMs && nowMs - finishMs <= ageLimit, 'Arizona runtime must finish within two hours and cannot be in the future.');
  check(inventory.length > 0, 'Arizona state has no inventory.');
  check(!inventory.some((row) => !isArizonaRetailerInventory(row) || row.canAlertAsInventory !== true || row.stale === true || row.sourceStale === true || row.raw?.staleFallback === true), 'Arizona inventory fails retailer identity, premises, stock or freshness policy.');
  check(!inventory.some((row) => !currentObservation(row)), 'Inventory observation must retain its original timestamp inside the current runtime window.');
  check(!inventory.some(miniature), 'Miniature formats must not enter Arizona inventory.');
  check(!inventory.some(sentinelPromotion), 'CityHive sentinels must not be promoted into exact inventory.');
  check(!signals.some((row) => (/catalog|watch/i.test(String(row.eventType || '')) || row.availabilityStatus === 'catalog_listed') && row.canAlertAsInventory === true), 'Catalog or watch rows must not be promoted into inventory.');

  const selected = Array.isArray(metadata?.selectedStores) ? metadata.selectedStores : [];
  const baseline = Array.isArray(metadata?.baselineStores) ? metadata.baselineStores : [];
  const added = Array.isArray(metadata?.addedStores) ? metadata.addedStores : [];
  const byStore = new Map(selected.map((entry) => [entry?.storeId, entry]));
  const baselineIds = new Set(ARIZONA_XAPI_BASELINE_STORE_IDS);
  const expectedBaseline = selected.filter((entry) => baselineIds.has(String(entry?.storeId).split(':')[1]));
  const expectedAdded = selected.filter((entry) => !baselineIds.has(String(entry?.storeId).split(':')[1]));
  const previousIds = new Set(ARIZONA_XAPI_PREVIOUS_STORE_IDS);
  const newStores = selected.filter((entry) => !previousIds.has(String(entry?.storeId).split(':')[1]));
  const sameEntries = (actual, desired) => actual.length === desired.length && new Set(actual.map((entry) => entry?.storeId)).size === actual.length
    && actual.every((entry) => desired.some((row) => row?.storeId === entry?.storeId && row?.address === entry?.address && row?.city === entry?.city));
  check(Boolean(metadata), 'Current XAPI collection metadata is required.');
  check(selected.length >= expected.minimumSelectedStores && byStore.size === selected.length && selected.every(validPremises)
    && new Set(selected.map((entry) => text(entry?.address))).size === selected.length, 'XAPI selection must contain unique exact Arizona stores and addresses at the required depth.');
  check(sameEntries(baseline, expectedBaseline) && baseline.length >= expected.minimumBaselineStores, 'XAPI baseline store selection is missing or misclassified.');
  check(sameEntries(added, expectedAdded) && added.length >= expected.minimumAddedStores, 'XAPI added store selection is missing or misclassified.');
  if (expected.minimumBaselineStores === 24) check(ARIZONA_XAPI_BASELINE_STORE_IDS.every((id) => selected.some((entry) => String(entry?.storeId).split(':')[1] === id)), 'All 24 protected baseline XAPI stores must remain selected.');
  if (expected.minimumNewSelectedStores > 0) check(ARIZONA_XAPI_PREVIOUS_STORE_IDS.every((id) => selected.some((entry) => String(entry?.storeId).split(':')[1] === id)), 'All 128 previously released XAPI stores must remain selected.');
  check(newStores.length >= expected.minimumNewSelectedStores, 'Selection does not reach the genuinely new store floor against the released 128-store cohort.');

  const requests = Array.isArray(metadata?.requests) ? metadata.requests : [];
  const search = requests.filter((request) => request?.kind === 'inventory');
  const bourbon = search.filter((request) => request.term === 'bourbon');
  const whiskey = search.filter((request) => request.term === 'whiskey');
  const rare = search.filter((request) => !['bourbon', 'whiskey'].includes(request.term));
  const blockedHosts = new Set();
  const successfulQueries = new Set();
  const bourbonStores = new Set();
  for (const request of requests) {
    let url;
    try { url = new URL(request?.url); } catch { check(false, 'XAPI request ledger contains an invalid URL.'); continue; }
    check(url.protocol === 'https:' && !url.username && !url.password && !url.hash, 'XAPI request ledger contains an unsafe URL.');
    check(!blockedHosts.has(url.host), `XAPI made a request after denial on ${url.host}.`);
    if ([401, 403, 429].includes(numericStatus(request.status))) blockedHosts.add(url.host);
    if (request.kind === 'inventory') {
      const banner = url.hostname.match(/^www\.(safeway|albertsons)\.com$/)?.[1];
      const storeKey = `${banner}:${request.storeId}`;
      const binding = Boolean(banner && url.origin === `https://www.${banner}.com` && byStore.has(storeKey) && url.pathname === '/abs/pub/xapi/search/substitute'
        && url.searchParams.get('storeid') === String(request.storeId) && url.searchParams.get('q') === request.term
        && url.searchParams.get('rows') === String(ARIZONA_XAPI_SEARCH_ROWS) && url.searchParams.get('start') === '0'
        && url.searchParams.get('channel') === 'instore' && url.searchParams.get('banner') === banner);
      check(binding, 'XAPI inventory request does not bind the selected store, query and bounded page.');
      check(allowedTerms.has(request.term), 'XAPI request contains an unreviewed search term.');
      if (request.term === 'bourbon') bourbonStores.add(storeKey);
      if (binding && numericStatus(request.status) === 200 && request.ok === true) successfulQueries.add(`${storeKey}|${request.term}`);
    } else check(request.kind === 'resolver' && url.origin === 'https://www.safeway.com' && url.pathname === '/abs/pub/xapi/storeresolver/v2/all'
      && /^\d{5}$/.test(url.searchParams.get('zipcode') || '') && url.searchParams.get('radius') === '50' && url.searchParams.get('size') === '100', 'XAPI resolver request violates the configured public route.');
  }
  check(search.length === metadata?.totalSearchCount && bourbon.length === metadata?.bourbonSearchCount && rare.length === metadata?.rareSearchCount && whiskey.length === (metadata?.whiskeySearchCount || 0), 'XAPI search counts do not match the request ledger.');
  check(search.length <= Math.min(ARIZONA_XAPI_SEARCH_LIMIT, expected.maximumSearchCount) && rare.length <= Math.min(ARIZONA_XAPI_RARE_QUERY_LIMIT, expected.maximumRareSearchCount) && metadata?.maxSearchCount === ARIZONA_XAPI_SEARCH_LIMIT, 'XAPI request budget exceeds the bounded broad and library query caps.');
  check(bourbon.length === selected.length && bourbonStores.size === selected.length && selected.every((entry) => bourbonStores.has(entry?.storeId)), 'Each selected XAPI store must receive exactly one bourbon query.');
  for (const row of xapi) {
    const entry = byStore.get(row.storeId);
    const id = productId(row);
    const sourceUrl = `https://www.${row.sourceChain}.com/shop/product-details.${id}.html`;
    const rawQuantity = row.raw?.channelInventory?.instoreItemQty ?? row.raw?.channelInventory?.inStoreItemQty;
    const channelPositive = String(row.raw?.channelInventory?.instore ?? row.raw?.channelInventory?.inStore ?? '') === '1';
    const quantitySafe = rawQuantity == null ? Number(row.quantity || 0) === 0 && row.quantityIsExact !== true
      : rawQuantity !== '' && Number.isFinite(Number(rawQuantity)) && Number(rawQuantity) > 0 && Number(row.quantity) === Number(rawQuantity) && row.quantityIsExact !== false;
    check(Boolean(entry && entry.address === row.storeAddress && entry.city === row.city && row.sourceUrl === sourceUrl
      && /^\d+$/.test(id) && String(row.raw?.product?.pid || '') === id && /^\d+$/.test(String(row.raw?.product?.upc || ''))
      && successfulQueries.has(`${row.storeId}|${row.raw?.queryTerm}`)), 'XAPI inventory lacks matching store, product URL or successful request evidence.');
    check(channelPositive && quantitySafe, 'XAPI stock or exact quantity contradicts the original channel evidence.');
    if (row.sourceBottleMatchMethod === 'exact-arizona-library-identity' || row.raw?.product?.name) {
      const match = arizonaXapiLibraryIdentity({ ...row.raw?.product, storeId: row.raw?.merchantId }, libraryBible, { storeId: String(row.merchantId) });
      const names = match.record?.libraryIdentities?.flatMap(bottle => [bottle.canonicalName, ...bottle.aliases]) || [];
      check(stripHtml(row.raw?.product?.name) === row.rawName && Boolean(match.record)
        && names.some(name => libraryIdentityKey(name) === libraryIdentityKey(row.canonicalName)),
      'XAPI library identity lost its original title, strength, package or complete expression proof.');
    }
  }
  const positiveStores = new Set(xapi.map((row) => row.storeId));
  check(positiveStores.size >= expected.minimumPositiveXapiStores, 'XAPI positive inventory does not reach the required store floor.');

  const published = rows(drops, 'drops').filter((row) => row?.state === 'AZ' || row?.stateCode === 'AZ');
  const metroRequests = state?.precisionMetadata?.metro?.sources?.flatMap(source => source.requests || []) || [];
  const metroSuccessful = new Set(metroRequests.filter(r => r.ok === true && numericStatus(r.status) === 200).map(r => r.url));
  for (const row of inventory.filter(row => ['mesa-liquor','best-liquor-tempe','liquor-wheel-2-phoenix'].includes(row.sourceChain))) {
    const proof = row.sourceProductBinding;
    const match = metroBottleMatch(proof?.identityName || row.rawName, libraryBible);
    check(Boolean(match) && match.id === row.canonicalBottleId
      && (row.sourceChain === 'liquor-wheel-2-phoenix' ? metroSuccessful.has(row.sourceUrl) : metroSuccessful.has(proof?.premiseUrl) && metroSuccessful.has(proof?.productQueryUrl)),
    'Phoenix metro inventory lost its complete bottle identity or successful current source proof.');
  }
  const inventoryCandidates = published.filter(inventoryType);
  const sourceByIdentity = new Map(inventory.map((row) => [identity(row), row]));
  const disabledKeys = new Set(libraryRecords.filter(bottle => bottle.isAlertEligible === false)
    .flatMap(bottle => [bottle.canonicalName, ...bottle.aliases]).map(libraryIdentityKey));
  const explicitlyDisabled = row => {
    const source = sourceByIdentity.get(identity(row));
    return Boolean(source && disabledKeys.has(libraryIdentityKey(source.canonicalName)));
  };
  const publicInventory = inventoryCandidates.filter(row => !explicitlyDisabled(row) && isPublicDropFeedEligible(row));
  const publicIdentities = new Set(publicInventory.map(identity));
  check(new Set(inventoryCandidates.map(identity)).size === inventoryCandidates.length, 'Duplicate published Arizona inventory identities cannot inflate public coverage.');
  const matchSource = (row, source) => Boolean(source && row.storeAddress === source.storeAddress && row.city === source.city
    && row.observedAt === source.observedAt && Number(row.quantity || 0) === Number(source.quantity || 0)
    && Number(row.price || 0) === Number(source.price || 0) && row.availabilityStatus === source.availabilityStatus
    && !(source.quantityIsExact === false && row.quantityIsExact !== false) && !(Number(source.quantity || 0) === 0 && row.quantityIsExact === true));
  for (const row of inventoryCandidates) check(isArizonaRetailerInventory(row)
    && (explicitlyDisabled(row)
      ? row.canAlertAsInventory === false && row.canAlertAsWatch === false && row.eligibleForOnSite === false
      : row.canAlertAsInventory === true)
    && currentObservation(row)
    && row.stale !== true && row.sourceStale !== true && !miniature(row) && ['unicorn', 'allocated', 'limited'].includes(row.tier)
    && matchSource(row, sourceByIdentity.get(identity(row))), 'Published Arizona inventory lost original source, store, product, price, quantity or observation proof.');
  check(!published.some((row) => !inventoryType(row) && row.canAlertAsInventory === true), 'Published catalog or watch rows cannot claim inventory.');
  check(publicIdentities.size >= expected.minimumPublicRows, 'Published current Arizona inventory fell below the public inventory floor.');
  const addedPublicStores = new Set(publicInventory.filter((row) => added.some((entry) => entry?.storeId === row.storeId)).map((row) => row.storeId));
  check(addedPublicStores.size >= expected.minimumAddedPublicStores, 'No added XAPI store survived into current public inventory.');
  const newPublicStores = new Set(publicInventory.filter((row) => newStores.some((entry) => entry.storeId === row.storeId)).map((row) => row.storeId));
  check(newPublicStores.size >= expected.minimumNewPublicStores, 'Genuinely new stores do not reach the current public inventory floor.');
  const buffalo = publicInventory.filter((row) => xapiType(row) && productId(row) === '960051942' && sourceByIdentity.get(identity(row))?.canonicalName === 'Buffalo Trace Bourbon');
  check(buffalo.length > 0, 'Exact Buffalo Trace XAPI product 960051942 must survive public export.');
  const reviewedDepthRows = publicInventory.filter(row => xapiType(row) && ['970022436', '970468334', '960293806'].includes(productId(row)));
  check(reviewedDepthRows.length >= expected.minimumReviewedDepthRows, 'Reviewed Arizona bottle depth must survive current public export.');
  const smartFinal = inventory.filter(row => row.sourceChain === 'smart-final');
  const smartRequests = state?.precisionMetadata?.smartFinal?.requests || [];
  const smartSuccessful = new Set(smartRequests.filter(r => numericStatus(r.status) === 200).map(r => r.url));
  check(smartRequests.length <= 90, 'Smart & Final exceeded its bounded discovery and store requests.');
  for (const row of smartFinal) check(smartSuccessful.has(row.sourceUrl)
    && row.sourceProductBinding?.storeAddress === row.storeAddress && row.quantity === 0 && row.quantityIsExact === false,
  'Smart & Final inventory lost its current successful request, premise binding or unknown quantity semantics.');
  const smartPublicStores = new Set(publicInventory.filter(row => row.sourceChain === 'smart-final').map(row => row.storeId));
  check(smartPublicStores.size >= expected.minimumSmartFinalStores, 'New Smart & Final stores must survive current public export.');
  const coverage = stats?.stateCoverage?.states?.filter((row) => row.state === 'AZ') || [];
  check(coverage.length === 1 && coverage[0].coverageTier === 'live_store_inventory' && coverage[0].publicStatus === 'active', 'Published Arizona stats must identify active live_store_inventory coverage.');
  const publishedAlerts = rows(alerts, 'alerts').filter((row) => row?.state === 'AZ' || row?.stateCode === 'AZ');
  const alertCandidateKeys = publishedAlerts.map((row) => row.dedupeKey || row.id);
  check(alertCandidateKeys.every((key) => typeof key === 'string' && key.trim().length > 0)
    && new Set(alertCandidateKeys).size === publishedAlerts.length, 'Arizona alert candidate keys must be unique and nonempty (dedupeKey || id).');
  const publicByIdentity = new Map(publicInventory.map((row) => [identity(row), row]));
  for (const row of publishedAlerts) check(row.action === 'inventory_alert_candidate' && row.actionabilityClass === 'store_inventory' && inventoryType(row)
    && currentObservation(row) && row.stale !== true && row.sourceStale !== true && row.availabilityStatus === 'in_stock'
    && matchSource(row, publicByIdentity.get(identity(row))), 'Arizona alerts cannot contain watch, stale, catalog or unbound inventory.');
  check(new Set([drops?.runId, stats?.runId, alerts?.runId].filter(Boolean)).size <= 1, 'Published Arizona artifacts belong to different export runs.');
  return { status: errors.length ? 'failed' : 'ok', errors, stateStatus: state?.status || null, inventorySignals: inventory.length, xapiInventorySignals: xapi.length,
    selectedStores: selected.length, baselineStores: baseline.length, addedStores: added.length, positiveXapiStores: positiveStores.size,
    publicRows: publicIdentities.size, addedPublicStores: addedPublicStores.size, buffaloTracePublicRows: buffalo.length, alerts: publishedAlerts.length,
    newSelectedStores: newStores.length, newPublicStores: newPublicStores.size, reviewedDepthRows: reviewedDepthRows.length, smartFinalPublicStores: smartPublicStores.size,
    candidateInventoryRows: inventoryCandidates.length, catalogDisabledCandidateRows: inventoryCandidates.filter(explicitlyDisabled).length,
    searchCount: search.length, bourbonSearchCount: bourbon.length, whiskeySearchCount: whiskey.length, rareSearchCount: rare.length, maximumAgeMinutes: ageLimit / 60_000 };
}

export function verifyArizonaExpansionArtifact(input) {
  const result = diagnoseArizonaExpansionArtifact(input);
  if (result.errors.length) {
    const error = new Error(`Arizona expansion verification failed:\n${result.errors.map((message) => `- ${message}`).join('\n')}`);
    error.diagnostics = result;
    throw error;
  }
  return result;
}

async function main() {
  const out = path.resolve(process.env.BOURBON_SIGNAL_OUT_DIR || 'out');
  const [state, drops, stats, alerts] = await Promise.all(['states/AZ.json', 'site/drops.json', 'site/stats.json', 'site/alerts.json']
    .map(async (file) => JSON.parse(await readFile(path.join(out, file), 'utf8'))));
  const catalog = JSON.parse(await readFile(path.join(out, 'library-catalog.json'), 'utf8').catch(error => { if (error.code === 'ENOENT') return JSON.stringify(classification); throw error; }));
  const bible = JSON.parse(await readFile(path.join(out, 'bourbon-bible.json'), 'utf8'));
  const input = { state, drops, stats, alerts, libraryRecords: catalog.records, bibleRecords: bible.records };
  const diagnostics = diagnoseArizonaExpansionArtifact(input);
  await writeFile(path.join(out, 'az-expansion-verification.json'), JSON.stringify({
    checkedAt: new Date().toISOString(), runId: stats.runId, ...diagnostics,
    alertCandidateIdentities: rows(alerts, 'alerts').filter((row) => row?.state === 'AZ' || row?.stateCode === 'AZ').map((row) => ({
      sourceIdentity: identity(row), id: row.id, dedupeKey: row.dedupeKey, changeType: row.changeType,
      observedAt: row.observedAt, canonicalBottleId: row.canonicalBottleId, quantity: row.quantity, price: row.price,
    })),
  }, null, 2));
  console.log(JSON.stringify(verifyArizonaExpansionArtifact(input), null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(error.message || error); process.exitCode = 1; });
}
