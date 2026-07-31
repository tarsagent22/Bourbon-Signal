import { markSignalStaleNonAlertable } from './stale-signal-policy.mjs';

export function markStaleReport(report, config, reason, now = new Date().toISOString()) {
  const priorStatus = String(report.status || '').replace(/^(stale_)+/, '') || 'previous_report';
  const staleSignals = (report.signals || []).map((signal) => markSignalStaleNonAlertable(signal, reason, now));
  const roadblocks = [
    ...(report.roadblocks || []).filter((roadblock) => String(roadblock.status || '') !== 'stale_previous_report'),
    {
      state: config.id,
      source: `${config.label} refresh fallback`,
      url: `out/states/${config.id}.json`,
      status: 'stale_previous_report',
      error: reason,
      nextRoute: 'Keep last known good state report in the site export, then inspect/fix the timed-out source without blocking other states.',
    },
  ];
  return {
    ...report,
    state: report.state || config.id,
    label: report.label || config.label,
    tier: report.tier || config.tier,
    strategy: report.strategy || config.strategy,
    cadence: report.cadence || config.cadence,
    value: report.value || config.value,
    stale: true,
    staleReason: reason,
    staleFallbackAt: now,
    previousFinishedAt: report.previousFinishedAt || report.finishedAt || null,
    lastGoodAt: report.lastGoodAt || report.finishedAt || null,
    startedAt: report.startedAt || now,
    finishedAt: now,
    signals: staleSignals,
    roadblocks,
    status: `stale_${priorStatus}`,
  };
}
