import { createHash } from 'node:crypto';

export const REQUIRED_SITE_EXPORT_FILES = [
  'alerts.json',
  'bottles.json',
  'drops.json',
  'events.json',
  'historical-trends.json',
  'locations.json',
  'manifest.json',
  'nc-intelligence.json',
  'state-health.json',
  'stats.json',
  'store-identity.json',
  'stores.json',
];
export const OPTIONAL_SITE_EXPORT_FILES = ['state-quality.json'];
const ALLOWED_SITE_EXPORT_PATHS = new Set(
  [...REQUIRED_SITE_EXPORT_FILES, ...OPTIONAL_SITE_EXPORT_FILES].map((file) => `engine/out/site/${file}`),
);

export function assertExportFileSet(files) {
  const actual = new Set(files);
  const missing = REQUIRED_SITE_EXPORT_FILES.filter((file) => !actual.has(file));
  const allowed = new Set([...REQUIRED_SITE_EXPORT_FILES, ...OPTIONAL_SITE_EXPORT_FILES]);
  const unexpected = files.filter((file) => !allowed.has(file));
  if (missing.length) throw new Error(`Missing site export files: ${missing.join(', ')}`);
  if (unexpected.length) throw new Error(`Unexpected site export files: ${unexpected.join(', ')}`);
}

function isAllowedSiteExportPath(file) {
  return ALLOWED_SITE_EXPORT_PATHS.has(file)
    || file === 'engine/out/site/states/index.json'
    || /^engine\/out\/site\/states\/[A-Z0-9-]+\/drops\.json$/u.test(file);
}

export function assertChangedExportPaths(paths) {
  const unsafe = paths.filter((file) => !isAllowedSiteExportPath(file));
  if (unsafe.length) throw new Error(`Generated export staging touched non-allowlisted paths: ${unsafe.join(', ')}`);
}

export function hashEntries(entries) {
  const hash = createHash('sha256');
  for (const entry of [...entries].sort((a, b) => a.path.localeCompare(b.path))) {
    const contents = Buffer.isBuffer(entry.contents) ? entry.contents : Buffer.from(String(entry.contents));
    hash.update(entry.path);
    hash.update('\0');
    hash.update(createHash('sha256').update(contents).digest('hex'));
    hash.update('\0');
  }
  return hash.digest('hex');
}

export function assertCleanOriginMain({ head, originMain, status }) {
  if (!head || !originMain || head !== originMain) {
    throw new Error(`Release checkout must be pinned to origin/main (HEAD=${head || 'unknown'}, origin/main=${originMain || 'unknown'}).`);
  }
  if (String(status || '').trim()) {
    throw new Error('Release checkout must be clean before verification and build.');
  }
}

export function parseDeploymentUrl(output) {
  return String(output || '').match(/https:\/\/[^\s]+\.vercel\.app/iu)?.[0] || null;
}

export function parseDeploymentId(output) {
  return String(output || '').match(/\bdpl_[A-Za-z0-9]+\b/u)?.[0] || null;
}

export function parsePorcelainPaths(status) {
  const source = String(status || '').trimEnd();
  if (!source.trim()) return [];
  return source.split(/\r?\n/u).map((line) => line.slice(3).replace(/\\/gu, '/'));
}

export function evaluateCronRegistration(payload, expected) {
  const crons = Array.isArray(payload?.crons) ? payload.crons : [];
  const matching = crons.find((cron) => cron.path === expected.path);
  const pending = [
    ...(Array.isArray(payload?.undeployed) ? payload.undeployed : []),
    ...(Array.isArray(payload?.modified) ? payload.modified : []),
  ].filter((cron) => cron.path === expected.path);
  const failures = [];
  if (!matching) failures.push(`Missing registered cron ${expected.path}.`);
  else if (matching.schedule !== expected.schedule) failures.push(`Cron ${expected.path} is ${matching.schedule}, expected ${expected.schedule}.`);
  if (matching && expected.host && matching.host !== expected.host) failures.push(`Cron ${expected.path} targets ${matching.host || 'unknown'}, expected ${expected.host}.`);
  if (pending.length) failures.push(`Cron ${expected.path} has pending undeployed/modified configuration.`);
  if (payload?.enabled === false) failures.push('Vercel cron service is disabled for the project.');
  return { ok: failures.length === 0, expected, actual: matching || null, pending, failures };
}

export function evaluateLiveHealth(payload, { expectedCronSchedule, expectedCronStatus = 'healthy', expectedDeploymentId = null }) {
  const failures = [];
  if (!payload || payload.ok !== true) failures.push('Ops health endpoint is not healthy.');
  if (payload?.cron?.expectedSchedule !== expectedCronSchedule) {
    failures.push(`Ops health expected cron ${payload?.cron?.expectedSchedule || 'unknown'}, expected ${expectedCronSchedule}.`);
  }
  if (payload?.cron?.status !== expectedCronStatus) failures.push(`Cron heartbeat status is ${payload?.cron?.status || 'unknown'}, expected ${expectedCronStatus}.`);
  if (expectedCronStatus === 'healthy' && payload?.cron?.lastRunDryRun === true) failures.push('Cron heartbeat came from a dry run.');
  if (expectedCronStatus === 'monitoring' && payload?.cron?.lastRunDryRun !== true) failures.push('Monitor-only cron heartbeat was not a dry run.');
  if (expectedDeploymentId && payload?.cron?.deploymentId !== expectedDeploymentId) failures.push(`Cron heartbeat deployment is ${payload?.cron?.deploymentId || 'unknown'}, expected ${expectedDeploymentId}.`);
  if (!['healthy', 'degraded'].includes(payload?.engine?.status)) failures.push(`Engine health status is ${payload?.engine?.status || 'unknown'}.`);
  return { ok: failures.length === 0, failures };
}

export function buildReleaseManifest({
  commit,
  tree,
  lockfileSha256,
  siteExportSha256,
  localVerifiedBuildId,
  verifiedAt,
  verification,
}) {
  return {
    schemaVersion: 1,
    product: 'bourbon-signal',
    source: { repository: 'tarsagent22/Bourbon-Signal', branch: 'main', commit, tree },
    artifacts: { lockfileSha256, siteExportSha256, localVerifiedBuildId },
    verifiedAt,
    verification,
  };
}
