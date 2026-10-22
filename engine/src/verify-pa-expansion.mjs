import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { FWGS_REVIEWED_PRODUCT_CONTRACT, FWGS_REVIEWED_PRODUCT_IDENTITIES, FWGS_REVIEWED_SOURCE_HOST } from './collectors/fwgs-reviewed-matching.mjs';
import { confidenceForSignal } from './confidence-policy.mjs';
import { pennsylvaniaDirectFwgsRoadblock } from './collectors/pennsylvania-direct-source-policy.mjs';
import { buildCurrentInventoryAlertsFromDrops } from './export-site-contract.mjs';

export const PENNSYLVANIA_EXPANSION_EXPECTATIONS = Object.freeze({ minimumReviewedPublicRows: 800, minimumReviewedPublicStores: 250, minimumCanonicalRowsPerSku: 1, minimumPublicRowsPerEligibleSku: 1, maximumAgeMs: 2 * 60 * 60_000 });
const SOURCE = 'FWGS store pickup inventory API browser-assisted collector';
const ENDPOINT = '/ccstorex/custom/v1/b2b/get-inventory';
const eligibleTier = (tier) => ['unicorn', 'allocated', 'limited'].includes(tier);
const arrayRows = (payload, key) => Array.isArray(payload) ? payload : Array.isArray(payload?.[key]) ? payload[key] : [];
const skuOf = (row) => String(row?.raw?.product?.sku || row?.sourceProductBinding?.sku || row?.sourceProductProofSku || row?.sourceUrl?.match(/\/product\/(\d+)(?:$|[?#])/)?.[1] || '');
const identity = (row) => [row?.sourceLabel || row?.source, skuOf(row), row?.storeId, row?.sourceUrl].join('|');
const licensee = (row) => /LICENSEE[\s-]+SERVICE[\s-]+CENTER/i.test(`${row?.storeName || ''} ${row?.locationName || ''} ${row?.raw?.store?.name || ''}`) || row?.raw?.locationKind === 'licensee_service_center';
const bySku = new Map(FWGS_REVIEWED_PRODUCT_IDENTITIES.map((row) => [row.sku, row]));

function expectedProof(product) {
  return { contractVersion: FWGS_REVIEWED_PRODUCT_CONTRACT, sourceHost: FWGS_REVIEWED_SOURCE_HOST, sku: product.sku,
    sourceTitle: product.name, sourceBrand: product.brand, sourceCategory: product.category, sourceType: product.type,
    sourceRoute: product.route, sourceProductUrl: `https://${FWGS_REVIEWED_SOURCE_HOST}${product.route}`,
    canonicalBottleId: product.canonicalBottleId, canonicalName: product.canonicalName };
}
const sameProof = (actual, expected) => Boolean(actual && Object.entries(expected).every(([key, value]) => Object.hasOwn(actual, key) && actual[key] === value));
const inPa = (lat, lng) => lat == null && lng == null || Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) && Number(lat) >= 39 && Number(lat) <= 43 && Number(lng) >= -81 && Number(lng) <= -74;

export function diagnosePennsylvaniaExpansionArtifact({ state, drops, alerts, browserArtifact, now = Date.now(), expectations = {} } = {}) {
  const errors = [];
  const check = (condition, message) => { if (!condition) errors.push(message); };
  const expected = { ...PENNSYLVANIA_EXPANSION_EXPECTATIONS, ...expectations };
  for (const [key, value] of Object.entries(expected)) check(Number.isSafeInteger(value) && value >= 0, `Invalid Pennsylvania verifier expectation: ${key}.`);
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  const maxAgeMs = Math.min(PENNSYLVANIA_EXPANSION_EXPECTATIONS.maximumAgeMs, expected.maximumAgeMs);
  const finishedMs = Date.parse(state?.finishedAt);
  const fresh = (row) => { const at = Date.parse(row?.observedAt); return Number.isFinite(at) && at <= nowMs && nowMs - at <= maxAgeMs; };
  const signals = Array.isArray(state?.signals) ? state.signals.filter(Boolean) : [];
  const sourceInventory = signals.filter((row) => row.state === 'PA' && row.eventType === 'store_inventory_result' && row.sourceLabel === SOURCE);
  const reviewed = sourceInventory.filter((row) => bySku.has(skuOf(row)) || row.sourceProductBinding?.contractVersion === FWGS_REVIEWED_PRODUCT_CONTRACT || row.raw?.fwgsBottleMatch?.contractVersion === FWGS_REVIEWED_PRODUCT_CONTRACT);
  check(Number.isFinite(nowMs) && state?.state === 'PA' && state.status === 'useful' && state.stale !== true, 'Pennsylvania expansion requires a fresh useful PA state report.');
  check(state?.precisionMetadata?.directSearchAttempts === 0 && state?.precisionMetadata?.directSearchPolicy === 'retired_known_http_403', 'Pennsylvania must retire known denied direct searches with zero attempts.');
  for (const route of pennsylvaniaDirectFwgsRoadblock().denialEvidence) {
    const results = (state?.sourceResults || []).filter((row) => row.sourceId === route.sourceId);
    check(results.length === 1 && results[0].sourceUrl === route.url && results[0].status === 'disabled' && results[0].attemptCount === 0
      && Array.isArray(results[0].attempts) && results[0].attempts.length === 0 && results[0].checkedAt === route.checkedAt,
    `Known denied FWGS source ${route.sourceId} must remain disabled with zero attempts and its original checkedAt.`);
  }
  check(Number.isFinite(finishedMs) && finishedMs <= nowMs && nowMs - finishedMs <= maxAgeMs, 'Pennsylvania collection state must be within two hours and not in the future.');
  if (browserArtifact) check(browserArtifact.inventoryEndpoint === ENDPOINT && Number.isFinite(Date.parse(browserArtifact.generatedAt)) && Date.parse(browserArtifact.generatedAt) <= nowMs && nowMs - Date.parse(browserArtifact.generatedAt) <= maxAgeMs, 'FWGS browser artifact must retain fresh original pickup provenance.');
  const sourceByIdentity = new Map(sourceInventory.map((row) => [identity(row), row]));
  const sourceCounts = Object.fromEntries(FWGS_REVIEWED_PRODUCT_IDENTITIES.map((row) => [row.sku, 0]));
  for (const row of reviewed) {
    const product = bySku.get(skuOf(row));
    const rawProduct = row.raw?.product;
    const store = row.raw?.store;
    const proof = product && expectedProof(product);
    const sourceUrl = product && `https://${FWGS_REVIEWED_SOURCE_HOST}${product.route}`;
    const productSafe = Boolean(product && ['sku', 'name', 'brand', 'category', 'type', 'route'].every((key) => Object.hasOwn(rawProduct || {}, key) && rawProduct[key] === product[key])
      && row.rawName === product.name && row.sourceUrl === sourceUrl && row.canonicalBottleId === product.canonicalBottleId && row.canonicalName === product.canonicalName
      && sameProof(row.raw?.fwgsBottleMatch, proof) && sameProof(row.sourceProductBinding, proof));
    check(productSafe, `Reviewed FWGS product ${skuOf(row)} has mismatched SKU, title, route, canonical identity or accepted provenance.`);
    const address = store && [store.address1, store.address2, store.city, store.stateAddress, store.postalCode].filter(Boolean).join(', ');
    const premisesSafe = Boolean(store && /^\d+$/.test(String(store.locationId || '')) && String(store.locationId) === String(row.storeId)
      && store.type === 'store' && store.pickUp === true && store.inventory === true && ['US', 'USA'].includes(store.country)
      && store.stateAddress === 'PA' && row.stateCode === 'PA' && store.city === row.city && /^\d{5}(?:-\d{4})?$/.test(String(store.postalCode || ''))
      && address === row.storeAddress && row.locationPrecision === 'store_level' && row.storeName === store.name && inPa(store.latitude, store.longitude)
      && row.raw?.locationKind === 'fwgs_retail_store' && row.raw?.browserAssisted === true && row.raw?.inventoryEndpoint === ENDPOINT
      && row.raw?.sampleOnly !== true && row.sampleOnly !== true && !licensee(row));
    check(premisesSafe, `Reviewed FWGS product ${skuOf(row)} lacks exact consumer retail pickup premises.`);
    const quantitySafe = Number.isSafeInteger(row.quantity) && row.quantity > 0 && row.quantity === row.raw?.quantity && row.quantityIsExact !== false;
    check(quantitySafe && row.availabilityStatus === 'IN_STOCK' && row.stale !== true && row.sourceStale !== true && row.canAlertAsInventory !== false && confidenceForSignal(row).canAlertAsInventory,
      `Reviewed FWGS product ${skuOf(row)} lacks positive alertable store pickup quantity.`);
    check(fresh(row) && row.observedAt === row.raw?.generatedAt && Date.parse(row.observedAt) <= finishedMs
      && (!browserArtifact || row.observedAt === browserArtifact.generatedAt), `Reviewed FWGS product ${skuOf(row)} has stale, future or false-fresh source observation.`);
    if (product && productSafe && premisesSafe && quantitySafe) sourceCounts[product.sku] += 1;
  }
  for (const product of FWGS_REVIEWED_PRODUCT_IDENTITIES) check(sourceCounts[product.sku] >= expected.minimumCanonicalRowsPerSku, `Reviewed canonical FWGS SKU ${product.sku} is missing from consumer store inventory.`);
  check(!signals.some((row) => licensee(row) && row.canAlertAsInventory === true), 'Licensee Service Center diagnostics cannot be consumer inventory-alertable.');

  const publicRows = arrayRows(drops, 'drops').filter((row) => row?.state === 'PA' || row?.stateCode === 'PA');
  const reviewedPublic = publicRows.filter((row) => bySku.has(skuOf(row)));
  const uniquePublic = new Set(reviewedPublic.map(identity));
  check(uniquePublic.size === reviewedPublic.length, 'Duplicate reviewed PA public identities cannot inflate expansion coverage.');
  const sameSource = (row, source) => Boolean(source && String(row.storeId) === String(source.storeId) && row.sourceUrl === source.sourceUrl
    && row.storeAddress === source.storeAddress && row.city === source.city && row.observedAt === source.observedAt
    && Number(row.quantity) === Number(source.quantity) && Number(row.price) === Number(source.price)
    && row.canonicalBottleId === source.canonicalBottleId && row.canonicalName === source.canonicalName);
  const publicCounts = Object.fromEntries(FWGS_REVIEWED_PRODUCT_IDENTITIES.map((row) => [row.sku, 0]));
  for (const row of reviewedPublic) {
    const product = bySku.get(skuOf(row));
    const source = sourceByIdentity.get(identity(row));
    check(row.type === 'store_inventory_result' && row.locationPrecision === 'store_level' && row.canAlertAsInventory === true
      && Number(row.quantity) > 0 && row.quantityIsExact !== false && fresh(row) && row.stale !== true && row.sourceStale !== true
      && !licensee(row) && eligibleTier(row.tier) && row.tier === product.tier && sameSource(row, source)
      && sameProof(row.sourceProductBinding, expectedProof(product)), `Published FWGS SKU ${product.sku} lost exact positive source, store, product or observation proof.`);
    const priceChange = ['price_drop', 'price_change'].includes(row.listingChange) && row.listingChangedAt === row.displayAt;
    const falseFresh = !priceChange && row.firstSeenAt && row.lastConfirmedAt && row.firstSeenAt !== row.lastConfirmedAt && (row.displayAt === row.lastConfirmedAt || row.timestampBasis === 'last_confirmed_at');
    check(!falseFresh && (!row.lastConfirmedAt || row.lastConfirmedAt === source?.observedAt), `Published FWGS SKU ${product.sku} falsely renews its observation or display clock.`);
    publicCounts[product.sku] += 1;
  }
  for (const product of FWGS_REVIEWED_PRODUCT_IDENTITIES) {
    if (eligibleTier(product.tier)) check(publicCounts[product.sku] >= expected.minimumPublicRowsPerEligibleSku, `Public-eligible reviewed FWGS SKU ${product.sku} did not survive publication.`);
    else check(publicCounts[product.sku] === 0, `Standard reviewed FWGS SKU ${product.sku} must not be promoted into the public rare-bottle feed.`);
  }
  const publicStores = new Set(reviewedPublic.map((row) => row.storeId));
  check(uniquePublic.size >= expected.minimumReviewedPublicRows, 'Reviewed PA public inventory is below the conservative 800-row expansion floor.');
  check(publicStores.size >= expected.minimumReviewedPublicStores, 'Reviewed PA public inventory is below the conservative 250-store expansion floor.');
  check(!publicRows.some((row) => licensee(row) && row.canAlertAsInventory === true), 'Published Licensee Service Center rows cannot be consumer inventory-alertable.');

  const publishedAlerts = arrayRows(alerts, 'alerts').filter((row) => row?.state === 'PA' || row?.stateCode === 'PA');
  const candidateKeys = publishedAlerts.map((row) => row.dedupeKey || row.id);
  check(candidateKeys.every((key) => typeof key === 'string' && key.trim()) && new Set(candidateKeys).size === publishedAlerts.length, 'PA alert candidate keys must be unique and nonempty (dedupeKey || id).');
  const publicByIdentity = new Map(publicRows.map((row) => [identity(row), row]));
  for (const row of publishedAlerts) {
    check(row.action === 'inventory_alert_candidate' && row.actionabilityClass === 'store_inventory' && row.eventType === 'store_inventory_result'
      && row.locationPrecision === 'store_level' && Number(row.quantity) > 0 && row.quantityIsExact !== false && fresh(row)
      && row.stale !== true && row.sourceStale !== true && !licensee(row) && row.availabilityStatus === 'IN_STOCK', 'PA alerts cannot contain stale, aggregate, watch or Licensee Service Center inventory.');
    if (bySku.has(skuOf(row))) check(sameSource(row, publicByIdentity.get(identity(row))), `Reviewed PA alert SKU ${skuOf(row)} lost its accepted public source binding.`);
  }
  const eligibleCurrentReviewed = buildCurrentInventoryAlertsFromDrops(publicRows).filter((row) => bySku.has(skuOf(row)));
  const eligibleCurrentIdentities = new Set(eligibleCurrentReviewed.map(identity));
  check(reviewedPublic.every((row) => eligibleCurrentIdentities.has(identity(row))), 'Every reviewed current public PA row must qualify through the current-inventory alert pipeline before publication caps.');
  const reviewedAlerts = publishedAlerts.filter((row) => bySku.has(skuOf(row)));
  check(reviewedAlerts.length > 0, 'At least one source-bound reviewed PA alert candidate must survive publication caps.');
  check(new Set([drops?.runId, alerts?.runId].filter(Boolean)).size <= 1, 'Pennsylvania public drops and alerts belong to different export runs.');
  return { status: errors.length ? 'failed' : 'ok', errors, stateStatus: state?.status || null, sourceRows: reviewed.length, sourceRowsBySku: sourceCounts,
    publicRows: uniquePublic.size, publicStores: publicStores.size, publicRowsBySku: publicCounts,
    publicEligibleSkus: FWGS_REVIEWED_PRODUCT_IDENTITIES.filter((product) => eligibleTier(product.tier)).map((product) => product.sku),
    matchedStandardSkus: FWGS_REVIEWED_PRODUCT_IDENTITIES.filter((product) => !eligibleTier(product.tier)).map((product) => product.sku),
    alerts: publishedAlerts.length, publishedReviewedAlerts: reviewedAlerts.length, eligibleCurrentReviewedAlerts: eligibleCurrentReviewed.length, maximumAgeMinutes: maxAgeMs / 60_000 };
}

export function verifyPennsylvaniaExpansionArtifact(input) {
  const result = diagnosePennsylvaniaExpansionArtifact(input);
  if (result.errors.length) { const error = new Error(`Pennsylvania expansion verification failed:\n${result.errors.map((message) => `- ${message}`).join('\n')}`); error.diagnostics = result; throw error; }
  return result;
}

async function main() {
  const out = path.resolve(process.env.BOURBON_SIGNAL_OUT_DIR || 'out');
  const diagnosticPath = path.join(out, 'pa-expansion-verification.json');
  await mkdir(out, { recursive: true });
  let input;
  let diagnostics;
  try {
    const [state, drops, alerts, browserArtifact] = await Promise.all(['states/PA.json', 'site/drops.json', 'site/alerts.json', 'browser/fwgs-store-inventory.json'].map(async (file) => JSON.parse(await readFile(path.join(out, file), 'utf8'))));
    input = { state, drops, alerts, browserArtifact };
    diagnostics = diagnosePennsylvaniaExpansionArtifact(input);
  } catch (error) { diagnostics = { status: 'failed', errors: [`Unable to read or evaluate PA expansion artifacts: ${error.message}`] }; }
  await writeFile(diagnosticPath, JSON.stringify({ checkedAt: new Date().toISOString(), runId: input?.drops?.runId || null, ...diagnostics,
    alertCandidateIdentities: arrayRows(input?.alerts, 'alerts').filter((row) => row?.state === 'PA').map((row) => ({ sourceIdentity: identity(row), id: row.id, dedupeKey: row.dedupeKey, changeType: row.changeType, observedAt: row.observedAt, canonicalBottleId: row.canonicalBottleId, quantity: row.quantity })) }, null, 2));
  if (diagnostics.status !== 'ok') throw new Error(`Pennsylvania expansion verification failed:\n${diagnostics.errors.join('\n')}`);
  console.log(JSON.stringify(diagnostics, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main().catch((error) => { console.error(error.message || error); process.exitCode = 1; });
