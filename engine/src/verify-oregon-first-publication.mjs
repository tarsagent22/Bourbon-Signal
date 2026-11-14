import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import { OREGON_DAILY_INVENTORY_URL, OREGON_DAILY_PRODUCTION_RUNTIME_ID } from './oregon-daily-production-policy.mjs';
import { isOregonDailyProductionEvidence } from './oregon-daily-production-policy.mjs';
import { isWithinCustomerFreshnessWindow } from './customer-drop-freshness.mjs';

const SHA256 = /^[a-f0-9]{64}$/iu;
export const OREGON_FIRST_PUBLICATION_MINIMUMS = Object.freeze({ rows: 1_000, stores: 200, cities: 150, allocatedRows: 1 });
// The retained 2026-11-13 hosted canary had 1,592 public rows, 260 exact stores,
// 168 cities and 787 allocated/unicorn rows; these floors catch a material collapse.

function pacificDate(nowMs) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', month: '2-digit', day: '2-digit', year: 'numeric' })
    .formatToParts(new Date(nowMs));
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${value.month}/${value.day}/${value.year}`;
}

export function oregonPreviousSourceReportSha256(manifest) {
  return manifest?.evidence?.firstPublication?.previousSourceReportSha256
    || manifest?.evidence?.shadow?.previousSourceReportSha256
    || manifest?.evidence?.shadow?.sourceReportSha256
    || null;
}

/** Cold first-publication check over the actual state report and customer site partition. */
export function verifyOregonFirstPublication({ stateReport, statePartition, alerts, previousSourceReportSha256,
  reportBytes, partitionBytes, workflowRunId = process.env.GITHUB_RUN_ID, nowMs = Date.now() } = {}) {
  const failures = [];
  const source = stateReport?.metadata?.oregonDailyInventory;
  const rows = Array.isArray(statePartition?.drops) ? statePartition.drops : [];
  const sourceSignals = (Array.isArray(stateReport?.signals) ? stateReport.signals : [])
    .filter(row => row?.sourceRuntimeId === OREGON_DAILY_PRODUCTION_RUNTIME_ID);
  const sourceRows = rows.filter(row => row?.sourceRuntimeId === OREGON_DAILY_PRODUCTION_RUNTIME_ID);
  if (sourceSignals.some(row => !isOregonDailyProductionEvidence(row)) || sourceRows.some(row => !isOregonDailyProductionEvidence(row))) {
    failures.push('Oregon source or public partition contains a row that fails the exact source, clock, or no-alert contract.');
  }
  const current = rows.filter(row => row?.sourceRuntimeId === OREGON_DAILY_PRODUCTION_RUNTIME_ID
    && isOregonDailyProductionEvidence(row)
    && isWithinCustomerFreshnessWindow(row, nowMs, { currentInventory: true }));
  const stores = new Set(current.map(row => String(row.storeId)));
  const cities = new Set(current.map(row => String(row.city).trim().toUpperCase()).filter(Boolean));
  const allocatedRows = current.filter(row => ['allocated', 'unicorn'].includes(String(row.tier).toLowerCase()));
  const stateAlerts = (alerts?.alerts || []).filter(row => row?.state === 'OR');

  if (stateReport?.state !== 'OR' || stateReport.stale !== false || stateReport.status !== 'useful') failures.push('Oregon state report is not a fresh useful collection.');
  if (!/^[0-9]+$/.test(String(workflowRunId || ''))) failures.push('Oregon first-publication receipt requires its hosted refresh workflow run id.');
  if (statePartition?.state !== 'OR' || (statePartition?.count != null && statePartition.count !== rows.length)) failures.push('Oregon public partition state or row count is invalid.');
  if (source?.complete !== true || source?.productionAlertDeliveryAllowed !== false) failures.push('Oregon report metadata does not prove a complete non-alerting daily report.');
  if (source?.sourceUrl !== OREGON_DAILY_INVENTORY_URL || !SHA256.test(String(source?.sourceReportSha256 || ''))) failures.push('Oregon report metadata is missing the official source URL or body digest.');
  if (!Number.isSafeInteger(source?.sourceBytes) || source.sourceBytes < 1 || source.sourceBytes > 150_000_000) failures.push('Oregon report metadata is missing its bounded source byte count.');
  if (source?.sourceReportSha256 === previousSourceReportSha256) failures.push('Oregon first publication is still bound to the previously reviewed daily report body.');
  if (source?.sourceReportDate !== pacificDate(nowMs)) failures.push('Oregon first publication is not using the current Pacific-date report.');
  const reportGeneratedAt = Date.parse(String(source?.sourceObservedAt || ''));
  if (!Number.isFinite(reportGeneratedAt) || reportGeneratedAt > nowMs || nowMs - reportGeneratedAt > 48 * 60 * 60_000) failures.push('Oregon report fetch clock is future-dated or older than 48 hours.');
  if (!current.length || current.some(row => row.sourceProductBinding?.reportSha256 !== source?.sourceReportSha256
    || row.sourceProductBinding?.reportGeneratedAt !== source?.sourceObservedAt)) failures.push('Oregon public rows do not all match the current source revision and original observation dates.');
  for (const row of [...sourceSignals, ...sourceRows, ...rows]) {
    if (row.canAlertAsInventory !== false || row.canAlertAsWatch !== false || row.alertable !== false
      || row.eligibleForDelivery !== false || row.deliveryEligible !== false || row.eligibleForEmail !== false || row.eligibleForSms !== false) {
      failures.push('Oregon first publication contains an alert- or delivery-enabled row.');
      break;
    }
  }
  if (stateAlerts.some(row => row?.eligibleForDelivery === true)) failures.push('Oregon first publication emitted a delivery-eligible alert.');
  if (current.length < OREGON_FIRST_PUBLICATION_MINIMUMS.rows || stores.size < OREGON_FIRST_PUBLICATION_MINIMUMS.stores
    || cities.size < OREGON_FIRST_PUBLICATION_MINIMUMS.cities || allocatedRows.length < OREGON_FIRST_PUBLICATION_MINIMUMS.allocatedRows) {
    failures.push(`Oregon first publication is below the held-cohort minimums (${current.length} rows, ${stores.size} stores, ${cities.size} cities, ${allocatedRows.length} allocated rows).`);
  }
  if (failures.length) return { ok: false, failures, receipt: null, rows: current.length, stores: stores.size, cities: cities.size,
    allocatedRows: allocatedRows.length, sourceReportDate: source?.sourceReportDate || null, sourceReportSha256: source?.sourceReportSha256 || null };
  const stats = values => ({ rows: values.length, stores: new Set(values.map(row => String(row.storeId))).size,
    cities: new Set(values.map(row => String(row.city || '').trim().toUpperCase()).filter(Boolean)).size,
    allocatedRows: values.filter(row => String(row.tier).toLowerCase() === 'allocated').length,
    unicornRows: values.filter(row => String(row.tier).toLowerCase() === 'unicorn').length });
  const observationDates = Object.fromEntries([...sourceSignals.reduce((counts, row) => {
    const date = String(row.observedAt || '').slice(0, 10);
    counts.set(date, (counts.get(date) || 0) + 1);
    return counts;
  }, new Map()).entries()].sort(([left], [right]) => left.localeCompare(right)));
  const productionAlertFlags = { canAlertAsInventory: false, canAlertAsWatch: false, alertable: false,
    eligibleForDelivery: false, deliveryEligible: false, eligibleForEmail: false, eligibleForSms: false,
    emittedOregonAlerts: stateAlerts.length };
  const receipt = { schemaVersion: 1, state: 'OR', verification: 'first_production_publication', workflowRunId: String(workflowRunId),
    verifiedAt: new Date(nowMs).toISOString(), sourceUrl: source.sourceUrl, sourceReportDate: source.sourceReportDate,
    sourceReportSha256: source.sourceReportSha256, sourceObservedAt: source.sourceObservedAt,
    sourceBytes: Number.isSafeInteger(source.sourceBytes) ? source.sourceBytes : null,
    sourceReportFileSha256: hash(reportBytes || JSON.stringify(stateReport)), sourceReportFileBytes: Buffer.byteLength(reportBytes || JSON.stringify(stateReport)),
    partitionSha256: hash(partitionBytes || JSON.stringify(statePartition)), partitionBytes: Buffer.byteLength(partitionBytes || JSON.stringify(statePartition)),
    rawNormalizedStats: { stateReportSignals: sourceSignals.length, sourceObservationDates: observationDates,
      sourceSignals: stats(sourceSignals), currentProductionRows: stats(current),
      publicPartitionRows: stats(rows) }, productionAlertFlags };
  receipt.receiptSha256 = hash(JSON.stringify(receipt));
  return { ok: true, failures: [], receipt, rows: current.length, stores: stores.size, cities: cities.size,
    allocatedRows: allocatedRows.length, sourceReportDate: source?.sourceReportDate || null, sourceReportSha256: source?.sourceReportSha256 || null };
}

const hash = value => createHash('sha256').update(value).digest('hex');
const readJson = file => readFile(file, 'utf8').then(JSON.parse);
if (process.argv[1]?.replaceAll('\\', '/').endsWith('/verify-oregon-first-publication.mjs')) {
  const [reportBytes, partitionBytes, alerts, manifest] = await Promise.all([
    readFile('out/states/OR.json'), readFile('out/site/states/OR/drops.json'), readJson('out/site/alerts.json'),
    readJson('data/state-integration/OR.json'),
  ]);
  const result = verifyOregonFirstPublication({ stateReport: JSON.parse(reportBytes), statePartition: JSON.parse(partitionBytes), alerts,
    reportBytes, partitionBytes, previousSourceReportSha256: oregonPreviousSourceReportSha256(manifest) });
  if (!result.ok) throw new Error(result.failures.join('\n'));
  const output = 'out/first-publication/OR.json'; await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(result.receipt, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ ok: true, state: 'OR', receipt: output, receiptSha256: result.receipt.receiptSha256,
    rows: result.rows, stores: result.stores, cities: result.cities, sourceReportDate: result.sourceReportDate }));
}
