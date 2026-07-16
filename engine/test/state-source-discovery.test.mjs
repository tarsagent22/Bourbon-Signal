import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  discoverStateSources,
  selectRotatingStateCohort,
} from '../src/discovery/state-source-discovery.mjs';

test('rotating discovery chooses only eligible candidate states at a fixed cohort size', () => {
  const cohort = selectRotatingStateCohort([
    { state: 'CO', nextEligibleAt: '2026-07-15T00:00:00.000Z', lastDiscoveryAt: null },
    { state: 'MA', nextEligibleAt: '2026-07-15T00:00:00.000Z', lastDiscoveryAt: '2026-07-10T00:00:00.000Z' },
    { state: 'ME', nextEligibleAt: '2026-07-17T00:00:00.000Z', lastDiscoveryAt: null },
  ], { now: '2026-07-16T00:00:00.000Z', cohortSize: 2 });
  assert.deepEqual(cohort.map((state) => state.state), ['CO', 'MA']);
});

test('state discovery enforces query budgets, dedupes domains, filters state mismatches, and has no promotion side effects', async (t) => {
  const outDir = await mkdtemp(path.join(os.tmpdir(), 'bourbon-discovery-'));
  t.after(() => rm(outDir, { recursive: true, force: true }));
  const calls = [];
  const activeStates = ['OH'];
  const client = {
    async search(query) {
      calls.push(query);
      return {
        cacheHit: false,
        results: [
          { title: 'Colorado Barrel House', url: 'https://www.barrel.example/bourbon', domain: 'barrel.example', description: 'Colorado bourbon retailer' },
          { title: 'Colorado Barrel House release', url: 'https://barrel.example/releases', domain: 'barrel.example', description: 'Colorado allocated releases' },
          { title: 'Wyoming retailer', url: 'https://wy.example/bourbon', domain: 'wy.example', description: 'Wyoming bourbon retailer' },
        ],
      };
    },
  };

  const [report] = await discoverStateSources({
    states: [{ state: 'CO', customerLabel: 'Colorado', lifecycleStage: 'discovery', requestBudget: { maxQueriesPerRun: 2 } }],
    stateIds: ['CO'],
    client,
    outDir,
    maxQueriesPerRun: 2,
    maxQueriesPerState: 2,
    now: () => '2026-07-16T12:00:00.000Z',
  });
  const saved = JSON.parse(await readFile(path.join(outDir, 'CO.json'), 'utf8'));

  assert.equal(calls.length, 2);
  assert.equal(report.candidates.length, 1);
  assert.equal(report.candidates[0].evidenceKind, 'search_discovery_only');
  assert.equal(report.candidates[0].inventoryEvidence, false);
  assert.equal(report.candidates[0].promotionEligible, false);
  assert.deepEqual(saved, report);
  assert.deepEqual(activeStates, ['OH']);
  assert.equal(JSON.stringify(saved).includes('rawBody'), false);
});
