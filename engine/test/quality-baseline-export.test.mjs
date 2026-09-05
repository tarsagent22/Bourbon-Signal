import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadComparableStateQualityBaseline } from '../src/state-quality-baseline.mjs';
import { buildStateDropPartitions } from '../src/site-state-partitions.mjs';
import { attachRunIdentity } from '../src/site-run-coherence.mjs';
import { prepareScheduledStateVerification } from '../src/scheduled-state-verification.mjs';
import { buildDrops, bibleLookup } from '../src/export-site-contract.mjs';
import { buildStateQualityInputs, buildStateQualityScorecard } from '../src/state-quality-scorecard.mjs';

const fixture = JSON.parse(await readFile(new URL('./fixtures/quality-baseline-production.json', import.meta.url), 'utf8'));
const read = async file => JSON.parse(await readFile(file, 'utf8'));
const put = async (dir, file, value) => { await mkdir(path.dirname(path.join(dir, file)), { recursive: true }); await writeFile(path.join(dir, file), JSON.stringify(value)); };
// Narrow production-derived slice, NOT a claim to be the missing full failed run.
// Wrapper metadata/empty unrelated artifacts are test scaffolding; source rows,
// accepted quality, clocks and replay input dimensions have file-hashed provenance.
async function acceptedSlice(dir) {
  const identity = { runId: 'production-derived-test-slice', generatedAt: fixture.acceptedGeneratedAt, engineGeneratedAt: '2026-09-04T23:00:27.388Z' };
  const partitions = buildStateDropPartitions(fixture.drops, { ...identity, contractVersion: 'bourbon-signal-site-v0.1' });
  const payloads = { 'manifest.json': { files: {} }, 'state-quality.json': { schemaVersion: 2, states: fixture.states.map(row => row.accepted) }, 'stats.json': { stateCoverage: { states: fixture.states.map(row => row.accepted.input) } }, 'state-health.json': { states: [] }, 'drops.json': { drops: fixture.drops }, 'alerts.json': { alerts: [] }, 'events.json': { events: [] }, 'stores.json': { stores: [] }, 'locations.json': { locations: [] }, 'states/index.json': partitions.index };
  for (const [state, payload] of partitions.payloads) payloads[`states/${state}/drops.json`] = payload;
  for (const [file, payload] of Object.entries(payloads)) await put(dir, file, attachRunIdentity(payload, identity));
}
async function runExport(root, previousDir, summary, now = fixture.generatedAt) {
  await put(root, 'current-snapshot.json', { generatedAt: now, signals: fixture.signals });
  await put(root, 'bourbon-bible.json', { records: fixture.bibleRecords });
  await put(root, 'summary.json', { generatedAt: now, ...summary });
  return spawnSync(process.execPath, ['--import', './test/fixtures/quality-offline-clock.mjs', 'src/export-site-contract.mjs'], { cwd: fileURLToPath(new URL('..', import.meta.url)), encoding: 'utf8', timeout: 30000, env: { ...process.env, BOURBON_SIGNAL_OUT_DIR: root, BOURBON_SIGNAL_PREVIOUS_SITE_DIR: previousDir, BOURBON_SIGNAL_ALLOW_STATE_QUALITY_REGRESSION: '0', BOURBON_SIGNAL_RUN_STATES: summary.partialRefresh ? summary.attemptedStateIds.join(',') : '', QUALITY_FIXTURE_NOW: now } });
}
const summary = { partialRefresh: false, attemptedStateIds: ['MD-MONTGOMERY', 'KY'], freshStateIds: ['MD-MONTGOMERY', 'KY'], states: fixture.states.map(row => row.replay.input) };

test('production-derived source signals + accepted episode anchors reproduce 58/48, not raw-only 68/68', () => {
  const score = previousDrops => buildStateQualityScorecard(buildStateQualityInputs({ stateCoverage: { states: summary.states }, drops: buildDrops(fixture.signals, bibleLookup(fixture.bibleRecords), fixture.signals, previousDrops), alerts: [] }), { generatedAt: fixture.generatedAt });
  assert.deepEqual(score(fixture.drops).states.map(row => row.score), [58, 48]);
  assert.deepEqual(score([]).states.map(row => row.score), [68, 68]);
  assert.deepEqual(score(fixture.drops).states.map(row => row.input), fixture.states.map(row => row.replay.input));
});

test('composed exporter migrates legacy baseline and publishes comparable MD/KY without granting stale alerts', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'quality-migration-export-'));
  try {
    const baseline = path.join(root, 'accepted');
    await acceptedSlice(baseline);
    const before = await readFile(path.join(baseline, 'state-quality.json'), 'utf8');
    const result = await runExport(root, baseline, summary);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const quality = await read(path.join(root, 'site/state-quality.json'));
    assert.equal(quality.schemaVersion, 3);
    assert.equal(quality.regression.ok, true);
    assert.deepEqual(quality.states.filter(row => summary.attemptedStateIds.includes(row.state)).map(row => [row.state, row.score, row.releaseEligible]), [['MD-MONTGOMERY', 58, false], ['KY', 48, false]]);
    assert.deepEqual((await read(path.join(root, 'site/alerts.json'))).alerts, []);
    assert.equal(await readFile(path.join(baseline, 'state-quality.json'), 'utf8'), before, 'migration is in-memory; never mutate accepted cache');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('composed TX partial/adaptive publication migrates all untouched rows and does not retain scalars next run', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'quality-migration-partial-'));
  try {
    const baseline = path.join(root, 'accepted');
    await acceptedSlice(baseline);
    const partial = { ...summary, partialRefresh: true, attemptedStateIds: ['TX'], freshStateIds: ['TX'] };
    const result = await runExport(root, baseline, partial);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const first = await read(path.join(root, 'site/state-quality.json'));
    assert.equal(first.schemaVersion, 3);
    assert.deepEqual(first.states.filter(row => summary.attemptedStateIds.includes(row.state)).map(row => row.score), [64, 50]);
    const next = await runExport(root, path.join(root, 'site'), partial, '2026-09-12T23:24:17.014Z');
    assert.equal(next.status, 0, next.stderr || next.stdout);
    const second = await read(path.join(root, 'site/state-quality.json'));
    const retained = second.states.filter(row => summary.attemptedStateIds.includes(row.state));
    assert.deepEqual(retained.map(row => row.score), [54, 50]);
    assert.ok(retained.every(row => row.freshness.distributionKnown && !row.releaseEligible));
    assert.deepEqual((await read(path.join(root, 'site/alerts.json'))).alerts, []);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('composed full and explicit MD/KY target retain true-regression blocker, with no output activation', async () => {
  for (const partialRefresh of [false, true]) {
    const root = await mkdtemp(path.join(tmpdir(), 'quality-migration-negative-'));
    try {
      const baseline = path.join(root, 'accepted');
      await acceptedSlice(baseline);
      const damaged = { ...summary, partialRefresh, states: summary.states.map(row => ({ ...row, status: 'failed' })) };
      const result = await runExport(root, baseline, damaged);
      assert.equal(result.status, 1, result.stdout);
      assert.match(result.stderr, /State quality regression blocked site export/);
      assert.match(result.stderr, /state status became degraded/);
      await assert.rejects(readFile(path.join(root, 'site/manifest.json')), { code: 'ENOENT' });
    } finally { await rm(root, { recursive: true, force: true }); }
  }
});

test('standalone quality builder preserves run coherence on repeated use of the two-state slice only', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'quality-builder-'));
  try {
    const site = path.join(root, 'out/site');
    await acceptedSlice(site);
    for (const pass of [1, 2]) {
      const result = spawnSync(process.execPath, [fileURLToPath(new URL('../src/build-state-quality-from-site.mjs', import.meta.url))], { cwd: root, encoding: 'utf8', env: { ...process.env, BOURBON_SIGNAL_ALLOW_STATE_QUALITY_REGRESSION: '0' } });
      assert.equal(result.status, 0, `pass ${pass}: ${result.stderr || result.stdout}`);
      const baseline = await loadComparableStateQualityBaseline(site);
      assert.equal(baseline.schemaVersion, 3);
      assert.deepEqual(baseline.states.map(row => row.score), [64, 50]);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('actual scheduled baseline copy preserves required metadata and partitions byte-for-byte', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'quality-hydration-'));
  try {
    const siteDir = path.join(root, 'site');
    const previousSiteDir = path.join(root, 'previous');
    await acceptedSlice(siteDir);
    await prepareScheduledStateVerification({ siteDir, previousSiteDir, ledgerPath: path.join(root, 'ledger.json'), cacheKey: 'offline-test-cache', runId: 'offline-copy-test', now: fixture.generatedAt });
    for (const file of ['manifest.json', 'stats.json', 'state-health.json', 'state-quality.json', 'drops.json', 'alerts.json', 'events.json', 'stores.json', 'locations.json', 'states/index.json', 'states/KY/drops.json', 'states/MD-MONTGOMERY/drops.json']) {
      assert.equal(await readFile(path.join(previousSiteDir, file), 'utf8'), await readFile(path.join(siteDir, file), 'utf8'), file);
    }
    assert.equal((await loadComparableStateQualityBaseline(previousSiteDir)).schemaVersion, 3);
    const workflow = await readFile(new URL('../../.github/workflows/refresh-feed.yml', import.meta.url), 'utf8');
    for (const step of ['Restore last published site contract', 'Save verified published site contract']) {
      const block = workflow.split(`- name: ${step}`)[1].split('- name:')[0];
      assert.match(block, /path: engine\/out\/site\s/);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

const corruptions = {
  empty: q => { q.states = []; },
  truncated: q => { q.states.pop(); },
  duplicate: q => { q.states[1] = structuredClone(q.states[0]); },
  score: q => { delete q.states[0].score; },
  identity: q => { q.states[0].input.state = 'VA'; },
  tier: q => { q.states[0].input.coverageTier = 'unknown'; },
  numeric: q => { q.states[0].input.dropCount = null; },
  dimension: q => { delete q.states[0].dimensions.alerts; },
  evidence: q => { q.states[0].input.freshnessEvidence = Array(q.states[0].input.dropCount).fill({}); },
  'evidence-array': q => { q.states[0].input.freshnessEvidence = [null]; },
  'evidence-type': q => { q.states[0].input.freshnessEvidence = false; },
};
for (const schemaVersion of [2, 3]) for (const [kind, corrupt] of Object.entries(corruptions)) {
  test(`schema ${schemaVersion} rejects corrupt quality ${kind} before full or targeted regression can bypass baseline`, async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'quality-corruption-'));
    try {
      const baseline = path.join(root, 'accepted');
      await acceptedSlice(baseline);
      const q = schemaVersion === 3 ? await loadComparableStateQualityBaseline(baseline) : await read(path.join(baseline, 'state-quality.json'));
      corrupt(q);
      await put(baseline, 'state-quality.json', q);
      await assert.rejects(loadComparableStateQualityBaseline(baseline), /baseline|evidence/i);
      for (const partialRefresh of [false, true]) {
        const result = await runExport(root, baseline, { ...summary, partialRefresh, states: summary.states.map(row => ({ ...row, status: 'failed' })) });
        assert.equal(result.status, 1, result.stdout);
        assert.match(result.stderr, /baseline|evidence/i);
        await assert.rejects(readFile(path.join(root, 'site/manifest.json')), { code: 'ENOENT' });
      }
    } finally { await rm(root, { recursive: true, force: true }); }
  });
}

for (const file of ['manifest.json', 'stats.json', 'drops.json', 'alerts.json', 'state-health.json', 'events.json', 'stores.json', 'locations.json', 'bottles.json', 'historical-trends.json', 'nc-intelligence.json', 'state-quality.json', 'states/KY/drops.json']) {
  test(`orphan ${file}, including JSON null/false, is not bootstrap`, async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'quality-orphan-'));
    try {
      for (const value of [{ runId: 'prior-publication' }, null, false]) {
        await put(root, file, value);
        await assert.rejects(loadComparableStateQualityBaseline(root), /baseline/i);
      }
    } finally { await rm(root, { recursive: true, force: true }); }
  });
}
test('only genuine absent publication bootstraps; empty partition directory is prior evidence', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'quality-bootstrap-'));
  try {
    assert.equal(await loadComparableStateQualityBaseline(root), null);
    assert.equal(await loadComparableStateQualityBaseline(path.join(root, 'absent')), null);
    await mkdir(path.join(root, 'states'));
    await assert.rejects(loadComparableStateQualityBaseline(root), /baseline/i);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('malformed JSON and jointly truncated coverage/quality cannot erase partition history', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'quality-json-'));
  try {
    await acceptedSlice(root);
    await writeFile(path.join(root, 'state-quality.json'), '{"states":');
    await assert.rejects(loadComparableStateQualityBaseline(root), /baseline/i);
    await acceptedSlice(root);
    const quality = await read(path.join(root, 'state-quality.json'));
    const stats = await read(path.join(root, 'stats.json'));
    quality.states = [];
    stats.stateCoverage.states = [];
    await put(root, 'state-quality.json', quality);
    await put(root, 'stats.json', stats);
    await assert.rejects(loadComparableStateQualityBaseline(root), /baseline/i);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('migration fails closed for missing baseline, missing partition, mixed run, tampered rows and unsupported schema', async () => {
  for (const schemaVersion of [2, 3]) for (const kind of ['quality', 'partition', 'mixed-run', 'row-content', 'schema']) {
    const root = await mkdtemp(path.join(tmpdir(), 'quality-migration-invalid-'));
    try {
      await acceptedSlice(root);
      if (schemaVersion === 3) await put(root, 'state-quality.json', await loadComparableStateQualityBaseline(root));
      if (kind === 'quality') await rm(path.join(root, 'state-quality.json'));
      if (kind === 'partition') await rm(path.join(root, 'states/KY/drops.json'));
      if (kind === 'mixed-run') { const payload = await read(path.join(root, 'alerts.json')); await put(root, 'alerts.json', { ...payload, runId: 'other-run' }); }
      if (kind === 'row-content') { const payload = await read(path.join(root, 'states/KY/drops.json')); payload.drops[0].firstSeenAt = fixture.generatedAt; await put(root, 'states/KY/drops.json', payload); }
      if (kind === 'schema') { const payload = await read(path.join(root, 'state-quality.json')); await put(root, 'state-quality.json', { ...payload, schemaVersion: 99 }); }
      await assert.rejects(loadComparableStateQualityBaseline(root), /baseline|migration/i);
    } finally { await rm(root, { recursive: true, force: true }); }
  }
});
