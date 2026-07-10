import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { atomicWriteJson, validateFwgsChunk, validateFwgsFullArtifact } from './fwgs-artifact-policy.mjs';

const products = Array.from({ length: 12 }, (_, index) => ({ sku: `sku-${index}` }));
const locations = Array.from({ length: 16 }, (_, index) => ({ locationId: String(600 + index), latitude: 40, longitude: -77 }));
const rows = Array.from({ length: 1000 }, (_, index) => ({
  product: { sku: `sku-${index % 12}` },
  location: { locationId: String(index % 616) },
  quantity: 1
}));

const lastChunk = {
  locationTotal: 616,
  products,
  locations,
  inventoryRows: [],
  productSearches: Array.from({ length: 37 }, () => ({ ok: true, status: 200 })),
  summary: { sourceLocationCount: 16, excludedLocationCount: 0, invalidCoordinateCount: 0 }
};
assert.equal(validateFwgsChunk(lastChunk, { offset: 600, limit: 300 }).ok, true, 'final partial chunk should require the remaining statewide locations');
assert.equal(validateFwgsChunk({ ...lastChunk, locations: locations.slice(0, 14), summary: { ...lastChunk.summary, excludedLocationCount: 2 } }, { offset: 600, limit: 300 }).ok, true, 'explicitly ineligible stores should reconcile without creating a coverage gap');
assert.equal(validateFwgsChunk({ ...lastChunk, locations: locations.slice(1) }, { offset: 600, limit: 300 }).ok, false, 'incomplete final chunk must fail');
assert.equal(validateFwgsChunk({ ...lastChunk, productSearches: [{ ok: false, status: 403 }] }, { offset: 600, limit: 300 }).ok, false, 'challenged product searches must fail');

const full = {
  locationTotal: 616,
  locations: Array.from({ length: 616 }, (_, index) => ({ locationId: String(index), latitude: 40, longitude: -77 })),
  inventoryRows: rows,
  failedChunks: [],
  summary: {
    locationCount: 616,
    sourceLocationCount: 616,
    excludedLocationCount: 0,
    positiveInventoryRowCount: 1000,
    positiveInventoryProductCount: 12,
    searchTermCount: 37,
    invalidCoordinateCount: 0
  }
};
assert.equal(validateFwgsFullArtifact(full).ok, true, 'complete statewide artifact should pass');
assert.equal(validateFwgsFullArtifact({ ...full, locations: full.locations.slice(0, 400) }).ok, false, 'low store coverage must fail');
assert.equal(validateFwgsFullArtifact({ ...full, failedChunks: [{ offset: 300 }] }).ok, false, 'failed chunks must fail');
assert.equal(validateFwgsFullArtifact({ ...full, staleChunks: [{ offset: 300 }] }).ok, false, 'stale fallback chunks must not be published as a fresh statewide artifact');
assert.equal(validateFwgsFullArtifact({ ...full, inventoryRows: [...rows, rows[0]] }).ok, false, 'duplicate SKU/store rows must fail');
assert.equal(validateFwgsFullArtifact({ ...full, inventoryRows: [{ ...rows[0], location: { locationId: 'missing' } }, ...rows.slice(1)] }).ok, false, 'orphan store rows must fail');
assert.equal(validateFwgsFullArtifact({ ...full, inventoryRows: [{ ...rows[0], quantity: null }, ...rows.slice(1)] }).ok, false, 'unknown quantity must not become a positive row');

const directory = await mkdtemp(path.join(os.tmpdir(), 'fwgs-policy-'));
const file = path.join(directory, 'artifact.json');
await atomicWriteJson(file, { ok: true });
assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), { ok: true });

console.log('FWGS artifact hardening tests passed.');
