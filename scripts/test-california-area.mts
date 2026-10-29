import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { californiaAreaMatchesFields, normalizeCaliforniaAreas, parseCaliforniaAreaQuery, SUPPORTED_CALIFORNIA_AREAS } from '../src/lib/california-area.ts';
import { buildDropFeedAreaRequest } from '../src/lib/feed-area-options.ts';
import { CALIFORNIA_GROCERY_SOURCES } from '../engine/src/collectors/california-grocery-premises.mjs';

assert.deepEqual(SUPPORTED_CALIFORNIA_AREAS, [...new Set(CALIFORNIA_GROCERY_SOURCES.map(source=>source.city))].sort());
assert.equal(SUPPORTED_CALIFORNIA_AREAS.length, 29);
assert.deepEqual(normalizeCaliforniaAreas(['San Diego', 'Los Angeles', 'san diego']), ['Los Angeles', 'San Diego']);
assert.equal(californiaAreaMatchesFields(['San Diego'], ['San Diego']), true);
assert.equal(californiaAreaMatchesFields(['6090 Friars Road, San Diego, CA 92108'], ['San Diego']), true);
assert.equal(californiaAreaMatchesFields(['SAN DIEGO, CA'], ['San Diego']), true);
assert.equal(californiaAreaMatchesFields(['San Diego County'], ['San Diego']), false);
assert.equal(californiaAreaMatchesFields(['La Mesa, CA'], ['San Diego']), false);
assert.equal(californiaAreaMatchesFields(['Chula Vista, CA'], ['San Diego']), false);
assert.equal(californiaAreaMatchesFields(['Los Angeles, CA'], ['San Diego']), false);
assert.equal(californiaAreaMatchesFields(['San Francisco, CA'], ['San Diego']), false);
assert.equal(californiaAreaMatchesFields(['San Diego'], []), true);
assert.deepEqual(parseCaliforniaAreaQuery(null), { requested: false, valid: true, areas: [] });
assert.deepEqual(parseCaliforniaAreaQuery('San Diego'), { requested: true, valid: true, areas: ['San Diego'] });
assert.deepEqual(parseCaliforniaAreaQuery('Los Angeles'), { requested: true, valid: true, areas: ['Los Angeles'] });
assert.deepEqual(parseCaliforniaAreaQuery('Fresno'), { requested: true, valid: false, areas: [] });
assert.equal(californiaAreaMatchesFields(['South San Francisco, CA 94080'], ['San Francisco']), false);
assert.equal(californiaAreaMatchesFields(['West Sacramento, CA 95691'], ['Sacramento']), false);
assert.equal(californiaAreaMatchesFields(['Los Angeles County'], ['Los Angeles']), false);
assert.equal(californiaAreaMatchesFields(['Culver City, CA 90232'], ['Los Angeles']), false);
for(const source of CALIFORNIA_GROCERY_SOURCES) {
  assert.equal(californiaAreaMatchesFields([source.address], [source.city]), true, source.address);
  assert.deepEqual(buildDropFeedAreaRequest('CA', `CA::${source.city}`), {key:'area', value:source.city});
}
assert.deepEqual(buildDropFeedAreaRequest('CA', 'CA::san diego'), { key: 'area', value: 'san diego' });

const sourceContracts = [
  ['src/components/sections/DropFeed.tsx', ['buildDropFeedAreaRequest(feedStateParam, countyFilter)', 'californiaAreaMatchesFields(areaLabelsForDrop(drop), [wanted])']],
  ['src/app/dashboard/page.tsx', ['californiaAreaMatchesFields([', 'areaPrefs.caAreas']],
  ['src/app/api/drops/route.ts', ['parseCaliforniaAreaQuery', 'californiaAreaMatchesFields']],
  ['src/app/api/stores/route.ts', ['parseCaliforniaAreaQuery', 'californiaAreaMatchesFields']],
  ['src/app/api/locations/route.ts', ['parseCaliforniaAreaQuery', 'californiaAreaMatchesFields']],
  ['src/lib/alert-delivery.ts', ['areaPrefs.caAreas', 'californiaAreaMatchesFields']],
  ['src/lib/email-alerts.ts', ['prefs.caAreas', 'matchedCaliforniaArea']],
  ['src/app/api/user/preferences/route.ts', ['caAreas: string[]', 'normalizeCaliforniaAreas']],
] as const;

for (const [path, snippets] of sourceContracts) {
  const source = await readFile(path, 'utf8');
  for (const snippet of snippets) assert.ok(source.includes(snippet), `${path} must contain California contract: ${snippet}`);
}

console.log('California reviewed city area contracts passed.');
