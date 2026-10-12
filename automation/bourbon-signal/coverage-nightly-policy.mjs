export const NIGHTLY_POLICY = Object.freeze({ timezone: 'America/New_York', startHour: 1, endHour: 7,
  maxRunMinutes: 360, discoveryMinutes: 20, implementationMinutes: 45, maxRetries: 1 });

export function nightlyDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: NIGHTLY_POLICY.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function groupNightlyJobs(jobs) {
  const groups = new Map();
  for (const job of jobs) {
    const group = groups.get(job.stateCode) || { stateCode: job.stateCode, targets: [] };
    group.targets.push(job);
    groups.set(job.stateCode, group);
  }
  // Preserve active work first, then the oldest state's requests together to reuse its research and releases.
  return [...groups.values()].sort((a, b) => Number(b.targets.some(job => job.status === 'running')) - Number(a.targets.some(job => job.status === 'running')));
}

export function nextNightlyJob(ledger) {
  const jobs = ledger.groups.flatMap(group => group.targets);
  return jobs.find(job => ledger.entries[job.jobKey]?.status === 'running')
    || jobs.find(job => !ledger.entries[job.jobKey]);
}

export function nightlyBudget(ledger, attemptStartedAt = null, now = new Date()) {
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: NIGHTLY_POLICY.timezone, hour: '2-digit', hourCycle: 'h23' }).format(now));
  const runMinutes = (now.getTime() - Date.parse(ledger.startedAt)) / 60_000;
  const attemptMinutes = attemptStartedAt ? (now.getTime() - Date.parse(attemptStartedAt)) / 60_000 : 0;
  const inWindow = hour >= NIGHTLY_POLICY.startHour && hour < NIGHTLY_POLICY.endHour && nightlyDate(now) === ledger.date;
  return { ...NIGHTLY_POLICY, inWindow, runMinutes, attemptMinutes,
    canStart: inWindow && Number.isFinite(runMinutes) && runMinutes >= 0 && runMinutes < NIGHTLY_POLICY.maxRunMinutes,
    discoveryExpired: attemptMinutes >= NIGHTLY_POLICY.discoveryMinutes,
    implementationExpired: attemptMinutes >= NIGHTLY_POLICY.implementationMinutes };
}
