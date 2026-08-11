import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assertCredibleVirginiaOfficialLocations,
  parseArcgisFeaturesPayload,
  replaceRefreshedOfficialLocations,
  virginiaOfficialStoreIdentity,
} from '../src/location-identities.mjs';

test('Virginia official store names normalize to the inventory store ID', () => {
  assert.deepEqual(virginiaOfficialStoreIdentity('ABC Store 049'), {
    id: '49',
    sourceStoreId: '49',
  });
  assert.deepEqual(virginiaOfficialStoreIdentity('Virginia ABC Store 49'), {
    id: '49',
    sourceStoreId: '49',
  });
});

test('non-store and ambiguous names do not invent a Virginia ID', () => {
  assert.equal(virginiaOfficialStoreIdentity('Virginia ABC Headquarters'), null);
  assert.equal(virginiaOfficialStoreIdentity('ABC Store'), null);
});

test('ArcGIS payload validation rejects error envelopes, malformed bodies, and empty result sets', () => {
  assert.throws(() => parseArcgisFeaturesPayload(JSON.stringify({ error: { message: 'service unavailable' } })), /ArcGIS error/i);
  assert.throws(() => parseArcgisFeaturesPayload(JSON.stringify({ ok: true })), /features/i);
  assert.throws(() => parseArcgisFeaturesPayload(JSON.stringify({ features: [] })), /empty/i);
  assert.deepEqual(parseArcgisFeaturesPayload(JSON.stringify({ features: [{ attributes: { LandmkName: 'ABC Store 049' } }] })), [
    { attributes: { LandmkName: 'ABC Store 049' } },
  ]);
  assert.throws(() => assertCredibleVirginiaOfficialLocations([{ id: '49' }]), /credible minimum/i);
  const credible = Array.from({ length: 300 }, (_, index) => ({ id: String(index + 1) }));
  assert.equal(assertCredibleVirginiaOfficialLocations(credible), credible);
});

test('a successful source refresh removes obsolete hashed rows before inserting canonical IDs', () => {
  const locations = replaceRefreshedOfficialLocations({
    previous: [
      { id: 'legacy-hash', state: 'VA', source: 'Virginia ABC stores ArcGIS', name: 'ABC Store 049' },
      { id: 'other', state: 'OR', source: 'Oregon OLCC liquor stores ArcGIS', name: 'Other store' },
    ],
    collected: [
      { id: '49', sourceStoreId: '49', state: 'VA', source: 'Virginia ABC stores ArcGIS', name: 'ABC Store 049' },
    ],
    refreshedSources: ['Virginia ABC stores ArcGIS'],
  });
  assert.deepEqual(locations.map((location) => location.id).sort(), ['49', 'other']);
});
