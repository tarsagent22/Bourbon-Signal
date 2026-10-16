type Source = { id: string; kind: string; expiryHours: number };
type Job = { source_id: string; accepted_at?: string | Date | null; last_reason?: string; failures?: number };

export function sourceAcceptanceHealth(jobs: Job[], sources: Source[], now = Date.now()) {
  return sources.map(source => {
    const job = jobs.find(row => row.source_id === source.id);
    const age = now - new Date(job?.accepted_at || '').getTime();
    const dependency = source.kind === 'oh-probe';
    const status = dependency ? job?.last_reason === 'dependency_ready' ? 'dependency_ready' : 'dependency_unavailable'
      : !job?.accepted_at ? 'never_accepted'
      : !Number.isFinite(age) || age < 0 || age > source.expiryHours * 3_600_000 ? 'stale'
      : Number(job.failures || 0) > 0 || job.last_reason !== 'accepted' ? 'degraded' : 'healthy';
    return { source: source.id, status, dependency, acceptedAt: job?.accepted_at || null, reason: job?.last_reason || 'not_initialized' };
  });
}
