import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { bibleLookup, publicSignal } from './export-site-contract.mjs';
import { replayWyomingGroceryReport } from './research-wyoming-grocery-runtime.mjs';
import { WYOMING_GROCERY_LABEL, WYOMING_GROCERY_STORES, isWyomingGroceryCanaryPreview } from './wyoming-grocery-policy.mjs';

export async function prepareWyomingGroceryCanary({ reportPath, provenance, bible, nowMs = Date.now() }) {
  const bytes = await readFile(reportPath);
  const report = JSON.parse(bytes.toString('utf8'));
  const origin = report.metadata?.origin;
  const reportSha256 = createHash('sha256').update(bytes).digest('hex');
  if (provenance?.status !== 'verified_github_shadow_artifact' || provenance.state !== 'WY'
    || origin?.kind !== 'github_actions' || provenance.repository !== origin.repository
    || String(provenance.workflowRunId) !== origin.workflowRunId || provenance.headSha !== origin.commitSha
    || provenance.reportSha256 !== reportSha256) {
    throw new Error('Wyoming preview requires its exact verified workflow-issued shadow report');
  }
  const rows = await replayWyomingGroceryReport(report, dirname(reportPath), bible, { nowMs });
  const index = bibleLookup(bible.records);
  const drops = rows.map(row => ({
    ...publicSignal({ ...row, locationName: row.storeName }, index),
    tier: row.tier,
    previewOnly: true,
    eligibleForOnSite: true,
    eligibleForDropFeed: true,
    alertable: false,
    canAlertAsInventory: false,
    canAlertAsWatch: false,
    eligibleForWatch: false,
    eligibleForDelivery: false,
    deliveryEligible: false,
    eligibleForEmail: false,
    eligibleForSms: false,
  }));
  if (!drops.length || !drops.every(isWyomingGroceryCanaryPreview)) {
    throw new Error('Wyoming preview lost an exact product binding in the customer export');
  }
  const positiveStores = new Set(drops.map(row => row.storeId));
  const locations = WYOMING_GROCERY_STORES.map(store => ({
    id: store.storeId,
    storeId: store.storeId,
    name: 'Albertsons ' + store.city,
    address: store.address,
    city: store.city,
    state: 'WY',
    zip: store.zip,
    lat: store.lat,
    lng: store.lng,
    type: 'store',
    source: WYOMING_GROCERY_LABEL,
    precision: 'store_level',
    searchable: true,
    collectorAttached: true,
    hasSignals: positiveStores.has(store.storeId),
  }));
  return {
    schemaVersion: 1,
    state: 'WY',
    generatedAt: report.finishedAt,
    scope: 'isolated_canary_input_no_production_activation',
    originalSourceClockPreserved: true,
    workflowSource: provenance,
    locations,
    drops,
  };
}
