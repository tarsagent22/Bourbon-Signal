const BARREL_PROOF = Object.freeze(['barrel proof']);
const BOTH_FAMILIES = Object.freeze(['barrel proof', 'single barrel']);
const BUFFALO_TRACE = Object.freeze(['buffalo trace']);
const REVIEWED_SEARCH_TERMS = new Map([
  ['turnup-nyc', BARREL_PROOF],
  ['greenpoint-wine-liquor', BARREL_PROOF],
  ['7th-ave-wines', BARREL_PROOF],
  ['bedford-wines', BARREL_PROOF],
  ['michaeltowne-wines', BOTH_FAMILIES],
  ['off-broadway-wine-spirits', BOTH_FAMILIES],
  ['mayfair-liquors', BARREL_PROOF],
  ['springs-liquor-outlet', BUFFALO_TRACE],
  ['wallabys-liquor-warehouse', BUFFALO_TRACE],
  ['south-park-liquor', BUFFALO_TRACE],
]);

// Public search exposes positive variants omitted from the first category page.
// Keep the ordinary four-hour refresh cadence and skip duplicate page=2 requests.
export function metroCityHiveDepthPolicy(sourceId) {
  const queryTerms = REVIEWED_SEARCH_TERMS.get(sourceId);
  if (!queryTerms) return null;
  return Object.freeze({
    maxCategoryPages: 1,
    includeWhiskey: false,
    queryTerms,
    maxRequests: 1 + queryTerms.length,
    maxElapsedMs: 20_000,
    maxBodyBytes: 1_024 * 1_024,
    maxTotalBytes: 3 * 1_024 * 1_024,
    maxProducts: 150,
    requestTimeoutMs: 8_000,
  });
}
