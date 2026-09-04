// Pure scheduling constraint, not a timer/job writer. A fetch/304 alone does
// not renew evidence. Callers supply an authoritative deadline or confirmation
// plus TTL. Missing policy leaves existing efficiency scheduling unchanged.
const FUTURE_TOLERANCE_MS = 5 * 60_000;
const asTime = (value) => Date.parse(value || '');

export function constrainFreshnessDeadline(nextProbeMs, metrics = {}, options = {}, nowMs = Date.now()) {
  const candidates = [metrics.freshnessDeadlineAt, options.freshnessDeadlineAt].map(asTime).filter(Number.isFinite);
  const ttlValue = options.freshnessMaxAgeMs ?? metrics.freshnessMaxAgeMs;
  const ttl = ttlValue == null ? NaN : Number(ttlValue);
  const confirmation = asTime(metrics.lastConfirmedAt);
  if (Number.isFinite(ttl) && ttl >= 0 && Number.isFinite(confirmation)) {
    // Implausible confirmation cannot buy a later deadline. Small clock skew
    // is accepted but never extends the usable freshness horizon.
    candidates.push(confirmation > nowMs + FUTURE_TOLERANCE_MS ? nowMs : Math.min(confirmation, nowMs) + ttl);
  }
  const deadlineMs = candidates.length ? Math.min(...candidates) : null;
  const permissionBlocked = metrics.disabled || metrics.policyBlocked || metrics.quarantined
    || [401, 403].includes(Number(metrics.lastStatus));
  let constrained = deadlineMs !== null && !permissionBlocked ? Math.min(nextProbeMs, deadlineMs) : nextProbeMs;
  // Freshness is a quality obligation, never permission to evade cooldowns.
  const notBefore = [metrics.retryAfterAt, metrics.cooldownUntil, options.retryAfterAt, options.cooldownUntil]
    .map(asTime).filter(Number.isFinite);
  if (notBefore.length) constrained = Math.max(constrained, ...notBefore);
  return {
    nextProbeMs: constrained,
    freshnessDeadlineAt: deadlineMs === null ? null : new Date(deadlineMs).toISOString(),
    freshnessLimited: constrained < nextProbeMs,
    freshnessDeferred: deadlineMs !== null && constrained > deadlineMs,
  };
}
