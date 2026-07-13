import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCityHiveReportedQuantity, rotatingSourceCohort } from '../src/collectors/cityhive-hardening.mjs';

test('Tennessee CityHive cohorts rotate without hammering the full source universe', () => {
  const sources = ['a', 'b', 'c', 'd', 'e'];
  assert.deepEqual(rotatingSourceCohort(sources, '1970-01-01T00:00:00.000Z', 2, 60 * 60_000), ['a', 'b']);
  assert.deepEqual(rotatingSourceCohort(sources, '1970-01-01T01:00:00.000Z', 2, 60 * 60_000), ['c', 'd']);
  assert.equal(new Set(rotatingSourceCohort(sources, '1970-01-01T02:00:00.000Z', 8, 60 * 60_000)).size, 5);
});

test('CityHive quantity 100 is binary availability rather than an exact shelf count', () => {
  assert.deepEqual(normalizeCityHiveReportedQuantity(100), {
    reportedQuantity: 100,
    binaryAvailability: true,
    quantity: 1
  });
  assert.deepEqual(normalizeCityHiveReportedQuantity(7), {
    reportedQuantity: 7,
    binaryAvailability: false,
    quantity: 7
  });
});
