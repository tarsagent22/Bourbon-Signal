import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  acquireRefreshControlPlane,
  checkpointRefreshStage,
  finishRefreshControlPlane,
  nextRefreshStage,
  readRefreshControlPlane,
  renewRefreshControlLease,
} from '../src/refresh-control-plane.mjs';

const STAGES = ['build_bible', 'collect_states', 'export_site'];
const SCOPE = { requestedStates: [], forceAllStates: false };

test('a restarted runner resumes from the next incomplete stage after a dead owner', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'bs-refresh-control-plane-'));
  const statePath = path.join(root, 'refresh-control.json');
  try {
    const first = await acquireRefreshControlPlane({
      statePath,
      scope: SCOPE,
      stages: STAGES,
      now: '2026-08-28T12:00:00.000Z',
      pid: 101,
      ownerAlive: () => true,
    });
    assert.equal(first.acquired, true);
    assert.equal(first.resumed, false);
    await checkpointRefreshStage({
      statePath,
      leaseId: first.session.lease.leaseId,
      stage: 'build_bible',
      status: 'completed',
      now: '2026-08-28T12:01:00.000Z',
    });

    const resumed = await acquireRefreshControlPlane({
      statePath,
      scope: SCOPE,
      stages: STAGES,
      now: '2026-08-28T12:10:00.000Z',
      pid: 202,
      ownerAlive: (pid) => pid !== 101,
    });
    assert.equal(resumed.acquired, true);
    assert.equal(resumed.resumed, true);
    assert.deepEqual(resumed.session.completedStages, ['build_bible']);
    assert.equal(nextRefreshStage(resumed.session), 'collect_states');
    assert.equal(resumed.session.lease.recoveredFromLeaseId, first.session.lease.leaseId);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('duplicate refresh dispatch is denied while the live owner lease is still current', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'bs-refresh-control-plane-'));
  const statePath = path.join(root, 'refresh-control.json');
  try {
    const first = await acquireRefreshControlPlane({
      statePath,
      scope: SCOPE,
      stages: STAGES,
      now: '2026-08-28T12:00:00.000Z',
      pid: 111,
      ownerAlive: () => true,
      leaseMs: 30 * 60_000,
    });
    const second = await acquireRefreshControlPlane({
      statePath,
      scope: SCOPE,
      stages: STAGES,
      now: '2026-08-28T12:05:00.000Z',
      pid: 222,
      ownerAlive: () => true,
      leaseMs: 30 * 60_000,
    });
    assert.equal(first.acquired, true);
    assert.equal(second.acquired, false);
    assert.equal(second.reason, 'active_owner');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('an expired lease is fenced and cannot overwrite the takeover session', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'bs-refresh-control-plane-'));
  const statePath = path.join(root, 'refresh-control.json');
  try {
    const first = await acquireRefreshControlPlane({
      statePath,
      scope: SCOPE,
      stages: STAGES,
      now: '2026-08-28T12:00:00.000Z',
      pid: 111,
      ownerAlive: () => true,
      leaseMs: 60_000,
    });
    await renewRefreshControlLease({
      statePath,
      leaseId: first.session.lease.leaseId,
      now: '2026-08-28T12:00:30.000Z',
      leaseMs: 60_000,
    });
    const takeover = await acquireRefreshControlPlane({
      statePath,
      scope: SCOPE,
      stages: STAGES,
      now: '2026-08-28T12:02:00.000Z',
      pid: 222,
      ownerAlive: () => true,
      leaseMs: 60_000,
    });
    assert.equal(takeover.acquired, true);
    assert.equal(takeover.resumed, true);
    await assert.rejects(
      checkpointRefreshStage({
        statePath,
        leaseId: first.session.lease.leaseId,
        stage: 'build_bible',
        status: 'completed',
        now: '2026-08-28T12:02:30.000Z',
      }),
      /was fenced/i,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('simultaneous starters serialize acquisition so only one owns the live lease', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'bs-refresh-control-plane-'));
  const statePath = path.join(root, 'refresh-control.json');
  try {
    const [left, right] = await Promise.all([
      acquireRefreshControlPlane({ statePath, scope: SCOPE, stages: STAGES, now: '2026-08-28T12:00:00.000Z', pid: 501, ownerAlive: () => true }),
      acquireRefreshControlPlane({ statePath, scope: SCOPE, stages: STAGES, now: '2026-08-28T12:00:00.000Z', pid: 502, ownerAlive: () => true }),
    ]);
    assert.equal([left, right].filter((result) => result.acquired).length, 1);
    assert.equal([left, right].filter((result) => !result.acquired && result.reason === 'active_owner').length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('concurrent heartbeat and checkpoint writes preserve the completed stage', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'bs-refresh-control-plane-'));
  const statePath = path.join(root, 'refresh-control.json');
  try {
    const acquired = await acquireRefreshControlPlane({
      statePath,
      scope: SCOPE,
      stages: STAGES,
      now: '2026-08-28T12:00:00.000Z',
      pid: 503,
      ownerAlive: () => true,
    });
    await Promise.all([
      renewRefreshControlLease({ statePath, leaseId: acquired.session.lease.leaseId, now: '2026-08-28T12:00:30.000Z' }),
      checkpointRefreshStage({ statePath, leaseId: acquired.session.lease.leaseId, stage: 'build_bible', status: 'completed', now: '2026-08-28T12:00:31.000Z' }),
    ]);
    const saved = await readRefreshControlPlane(statePath);
    assert.deepEqual(saved.completedStages, ['build_bible']);
    assert.equal(saved.stageResults.build_bible.status, 'completed');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('a truncated control-plane file fails closed by starting a fresh session', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'bs-refresh-control-plane-'));
  const statePath = path.join(root, 'refresh-control.json');
  try {
    await writeFile(statePath, '{"contractVersion":"broken"', 'utf8');
    const session = await acquireRefreshControlPlane({
      statePath,
      scope: SCOPE,
      stages: STAGES,
      now: '2026-08-28T12:00:00.000Z',
      pid: 333,
      ownerAlive: () => false,
    });
    assert.equal(session.acquired, true);
    assert.equal(session.resumed, false);
    assert.equal(nextRefreshStage(session.session), 'build_bible');
    await finishRefreshControlPlane({
      statePath,
      leaseId: session.session.lease.leaseId,
      now: '2026-08-28T12:01:00.000Z',
      status: 'succeeded',
    });
    const saved = JSON.parse(await readFile(statePath, 'utf8'));
    assert.equal(saved.status, 'succeeded');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('completed sessions remain readable for post-run diagnostics', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'bs-refresh-control-plane-'));
  const statePath = path.join(root, 'refresh-control.json');
  try {
    const session = await acquireRefreshControlPlane({
      statePath,
      scope: { requestedStates: ['NC'] },
      stages: STAGES,
      now: '2026-08-28T12:00:00.000Z',
      pid: 444,
      ownerAlive: () => true,
    });
    await checkpointRefreshStage({
      statePath,
      leaseId: session.session.lease.leaseId,
      stage: 'build_bible',
      status: 'completed',
      now: '2026-08-28T12:00:10.000Z',
      details: { skipped: false },
    });
    await finishRefreshControlPlane({
      statePath,
      leaseId: session.session.lease.leaseId,
      status: 'succeeded',
      now: '2026-08-28T12:00:20.000Z',
      details: { warnings: 0 },
    });
    const saved = await readRefreshControlPlane(statePath);
    assert.equal(saved.status, 'succeeded');
    assert.equal(saved.stageResults.build_bible.status, 'completed');
    assert.equal(saved.summary.warnings, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
