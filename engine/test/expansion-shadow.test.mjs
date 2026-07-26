import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildShadowEvidence, runExpansionShadow, selectShadowCandidates } from '../src/run-expansion-shadow.mjs';

test('shadow collection only selects explicitly eligible non-active candidates and never emits publishable rows', () => {
  const lifecycle = {
    activeStates: ['AA'],
    states: {
      AA: { publicStatus: 'active', shadowEligible: true },
      ZZ: { publicStatus: 'research_only', shadowEligible: true },
      YY: { publicStatus: 'research_only', shadowEligible: false },
    },
  };
  assert.deepEqual(selectShadowCandidates(lifecycle, { limit: 5 }), ['ZZ']);
  const evidence = buildShadowEvidence('ZZ', {
    status: 'useful', signals: [{ storeId: 'zz-1', storeAddress: '1 Main', observedAt: '2026-07-16T00:00:00.000Z', canAlertAsInventory: true }],
    sources: [{ ok: true }], roadblocks: [], startedAt: '2026-07-16T00:00:00.000Z', finishedAt: '2026-07-16T00:00:01.000Z',
  });
  assert.equal(evidence.publication.allowed, false);
  assert.equal(evidence.alerts.disabled, true);
  assert.equal(evidence.metrics.exactStoreRatio, 1);
});

test('shadow collection persists an explicit report and marks failed inner collectors unsuccessful', async () => {
  const outDir = await mkdtemp(path.join(tmpdir(), 'bs-expansion-shadow-'));
  try {
    const lifecycle = { activeStates: [], states: { ZZ: { publicStatus: 'research_only', shadowEligible: true } } };
    const summary = await runExpansionShadow({
      lifecycle,
      states: ['ZZ'],
      limit: 1,
      outDir,
      runCollector: async () => ({ ok: false, stdout: '', stderr: 'fixture failure', error: 'collector exited 1' }),
    });
    assert.equal(summary.results[0].executionOk, false);
    assert.equal(summary.results[0].collectorStatus, 'failed_shadow_collection');
    const report = JSON.parse(await readFile(path.join(summary.results[0].directory, 'report.json'), 'utf8'));
    const evidence = JSON.parse(await readFile(path.join(summary.results[0].directory, 'evidence.json'), 'utf8'));
    assert.equal(report.status, 'failed_shadow_collection');
    assert.equal(evidence.execution.ok, false);
    assert.equal(evidence.publication.productionSnapshotTouched, false);
    assert.equal(evidence.alerts.deliveryAttempted, false);
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
});
