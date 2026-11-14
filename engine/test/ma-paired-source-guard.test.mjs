import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { beginMassachusettsPairedSourceAttempt, finishMassachusettsPairedSourceAttempt } from '../src/ma-paired-source-guard.mjs';
import { researchSourceForState, collectResearchStateReport } from '../src/research-state-registry.mjs';
import { BourbonBible } from '../src/core/bible.mjs';

async function isolated(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'bs-ma-paired-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return path.join(dir, 'attempts.json');
}

test('MA paired source guard persists before collection and enforces a 24 hour repeat window', async t => {
  const file = await isolated(t);
  const attempt = await beginMassachusettsPairedSourceAttempt({ file, now: '2026-11-14T18:00:00.000Z', runId: '43700000001' });
  const persisted = JSON.parse(await readFile(file, 'utf8'));
  assert.equal(persisted.status, 'started');
  assert.equal(persisted.lastAttemptAt, attempt.lastAttemptAt);
  await assert.rejects(beginMassachusettsPairedSourceAttempt({ file, now: '2026-11-15T17:59:59.999Z' }), /24-hour cooldown/);
  const next = await beginMassachusettsPairedSourceAttempt({ file, now: '2026-11-15T18:00:00.000Z', runId: '43700000002' });
  assert.equal(next.lastRunId, '43700000002');
});

test('MA paired source guard honors the last held observation when the research branch cache is empty', async t => {
  const file = await isolated(t);
  await assert.rejects(beginMassachusettsPairedSourceAttempt({ file,
    bootstrapAttemptAt: '2026-11-14T18:40:29.363Z', now: '2026-11-15T18:40:29.362Z' }), /24-hour cooldown/);
  const due = await beginMassachusettsPairedSourceAttempt({ file,
    bootstrapAttemptAt: '2026-11-14T18:40:29.363Z', now: '2026-11-15T18:40:29.363Z' });
  assert.equal(due.lastAttemptAt, '2026-11-15T18:40:29.363Z');
});

test('MA paired source guard fails closed on malformed, future-dated, or denied ledgers', async t => {
  const file = await isolated(t);
  await writeFile(file, '{invalid');
  await assert.rejects(beginMassachusettsPairedSourceAttempt({ file, now: '2026-11-14T18:00:00Z' }), /JSON|Malformed/);
  await writeFile(file, JSON.stringify({ schemaVersion: 1, lastAttemptAt: '2026-11-14T19:00:00Z', blockedHosts: [] }));
  await assert.rejects(beginMassachusettsPairedSourceAttempt({ file, now: '2026-11-14T18:00:00Z' }), /future/);
  await writeFile(file, JSON.stringify({ schemaVersion: 1, lastAttemptAt: '2026-11-13T18:00:00Z', blockedHosts: ['www.wildduckliquors.com'] }));
  await assert.rejects(beginMassachusettsPairedSourceAttempt({ file, now: '2026-11-14T18:00:00Z' }), /blocked after prior host denial/);
});

test('MA paired source guard retains 403 and 429 host blocks after a run', async t => {
  const file = await isolated(t);
  const attempt = await beginMassachusettsPairedSourceAttempt({ file, now: '2026-11-14T18:00:00Z' });
  await finishMassachusettsPairedSourceAttempt({ file, attemptAt: attempt.lastAttemptAt, report: {
    finishedAt: '2026-11-14T18:01:00Z', metadata: { complete: false },
    sources: [{ url: 'https://www.cbcliquors.com/p', status: 403 }, { url: 'https://juliosliquors.com/shop', status: 429 }],
  }, reportSha256: 'a'.repeat(64) });
  await assert.rejects(beginMassachusettsPairedSourceAttempt({ file, now: '2026-11-16T18:00:00Z' }), /blocked after prior host denial/);
});

test('MA paired research mode stops before any fetch when its retained 24 hour ledger is not due', async t => {
  const file = await isolated(t);
  const now = new Date().toISOString();
  await writeFile(file, JSON.stringify({ schemaVersion: 1, lastAttemptAt: now, lastRunId: 'prior', status: 'complete', blockedHosts: [] }));
  const envKeys = ['BOURBON_SIGNAL_SHADOW_MODE', 'BOURBON_SIGNAL_MA_PAIRED_SOURCE', 'BOURBON_SIGNAL_MA_PAIRED_ATTEMPT_FILE'];
  const previous = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
  const originalFetch = globalThis.fetch;
  let calls = 0;
  t.after(() => {
    for (const key of envKeys) previous[key] === undefined ? delete process.env[key] : process.env[key] = previous[key];
    globalThis.fetch = originalFetch;
  });
  process.env.BOURBON_SIGNAL_SHADOW_MODE = '1';
  process.env.BOURBON_SIGNAL_MA_PAIRED_SOURCE = '1';
  process.env.BOURBON_SIGNAL_MA_PAIRED_ATTEMPT_FILE = file;
  globalThis.fetch = async () => { calls++; throw new Error('unexpected source request'); };
  const config = researchSourceForState('MA');
  await assert.rejects(collectResearchStateReport(config, new BourbonBible([])), /24-hour cooldown/);
  assert.equal(calls, 0);
});
