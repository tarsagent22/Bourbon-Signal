import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { BourbonBible } from './core/bible.mjs';
import { OREGON_DAILY_INVENTORY_URL } from './or-daily-inventory.mjs';
import { projectOregonDailyProduction } from './collectors/oregon-daily-production.mjs';

const sha256 = /^[a-f0-9]{64}$/iu;
const dateValue = value => Date.parse(String(value || ''));

function validReport(report) {
  return report?.schemaVersion === 'bourbon-signal-or-product-availability-v1'
    && report.status === 'ready' && report.sourceUrl === OREGON_DAILY_INVENTORY_URL
    && sha256.test(String(report.sourceSha256 || '')) && Number.isSafeInteger(report.sourceBytes)
    && report.sourceBytes > 0 && report.sourceBytes <= 150_000_000
    && /^\d{1,2}\/\d{1,2}\/\d{4}$/u.test(String(report.sourceReportDate || ''))
    && Number.isFinite(dateValue(report.generatedAt)) && Array.isArray(report.products);
}

/** Offline-only comparison of saved official report artifacts; makes no source requests. */
export function verifyDistinctOregonReport({ previousReport, candidateReport, bible, nowMs = Date.now() } = {}) {
  if (!validReport(previousReport) || !validReport(candidateReport)) {
    throw new Error('Both inputs must be saved, parsed official OLCC report artifacts.');
  }
  if (!Array.isArray(bible?.records) || !bible.records.length) throw new Error('A current app Bible is required.');

  const reasons = [];
  if (candidateReport.sourceSha256 === previousReport.sourceSha256) reasons.push('OLCC CSV body digest is unchanged.');
  if (dateValue(candidateReport.generatedAt) <= dateValue(previousReport.generatedAt)) reasons.push('Candidate report clock did not advance.');
  const parseReportDate = value => {
    const [month, day, year] = String(value).split('/').map(Number);
    const time = Date.UTC(year, month - 1, day), date = new Date(time);
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? time : NaN;
  };
  const previousDate = parseReportDate(previousReport.sourceReportDate);
  const candidateDate = parseReportDate(candidateReport.sourceReportDate);
  if (!Number.isFinite(previousDate) || !Number.isFinite(candidateDate) || candidateDate < previousDate) {
    reasons.push('Candidate OLCC report date is invalid or regressed.');
  }

  const recordsSha256 = createHash('sha256').update(JSON.stringify(bible.records)).digest('hex');
  if (candidateReport.bible?.mode !== 'live' || candidateReport.bible?.recordsSha256 !== recordsSha256) {
    reasons.push('Candidate report lacks the current live app Bible records digest.');
  }
  const reportClock = dateValue(candidateReport.generatedAt);
  if (!Number.isFinite(reportClock) || reportClock > nowMs || nowMs - reportClock > 48 * 60 * 60_000) {
    reasons.push('Candidate report is future-dated or older than 48 hours.');
  }
  const rows = reasons.length ? [] : projectOregonDailyProduction(candidateReport, bible, { nowMs });
  if (!reasons.length && rows.length === 0) reasons.push('No exact, current positive store rows survive identity and clock checks.');

  return {
    state: 'OR',
    status: reasons.length ? 'not_ready' : 'distinct_report_ready_for_offline_canary_review',
    distinct: reasons.length === 0,
    reasons,
    previous: { reportDate: previousReport.sourceReportDate, generatedAt: previousReport.generatedAt, sourceSha256: previousReport.sourceSha256 },
    candidate: { reportDate: candidateReport.sourceReportDate, generatedAt: candidateReport.generatedAt, sourceSha256: candidateReport.sourceSha256 },
    ...(reasons.length ? {} : {
      positiveRows: rows.length,
      distinctBottles: new Set(rows.map(row => row.canonicalBottleId)).size,
      distinctStores: new Set(rows.map(row => row.storeId)).size,
      distinctCities: new Set(rows.map(row => row.city)).size,
      alertableRows: rows.filter(row => row.canAlertAsInventory || row.canAlertAsWatch).length,
      deliveryEligibleRows: rows.filter(row => row.eligibleForDelivery || row.eligibleForEmail || row.eligibleForSms).length,
    }),
    scope: 'offline_saved_artifact_comparison_no_network_or_lifecycle_changes',
  };
}

const argument = flag => process.argv.find(value => value.startsWith(`${flag}=`))?.slice(flag.length + 1);
async function main() {
  const previousFile = argument('--previous'), candidateFile = argument('--candidate'), bibleFile = argument('--bible');
  if (!previousFile || !candidateFile || !bibleFile) throw new Error('Use --previous=<saved-report.json> --candidate=<saved-report.json> --bible=<current-bible.json>');
  const [previousReport, candidateReport, bible] = await Promise.all([
    readFile(previousFile, 'utf8').then(JSON.parse), readFile(candidateFile, 'utf8').then(JSON.parse), BourbonBible.load(bibleFile),
  ]);
  console.log(JSON.stringify(verifyDistinctOregonReport({ previousReport, candidateReport, bible }), null, 2));
}

if (import.meta.url === (process.argv[1] ? pathToFileURL(process.argv[1]).href : '')) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
