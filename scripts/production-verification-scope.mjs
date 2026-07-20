export function selectVerificationStates(activeStates, requestedRaw = '') {
  const active = [...new Set((activeStates || []).map((state) => String(state).trim().toUpperCase()).filter(Boolean))];
  const requested = [...new Set(String(requestedRaw || '').split(',').map((state) => state.trim().toUpperCase()).filter(Boolean))];
  if (!requested.length) return active;
  const activeSet = new Set(active);
  const unknown = requested.filter((state) => !activeSet.has(state));
  if (unknown.length) throw new Error(`Production verification requested unknown or inactive states: ${unknown.join(', ')}`);
  const requestedSet = new Set(requested);
  return active.filter((state) => requestedSet.has(state));
}
