const SHA = /^[a-f0-9]{40}$/;
const MARKER = /<!-- bourbon-signal-coverage-lease@1 (\{[^\n]*\}) -->/g;
export const RELEASE_MINUTES = 60;

export function coverageReleaseWindow(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(now).map(p => [p.type, p.value]));
  const secondsLeft = (7 - Number(parts.hour)) * 3600 - Number(parts.minute) * 60 - Number(parts.second);
  return { inWindow: Number(parts.hour) >= 1 && Number(parts.hour) < 7, secondsLeft };
}

export function createCoverageLease({ jobKey, taskId, headRef, headSha, mainSha, now = new Date() }) {
  const window = coverageReleaseWindow(now);
  if (!window.inWindow || window.secondsLeft < RELEASE_MINUTES * 60) throw Error('Coverage admission needs a full hour before 7 a.m. Eastern. Keep the branch parked.');
  const lease = { jobKey, taskId, headRef, headSha, mainSha, admittedAt: now.toISOString(), expiresAt: new Date(now.getTime() + RELEASE_MINUTES * 60_000).toISOString() };
  validateCoverageLease(lease);
  return lease;
}

export function validateCoverageLease(lease) {
  if (!lease || !/^coverage-request:[a-zA-Z0-9:|._/@+-]{20,320}$/.test(lease.jobKey || '')
    || !/^cx_[a-f0-9]{32}$/.test(lease.taskId || '') || !/^[a-zA-Z0-9._/-]{1,180}$/.test(lease.headRef || '')
    || !SHA.test(lease.headSha || '') || !SHA.test(lease.mainSha || '')) throw Error('Invalid coverage release lease identity.');
  const start = Date.parse(lease.admittedAt), end = Date.parse(lease.expiresAt);
  const window = coverageReleaseWindow(new Date(start));
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > RELEASE_MINUTES * 60_000
    || !window.inWindow || end - start > window.secondsLeft * 1000) throw Error('Invalid coverage release lease deadline.');
  return lease;
}

export function coverageLeaseMarker(lease) { return `<!-- bourbon-signal-coverage-lease@1 ${JSON.stringify(validateCoverageLease(lease))} -->`; }
export function readCoverageLease(body) {
  const matches = [...String(body || '').matchAll(MARKER)];
  if (!matches.length) return null;
  if (matches.length !== 1) throw Error('Ambiguous coverage release lease.');
  return validateCoverageLease(JSON.parse(matches[0][1]));
}
export function assertCoverageMergeLease(lease, now = new Date()) {
  validateCoverageLease(lease);
  if (!coverageReleaseWindow(now).inWindow || Date.parse(lease.admittedAt) > now.getTime() || Date.parse(lease.expiresAt) <= now.getTime()) throw Error('Coverage release reservation expired. Park and obtain fresh admission.');
}

export function validateCoverageReadiness(readiness, { headSha, mainSha, now = new Date() }) {
  if (readiness?.schemaVersion !== 1 || readiness.headSha !== headSha || readiness.mainSha !== mainSha
    || readiness.localChecks?.passed !== true || readiness.review?.approved !== true || readiness.sourcePreflight?.verified !== true
    || ![readiness.checkedAt, readiness.sourcePreflight.checkedAt].every(date => Number.isFinite(Date.parse(date)) && Date.parse(date) <= now.getTime() && now.getTime() - Date.parse(date) <= 60 * 60_000)) throw Error('Coverage admission needs current main, reviewed head, passing local checks and fresh source preflight.');
}

export function validateParkablePull(pull, lease, { repository, now = new Date(), expiredOnly = true }) {
  validateCoverageLease(lease);
  if (pull?.state !== 'open' || pull.merged || pull.merged_at) throw Error('Only an unmerged open coverage PR can be parked.');
  if (pull.base?.repo?.full_name !== repository || pull.head?.repo?.full_name !== repository || pull.base?.ref !== 'main'
    || pull.head?.ref !== lease.headRef || !SHA.test(pull.head?.sha || '')
    || !String(pull.body || '').replace(/\r/g, '').split('\n').some(line => line.trim() === `Authority immutable job key: ${lease.jobKey}`)) throw Error('Coverage PR does not match its saved release identity.');
  if (expiredOnly && Date.parse(lease.expiresAt) > now.getTime()) throw Error('Coverage reservation has not expired.');
}
