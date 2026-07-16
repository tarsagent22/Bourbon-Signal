import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { collectState } from '../src/collectors/generic-state.mjs';

function response(url, text) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    url,
    requestedUrl: url,
    contentType: 'text/html',
    bytes: Buffer.byteLength(text),
    elapsedMs: 1,
    text,
    error: null,
  };
}

const bible = {
  scanText(text) {
    return /fixture bourbon/i.test(text)
      ? [{ id: 'fixture-bottle', canonical: 'Fixture Bourbon', tier: 'tracked' }]
      : [];
  },
  match() { return null; },
};

test('generic simple-source lane uses standardized isolation and preserves successful siblings', async () => {
  const config = {
    id: 'ZZ',
    label: 'Fixture state',
    tier: 'test',
    strategy: 'fixture',
    cadence: 'test',
    value: 'fixture',
    sources: [
      { kind: 'html', label: 'healthy fixture', url: 'https://healthy.fixture.test/source' },
      { kind: 'html', label: 'throwing fixture', url: 'https://throwing.fixture.test/source' },
      { kind: 'html', label: 'second healthy fixture', url: 'https://sibling.fixture.test/source' },
    ],
    apiCandidates: [],
  };
  const fetcher = async (url) => {
    if (url.includes('throwing')) throw new Error('fixture collector threw');
    return response(url, '<h1>Fixture Bourbon</h1><p>Inventory in stock.</p>');
  };

  const report = await collectState(config, bible, {
    fetcher,
    sourceRunnerOptions: { maxAttempts: 1, timeoutMs: 100, retryDelayMs: 0 },
  });

  assert.equal(report.sourceResults.length, 3);
  assert.equal(report.sourceResults.every((result) => /^zz:configured:[a-f0-9]{16}$/.test(result.sourceId)), true);
  assert.equal(new Set(report.sourceResults.map((result) => result.sourceId)).size, 3);
  assert.equal(report.sourceResults[0].status, 'success');
  assert.equal(report.sourceResults[1].status, 'failed');
  assert.equal(report.sourceResults[2].status, 'success');
  assert.equal(report.signals.some((signal) => signal.sourceLabel === 'healthy fixture'), true);
  assert.equal(report.signals.some((signal) => signal.sourceLabel === 'second healthy fixture'), true);
  assert.equal(report.roadblocks.some((roadblock) => roadblock.source === 'throwing fixture'), true);
});

test('representative multi-source California lane and run-level SLO use shared runtime without replacing orchestration', async () => {
  const precision = await readFile(new URL('../src/collectors/precision-probes.mjs', import.meta.url), 'utf8');
  assert.match(precision, /runSourceAdapters\(californiaAdapters/);
  assert.match(precision, /createSourceAdapter\(\{[\s\S]*?id:\s*`ca:/);
  assert.doesNotMatch(precision, /async function retryCaliforniaFetch/);

  const stateRunner = await readFile(new URL('../src/run-state.mjs', import.meta.url), 'utf8');
  assert.match(stateRunner, /collectState\(config, bible,/);
  const engineRunner = await readFile(new URL('../src/run.mjs', import.meta.url), 'utf8');
  assert.match(engineRunner, /runBoundedPool\(runnable/);
  assert.match(engineRunner, /source-slo-7d\.json/);
  assert.match(engineRunner, /appendSourceSloObservations/);
  assert.match(engineRunner, /buildSevenDaySourceSloReport/);
});
