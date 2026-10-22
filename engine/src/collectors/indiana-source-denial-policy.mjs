const PROVENANCE = Object.freeze({
  runId: 39854435934,
  reportPath: 'states/IN.json',
  reportSha256: '9e2de7c706414f4081bcc388e296594fa4bb0716e0d31fff6dc18b45ccdff74d',
  reportFinishedAt: '2026-10-22T20:27:28.250Z',
  sourceRuntimeId: 'precision:in',
  sourceResultStatus: 'not_due',
  sourceAttemptCount: 0,
  aggregatePrecisionCheckedAt: '2026-10-22T19:34:58.190Z',
  clockSemantics: 'aggregate_precision_finish_upper_bound',
  individualRequestFinishedAt: null,
  note: 'The report retained four HTTP 403 roadblocks from its prior precision result. The publication made no Indiana source attempt. The prior aggregate finish is a conservative upper bound, not an exact per-retailer request timestamp.',
});

// These explicit keys identify four existing collection lanes, not all routes
// on any retailer host. Healthy CityHive, Payless, Bourbon World, ATC, and
// Target configuration behavior remain independent of this policy.
export const INDIANA_CAPTURED_SOURCE_DENIALS = Object.freeze({
  'ilg-events': Object.freeze({
    source: 'Indiana Liquor Group bourbon/whiskey tasting events',
    url: 'https://indianaliquor.com/our-events/',
  }),
  kahns: Object.freeze({
    source: "Kahn's Fine Wines & Spirits in-stock bourbon API",
    url: 'https://www.kahnsfinewines.com/api/trpc/product.getAll?input=%7B%22json%22%3A%7B%22hasPromo%22%3Afalse%2C%22inStock%22%3Atrue%2C%22categories%22%3A%5B%222sipcm0ec0lsm%22%5D%2C%22text%22%3A%22bourbon%22%2C%22min_price%22%3A0%2C%22max_price%22%3A1000000%2C%22pagination%22%3A%7B%22pageIndex%22%3A0%2C%22pageSize%22%3A100%7D%2C%22categoryContext%22%3A%7B%22publicId%22%3A%222sipcm0ec0lsm%22%2C%22slug%22%3A%22spirits%22%7D%7D%7D',
  }),
  'penguin-liquor': Object.freeze({
    source: 'Penguin Liquor Lafayette product category pages',
    url: 'https://www.penguinliquor.com/c/spirits/whiskey/19',
  }),
  'doordash-frontier': Object.freeze({
    source: 'DoorDash Frontier Liquors Evansville marketplace page',
    url: 'https://www.doordash.com/convenience/store/frontier-liquors-evansville-26286224/',
  }),
});

export function indianaDeniedSourceSkip(sourceKey, { stateId = 'IN', sourceRuntimeId = 'precision:in', url } = {}) {
  if (stateId !== 'IN' || typeof sourceKey !== 'string' || !Object.hasOwn(INDIANA_CAPTURED_SOURCE_DENIALS, sourceKey)) return null;
  const captured = INDIANA_CAPTURED_SOURCE_DENIALS[sourceKey];
  if (url !== undefined && url !== captured.url) return null;
  const policyId = 'in-captured-direct-403-routes-disabled-20261022';
  const evidence = {
    ...PROVENANCE,
    source: captured.source,
    url: captured.url,
    httpStatus: 403,
    error: 'HTTP 403',
  };
  return {
    signals: [],
    roadblocks: [{
      state: 'IN', source: captured.source, url: captured.url, sourceRuntimeId,
      status: 'source_policy_disabled', policyId, sourceKey,
      attemptCount: 0, historicalHttpStatus: 403,
      evidenceRuntimeFinishedAt: PROVENANCE.aggregatePrecisionCheckedAt,
      evidenceClockSemantics: PROVENANCE.clockSemantics,
      denialEvidence: { ...evidence },
      error: 'This unchanged Indiana source route is disabled after a captured HTTP 403; no request was made in this pass.',
      nextRoute: 'Keep this denied route disabled while independent healthy retailer lanes continue; do not bypass retailer protection.',
    }],
    metadata: {
      policyId, sourceKey, decision: 'disabled',
      directRequestsAllowed: false, attemptCount: 0,
      denialEvidence: { ...evidence },
    },
  };
}
