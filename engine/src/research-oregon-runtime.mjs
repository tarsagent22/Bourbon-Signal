import { readFile } from 'node:fs/promises';
import { stableId } from './core/text.mjs';
import { OREGON_DAILY_INVENTORY_URL, resolveOregonBourbonIdentity } from './or-daily-inventory.mjs';

const SOURCE_NAME = 'Oregon OLCC Daily Store Inventory';
const REPORT_PATH = 'out/browser/OR-product-availability.json';
const CONFIG = Object.freeze({
  id: 'OR',
  label: SOURCE_NAME,
  tier: 'A',
  strategy: 'inventory_locator',
  cadence: 'shadow-only',
  active: false,
});

export function oregonResearchSourceForState(state) {
  return state === 'OR' ? CONFIG : null;
}

export function collectOregonDailySignals(report, bible) {
  const signals = [];
  const roadblocks = [];
  if (report.sourceUrl !== OREGON_DAILY_INVENTORY_URL) throw new Error('An official OLCC daily inventory report is required.');
  for (const product of report.products || []) {
    if (!Array.isArray(product.stores) || !product.stores.length) continue;
    const identityCheck = resolveOregonBourbonIdentity(product, bible);
    if (identityCheck.status !== 'verified_exact') {
      roadblocks.push({ state: 'OR', source: SOURCE_NAME, url: OREGON_DAILY_INVENTORY_URL, status: identityCheck.status, error: `${product.name || product.itemCode}: standard bottle identity, size, proof, or exact match is not sufficiently verified.`, nextRoute: 'Review the exact OLCC product identity against the full bottle library; unresolved rows stay out of customer inventory.' });
      continue;
    }
    const record = identityCheck.match.record;
    for (const store of product.stores) {
      const quantity = store.quantity;
      if (!Number.isSafeInteger(quantity) || quantity <= 0 || !store.inventoryObservedAt || !store.storeNo || !store.address || !store.city || !store.zip) continue;
      const storeAddress = [store.address, store.city, 'OR', store.zip].filter(Boolean).join(', ');
      signals.push({
        id: stableId(['OR', 'or-daily-store', record.id, product.size, product.proof, store.storeNo]),
        state: 'OR',
        sourceLabel: SOURCE_NAME,
        sourceUrl: OREGON_DAILY_INVENTORY_URL,
        rawName: product.name,
        canonicalBottleId: record.id,
        canonicalName: record.canonical,
        tier: product.rarityTier,
        confidence: 1,
        sourceMatchStatus: 'bottle_bible_match',
        fetchedAt: report.generatedAt,
        eventType: 'store_inventory_result',
        locationPrecision: 'store_level',
        locationName: `Oregon Liquor Store ${store.storeNo}`,
        storeName: `Oregon Liquor Store ${store.storeNo}`,
        storeId: String(store.storeNo),
        storeAddress,
        city: store.city || null,
        stateCode: 'OR',
        postalCode: store.zip || null,
        quantity,
        price: product.bottlePrice ?? null,
        observedAt: store.inventoryObservedAt,
        sourceAvailabilityVerified: true,
        canAlertAsInventory: false,
        canAlertAsWatch: false,
        dataLane: 'inventory',
        inventorySemantics: 'Official OLCC store-reported bottle quantity in the statewide daily inventory report. Timestamp is the store inventory date, not a restock event; verify with the store before driving.',
        evidence: `The OLCC daily inventory report lists ${store.quantity} bottle(s) of ${product.name || product.itemCode} at ${store.storeName || `store ${store.storeNo}`}, ${store.address}, ${store.city}, OR ${store.zip}. Store inventory date: ${store.inventoryDate}; verify with the store before driving.`,
        alertable: false,
        eligibleForOnSite: false,
        eligibleForDelivery: false,
        eligibleForEmail: false,
        eligibleForSms: false,
        raw: { itemCode: product.itemCode, proof: product.proof, size: product.size, inventoryDate: store.inventoryDate, sourceReportDate: report.sourceReportDate, shadowOnly: true }
      });
    }
  }

  return { signals, roadblocks };
}

export async function collectOregonResearchReport(config, bible, { reportPath = REPORT_PATH } = {}) {
  if (process.env.BOURBON_SIGNAL_SHADOW_MODE !== '1' || config !== CONFIG) {
    throw new Error('Oregon daily inventory research requires the isolated shadow source.');
  }

  const startedAt = new Date().toISOString();
  let report;
  let signals = [];
  let roadblocks = [];
  let sourceError = null;
  try {
    report = JSON.parse(await readFile(reportPath, 'utf8'));
    ({ signals, roadblocks } = collectOregonDailySignals(report, bible));
    if (Array.isArray(report.errors) && report.errors.length) {
      sourceError = 'The daily report has failed source checks.';
    } else if (!signals.length) {
      sourceError = 'The daily report produced no reviewed positive inventory.';
    }
  } catch (error) {
    sourceError = error.message;
  }
  if (sourceError) {
    roadblocks.push({ state: config.id, source: SOURCE_NAME, url: OREGON_DAILY_INVENTORY_URL, status: 'failed', error: sourceError });
  }

  const finishedAt = new Date().toISOString();
  const sourceId = 'research:or:olcc-daily-inventory';
  const lastGoodAt = sourceError ? null : report.generatedAt;
  const source = {
    sourceRuntimeId: sourceId, label: SOURCE_NAME, url: OREGON_DAILY_INVENTORY_URL,
    ok: !sourceError, status: sourceError ? 0 : 200, error: sourceError,
    signalType: 'store_inventory_result', matchedBottleCount: signals.length,
  };
  return {
    state: config.id, label: config.label, tier: config.tier, strategy: config.strategy, cadence: config.cadence,
    startedAt, finishedAt, lastGoodAt,
    status: signals.length ? (sourceError ? 'partial_useful' : 'useful') : 'no_trusted_inventory',
    stale: false, signals, sources: [source], roadblocks,
    sourceResults: [{
      sourceId, sourceLabel: SOURCE_NAME, sourceUrl: OREGON_DAILY_INVENTORY_URL,
      ok: !sourceError, status: sourceError ? 'failed' : 'success', checkedAt: finishedAt, lastGoodAt,
      inventoryAlertable: false, watchAlertable: false,
    }],
    metadata: {
      sourceReportDate: report?.sourceReportDate ?? null,
      sourceSha256: report?.sourceSha256 ?? null,
      complete: !sourceError, shadowOnly: true, productionActivationAllowed: false, customerDeliveryAllowed: false,
    },
  };
}
