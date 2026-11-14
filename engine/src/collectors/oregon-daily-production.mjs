import { createHash } from 'node:crypto';
import { collectOregonDailyInventory, OREGON_INVENTORY_MAX_AGE_MS, resolveOregonBourbonIdentity } from '../or-daily-inventory.mjs';
import { stableId } from '../core/text.mjs';
import { validateImmutablePromotionEvidence, evaluateStateControl } from '../reliability-policy.mjs';
import { isOregonDailyProductionEvidence, OREGON_DAILY_INVENTORY_URL, OREGON_DAILY_PRODUCTION_COHORT_SHA256, OREGON_DAILY_PRODUCTION_RUNTIME_ID } from '../oregon-daily-production-policy.mjs';
export { OREGON_DAILY_PRODUCTION_RUNTIME_ID };

export const OREGON_DAILY_PRODUCTION_CONFIG = Object.freeze({
  schemaVersion: 1,
  state: 'OR',
  sourceUrl: OREGON_DAILY_INVENTORY_URL,
  runtimeId: OREGON_DAILY_PRODUCTION_RUNTIME_ID,
  identity: 'exact-live-bible-canonical-id-and-name',
  storeIdentity: 'official-store-number-address-city-postal-code',
  quantity: 'positive-safe-integer-exact-source-count',
  observationClock: 'official-inventory-date-preserved',
  maxAgeMs: OREGON_INVENTORY_MAX_AGE_MS,
  alerts: false,
  cohortSha256: OREGON_DAILY_PRODUCTION_COHORT_SHA256,
});
export function oregonDailyProductionSourceConfigHash(manifest) {
  if (!manifest || manifest.state !== 'OR') throw new Error('Unreviewed Oregon production manifest');
  return createHash('sha256').update(JSON.stringify(Object.fromEntries(
    ['lifecycle', 'collector', 'storeIdentity', 'sourceSemantics', 'customerPaths'].map(key => [key, manifest[key]])
  ))).digest('hex');
}

const dateMs = value => Date.parse(String(value || ''));
const sha256 = /^[a-f0-9]{64}$/i;

/** Promotion requires a separately reviewed, immutable OR manifest and lifecycle entry. */
export function oregonDailyProductionAllowed(config, manifest, { env = process.env } = {}) {
  const entry = config?.states?.OR;
  const evidence = entry?.promotionEvidence;
  const policy = { ...config?.reliabilityPolicy?.promotionPolicy,
    minShadowRuns: Math.max(3, Number(config?.reliabilityPolicy?.promotionPolicy?.minShadowRuns) || 3),
    minCanaryRuns: Math.max(2, Number(config?.reliabilityPolicy?.promotionPolicy?.minCanaryRuns) || 2) };
  return Boolean(config?.activeStates?.includes('OR') && entry?.publicStatus === 'active'
    && entry.promotionStage === 'active' && entry.inventoryAlertable === false && entry.watchAlertable === false
    && manifest?.state === 'OR' && manifest.lifecycle?.publicStatus === 'active'
    && manifest.lifecycle?.refinementLevel === 'store'
    && JSON.stringify(manifest.collector?.sourceIds) === JSON.stringify([OREGON_DAILY_PRODUCTION_RUNTIME_ID])
    && manifest.collector?.cohortSha256 === OREGON_DAILY_PRODUCTION_COHORT_SHA256
    && manifest.collector?.cohortSha256 === OREGON_DAILY_PRODUCTION_CONFIG.cohortSha256
    && manifest.storeIdentity?.addressRequired === true
    && manifest.sourceSemantics?.inventoryAlertable === false && manifest.sourceSemantics?.watchAlertable === false
    && Number(evidence?.shadowRuns) >= policy.minShadowRuns && Number(evidence?.canaryRuns) >= policy.minCanaryRuns
    && Number.isFinite(dateMs(evidence?.verifiedAt))
    && evidence.verticalSliceManifest === 'engine/data/state-integration/OR.json'
    && evidence.fixtureContract === 'engine/data/state-fixtures/OR.json'
    && evaluateStateControl('OR', env).collect && evaluateStateControl('OR', env).publishCandidate
    && validateImmutablePromotionEvidence('OR', evidence, policy)
    && evidence.immutableEvidence.provenance.repository === 'tarsagent22/Bourbon-Signal'
    && manifest.evidence?.immutablePromotionEvidence?.sourceConfigHash === oregonDailyProductionSourceConfigHash(manifest)
    && JSON.stringify(manifest.evidence?.immutablePromotionEvidence) === JSON.stringify(evidence.immutableEvidence));
}

/** Maps a saved official daily report. This function performs no network access. */
export function projectOregonDailyProduction(report, bible, { nowMs = Date.now() } = {}) {
  if (report?.schemaVersion !== 'bourbon-signal-or-product-availability-v1' || report.status !== 'ready'
    || report.sourceUrl !== OREGON_DAILY_INVENTORY_URL || !Array.isArray(bible?.records) || !bible.records.length
    || report.bible?.recordsSha256 !== createHash('sha256').update(JSON.stringify(bible.records)).digest('hex')
    || !sha256.test(String(report.sourceSha256 || '')) || !Number.isSafeInteger(report.sourceBytes)
    || report.sourceBytes < 1 || report.sourceBytes > 150_000_000 || !Array.isArray(report.products)) return [];
  const reportClock = dateMs(report.generatedAt);
  if (!Number.isFinite(reportClock) || reportClock > nowMs || nowMs - reportClock > OREGON_INVENTORY_MAX_AGE_MS) return [];
  const reportDate = String(report.sourceReportDate || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!reportDate) return [];
  const reportDay = Date.UTC(Number(reportDate[3]), Number(reportDate[1]) - 1, Number(reportDate[2]));
  const reportDateCheck = new Date(reportDay);
  if (reportDateCheck.getUTCFullYear() !== Number(reportDate[3]) || reportDateCheck.getUTCMonth() !== Number(reportDate[1]) - 1
    || reportDateCheck.getUTCDate() !== Number(reportDate[2])) return [];
  const generated = new Date(reportClock);
  const generatedDay = Date.UTC(generated.getUTCFullYear(), generated.getUTCMonth(), generated.getUTCDate());
  if (!Number.isFinite(reportDay) || Math.round((generatedDay - reportDay) / 86_400_000) < 0
    || Math.round((generatedDay - reportDay) / 86_400_000) > 2) return [];
  const rows = [];
  for (const product of report.products) {
    const identity = resolveOregonBourbonIdentity(product, bible);
    if (identity.status !== 'verified_exact' || identity.match.record.id !== product.canonicalBottleId
      || identity.match.record.canonical !== product.canonicalName || !Array.isArray(product.stores)) continue;
    for (const store of product.stores) {
      const age = nowMs - dateMs(store.inventoryObservedAt);
      if (!Number.isSafeInteger(store.quantity) || store.quantity <= 0 || !Number.isFinite(age) || age < 0 || age > OREGON_INVENTORY_MAX_AGE_MS
        || !/^\d+$/.test(String(store.storeNo || '')) || !String(store.address || '').trim()
        || !String(store.city || '').trim() || !/^\d{5}(?:-\d{4})?$/.test(String(store.zip || '').trim())) continue;
      rows.push({
        id: stableId(['OR', 'or-daily-store', identity.match.record.id, product.size, product.proof, String(store.storeNo)]),
        state: 'OR', stateCode: 'OR', sourceRuntimeId: OREGON_DAILY_PRODUCTION_RUNTIME_ID,
        sourceLabel: 'Oregon OLCC Daily Store Inventory', sourceUrl: OREGON_DAILY_INVENTORY_URL,
        sourceReportSha256: report.sourceSha256, sourceReportGeneratedAt: report.generatedAt,
        sourceAvailabilityVerified: true, sourceStale: false, stale: false,
        sourceProductBinding: { source: 'olcc-daily-report', cohortSha256: OREGON_DAILY_PRODUCTION_COHORT_SHA256,
          itemCode: String(product.itemCode), newItemCode: String(product.newItemCode),
          canonicalBottleId: identity.match.record.id, size: product.size, proof: product.proof, reportSha256: report.sourceSha256,
          reportGeneratedAt: report.generatedAt, sourceQuantity: store.quantity, observedAt: store.inventoryObservedAt },
        type: 'store_inventory_result', event_type: 'store_inventory_result', eventType: 'store_inventory_result',
        locationPrecision: 'store_level', locationName: `Oregon Liquor Store ${store.storeNo}`,
        storeName: String(store.storeName || `Oregon Liquor Store ${store.storeNo}`), storeId: String(store.storeNo),
        storeAddress: `${store.address}, ${store.city}, OR ${store.zip}`, city: store.city, postalCode: String(store.zip),
        canonicalBottleId: identity.match.record.id, canonicalName: identity.match.record.canonical, tier: identity.match.record.tier || product.rarityTier,
        rawName: product.name, size: product.size, proof: product.proof, quantity: store.quantity, quantityIsExact: true,
        price: product.bottlePrice ?? null, observedAt: store.inventoryObservedAt, lastConfirmedAt: store.inventoryObservedAt,
        canAlertAsInventory: false, canAlertAsWatch: false, alertable: false,
        eligibleForOnSite: true, eligibleForDropFeed: true, eligibleForWatch: false,
        eligibleForDelivery: false, deliveryEligible: false, eligibleForEmail: false, eligibleForSms: false,
        previewOnly: false,
        inventorySemantics: 'Exact quantity in the official OLCC daily report, with its original store inventory date. Inventory is not a restock event; confirm with the store before driving.',
      });
    }
  }
  return rows;
}

/** Dormant production wrapper: lifecycle and immutable source configuration gate precede all source work. */
export async function collectOregonDailyProduction(config, manifest, bible, options = {}) {
  if (!oregonDailyProductionAllowed(config, manifest, options)) return {
    signals: [], metadata: { complete: false, blockedByPromotion: true, sourceRequestCount: 0 },
    accounting: { requestCount: 0, bytes: 0, completeSnapshot: false },
  };
  const { nowMs = Date.now(), ...collectorOptions } = options;
  const report = await collectOregonDailyInventory({ bible, terms: [], generatedAt: new Date(nowMs).toISOString(), ...collectorOptions });
  const signals = projectOregonDailyProduction(report, bible, { nowMs });
  return {
    signals,
    metadata: { complete: report.status === 'ready' && signals.length > 0, sourceObservedAt: report.generatedAt,
      sourceReportDate: report.sourceReportDate, sourceReportSha256: report.sourceSha256, sourceRequestCount: report.sourceRequestCount ?? null,
      productionAlertDeliveryAllowed: false, observation: 'official_daily_store_inventory_exact_quantity' },
    accounting: { requestCount: report.sourceRequestCount ?? null, bytes: report.sourceBytes ?? null, completeSnapshot: signals.length > 0 },
  };
}
