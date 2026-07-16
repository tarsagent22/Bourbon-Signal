import assert from 'node:assert/strict';
import { rankSourceInvestments } from '../automation/bourbon-signal/source-roi-core.mjs';

const report = rankSourceInvestments({
  drops: [
    { state: 'NC', source: 'source-a', bottle_id: 'weller-12', bottle: 'Weller 12 Year', locationPrecision: 'store_level' },
    { state: 'VA', source: 'source-b', bottle_id: 'stagg', bottle: 'Stagg', locationPrecision: 'store_level' },
  ],
  alerts: [],
  sourceHealth: { states: [] },
  demand: {
    privacy: { minCohortSize: 5, containsPii: false, containsRawHistory: false },
    geographies: [{ state: 'NC', weightedDemand: 40, memberCount: 10 }],
    bottles: [{ canonicalBottleId: 'weller-12', canonicalBottleName: 'Weller 12 Year', weightedDemand: 60, memberCount: 15 }],
  },
  generatedAt: '2026-07-16T00:00:00.000Z',
});

const nc = report.top.find((row) => row.state === 'NC');
const va = report.top.find((row) => row.state === 'VA');
assert.ok(nc && va);
assert.equal(nc.demandScore, 100);
assert.equal(va.demandScore, 0);
assert.ok(nc.score > va.score);
assert.equal(report.demandWeighted, true);

const unsafe = rankSourceInvestments({
  drops: [{ state: 'NC', source: 'source-a', bottle_id: 'weller-12', bottle: 'Weller 12 Year' }],
  demand: {
    privacy: { minCohortSize: 1, containsPii: true, containsRawHistory: true },
    geographies: [{ state: 'NC', weightedDemand: 10_000 }],
    bottles: [],
  },
});
assert.equal(unsafe.demandWeighted, false);
assert.equal(unsafe.top[0].demandScore, 0);

console.log('Demand-weighted source ROI contract passed.');
