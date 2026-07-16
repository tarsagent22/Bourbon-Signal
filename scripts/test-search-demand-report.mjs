import assert from 'node:assert/strict';
import { buildPrivacySafeSearchDemand } from '../automation/bourbon-signal/search-demand-core.mjs';

const events = [
  ...Array.from({ length: 5 }, (_, index) => ({
    query: index === 0 ? 'Weller Twelve' : 'Weller 12',
    state: 'NC',
    matchedBottleId: 'weller-12',
    matchedBottleName: 'Weller 12 Year',
    outcome: 'matched',
    capturedAt: `2026-07-16T00:0${index}:00.000Z`,
  })),
  ...Array.from({ length: 4 }, () => ({ query: 'Stagg', state: 'VA', matchedBottleId: 'stagg', matchedBottleName: 'Stagg', outcome: 'matched' })),
  { query: 'person@example.com', state: 'NC', matchedBottleId: 'weller-12', matchedBottleName: 'Weller 12 Year' },
  { query: 'https://example.com/weller', state: 'NC', matchedBottleId: 'weller-12', matchedBottleName: 'Weller 12 Year' },
];
const report = buildPrivacySafeSearchDemand(events, {
  catalog: [
    { id: 'weller-12', canonical_id: 'weller-12', canonical_name: 'Weller 12 Year', name: 'Weller 12 Year' },
    { id: 'stagg', canonical_id: 'stagg', canonical_name: 'Stagg', name: 'Stagg' },
  ],
  approvedStateCodes: ['NC', 'VA'],
  minCohortSize: 2,
});

assert.deepEqual(report.privacy, { minCohortSize: 5, containsPii: false, containsRawHistory: false });
assert.equal(report.acceptedEvents, 9);
assert.equal(report.rejectedSensitiveEvents, 2);
assert.deepEqual(report.bottles, [{ canonicalBottleId: 'weller-12', canonicalBottleName: 'Weller 12 Year', eventCount: 5, weightedDemand: 5 }]);
assert.deepEqual(report.geographies, [{ state: 'NC', eventCount: 5, weightedDemand: 5 }]);
assert.deepEqual(report.suppressed, { bottleCohorts: 1, geographyCohorts: 1 });
const serialized = JSON.stringify(report);
for (const forbidden of ['query', 'events', 'capturedAt', 'person@example.com', 'https://']) assert.equal(serialized.includes(forbidden), false);

console.log('Privacy-safe search demand report contract passed.');
