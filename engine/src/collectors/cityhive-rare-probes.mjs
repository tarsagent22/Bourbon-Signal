const freezePolicy = (policy) => Object.freeze(Object.fromEntries(
  Object.entries(policy).map(([state, sources]) => [
    state,
    Object.freeze(Object.fromEntries(
      Object.entries(sources).map(([sourceId, brands]) => [sourceId, Object.freeze([...brands])]),
    )),
  ]),
));

export const CITYHIVE_RARE_BRAND_PROBE_POLICY = freezePolicy({
  GA: {
    '74-package': ['Weller', 'Old Fitzgerald', "Blanton's"],
  },
});

function exactMerchantCategoryUrl(categoryUrl, merchantId) {
  if (!merchantId) throw new Error('A reviewed CityHive merchant ID is required.');
  const url = new URL(categoryUrl);
  if (url.protocol !== 'https:') throw new Error('CityHive probes require HTTPS first-party URLs.');
  url.searchParams.set('merchant-id', String(merchantId));
  url.searchParams.delete('skip');
  return url;
}

export function buildCityHiveRareProbeUrls({ state, sourceId, categoryUrl, merchantId }) {
  const baseline = exactMerchantCategoryUrl(categoryUrl, merchantId);
  const brands = CITYHIVE_RARE_BRAND_PROBE_POLICY[String(state || '').toUpperCase()]?.[String(sourceId || '')] || [];
  const urls = [baseline.href];
  for (const brand of brands) {
    const url = new URL(baseline.href);
    url.searchParams.set('brands', brand);
    urls.push(url.href);
  }
  return urls;
}
