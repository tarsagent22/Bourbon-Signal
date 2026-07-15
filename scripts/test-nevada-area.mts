import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { nevadaAreaMatchesFields, normalizeNevadaAreas, parseNevadaAreaQuery, SUPPORTED_NEVADA_AREAS } from '../src/lib/nevada-area.ts';

assert.deepEqual(SUPPORTED_NEVADA_AREAS, ['Las Vegas Valley', 'Reno–Sparks']);
assert.deepEqual(normalizeNevadaAreas(['Las Vegas Valley', 'Reno-Sparks', 'Reno–Sparks', 'Carson City']), ['Las Vegas Valley', 'Reno–Sparks']);
assert.equal(nevadaAreaMatchesFields(['Las Vegas'], ['Las Vegas Valley']), true);
assert.equal(nevadaAreaMatchesFields(['North Las Vegas, NV'], ['Las Vegas Valley']), true);
assert.equal(nevadaAreaMatchesFields(['Henderson, NV 89052'], ['Las Vegas Valley']), true);
assert.equal(nevadaAreaMatchesFields(['Summerlin'], ['Las Vegas Valley']), true);
assert.equal(nevadaAreaMatchesFields(['Reno, NV'], ['Reno–Sparks']), true);
assert.equal(nevadaAreaMatchesFields(['Sparks, NV 89431'], ['Reno–Sparks']), true);
assert.equal(nevadaAreaMatchesFields(['Carson City, NV'], ['Reno–Sparks']), false);
assert.equal(nevadaAreaMatchesFields(['Las Vegas'], ['Reno–Sparks']), false);
assert.equal(nevadaAreaMatchesFields(['Reno'], []), true);
assert.deepEqual(parseNevadaAreaQuery(null), { requested: false, valid: true, areas: [] });
assert.deepEqual(parseNevadaAreaQuery('Las Vegas Valley'), { requested: true, valid: true, areas: ['Las Vegas Valley'] });
assert.deepEqual(parseNevadaAreaQuery('Reno-Sparks'), { requested: true, valid: true, areas: ['Reno–Sparks'] });
assert.deepEqual(parseNevadaAreaQuery('Carson City'), { requested: true, valid: false, areas: [] });

const sourceContracts = [
  ['src/components/sections/DropFeed.tsx', ['feedStateParam === "NV"', 'nevadaAreaMatchesFields(areaLabelsForDrop(drop), [wanted])']],
  ['src/app/dashboard/page.tsx', ['nevadaAreaMatchesFields([', 'areaPrefs.nvAreas']],
  ['src/app/api/drops/route.ts', ['parseNevadaAreaQuery', 'nevadaAreaMatchesFields']],
  ['src/app/api/stores/route.ts', ['parseNevadaAreaQuery', 'nevadaAreaMatchesFields']],
  ['src/app/api/locations/route.ts', ['parseNevadaAreaQuery', 'nevadaAreaMatchesFields']],
  ['src/lib/alert-delivery.ts', ['areaPrefs.nvAreas', 'nevadaAreaMatchesFields']],
  ['src/lib/email-alerts.ts', ['prefs.nvAreas', 'nevadaAreaMatchesFields']],
  ['src/app/api/user/preferences/route.ts', ['nvAreas: string[]', 'normalizeNevadaAreas']],
] as const;

for (const [path, snippets] of sourceContracts) {
  const source = await readFile(path, 'utf8');
  for (const snippet of snippets) assert.ok(source.includes(snippet), `${path} must contain Nevada contract: ${snippet}`);
}

console.log('Nevada area contract passed.');
