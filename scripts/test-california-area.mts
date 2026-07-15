import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { californiaAreaMatchesFields, normalizeCaliforniaAreas, parseCaliforniaAreaQuery, SUPPORTED_CALIFORNIA_AREAS } from '../src/lib/california-area.ts';

assert.deepEqual(SUPPORTED_CALIFORNIA_AREAS, ['San Diego']);
assert.deepEqual(normalizeCaliforniaAreas(['San Diego', 'Los Angeles', 'san diego']), ['San Diego']);
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
assert.deepEqual(parseCaliforniaAreaQuery('Los Angeles'), { requested: true, valid: false, areas: [] });

const sourceContracts = [
  ['src/components/sections/DropFeed.tsx', ['feedStateParam === "CA" ? "area" : "store"', 'californiaAreaMatchesFields(areaLabelsForDrop(drop), [wanted])']],
  ['src/app/dashboard/page.tsx', ['californiaAreaMatchesFields([', 'areaPrefs.caAreas']],
  ['src/app/api/drops/route.ts', ['parseCaliforniaAreaQuery', 'californiaAreaMatchesFields']],
  ['src/app/api/stores/route.ts', ['parseCaliforniaAreaQuery', 'californiaAreaMatchesFields']],
  ['src/app/api/locations/route.ts', ['parseCaliforniaAreaQuery', 'californiaAreaMatchesFields']],
  ['src/lib/alert-delivery.ts', ['areaPrefs.caAreas', 'californiaAreaMatchesFields']],
  ['src/lib/email-alerts.ts', ['prefs.caAreas', 'californiaAreaMatchesFields']],
  ['src/app/api/user/preferences/route.ts', ['caAreas: string[]', 'normalizeCaliforniaAreas']],
] as const;

for (const [path, snippets] of sourceContracts) {
  const source = await readFile(path, 'utf8');
  for (const snippet of snippets) assert.ok(source.includes(snippet), `${path} must contain California contract: ${snippet}`);
}

console.log('California San Diego area contract passed.');
