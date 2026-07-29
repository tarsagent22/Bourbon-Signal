const BROWSER_SOURCE_STATES = new Set(['OH', 'PA']);

export function targetedRunNeedsBrowserCollectors(rawStates = '') {
  const states = String(rawStates || '')
    .split(',')
    .map((state) => state.trim().toUpperCase())
    .filter(Boolean);
  if (!states.length) return true;
  return states.some((state) => BROWSER_SOURCE_STATES.has(state));
}
