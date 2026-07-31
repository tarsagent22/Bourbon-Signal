import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { resolveAggregateStateReports } from '../src/state-report-aggregation.mjs';
import { markStaleReport } from '../src/state-report-fallback.mjs';

const readJson = async (file, fallback) => {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch { return fallback; }
};

test('partial refresh aggregates fresh requested reports with cached reports for every active state', async () => {
  const statesOut = await mkdtemp(path.join(os.tmpdir(), 'bourbon-state-aggregation-'));
  try {
    const configs = [{ id: 'NC' }, { id: 'AZ' }, { id: 'IN' }];
    await writeFile(path.join(statesOut, 'AZ.json'), JSON.stringify({ state: 'AZ', signals: [{ id: 'cached-az' }] }));
    await writeFile(path.join(statesOut, 'IN.json'), JSON.stringify({ state: 'IN', signals: [{ id: 'cached-in' }] }));
    const freshNc = { state: 'NC', signals: [{ id: 'fresh-nc' }] };
    const resolved = await resolveAggregateStateReports({ configs, collected: new Map([['NC', freshNc]]), statesOut, readReport: readJson });

    assert.deepEqual(resolved.map(({ report }) => report.state), ['NC', 'AZ', 'IN']);
    assert.deepEqual(resolved.map(({ attempted }) => attempted), [true, false, false]);
    assert.deepEqual(resolved.map(({ wasRun }) => wasRun), [true, false, false]);
    assert.equal(resolved[0].report, freshNc);
    assert.equal(resolved[2].report.signals[0].id, 'cached-in');
  } finally {
    await rm(statesOut, { recursive: true, force: true });
  }
});

test('rejected worker attempts use cache without being marked as fresh', async () => {
  const statesOut = await mkdtemp(path.join(os.tmpdir(), 'bourbon-state-aggregation-rejected-'));
  try {
    const cached = { state: 'IN', signals: [{ id: 'cached-in' }] };
    await writeFile(path.join(statesOut, 'IN.json'), JSON.stringify(cached));
    const [resolved] = await resolveAggregateStateReports({ configs: [{ id: 'IN' }], collected: new Map([['IN', null]]), statesOut, readReport: readJson });
    assert.equal(resolved.attempted, true);
    assert.equal(resolved.wasRun, false);
    assert.equal(resolved.report.signals[0].id, 'cached-in');
    const stale = markStaleReport(
      { ...resolved.report, status: 'useful', finishedAt: '2026-07-17T10:00:00.000Z', roadblocks: [], signals: [{ id: 'cached-in', canAlertAsInventory: true, canAlertAsWatch: true, quantity: 1 }] },
      { id: 'IN', label: 'Indiana' },
      'worker failed before returning a current report',
      '2026-07-17T11:00:00.000Z',
    );
    assert.equal(stale.stale, true);
    assert.equal(stale.status, 'stale_useful');
    assert.equal(stale.signals[0].canAlertAsInventory, false);
    assert.equal(stale.signals[0].canAlertAsWatch, false);
    assert.equal(stale.signals[0].sourceAvailabilityVerified, false);
    assert.equal(stale.signals[0].availabilityStatus, 'stale');
    assert.equal(stale.signals[0].sourceStale, true);
    assert.equal(stale.signals[0].raw.staleNonAlertable, true);
    assert.equal(stale.signals[0].raw.staleFallback, true);
  } finally {
    await rm(statesOut, { recursive: true, force: true });
  }
});

test('partial refresh fails closed when any active state lacks a current or cached report', async () => {
  const statesOut = await mkdtemp(path.join(os.tmpdir(), 'bourbon-state-aggregation-missing-'));
  try {
    await assert.rejects(
      resolveAggregateStateReports({ configs: [{ id: 'NC' }, { id: 'IN' }], collected: new Map([['NC', { state: 'NC' }]]), statesOut, readReport: readJson }),
      /No current or previous state report available for IN/,
    );
  } finally {
    await rm(statesOut, { recursive: true, force: true });
  }
});
