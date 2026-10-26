import { isLibraryDetectionTarget, libraryIdentityKey } from './core/library-catalog.mjs';

// Rotating exact expressions supplement broad retrieval within its existing
// request cap. They never prove every bottle/store combination was searched.
export function libraryDetectionQueries(bible) {
  const identities = (bible.records || []).flatMap(record => (record.libraryIdentities || [])
    .filter(isLibraryDetectionTarget).map(bottle => ({ bottle, record })));
  const seen = new Set();
  return identities.sort((a, b) => Number(Boolean(b.record.strictLibraryIdentity)) - Number(Boolean(a.record.strictLibraryIdentity))
    || a.bottle.id.localeCompare(b.bottle.id))
    .filter(({ bottle }) => { const key = libraryIdentityKey(bottle.canonicalName); if (seen.has(key)) return false; seen.add(key); return true; })
    .map(({ bottle }) => bottle.canonicalName);
}
