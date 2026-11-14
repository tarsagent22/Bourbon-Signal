import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';

const baseUrl = String(process.argv[2] || process.env.PREVIEW_URL || '').replace(/\/$/, '');
if (!/^https:\/\//.test(baseUrl)) throw new Error('Usage: node scripts/test-massachusetts-live-canary.mjs <https-preview-url>');

const expectedStores = new Map([
  ['ma:cbc-westford', '142 Littleton Rd, Westford, MA 01886, USA'],
  ['ma:wildduck-boston', '86 Massachusetts Ave, Boston, MA 02117, USA'],
  ['table-and-vine:5f52a8713df8c66117da02b2', '1119 Riverdale St, West Springfield, MA 01089, USA'],
  ['redstone-liquors:5d5d87598a9270243a2d2714', '115 Main St, Stoneham, MA 02180, USA'],
  ['ma-julios-westborough', '140 Turnpike Road, Westborough, MA 01581, USA'],
]);

async function get(path) {
  const response = await fetch(`${baseUrl}${path}`, { redirect: 'manual', signal: AbortSignal.timeout(30_000) });
  if ([401, 403].includes(response.status)) return { status: response.status, protected: true };
  assert.equal(response.status, 200, `${path} returned ${response.status}`);
  return { status: response.status, data: await response.json() };
}

const coverageResult = await get('/api/coverage');
let coverage;
if (!coverageResult.protected) {
  coverage = coverageResult.data.states?.find(row => row.code === 'MA');
  assert.ok(coverage, 'Coverage must expose Massachusetts');
  assert.equal(coverage.freshness?.currentInventoryStores, 4);
  assert.equal(coverage.scope?.searchableStores, 5);
  assert.equal(coverage.capabilities?.restockAlerts, false);
}

const dropsResult = await get('/api/drops?state=MA');
let dropCount = null;
if (!dropsResult.protected) {
  const rows = Array.isArray(dropsResult.data) ? dropsResult.data : dropsResult.data.drops || dropsResult.data.items || [];
  assert.equal(rows.length, 7);
  assert.ok(rows.every(row => row.state === 'MA' && row.canAlertAsInventory !== true && row.canAlertAsWatch !== true
    && row.eligibleForDelivery !== true && row.eligibleForEmail !== true && row.eligibleForSms !== true));
  dropCount = rows.length;
}

const [storesResult, locationsResult] = await Promise.all([
  get('/api/stores?state=MA&limit=1000'), get('/api/locations?state=MA&limit=1000'),
]);
let storeCount = null, locationCount = null;
if (!storesResult.protected) {
  const rows = storesResult.data.stores || storesResult.data.items || [];
  assert.equal(rows.filter(row => row.state === 'MA').length, expectedStores.size);
  for (const [id, address] of expectedStores) assert.ok(rows.some(row => (row.storeId || row.id) === id && (row.storeAddress || row.address) === address), `Missing ${id}`);
  storeCount = rows.filter(row => row.state === 'MA').length;
}
if (!locationsResult.protected) {
  const rows = locationsResult.data.locations || locationsResult.data.items || [];
  assert.equal(rows.filter(row => row.state === 'MA').length, expectedStores.size);
  for (const [id, address] of expectedStores) assert.ok(rows.some(row => (row.storeId || row.id) === id && (row.storeAddress || row.address) === address), `Missing ${id}`);
  locationCount = rows.filter(row => row.state === 'MA').length;
}

const proof = {
  state: 'MA', previewUrl: baseUrl, evaluatedAt: new Date().toISOString(),
  coverage: { status: coverageResult.status, protected: coverageResult.protected || false,
    currentInventoryStores: coverage?.freshness?.currentInventoryStores ?? null,
    searchableStores: coverage?.scope?.searchableStores ?? null, restockAlerts: coverage?.capabilities?.restockAlerts ?? null },
  drops: { status: dropsResult.status, protected: dropsResult.protected || false, rows: dropCount,
    allDeliveryDisabled: dropCount === null ? null : true },
  stores: { status: storesResult.status, protected: storesResult.protected || false, exactPremises: storeCount },
  locations: { status: locationsResult.status, protected: locationsResult.protected || false, exactPremises: locationCount },
  protectionBypassed: false,
};
await writeFile('engine/out/canary/MA/site/live-customer-paths.json', JSON.stringify(proof, null, 2) + '\n');
console.log(JSON.stringify(proof));
