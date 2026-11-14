import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { BourbonBible } from '../engine/src/core/bible.mjs';
import { parsePearsonsDcCapture, PEARSONS_DC_SOURCE } from '../engine/src/collectors/pearsons-dc-research.mjs';

const REQUIRED_REPORT_RUN = '43596973768';
const PEARSONS_CAPTURE_SHA256 = '19ae33c645f38f237d7e2c73e53cd684b0d9183ccf3892455ccc0a4419af8385';
const EXPECTED_CITY_STORES = new Set([
  'hop-cask-and-barrel:6054cf9d0168813b45dd1624',
  'metro-wine-dc:5b8ede1211bc076567b49bd5',
]);
const parseArgs = argv => {
  const result = {};
  for (let index = 2; index < argv.length; index++) {
    const value = argv[index];
    if (!value.startsWith('--')) throw new Error(`Unexpected argument: ${value}`);
    const key = value.slice(2), next = argv[++index];
    if (!next || next.startsWith('--')) throw new Error(`Missing value for --${key}`);
    result[key] = next;
  }
  return result;
};
const hash = value => createHash('sha256').update(value).digest('hex');
const ageMs = (observedAt, nowMs) => nowMs - Date.parse(observedAt);

export async function replayDcPearsonsCohort({ reportPath, htmlPath, headersPath, outputPath, bible, now = new Date() }) {
  const [reportBytes, htmlBytes, headers] = await Promise.all([
    readFile(reportPath), readFile(htmlPath), readFile(headersPath, 'utf8'),
  ]);
  const report = JSON.parse(reportBytes.toString('utf8'));
  if (report.state !== 'DC' || report.metadata?.origin?.workflowRunId !== REQUIRED_REPORT_RUN
    || report.status !== 'useful' || report.metadata?.shadowOnly !== true
    || report.metadata?.productionActivationAllowed !== false || report.metadata?.customerDeliveryAllowed !== false) {
    throw new Error('Expected the retained DC shadow report with delivery and production disabled');
  }
  const cityRows = report.signals;
  const cityIds = new Set(cityRows.map(row => row.storeId));
  if (cityRows.length !== 2 || cityIds.size !== 2 || [...cityIds].some(id => !EXPECTED_CITY_STORES.has(id))
    || cityRows.some(row => row.state !== 'DC' || row.availabilityStatus !== 'in_stock' || row.tier !== 'allocated'
      || row.sourceAvailabilityVerified !== true || row.canAlertAsInventory !== false || row.canAlertAsWatch !== false)) {
    throw new Error('The retained DC report no longer matches the reviewed two-premise allocated cohort');
  }
  const pearsons = parsePearsonsDcCapture(htmlBytes, {
    url: PEARSONS_DC_SOURCE.productUrl, headers, bible, expectedSha256: PEARSONS_CAPTURE_SHA256,
  });
  if (!pearsons) throw new Error('Pearson capture failed exact source, offer, premise, pickup or Bible validation');
  const nowMs = now.getTime();
  const stores = [...cityRows.map(row => ({
    storeId: row.storeId, storeName: row.storeName, storeAddress: row.storeAddress,
    source: 'cityhive-shadow-report', observedAt: row.observedAt, rawName: row.rawName,
    canonicalBottleId: row.canonicalBottleId, tier: row.tier, price: row.price,
    availabilityStatus: row.availabilityStatus, canAlertAsInventory: false, canAlertAsWatch: false,
    ageMinutesAtReplay: Math.round(ageMs(row.observedAt, nowMs) / 60_000),
  })), {
    storeId: pearsons.storeId, storeName: pearsons.storeName, storeAddress: pearsons.storeAddress,
    source: 'pearsons-retained-shopify-page', observedAt: pearsons.observedAt, rawName: pearsons.rawName,
    canonicalBottleId: pearsons.canonicalBottleId, tier: pearsons.tier, price: pearsons.price,
    availabilityStatus: pearsons.availabilityStatus, inventorySemantics: pearsons.inventorySemantics,
    sourcePageSha256: pearsons.sourceProductBinding.sourcePageSha256,
    canAlertAsInventory: false, canAlertAsWatch: false,
    ageMinutesAtReplay: Math.round(ageMs(pearsons.observedAt, nowMs) / 60_000),
  }];
  const freshRows = stores.filter(row => Number.isFinite(row.ageMinutesAtReplay) && row.ageMinutesAtReplay >= 0 && row.ageMinutesAtReplay <= 30);
  const result = {
    schemaVersion: 1, state: 'DC', mode: 'offline_research_replay_only', generatedAt: now.toISOString(),
    sourceCohort: [
      ...cityRows.map(row => ({ storeId: row.storeId, platform: 'cityhive', merchantId: row.merchantId, address: row.storeAddress })),
      { storeId: PEARSONS_DC_SOURCE.storeId, platform: 'shopify', merchantId: PEARSONS_DC_SOURCE.merchantId, address: PEARSONS_DC_SOURCE.storeAddress },
    ],
    retainedEvidence: {
      cityhiveRunId: REQUIRED_REPORT_RUN, cityhiveReportSha256: hash(reportBytes),
      cityhiveObservedAt: report.startedAt, pearsonsPageSha256: hash(htmlBytes),
      pearsonsObservedAt: pearsons.observedAt, pearsonsHttpStatus: pearsons.sourceProductBinding.httpStatus,
    },
    stores, counts: {
      cohortPremises: stores.length, allocatedOrUnicornRows: stores.filter(row => ['allocated', 'unicorn'].includes(row.tier)).length,
      currentWithin30MinutesAtReplay: freshRows.length, staleOrOutside30MinutesAtReplay: stores.length - freshRows.length,
    },
    readiness: {
      productionActivationAllowed: false, customerDeliveryAllowed: false, alertsAllowed: false,
      silentCanaryReady: false,
      reason: 'Offline evidence spans separate source runs; the CityHive observations are outside the 30-minute comparison window. Schedule one bounded DC shadow that includes the reviewed Pearson source after its cooldown, then assess its exact combined report.',
      pearsonsInventoryCaveat: 'This is a first-party storefront orderable pickup offer with a selected location and no exact shelf count; it is not a physical shelf-count claim.',
    },
    rawEvidence: {
      pearsons: { capturedAt: pearsons.observedAt, sha256: hash(htmlBytes), status: 200, ageHeaderSeconds: 0, file: path.resolve(htmlPath) },
      cityhive: { workflowRunId: REQUIRED_REPORT_RUN, startedAt: report.startedAt, file: path.resolve(reportPath) },
    },
  };
  if (outputPath) {
    await mkdir(path.dirname(path.resolve(outputPath)), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
  }
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = parseArgs(process.argv);
  const reportPath = args.report || 'C:/Users/chand/projects/bs-dc-md-wy-shadow-43596973768/DC/2026-11-14T12-53-28-706Z/report.json';
  const htmlPath = args.html || 'C:/Users/chand/projects/bs-dc-exact-shopify-late-20261114/pearsons.html';
  const headersPath = args.headers || 'C:/Users/chand/projects/bs-dc-exact-shopify-late-20261114/pearsons.headers';
  const bibleData = JSON.parse(await readFile(args.bible || 'engine/test/fixtures/shopify-variant-pickup/current-bourbon-bible.json', 'utf8'));
  const bible = new BourbonBible(bibleData.records);
  const result = await replayDcPearsonsCohort({ reportPath, htmlPath, headersPath, outputPath: args.out, bible });
  process.stdout.write(`${JSON.stringify({ mode: result.mode, stores: result.counts.cohortPremises, fresh: result.counts.currentWithin30MinutesAtReplay, ready: result.readiness.silentCanaryReady, output: args.out || null }, null, 2)}\n`);
}
