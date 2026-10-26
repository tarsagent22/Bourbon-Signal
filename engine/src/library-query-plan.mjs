import { cityHiveSafeBottleMatch } from './collectors/safe-bottle-match.mjs';
import { isLibraryDetectionTarget, libraryIdentityKey } from './core/library-catalog.mjs';

// Rotating exact expressions supplement broad retrieval within its existing
// request cap. They never prove every bottle/store combination was searched.
export function libraryDetectionQueries(bible) {
  const identities = (bible.records || []).flatMap(record => (record.libraryIdentities || [])
    .filter(isLibraryDetectionTarget).map(bottle => ({ bottle, record })));
  const seen = new Set();
  const tierRank = {regular:0,limited:1,allocated:2,highly_allocated:3,unicorn:4};
  const priority = bottle => Math.max(tierRank[bottle.nationalTier] || 0, ...bottle.stateOverrides.map(o => tierRank[o.tier] || 0));
  return identities.sort((a, b) => Number(b.bottle.isAlertEligible !== false) - Number(a.bottle.isAlertEligible !== false)
    || priority(b.bottle) - priority(a.bottle)
    || Number(Boolean(b.record.strictLibraryIdentity)) - Number(Boolean(a.record.strictLibraryIdentity))
    || a.bottle.id.localeCompare(b.bottle.id))
    .filter(({ bottle }) => { const key = libraryIdentityKey(bottle.canonicalName); if (seen.has(key)) return false; seen.add(key); return true; })
    .map(({ bottle }) => bottle.canonicalName);
}

// Prefixes broaden retrieval only. They never establish bottle identity.
export function librarySearchPool(bible) {
  const pool = new Map();
  for (const name of libraryDetectionQueries(bible)) {
    const words = name.trim().split(/\s+/);
    const prefixLength = /^(?:e\.?h\.?|e)$/i.test(words[0]) ? 3 : 2;
    const prefix = words.slice(0, prefixLength).filter((word, index) => !index || !/^\d+(?:y|yr|year)?$/i.test(word)).join(' ');
    for (const term of [prefix, name]) {
      const key = libraryIdentityKey(term);
      if (key && !pool.has(key)) pool.set(key, term);
    }
  }
  return [...pool.values()];
}

export function buildLibrarySourceSearchPlan(bible, { sourceKey, budget, broadTerms = [], priorityTerms = [], cursor = 0 } = {}) {
  if (!sourceKey || !Number.isInteger(budget) || budget < 1 || budget > 100) throw new Error('Invalid library search budget or source');
  const unique = terms => [...new Map(terms.map(term => [libraryIdentityKey(term), term]).filter(([key]) => key)).values()];
  const fixed = unique([...broadTerms, ...priorityTerms]);
  const fixedKeys = new Set(fixed.map(libraryIdentityKey));
  const pool = librarySearchPool(bible).filter(term => !fixedKeys.has(libraryIdentityKey(term)));
  if (pool.length && fixed.length >= budget) throw new Error('Library rotation needs at least one search slot');
  const count = Math.min(pool.length, budget - fixed.length);
  const offset = pool.length ? Math.max(0, Number.isSafeInteger(cursor) ? cursor : 0) % pool.length : 0;
  const rotating = Array.from({length: count}, (_, i) => pool[(offset + i) % pool.length]);
  return { schemaVersion: 1, sourceKey, budget, targetCount: libraryDetectionQueries(bible).length,
    poolSize: pool.length, terms: [...fixed, ...rotating].slice(0, budget), fixedTerms: fixed, rotatingTerms: rotating,
    nextCursor: pool.length ? (offset + count) % pool.length : 0,
    nextTermKey: pool.length ? libraryIdentityKey(pool[(offset + count) % pool.length]) : null,
    sourceInvocationsPerSweep: count ? Math.ceil(pool.length / count) : null,
    exhaustiveRetrievalVerified: false };
}

export function isExactLibraryTarget(rawName, bible) {
  if (typeof bible?.match !== 'function') return false;
  const {match, record} = cityHiveSafeBottleMatch(rawName, bible);
  return Boolean(record && ['exact-library-identity', 'exact-normalized-alias'].includes(match?.method)
    && record.libraryIdentities?.some(isLibraryDetectionTarget));
}

// These are source capabilities, not statewide coverage promises.
export const LIBRARY_SEARCH_LANES = Object.freeze({
  AZ: ['grocery-xapi', 'mesa-liquor', 'best-liquor-tempe', 'smart-final'],
  TN: ['gateway-grabbl'], SC: ['da-brown-bag', 'liquor-store-near-me', 'dunes'],
  NC: ['wake', 'greensboro', 'high-point-suggestions'], IL: ['binnys'], UT: ['dabs'],
  'MD-MONTGOMERY': ['abs-autocomplete', 'abs-postback', 'abs-opendata'],
  NY: ['reviewed-cityhive-depth'], CO: ['reviewed-cityhive-depth'],
});
