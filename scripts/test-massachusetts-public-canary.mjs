import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import * as classificationModule from '../src/lib/drop-classification.ts';
import * as evidenceModule from '../src/lib/public-drop-evidence.ts';
import * as coverageModule from '../src/lib/coverage-model.ts';
import * as contractModule from '../src/lib/site-engine-contract.ts';
import * as knownStoresModule from '../src/lib/coverage-known-stores.ts';
import * as receiptModule from '../src/lib/nationwide-pilot-receipt.ts';
import * as harness from '../apps/mobile/src/astra-test-harness.ts';
import { isMassachusettsCanaryOnSiteSignal } from '../engine/src/massachusetts-research-policy.mjs';

const { classifyPublicDrop, getDropClassificationIndex } = classificationModule.default || classificationModule;
const { normalizePublicDropEvidenceInput, isPublicDropFeedEligible, isCurrentInventoryEvidence } = evidenceModule.default || evidenceModule;
const { buildCoverageContract } = coverageModule.default || coverageModule;
const { normalizeDropForSite } = contractModule.default || contractModule;
const { listStates, normalizeStoreForSite, siteExportHeaders } = contractModule.default || contractModule;
const { loadWithMocks } = harness.default || harness;
const read = async file => JSON.parse(await readFile(file, 'utf8'));
const root = 'engine/out/canary/MA/site', clock = new Date().toISOString();
const [partition, stats, lifecycle, locations, stores, drops] = await Promise.all([
  read(`${root}/states/MA/drops.json`), read(`${root}/stats.json`), read(`${root}/lifecycle-preview.json`),
  read(`${root}/locations.json`), read(`${root}/stores.json`), read(`${root}/drops.json`),
]);
const index = getDropClassificationIndex((await read('src/data/drop-feed-classification.generated.json')).records);
const classified = partition.drops.map(row => normalizePublicDropEvidenceInput(classifyPublicDrop(normalizeDropForSite(row), index)));
const current = classified.filter(row => isPublicDropFeedEligible(row) && isCurrentInventoryEvidence(row, clock));
assert.equal(partition.drops.length, 7);
assert.equal(current.filter(row => String(row.rarity_tier || row.tier).toLowerCase() === 'allocated').length, 2);
assert.equal(current.filter(row => String(row.rarity_tier || row.tier).toLowerCase() === 'limited').length, 5);
assert.deepEqual(current.map(row => row.canonicalName).sort(), [
  'Eagle Rare 10 Year', 'Elijah Craig Barrel Proof', 'Elijah Craig Barrel Proof', 'Henry McKenna 10 Year',
  'Larceny Barrel Proof', 'Larceny Barrel Proof', 'Wild Turkey Rare Breed Straight Bourbon',
].sort());
assert.equal(new Set(locations.locations.filter(row => row.state === 'MA').map(row => row.storeId)).size, 5);
assert.equal(new Set(current.map(row => row.storeId)).size, 4);
assert.ok(current.every(row => isMassachusettsCanaryOnSiteSignal(row) && row.previewOnly === true
  && row.canAlertAsInventory === false && row.canAlertAsWatch === false && row.eligibleForDelivery === false
  && row.eligibleForEmail === false && row.eligibleForSms === false && row.quantityIsExact === false));
for (const mutation of [{ canAlertAsInventory: true }, { eligibleForDelivery: true }, { quantityIsExact: true },
  { storeAddress: '1 Other Rd, Boston, MA 02117' }, { sourceStale: true }]) {
  assert.equal(isMassachusettsCanaryOnSiteSignal({ ...current[0], ...mutation }), false, JSON.stringify(mutation));
}
const coverage = buildCoverageContract({ lifecycle, stateRows: stats.stateCoverage.states, locations: locations.locations,
  stores: stores.stores, drops: classified, degradedStates: [], generatedAt: stats.generatedAt, asOf: clock, healthLimited: false })
  .states.find(row => row.code === 'MA');
assert.equal(coverage?.scope.searchableStores, 5);
assert.equal(coverage?.scope.inventoryMonitoredStores, 4);
assert.equal(coverage?.capabilities.restockAlerts, false);

const payloads = { stats, locations, stores, drops };
const coverageService = loadWithMocks('src/lib/coverage-server.ts', {
  'server-only': {}, '@/config/stateLifecycle': { STATE_LIFECYCLE_CONFIG: lifecycle }, '@/config/mississippi-known-stores.json': { stores: [] },
  '@/lib/coverage-model': coverageModule.default || coverageModule, '@/lib/coverage-known-stores': knownStoresModule.default || knownStoresModule,
  '@/lib/retailer-signal-feed': { retailerSubmissionToFeedCard: () => null }, '@/lib/retailer-public-submissions': { readCachedPublicRetailerSubmissions: async () => [] },
  '@/lib/public-drop-evidence': evidenceModule.default || evidenceModule, '@/lib/drop-classification': classificationModule.default || classificationModule,
  '@/data/drop-feed-classification.generated.json': await read('src/data/drop-feed-classification.generated.json'),
  './nationwide-pilot-receipt': receiptModule.default || receiptModule,
  '@/lib/source-lane-runtime': { readRuntimeSourceDropOverlay: async rows => ({ drops: rows, version: 'isolated-ma-canary' }) },
  '@/lib/site-engine-contract': { normalizeDropForSite, readSiteExportResults: async names => names.map(name => ({ payload: payloads[name], source: 'remote-snapshot', snapshotId: 'isolated-ma-canary' })) },
});
const coverageRoute = loadWithMocks('src/app/api/coverage/route.ts', {
  'next/server': { NextResponse: Response }, '@/lib/coverage-server': coverageService,
  '@/lib/nationwide-pilot-receipt': receiptModule.default || receiptModule,
});
const response = await coverageRoute.GET(new Request('https://fixture.test/api/coverage'));
assert.equal(response.status, 200);
assert.equal((await response.json()).states.find(row => row.code === 'MA')?.freshness.currentInventoryStores, 4);

const candidateLocations = locations.locations.filter(row => row.state === 'MA');
const selectableDirectory = loadWithMocks('src/lib/sighting-store-directory.ts', {
  'next/cache': { unstable_cache: fn => fn }, './approved-catalog-service': { listApprovedLocations: async () => [] },
  './site-engine-contract': { readSiteExportResults: async names => names.map(name => ({ payload: name === 'locations' ? locations : stores })), readBundledSiteExport: () => null },
});
const directory = await selectableDirectory.readSightingStoreDirectory();
assert.equal(directory.filter(row => row.state === 'MA').length, 5);
const storeRoute = loadWithMocks('src/app/api/stores/route.ts', {
  'next/server': { NextResponse: Response },
  '@/lib/sighting-store-directory': { readSightingStoreDirectory: async () => directory, SIGHTING_STORE_DIRECTORY_VERSION: 'isolated-ma-canary' },
  '@/lib/site-engine-contract': { readSiteExport: async name => payloads[name], siteExportHeaders, listStates, normalizeStoreForSite },
});
const locationsRoute = loadWithMocks('src/app/api/locations/route.ts', {
  'next/server': { NextResponse: Response },
  '@/lib/site-engine-contract': { readSiteExport: async name => payloads[name], readBundledSiteExport: () => null,
    siteExportHeaders, listStates, normalizeStoreForSite, normalizeDropForSite },
});
for (const [route, path] of [[storeRoute, '/api/stores'], [locationsRoute, '/api/locations']]) {
  const response = await route.GET(new Request(`https://fixture.test${path}?state=MA&limit=1000`));
  assert.equal(response.status, 200);
  const result = await response.json();
  const rows = result.stores || result.locations;
  assert.equal(rows.filter(row => row.state === 'MA').length, 5);
  for (const location of candidateLocations) assert.ok(rows.some(row => (row.storeId || row.id) === location.storeId));
}

const proof = { state: 'MA', evaluatedAt: clock, scope: 'local_customer_projection_of_hosted_private_canary',
  positiveRows: partition.drops.length, currentTierRows: current.length, currentPositiveStores: 4,
  searchableStores: 5, finderStoresApiRows: 5, finderLocationsApiRows: 5,
  cities: [...new Set(locations.locations.filter(row => row.state === 'MA').map(row => row.city))].sort(),
  allDeliveryDisabled: true, exactShelfCountsClaimed: false, authoredCoverageRouteExecuted: true,
  authoredFinderStoreAndLocationRoutesExecuted: true,
  hostedVercelUiExercised: false };
await writeFile('engine/out/canary/MA/site/public-projection.json', JSON.stringify(proof, null, 2) + '\n');
console.log(JSON.stringify(proof));
