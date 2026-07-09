import assert from 'node:assert/strict';
import {
  assertCleanOriginMain,
  buildReleaseManifest,
  evaluateCronRegistration,
  evaluateLiveHealth,
  hashEntries,
  parseDeploymentUrl,
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
}, { path: '/api/alerts/deliver', schedule: '*/5 * * * *' });
assert.equal(cronOk.ok, true);
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

console.log('Release orchestrator core tests passed.');
