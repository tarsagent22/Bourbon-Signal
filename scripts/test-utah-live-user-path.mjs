import assert from 'node:assert/strict';

const baseUrl = String(process.argv[2] || process.env.BOURBON_SIGNAL_TEST_BASE_URL || '').replace(/\/$/, '');
if (!/^https?:\/\//.test(baseUrl)) throw new Error('Usage: node scripts/test-utah-live-user-path.mjs <base-url>');

async function response(path) {
  return fetch(`${baseUrl}${path}`, { redirect: 'manual', signal: AbortSignal.timeout(30_000) });
}

async function json(path) {
  const result = await response(path);
  assert.equal(result.status, 200, `${path} returned ${result.status}`);
  return result.json();
}

const drops = await json('/api/drops?state=UT');
const rows = Array.isArray(drops) ? drops : drops.drops || drops.items || [];
assert.ok(rows.length > 0, 'Utah Drop Feed API must return customer-visible rows');
assert.ok(rows.every((row) => row.state === 'UT'));
assert.ok(rows.every((row) => row.informationalOnly === true && row.canAlertAsInventory !== true && row.canAlertAsWatch !== true));

const locationsResponse = await response('/api/locations?state=UT');
assert.ok([200, 401].includes(locationsResponse.status), `Finder route returned unexpected ${locationsResponse.status}`);
const locations = locationsResponse.status === 200 ? await locationsResponse.json() : [];
const locationRows = Array.isArray(locations) ? locations : locations.locations || locations.items || [];
assert.ok(locationRows.every((row) => row.state === 'UT'), 'Finder state filter must not leak other states');

console.log(`Utah live user path passed at ${baseUrl}: ${rows.length} drops, ${locationRows.length} exact locations, Finder ${locationsResponse.status === 401 ? 'auth guard' : 'state filter'} verified, zero alertable rows.`);
