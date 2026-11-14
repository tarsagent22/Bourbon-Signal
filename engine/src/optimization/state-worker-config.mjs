export function resolveStateWorkerConcurrency(policyValue, environmentValue) {
  const policyDefault = Math.max(1, Math.floor(Number(policyValue) || 4));
  const requested = environmentValue == null || String(environmentValue).trim() === ''
    ? policyDefault
    : Number(environmentValue);
  return Math.max(1, Math.floor(Number.isFinite(requested) && requested > 0 ? requested : policyDefault));
}
