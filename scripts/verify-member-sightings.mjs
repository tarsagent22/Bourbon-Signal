import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];
function read(rel) { return readFileSync(path.join(root, rel), 'utf8'); }
function fail(msg) { failures.push(msg); }
function expectFile(rel) { if (!existsSync(path.join(root, rel))) fail(`Missing ${rel}`); else return read(rel); return ''; }

const sightingsClient = read('src/app/sightings/SightingsClient.tsx');
for (const phrase of ['activeTab', 'Submit', 'Feed', 'sightingType', 'Seen in store', 'Online/Social Media', 'Member Sightings', 'stateFilter', 'All states']) {
  if (!sightingsClient.includes(phrase)) fail(`Sightings page should include ${phrase}`);
}
if (!sightingsClient.includes('store.precision === "store"')) {
  fail('Sightings store search should restrict submissions to exact stores, not board/area records.');
}
if (!sightingsClient.includes('selected-store-card') || !sightingsClient.includes('Change store')) {
  fail('Sightings store picker should collapse suggestions and show the selected store/address after selection.');
}
if (!/voteSighting/.test(sightingsClient) || !/ThumbsUp/.test(sightingsClient) || !/ThumbsDown/.test(sightingsClient)) {
  fail('Sightings feed should include one-click thumbs up/down controls.');
}
if (!/isSignedIn/.test(sightingsClient) || !/members only/i.test(sightingsClient)) {
  fail('Sightings page should keep feed/submission member-only.');
}

const lib = read('src/lib/sightings.ts');
for (const phrase of ['SightingType', 'seen_in_store', 'online_social', 'SightingVote', 'upCount', 'downCount']) {
  if (!lib.includes(phrase)) fail(`Sightings model should include ${phrase}`);
}

const storeMap = read('src/lib/store-map.ts');
for (const phrase of ['rawPrecision', 'store_level', 'hasExactStoreAddress', 'sourceStoreId']) {
  if (!storeMap.includes(phrase)) fail(`Store map normalization should preserve exact store records for sightings search: ${phrase}`);
}

const locationsRoute = read('src/app/api/locations/route.ts');
for (const phrase of ['storesPayload', 'locationLookupKey', 'combinedRawLocations']) {
  if (!locationsRoute.includes(phrase)) fail(`Locations API should merge exact store export rows for sightings search: ${phrase}`);
}

const locationsPayload = JSON.parse(read('engine/out/site/locations.json'));
const storesPayload = JSON.parse(read('engine/out/site/stores.json'));
const locations = Array.isArray(locationsPayload.locations) ? locationsPayload.locations : [];
const stores = Array.isArray(storesPayload.stores) ? storesPayload.stores : [];
const allLocationInputs = [...locations, ...stores];
const ncExactStores = allLocationInputs.filter((location) => location.state === 'NC' && location.address && (location.locationType === 'store' || location.type === 'store' || location.sourceStoreId));
if (ncExactStores.length < 45) {
  fail(`NC should expose exact ABC store rows for sightings submissions; found ${ncExactStores.length}.`);
}
for (const query of ['wake county abc', 'apex', '27502', 'williams']) {
  if (!stores.some((store) => `${store.name} ${store.address} ${store.city} ${store.zip} ${store.state}`.toLowerCase().includes(query))) {
    fail(`Store export should include searchable NC store query: ${query}`);
  }
}
if (!ncExactStores.some((location) => /wake county abc/i.test(`${location.name} ${location.address} ${location.city}`))) {
  fail('NC exact store rows should include searchable Wake County ABC stores, not just board-level records.');
}

const api = expectFile('src/app/api/sightings/route.ts');
for (const phrase of ['getUserList', 'reporterUserId', 'poster cannot vote', 'sightingVotes', 'up', 'down']) {
  if (api && !api.includes(phrase)) fail(`Sightings API should include ${phrase}`);
}

const hook = read('src/hooks/useSightings.ts');
for (const phrase of ['/api/sightings', 'voteSighting', 'addSignalReport']) {
  if (!hook.includes(phrase)) fail(`useSightings should include ${phrase}`);
}

const dropFeed = read('src/components/sections/DropFeed.tsx');
for (const phrase of ['Member sighting', 'sighting.rarityTier', 'lastUpdated', 'Refreshed']) {
  if (!dropFeed.includes(phrase)) fail(`Drop feed should include ${phrase}`);
}
for (const phrase of ['memberSightingToGrouped', 'store_address: sighting.storeAddress', 'locationPrecision: "store_level"', 'exactStore: true', 'displayLocationLabel(sighting.storeName', 'onVoteSighting', 'voteSighting(sightingId, vote)', 'upCount: sighting.upCount']) {
  if (!dropFeed.includes(phrase)) fail(`Drop feed should preserve exact member sighting store details and voting: ${phrase}`);
}
if (/User submitted/.test(dropFeed)) fail('Drop feed should label member sightings as Member sighting, not User submitted.');
if (/Member report/.test(dropFeed)) fail('Drop feed should not show the redundant Member report tag for member sightings.');

const dashboard = read('src/app/dashboard/page.tsx');
for (const phrase of ['Personal signal brief', 'Saved markets', 'Tracked bottles', 'Recent matching drops']) {
  if (!dashboard.includes(phrase)) fail(`Dashboard should include personalized brief item: ${phrase}`);
}

const signUp = read('src/app/sign-up/[[...sign-up]]/page.tsx');
for (const phrase of ['forceRedirectUrl="/alerts?welcome=1"', 'signInForceRedirectUrl="/alerts?welcome=1"']) {
  if (!signUp.includes(phrase)) fail(`Sign-up should redirect to alerts onboarding: ${phrase}`);
}
const alerts = read('src/app/alerts/page.tsx');
for (const phrase of ['welcome', 'Setting your alert preferences before doing anything else is highly recommended', 'localStorage']) {
  if (!alerts.includes(phrase)) fail(`Alerts page should include one-time onboarding popup behavior: ${phrase}`);
}

if (failures.length) {
  console.error('Member sightings verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log('Member sightings verification passed.');
