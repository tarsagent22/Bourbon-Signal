import assert from 'node:assert/strict';
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  SOURCE_SCOUT_MANIFEST_CONTRACT_VERSION,
  resolveSourceScoutInput,
  validateSourceScoutArtifact,
} from './resolve-source-scout-input.mjs';

const HEAD_SHA = '071577a0ec11100e33cd369813a089cb0bd1efce';
const RUN = {
  databaseId: 31880701887,
  headBranch: 'main',
  headSha: HEAD_SHA,
  status: 'completed',
  conclusion: 'success',
  createdAt: '2026-08-15T10:54:39.000Z',
  updatedAt: '2026-08-15T11:06:00.000Z',
  url: 'https://github.com/tarsagent22/Bourbon-Signal/actions/runs/31880701887',
};

const REQUIRED_PAYLOADS = {
  'source-health.json': { generatedAt: '2026-08-15T10:55:47.749Z', status: 'healthy' },
  'source-slo-7d.json': { contractVersion: 'bourbon-signal-source-slo-report-v1', generatedAt: '2026-08-15T10:55:47.722Z' },
  'source-usefulness-roi.json': { contractVersion: 'bourbon-signal-source-usefulness-v1', generatedAt: '2026-08-15T11:00:30.597Z' },
  'optimization/source-run-history.json': { contractVersion: 'bourbon-signal-source-slo-history-v1', updatedAt: '2026-08-15T10:55:47.711Z', observations: [] },
  'site/stats.json': { contractVersion: 'bourbon-signal-site-v0.1', runId: 'fixture-run', generatedAt: '2026-08-15T11:05:09.346Z' },
};

async function writeArtifact(directory, overrides = {}) {
  for (const [relative, payload] of Object.entries({ ...REQUIRED_PAYLOADS, ...overrides })) {
    const file = path.join(directory, relative);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(payload, null, 2), 'utf8');
  }
}

test('source scout resolver selects the newest successful main run and hashes exactly its inventory-refresh artifact', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'bs-source-scout-test-'));
  const fixture = path.join(root, 'fixture-artifact');
  const destination = path.join(root, 'resolved-input');
  await mkdir(fixture);
  await writeArtifact(fixture);
  const calls = [];
  const runs = [
    { ...RUN, databaseId: 31880000000, createdAt: '2026-08-15T09:00:00.000Z', updatedAt: '2026-08-15T09:10:00.000Z' },
    RUN,
    { ...RUN, databaseId: 31890000000, headBranch: 'feature', createdAt: '2026-08-15T12:00:00.000Z' },
    { ...RUN, databaseId: 31891000000, conclusion: 'failure', createdAt: '2026-08-15T13:00:00.000Z' },
  ];
  const execFileImpl = async (file, args) => {
    calls.push([file, ...args]);
    if (file === 'git' && args[0] === 'fetch') return { stdout: '', stderr: '' };
    if (file === 'git' && args[0] === 'rev-parse') return { stdout: `${HEAD_SHA}\n`, stderr: '' };
    if (args[0] === 'run' && args[1] === 'list') return { stdout: JSON.stringify(runs), stderr: '' };
    if (args[0] === 'run' && args[1] === 'download') {
      const artifactDirectory = args[args.indexOf('--dir') + 1];
      await cp(fixture, artifactDirectory, { recursive: true });
      return { stdout: '', stderr: '' };
    }
    throw new Error(`Unexpected command: ${file} ${args.join(' ')}`);
  };

  try {
    const resolved = await resolveSourceScoutInput({ cwd: root, outputDirectory: destination, execFileImpl });
    assert.equal(resolved.manifest.contractVersion, SOURCE_SCOUT_MANIFEST_CONTRACT_VERSION);
    assert.equal(resolved.manifest.originMainSha, HEAD_SHA);
    assert.equal(resolved.manifest.run.databaseId, RUN.databaseId);
    assert.equal(resolved.manifest.run.headSha, HEAD_SHA);
    assert.equal(resolved.manifest.artifact.name, `inventory-refresh-${RUN.databaseId}`);
    assert.ok(Number.isFinite(Date.parse(resolved.manifest.resolvedAt)));
    assert.equal(resolved.manifest.artifact.downloadedAt, resolved.manifest.resolvedAt);
    assert.equal(resolved.manifest.files.length, Object.keys(REQUIRED_PAYLOADS).length);
    assert.deepEqual(resolved.manifest.files.map((file) => file.path), Object.keys(REQUIRED_PAYLOADS).sort());
    assert.ok(resolved.manifest.files.every((file) => /^[a-f0-9]{64}$/.test(file.sha256) && file.bytes > 0));
    assert.deepEqual(JSON.parse(await readFile(resolved.manifestPath, 'utf8')), resolved.manifest);
    assert.deepEqual(calls.slice(0, 2), [
      ['git', 'fetch', 'origin', '--prune'],
      ['git', 'rev-parse', '--verify', 'origin/main'],
    ]);
    assert.ok(calls.some((call) => call[0] === 'gh' && call.includes('refresh-feed.yml') && call.includes('success') && call.includes('main')));
    assert.ok(calls.some((call) => call[0] === 'gh'
      && call.slice(1, 5).join(' ') === `run download ${RUN.databaseId} --name`
      && call.includes(`inventory-refresh-${RUN.databaseId}`)));
    assert.equal(calls.filter((call) => call[0] === 'gh' && call[2] === 'download').length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('source scout artifact validation rejects missing, stale, and head-mismatched evidence', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'bs-source-scout-validation-'));
  try {
    await writeArtifact(root);
    await assert.rejects(
      validateSourceScoutArtifact({ artifactDirectory: root, run: RUN, originMainSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }),
      /head sha|origin\/main/i,
    );
    await rm(path.join(root, 'source-health.json'));
    await assert.rejects(validateSourceScoutArtifact({ artifactDirectory: root, run: RUN, originMainSha: HEAD_SHA }), /source-health\.json.*missing/i);
    await writeArtifact(root, { 'source-health.json': { generatedAt: '2026-08-14T10:55:47.749Z' } });
    await assert.rejects(validateSourceScoutArtifact({ artifactDirectory: root, run: RUN, originMainSha: HEAD_SHA }), /timestamp.*run window|run window.*timestamp/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('source scout resolver never falls back to checked-in engine output or an older successful run', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'bs-source-scout-no-fallback-'));
  const destination = path.join(root, 'resolved-input');
  await mkdir(path.join(root, 'engine', 'out'), { recursive: true });
  await writeArtifact(path.join(root, 'engine', 'out'));
  let downloads = 0;
  const newestWrongHead = { ...RUN, databaseId: RUN.databaseId + 1, headSha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', createdAt: '2026-08-15T11:30:00.000Z' };
  const execFileImpl = async (file, args) => {
    if (file === 'git' && args[0] === 'fetch') return { stdout: '', stderr: '' };
    if (file === 'git' && args[0] === 'rev-parse') return { stdout: `${HEAD_SHA}\n`, stderr: '' };
    if (args[1] === 'list') return { stdout: JSON.stringify([RUN, newestWrongHead]), stderr: '' };
    if (args[1] === 'download') downloads += 1;
    return { stdout: '', stderr: '' };
  };

  try {
    await assert.rejects(resolveSourceScoutInput({ cwd: root, outputDirectory: destination, execFileImpl }), /head sha|origin\/main/i);
    assert.equal(downloads, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
