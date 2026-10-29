import {targetedRunNeedsBrowserCollectors} from './targeted-browser-policy.mjs';

// Match the strict PA expansion publication deadline. Reuse never extends it.
export const FWGS_PUBLICATION_MAX_AGE_MS = 2 * 60 * 60_000;
export const FWGS_PUBLICATION_HEADROOM_MS = 95 * 60_000;
export const FWGS_REUSABLE_SOURCE_MAX_AGE_MS = FWGS_PUBLICATION_MAX_AGE_MS - FWGS_PUBLICATION_HEADROOM_MS;
// Five minutes +18min cold collection fits the 25min whole-artifact admission.
// A slower mixed refresh still fails closed at the unchanged final age check.
export const FWGS_REUSABLE_CHUNK_MAX_AGE_MS = 5 * 60_000;
const INVENTORY_ENDPOINT = '/ccstorex/custom/v1/b2b/get-inventory';

export function fwgsReuseAgeLimit(requested = FWGS_REUSABLE_SOURCE_MAX_AGE_MS) {
  if (!Number.isSafeInteger(requested) || requested < 0) throw new Error('FWGS cache reuse age must be a nonnegative integer');
  return Math.min(requested, FWGS_REUSABLE_SOURCE_MAX_AGE_MS);
}

export function fwgsChunkReuseAgeLimit(requested = FWGS_REUSABLE_CHUNK_MAX_AGE_MS) {
  return Math.min(fwgsReuseAgeLimit(requested), FWGS_REUSABLE_CHUNK_MAX_AGE_MS);
}

/** Pure source-clock admission, separate from product/premises validation. */
export function fwgsPublicationFreshness(payload, {nowMs = Date.now(), maxAgeMs = FWGS_REUSABLE_SOURCE_MAX_AGE_MS} = {}) {
  const limit = fwgsReuseAgeLimit(maxAgeMs), at = Date.parse(payload?.generatedAt || '');
  const chunks = payload?.chunks;
  const clocks = [at, ...(Array.isArray(chunks) ? chunks.map(chunk => Date.parse(chunk?.generatedAt || '')) : [])];
  if (!Number.isFinite(nowMs) || payload?.inventoryEndpoint !== INVENTORY_ENDPOINT
    || chunks != null && !Array.isArray(chunks) || clocks.some(clock => !Number.isFinite(clock) || clock > nowMs)
    || at !== Math.min(...clocks)) return {ok:false, reason:'FWGS original pickup clock is missing, future or inconsistent with its chunks'};
  const ageMs = nowMs - at, remainingMs = FWGS_PUBLICATION_MAX_AGE_MS - ageMs;
  return {ok:ageMs <= limit, generatedAt:payload.generatedAt, ageMs, remainingMs, maximumReuseAgeMs:limit,
    requiredHeadroomMs:FWGS_PUBLICATION_HEADROOM_MS,
    reason:ageMs <= limit ? null : 'FWGS original pickup observation lacks the reserved 95-minute continuity/publication headroom'};
}

/** The administrative browser refresh timer cannot renew old pickup evidence. */
export function browserCollectorRefreshDecision({rawStates = '', skip = false, browserRefreshMinutes = 240,
  lastBrowserRefreshAt, fwgsArtifact, nowMs = Date.now()} = {}) {
  if (skip) return {due:false, reason:'explicit_browser_skip'};
  if (!targetedRunNeedsBrowserCollectors(rawStates)) return {due:false, reason:'target_excludes_browser_states'};
  if (!Number.isFinite(browserRefreshMinutes) || browserRefreshMinutes < 0) throw new Error('Invalid browser refresh interval');
  if (browserRefreshMinutes >= 999_000) return {due:false, reason:'browser_refresh_interval_disabled'};
  const lastMs = Date.parse(lastBrowserRefreshAt || '');
  const intervalDue = !Number.isFinite(lastMs) || nowMs - lastMs >= browserRefreshMinutes * 60_000;
  const states = String(rawStates).split(',').map(state => state.trim().toUpperCase()).filter(Boolean);
  if (!states.length || states.includes('PA')) {
    const freshness = fwgsPublicationFreshness(fwgsArtifact, {nowMs});
    if (!freshness.ok) return {due:true, fwgsOnly:!intervalDue, reason:'fwgs_source_publication_headroom', freshness};
  }
  return {due:intervalDue,
    reason:'browser_refresh_interval'};
}


// A PA-only targeted recovery must not schedule the independent Ohio source,
// including when the caller attaches to an existing CDP session.
export function browserCollectorScripts({rawStates = '', browserStarted = false, fwgsOnly = false} = {}) {
  const states = String(rawStates).split(',').map(state => state.trim().toUpperCase()).filter(Boolean);
  const targetedPaOnly = states.includes('PA') && !states.includes('OH');
  return browserStarted || fwgsOnly || targetedPaOnly
    ? ['src/fwgs-browser-full.mjs']
    : ['src/ohlq-browser-collector.mjs', 'src/fwgs-browser-full.mjs'];
}


// Scheduled fallback/isolation remains independent. An explicitly targeted PA
// recovery cannot start the expensive pipeline with already-expiring evidence.
export function targetedPaPublicationAdmission(rawStates, fwgsArtifact, {nowMs = Date.now()} = {}) {
  const required = String(rawStates || '').split(',').some(state => state.trim().toUpperCase() === 'PA');
  return required ? {required, ...fwgsPublicationFreshness(fwgsArtifact, {nowMs})} : {required:false, ok:true};
}
