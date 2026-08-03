import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import {
  assertCleanOriginMain,
  buildReleaseManifest,
  evaluateCronRegistration,
  evaluateLiveHealth,
  hashEntries,
  assertExportFileSet,
  assertChangedExportPaths,
  parseDeploymentId,
  parseDeploymentUrl,
  parsePorcelainPaths,
} from './lib/release-orchestrator-core.mjs';

const digestA = hashEntries([
  { path: 'b.json', contents: Buffer.from('two') },
  { path: 'a.json', contents: Buffer.from('one') },
]);
const digestB = hashEntries([
  { path: 'a.json', contents: Buffer.from('one') },
  { path: 'b.json', contents: Buffer.from('two') },
]);
assert.equal(digestA, digestB, 'directory hash must be order-independent');

assert.doesNotThrow(() => assertCleanOriginMain({
  head: 'abc123',
  originMain: 'abc123',
  status: '',
}));
assert.throws(() => assertCleanOriginMain({ head: 'abc123', originMain: 'def456', status: '' }), /origin\/main/i);
assert.throws(() => assertCleanOriginMain({ head: 'abc123', originMain: 'abc123', status: ' M src/app/page.tsx' }), /clean/i);

const cronOk = evaluateCronRegistration({
  crons: [{ path: '/api/alerts/deliver', schedule: '*/5 * * * *', host: 'deploy.vercel.app' }],
  undeployed: [],
  modified: [],
}, { path: '/api/alerts/deliver', schedule: '*/5 * * * *', host: 'deploy.vercel.app' });
assert.equal(cronOk.ok, true);
assert.equal(evaluateCronRegistration({ crons: [{ path: '/api/alerts/deliver', schedule: '*/5 * * * *', host: 'old.vercel.app' }], modified: [] }, { path: '/api/alerts/deliver', schedule: '*/5 * * * *', host: 'deploy.vercel.app' }).ok, false);
assert.equal(evaluateCronRegistration({ crons: [{ path: '/api/alerts/deliver', schedule: '*/30 * * * *' }], modified: [] }, { path: '/api/alerts/deliver', schedule: '*/5 * * * *' }).ok, false);
assert.equal(evaluateCronRegistration({ crons: [{ path: '/api/alerts/deliver', schedule: '*/5 * * * *' }], modified: [{ path: '/api/alerts/deliver' }] }, { path: '/api/alerts/deliver', schedule: '*/5 * * * *' }).ok, false);

const healthy = evaluateLiveHealth({
  ok: true,
  cron: { status: 'healthy', expectedSchedule: '*/5 * * * *', lastRunAt: new Date().toISOString() },
  engine: { status: 'healthy' },
}, { expectedCronSchedule: '*/5 * * * *' });
assert.equal(healthy.ok, true);
assert.equal(evaluateLiveHealth({ ok: false, cron: { status: 'stale', expectedSchedule: '*/5 * * * *' }, engine: { status: 'healthy' } }, { expectedCronSchedule: '*/5 * * * *' }).ok, false);

assert.equal(parseDeploymentUrl('Production: https://bourbon-signal-abc.vercel.app [1m]'), 'https://bourbon-signal-abc.vercel.app');
assert.equal(parseDeploymentId('id\t\tdpl_1234567890'), 'dpl_1234567890');

const exportFiles = ['alerts.json', 'bottles.json', 'drops.json', 'events.json', 'historical-trends.json', 'locations.json', 'manifest.json', 'nc-intelligence.json', 'stats.json', 'store-identity.json', 'stores.json'];
assert.doesNotThrow(() => assertExportFileSet(exportFiles));
assert.throws(() => assertExportFileSet([...exportFiles, 'debug.json']), /Unexpected site export files/);
assert.throws(() => assertExportFileSet(exportFiles.filter((file) => file !== 'alerts.json')), /Missing site export files/);
assert.doesNotThrow(() => assertChangedExportPaths([
  'engine/out/site/alerts.json',
  'engine/out/site/state-quality.json',
  'engine/out/site/states/index.json',
  'engine/out/site/states/MD-MONTGOMERY/drops.json',
]));
assert.throws(() => assertChangedExportPaths(['engine/out/site/states/NC/debug.json']), /non-allowlisted paths/);
assert.throws(() => assertChangedExportPaths(['engine/out/site/nested/debug.json']), /non-allowlisted paths/);
assert.deepEqual(
  parsePorcelainPaths(' M engine/out/site/alerts.json\n?? engine/out/site/state-quality.json\n'),
  ['engine/out/site/alerts.json', 'engine/out/site/state-quality.json'],
  'porcelain parsing must preserve the first path when its status begins with a space',
);

const manifest = buildReleaseManifest({
  commit: 'abc123',
  tree: 'tree123',
  lockfileSha256: 'lock123',
  siteExportSha256: 'site123',
  localVerifiedBuildId: 'build123',
  verifiedAt: '2026-07-09T00:00:00.000Z',
  verification: [{ command: 'npm run verify:ci', ok: true }],
});
assert.equal(manifest.schemaVersion, 1);
assert.equal(manifest.source.commit, 'abc123');
assert.equal(manifest.artifacts.siteExportSha256, 'site123');
assert.equal(manifest.artifacts.localVerifiedBuildId, 'build123');
assert.deepEqual(manifest.verification, [{ command: 'npm run verify:ci', ok: true }]);

const releaseSource = readFileSync(new URL('./release-production.mjs', import.meta.url), 'utf8');
const rootInstall = releaseSource.indexOf("['npm', ['ci']]");
const engineInstall = releaseSource.indexOf("['npm', ['--prefix', 'engine', 'ci']]");
const verificationRun = releaseSource.indexOf("['npm', ['run', 'verify:ci']]");
assert.ok(rootInstall >= 0 && engineInstall > rootInstall && verificationRun > engineInstall,
  'clean production releases must install the independently packaged engine before verification');

const codeOnlyFlag = releaseSource.includes("'--code-only'");
const codeOnlyGuard = releaseSource.includes("Code-only release cannot publish site exports");
const identityBuild = releaseSource.includes("store:identity");
assert.ok(codeOnlyFlag && codeOnlyGuard && identityBuild, "code-only release must generate only the derived identity graph");
const invalidCodeOnly = spawnSync(process.execPath, ['scripts/release-production.mjs', '--code-only', '--publish-site-exports', 'engine/out/site'], { cwd: process.cwd(), encoding: 'utf8' });
assert.notEqual(invalidCodeOnly.status, 0, 'mixed code-only/export release invocation must fail before release work begins');
assert.match(`${invalidCodeOnly.stdout}${invalidCodeOnly.stderr}`, /Code-only release cannot publish site exports/);
for (const invalidTimeout of ['0', '-1', 'not-a-number']) {
  const rejectedTimeout = spawnSync(process.execPath, ['scripts/release-production.mjs', '--code-only'], {
    cwd: process.cwd(), encoding: 'utf8', env: { ...process.env, BOURBON_SIGNAL_RELEASE_TIMEOUT_MS: invalidTimeout },
  });
  assert.notEqual(rejectedTimeout.status, 0, 'invalid configured substep timeouts must fail before release work begins');
  assert.match(`${rejectedTimeout.stdout}${rejectedTimeout.stderr}`, /BOURBON_SIGNAL_RELEASE_TIMEOUT_MS must be a finite positive number/);
}
const sharedLease = releaseSource.includes('run-with-release-lane-lock.py') && releaseSource.includes('BOURBON_SIGNAL_RELEASE_LANE_LEASE_ID') && releaseSource.includes('BOURBON_SIGNAL_RELEASE_LANE_VALIDATED');
const runCliSource = releaseSource.slice(releaseSource.indexOf('async function runCli()'));
assert.match(runCliSource, /path\.resolve\(process\.argv\[1\]\),[\s\S]*?timeoutMs: NO_TIMEOUT/, 'the outer lease owner must remain alive for the full applied release');
assert.match(releaseSource, /const NO_TIMEOUT = Symbol\('no-timeout'\)/, 'no-timeout must be an internal sentinel rather than user-configurable numeric input');
assert.match(releaseSource, /timeoutMs === NO_TIMEOUT \? null : setTimeout/, 'only the lease-owner sentinel may disable a command timeout');
const trackedExportGuard = releaseSource.includes('Code-only release must preserve tracked engine/out/site exports');
const lockWrapper = readFileSync(new URL('./run-with-release-lane-lock.py', import.meta.url), 'utf8');
assert.match(lockWrapper, /BOURBON_SIGNAL_RELEASE_LANE_VALIDATED/);
const cleanReleaseEnv = { ...process.env };
for (const name of ['BOURBON_SIGNAL_RELEASE_LANE_LEASE_ID', 'BOURBON_SIGNAL_RELEASE_LANE_INHERITANCE_TOKEN', 'BOURBON_SIGNAL_RELEASE_LANE_VALIDATED']) delete cleanReleaseEnv[name];
const partialLeaseEnvironments = [
  { BOURBON_SIGNAL_RELEASE_LANE_VALIDATED: '1' },
  { BOURBON_SIGNAL_RELEASE_LANE_LEASE_ID: 'forged' },
  { BOURBON_SIGNAL_RELEASE_LANE_INHERITANCE_TOKEN: 'forged' },
  { BOURBON_SIGNAL_RELEASE_LANE_LEASE_ID: 'forged', BOURBON_SIGNAL_RELEASE_LANE_INHERITANCE_TOKEN: 'forged', BOURBON_SIGNAL_RELEASE_LANE_VALIDATED: '0' },
];
for (const partialLease of partialLeaseEnvironments) {
  const rejectedPartialLease = spawnSync(process.execPath, ['scripts/release-production.mjs', '--apply', '--code-only'], {
    cwd: process.cwd(), encoding: 'utf8', env: { ...cleanReleaseEnv, ...partialLease },
  });
  assert.notEqual(rejectedPartialLease.status, 0, 'partial inherited release-lane environments must fail before applying');
  assert.match(`${rejectedPartialLease.stdout}${rejectedPartialLease.stderr}`, /Inherited release-lane environment is incomplete or invalid/);
}
const forgedLease = spawnSync(process.execPath, ['scripts/release-production.mjs', '--apply', '--code-only'], {
  cwd: process.cwd(), encoding: 'utf8', env: { ...cleanReleaseEnv, BOURBON_SIGNAL_RELEASE_LANE_LEASE_ID: 'forged', BOURBON_SIGNAL_RELEASE_LANE_INHERITANCE_TOKEN: 'forged', BOURBON_SIGNAL_RELEASE_LANE_VALIDATED: '1' },
});
assert.notEqual(forgedLease.status, 0, 'forged inherited release leases must fail closed before applying');
assert.match(`${forgedLease.stdout}${forgedLease.stderr}`, /Inherited release-lane lease/);
assert.ok(sharedLease && trackedExportGuard, 'applied releases must hold a shared lease and code-only mode must preserve tracked exports');

console.log('Release orchestrator core tests passed.');
