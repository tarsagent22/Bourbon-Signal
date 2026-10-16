import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { assessEngineObservation, advanceEngineMonitor, planCadenceDispatch, reserveCadenceDispatch, acceptanceSummary } from './lib/engine-monitor-policy.mjs';
import { runEngineMonitor } from './engine-monitor.mjs';
const now = Date.parse('2026-10-16T12:00:00Z');
const at = minutes => new Date(now - minutes * 60000).toISOString();
function health(age = 10) { return { ok: true, release: { status: 'healthy' }, cron: { status: 'healthy' }, engine: {
  generatedAt: at(age), snapshotId: `snapshot-${age}`, dataSource: 'remote-snapshot', freshnessStage: 'healthy', degradedStateCount: 8,
} }; }
function observation(age = 10) { const h = health(age); return { ...assessEngineObservation(h, { nowMs: now }), ...h, ok: age <= 45 }; }

test('fresh degraded states do not become a global incident; export time cannot renew old collection', () => {
  assert.equal(assessEngineObservation(health(), { nowMs: now }).ok, true);
  const h = health(80); h.engine.exportGeneratedAt = at(0);
  assert.equal(assessEngineObservation(h, { nowMs: now }).ok, false);
});
test('one incident survives snapshot, release and reason changes; recovery requires new collection and two healthy checks', () => {
  let result = advanceEngineMonitor({}, observation(80), { nowMs: now });
  assert.equal(result.events.length, 0);
  result = advanceEngineMonitor(result.state, observation(80), { nowMs: now + 300000 });
  assert.equal(result.events[0].type, 'incident_opened');
  const id = result.state.incident.id;
  const changed = { ...observation(80), issues: ['different_reason'], engine: { ...health(80).engine, snapshotId: 'changed-id' } };
  result = advanceEngineMonitor(result.state, changed, { nowMs: now + 600000 });
  assert.equal(result.events.length, 0); assert.equal(result.state.incident.id, id);
  result = advanceEngineMonitor(result.state, observation(10), { nowMs: now + 900000 });
  assert.equal(result.events.length, 0);
  result = advanceEngineMonitor(result.state, observation(10), { nowMs: now + 1200000 });
  assert.equal(result.events[0].type, 'incident_recovered'); assert.equal(result.state.incident, null);
});
test('pending runs block dispatch, retries back off and exhaust, only accepted newer collection resets the circuit', () => {
  for (const status of ['queued','pending','waiting','requested','in_progress']) {
    assert.equal(planCadenceDispatch({}, observation(80), [{ id: 1, status }], { nowMs: now, enabled: true }).reason, 'refresh_active');
  }
  let state = {};
  for (let i = 0; i < 3; i++) {
    const time = now + i * 3600000;
    assert.equal(planCadenceDispatch(state, observation(80), [], { nowMs: time, enabled: true }).dispatch, true);
    state = reserveCadenceDispatch(state, time);
    assert.equal(planCadenceDispatch(state, observation(80), [], { nowMs: time + 1, enabled: true }).reason, 'dispatch_backoff');
  }
  assert.equal(planCadenceDispatch(state, observation(80), [], { nowMs: now + 24*3600000, enabled: true }).reason, 'dispatch_budget_exhausted');
  const renamed = advanceEngineMonitor(state, { ...observation(80), engine: { ...health(80).engine, snapshotId: 'new-export' } }, { nowMs: now }).state;
  assert.equal(renamed.dispatch.attempts, 3);
  assert.equal(advanceEngineMonitor(renamed, observation(10), { nowMs: now }).state.dispatch.attempts, 0);
});
test('normal cadence starts before the freshness deadline, without forcing every state or targeting Ohio', () => {
  assert.equal(planCadenceDispatch({}, observation(10), [], { nowMs: now, enabled: true }).dispatch, false);
  assert.equal(planCadenceDispatch({}, observation(21), [], { nowMs: now, enabled: true }).dispatch, true);
  assert.equal(planCadenceDispatch({}, observation(80), [], { nowMs: now }).reason, 'observation_only');
});
test('a release or cron recovery without new accepted collection cannot close the incident', () => {
  let state = { incident: { id: 'existing', collectionAtOpen: at(10) } };
  for (let i = 0; i < 3; i++) {
    const result = advanceEngineMonitor(state, observation(10), { nowMs: now + i * 300000 });
    assert.equal(result.events.length, 0); assert.equal(result.state.incident.id, 'existing'); state = result.state;
  }
});
test('a failed acceptance observation or unexplained gap can never be erased by later healthy snapshots', () => {
  const rows = Array.from({ length: 25 }, (_, n) => ({ checkedAt: new Date(now + n * 3600000).toISOString(), ok: n !== 2, engine: { snapshotId: `s${n}` } }));
  assert.equal(acceptanceSummary(rows, at(0), now + 24*3600000).status, 'needs_review');
  rows.forEach(row => row.ok = true);
  assert.equal(acceptanceSummary(rows, at(0), now + 24*3600000).status, 'public_pipeline_observation_passed');
  rows.splice(2, 2);
  assert.equal(acceptanceSummary(rows, at(0), now + 24*3600000).status, 'needs_review');
});

test('real worker persists uncertain dispatch reservations, limits aggregate requests and emits each incident/recovery once', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'bs-monitor-'));
  const calls = []; const notifications = []; let age = 80; let dispatchCalls = 0;
  const config = { evidenceDirectory: directory, dispatchEnabled: true, notificationsEnabled: true };
  const io = {
    nowMs: now,
    publicJson: async route => { calls.push(route); if (route.includes('health')) return { status: 200, body: health(age) };
      if (route === '/api/stats') return { status: 200, source: 'remote-snapshot', snapshotId: health(age).engine.snapshotId, body: { engineGeneratedAt: at(age), refreshHealth: { retryStateIds: ['OH','MS'] } } };
      return { status: 200, body: { states: [{ code: 'OH' }, { code: 'FL', freshness: {} }] } };
    },
    github: async args => { if (args.includes('POST')) { dispatchCalls++; throw new Error('uncertain transport'); } return { stdout: JSON.stringify({ workflow_runs: [] }) }; },
    notify: async event => { notifications.push(event); return { status: 'accepted_by_windows' }; },
  };
  try {
    await writeFile(path.join(directory, 'acceptance.json'), JSON.stringify({ startedAt: at(0) }));
    await runEngineMonitor(config, io);
    assert.equal(dispatchCalls, 1);
    assert.equal(JSON.parse(await readFile(path.join(directory, 'deterministic-monitor-state.json'), 'utf8')).dispatch.attempts, 1);
    io.nowMs += 300000; await runEngineMonitor(config, io);
    assert.equal(dispatchCalls, 1); assert.equal(notifications.length, 1);
    assert.deepEqual(calls, ['/api/ops/health','/api/stats','/api/coverage','/api/ops/health']);
    io.nowMs += 300000; await runEngineMonitor(config, io); assert.equal(notifications.length, 1);
    age = 10; io.nowMs += 300000; await runEngineMonitor(config, io);
    io.nowMs += 300000; await runEngineMonitor(config, io);
    assert.equal(notifications.length, 2); assert.equal(notifications[1].type, 'incident_recovered');
    const state = JSON.parse(await readFile(path.join(directory, 'deterministic-monitor-state.json'), 'utf8'));
    assert.equal(state.incident, null);
    assert.equal(JSON.parse(await readFile(path.join(directory, 'monitor-last-run.json'), 'utf8')).aiInvocations, 0);
    assert.equal(JSON.parse(await readFile(path.join(directory, 'acceptance-status.json'), 'utf8')).failedObservations, 3);
  } finally {
    assert.equal(path.dirname(directory), path.resolve(tmpdir()));
    await rm(directory, { recursive: true, force: true });
  }
});
test('a live process lock prevents overlap without deleting another worker lease', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'bs-monitor-'));
  try {
    await writeFile(path.join(directory, 'deterministic-monitor.lock'), JSON.stringify({ pid: process.pid, at: at(600) }));
    const result = await runEngineMonitor({ evidenceDirectory: directory }, { publicJson: () => { throw Error('must not run'); } });
    assert.equal(result.status, 'already_running');
  } finally {
    assert.equal(path.dirname(directory), path.resolve(tmpdir())); await rm(directory, { recursive: true, force: true });
  }
});
test('failed aggregate checks are retried and notification delivery failures have a separate bounded budget', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'bs-monitor-'));
  let audits = 0; let notifications = 0; let first = true;
  const config = { evidenceDirectory: directory, dispatchEnabled: false, notificationsEnabled: true };
  const io = { nowMs: now, publicJson: async route => {
    if (route.includes('health')) return { status: 200, body: health() };
    if (route === '/api/stats') { audits++; return first ? { status: 503 } : { status: 200, snapshotId: health().engine.snapshotId, source: 'remote-snapshot', body: {} }; }
    return { status: 200, body: { states: [] } };
  }, notify: async event => { assert.equal(event.retry, true); notifications++; return { status: 'notification_failed' }; } };
  try {
    await writeFile(path.join(directory, 'deterministic-monitor-state.json'), JSON.stringify({ events: [{ id: 'old:opened', message: 'Existing incident' }], notificationResults: { 'old:opened': { status: 'reserved', attempts: 1 } } }));
    await runEngineMonitor(config, io);
    first = false; io.nowMs += 300000; await runEngineMonitor(config, io);
    io.nowMs += 300000; await runEngineMonitor(config, io);
    assert.equal(audits, 2, 'a failed audit must not suppress the next audit for an hour');
    assert.equal(notifications, 2, 'at most three total attempts, including the persisted uncertain attempt');
  } finally { assert.equal(path.dirname(directory), path.resolve(tmpdir())); await rm(directory, { recursive: true, force: true }); }
});
