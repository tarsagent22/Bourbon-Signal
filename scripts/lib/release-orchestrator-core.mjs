import { createHash } from 'node:crypto';

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
  if (pending.length) failures.push(`Cron ${expected.path} has pending undeployed/modified configuration.`);
  if (payload?.enabled === false) failures.push('Vercel cron service is disabled for the project.');
  return { ok: failures.length === 0, expected, actual: matching || null, pending, failures };
}

export function evaluateLiveHealth(payload, { expectedCronSchedule }) {
  const failures = [];
  if (!payload || payload.ok !== true) failures.push('Ops health endpoint is not healthy.');
  if (payload?.cron?.expectedSchedule !== expectedCronSchedule) {
    failures.push(`Ops health expected cron ${payload?.cron?.expectedSchedule || 'unknown'}, expected ${expectedCronSchedule}.`);
  }
  if (payload?.cron?.status !== 'healthy') failures.push(`Cron heartbeat status is ${payload?.cron?.status || 'unknown'}.`);
  if (payload?.engine?.status !== 'healthy') failures.push(`Engine health status is ${payload?.engine?.status || 'unknown'}.`);
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
