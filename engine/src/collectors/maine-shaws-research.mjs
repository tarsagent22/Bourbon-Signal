import { groceryExpansionPremiseMatches } from './grocery-xapi-expansion.mjs';
import { parseBoundGroceryXapiInventory } from './grocery-xapi-identity.mjs';

// Research-only premises derived from Maine locator, Shaw's resolver, and
// per-store product captures dated 2026-11-14. This registry is not admitted
// to any production state source list.
export const MAINE_SHAWS_RESEARCH_SOURCES = Object.freeze([
  { id: 'me:shaws:4556', name: "Shaw's", stateCode: 'ME', merchantId: '4556', banner: 'shaws', resolverDomainName: "Shaw's", host: 'www.shaws.com', address: '353 Main St, Bangor, ME 04401', city: 'Bangor', zip: '04401', storeId: 'shaws:4556', lat: 44.79420250155674, lng: -68.77599181005161, locator: 'https://local.shaws.com/me/bangor/353-main-st/Beer-Wine-Liquor.html', researchOnly: true },
  { id: 'me:shaws:2541', name: "Shaw's", stateCode: 'ME', merchantId: '2541', banner: 'shaws', resolverDomainName: "Shaw's", host: 'www.shaws.com', address: '91 Auburn St, Portland, ME 04103', city: 'Portland', zip: '04103', storeId: 'shaws:2541', lat: 43.70251281572265, lng: -70.28797142595545, locator: 'https://local.shaws.com/me/portland/91-auburn-st/Beer-Wine-Liquor.html', researchOnly: true },
  { id: 'me:shaws:3548', name: "Shaw's", stateCode: 'ME', merchantId: '3548', banner: 'shaws', resolverDomainName: "Shaw's", host: 'www.shaws.com', address: '235 Camden St, Rockland, ME 04841', city: 'Rockland', zip: '04841', storeId: 'shaws:3548', lat: 44.12402530298263, lng: -69.09746189987989, locator: 'https://local.shaws.com/me/rockland/235-camden-st/Beer-Wine-Liquor.html', researchOnly: true },
  { id: 'me:shaws:57', name: "Shaw's", stateCode: 'ME', merchantId: '57', banner: 'shaws', resolverDomainName: "Shaw's", host: 'www.shaws.com', address: '175 High St, Ellsworth, ME 04605', city: 'Ellsworth', zip: '04605', storeId: 'shaws:57', lat: 44.53468333137616, lng: -68.41313656922021, locator: 'https://local.shaws.com/me/ellsworth/175-high-st/Beer-Wine-Liquor.html', researchOnly: true },
  { id: 'me:shaws:2552', name: "Shaw's", stateCode: 'ME', merchantId: '2552', banner: 'shaws', resolverDomainName: "Shaw's", host: 'www.shaws.com', address: '150 Western Ave, Augusta, ME 04330', city: 'Augusta', zip: '04330', storeId: 'shaws:2552', lat: 44.31155230248716, lng: -69.79478235477926, locator: 'https://local.shaws.com/me/augusta/150-western-ave/Beer-Wine-Liquor.html', researchOnly: true },
  { id: 'me:shaws:4559', name: "Shaw's", stateCode: 'ME', merchantId: '4559', banner: 'shaws', resolverDomainName: "Shaw's", host: 'www.shaws.com', address: '27 E Ave, Lewiston, ME 04240', city: 'Lewiston', zip: '04240', storeId: 'shaws:4559', lat: 44.08611944682636, lng: -70.19991337138686, locator: 'https://local.shaws.com/me/lewiston/27-e-ave/Beer-Wine-Liquor.html', researchOnly: true },
  { id: 'me:shaws:4560', name: "Shaw's", stateCode: 'ME', merchantId: '4560', banner: 'shaws', resolverDomainName: "Shaw's", host: 'www.shaws.com', address: '1364 Main St, Sanford, ME 04073', city: 'Sanford', zip: '04073', storeId: 'shaws:4560', lat: 43.413536029822595, lng: -70.74424635124973, locator: 'https://local.shaws.com/me/sanford/1364-main-st/Beer-Wine-Liquor.html', researchOnly: true },
  { id: 'me:shaws:3551', name: "Shaw's", stateCode: 'ME', merchantId: '3551', banner: 'shaws', resolverDomainName: "Shaw's", host: 'www.shaws.com', address: '251 Kennedy Memorial Dr, Waterville, ME 04901', city: 'Waterville', zip: '04901', storeId: 'shaws:3551', lat: 44.5445203298343, lng: -69.66724271953993, locator: 'https://local.shaws.com/me/waterville/251-kennedy-memorial-dr/Beer-Wine-Liquor.html', researchOnly: true },
  { id: 'me:shaws:1609', name: "Shaw's", stateCode: 'ME', merchantId: '1609', banner: 'shaws', resolverDomainName: "Shaw's", host: 'www.shaws.com', address: '670 Bath Rd, Wiscasset, ME 04578', city: 'Wiscasset', zip: '04578', storeId: 'shaws:1609', lat: 43.97302858953805, lng: -69.7093306751248, locator: 'https://local.shaws.com/me/wiscasset/670-bath-rd/Beer-Wine-Liquor.html', researchOnly: true },
  { id: 'me:shaws:608', name: "Shaw's", stateCode: 'ME', merchantId: '608', banner: 'shaws', resolverDomainName: "Shaw's", host: 'www.shaws.com', address: '200 Lower Main St, Freeport, ME 04032', city: 'Freeport', zip: '04032', storeId: 'shaws:608', lat: 43.845043345050144, lng: -70.11839112985183, locator: 'https://local.shaws.com/me/freeport/200-lower-main-st/Beer-Wine-Liquor.html', researchOnly: true },
].map(source => Object.freeze({
  ...source,
  sourceLabel: "Shaw's Maine first-party in-store availability",
})));

const RESEARCHED_LIMITED_EXPRESSIONS = new Map([
  ['960137024', 'Blade and Bow Bourbon'],
  ['289031989', 'Wild Turkey Rare Breed Straight Bourbon'],
  ['970889019', 'Penelope Four Grain Bourbon'],
  ['970022436', 'Heaven Hill Bottled-in-Bond 7 Year'],
]);
const SOURCES_BY_MERCHANT = new Map(MAINE_SHAWS_RESEARCH_SOURCES.map(source => [source.merchantId, source]));

export function maineShawsPremiseMatches(source, resolverStore) {
  return SOURCES_BY_MERCHANT.get(String(source?.merchantId || '')) === source
    && source.resolverDomainName === "Shaw's"
    && resolverStore?.domainName === "Shaw's"
    && groceryExpansionPremiseMatches(source, resolverStore);
}

// Replay only the four expression identities observed in the retained capture.
// Quantities and alert eligibility stay non-exact/non-alertable for this research lane.
export function parseMaineShawsResearchInventory(payload, source, bible, { observedAt } = {}) {
  if (SOURCES_BY_MERCHANT.get(String(source?.merchantId || '')) !== source
    || source.researchOnly !== true
    || !Number.isFinite(Date.parse(observedAt || ''))) return [];

  return parseBoundGroceryXapiInventory(payload, source, bible)
    .filter(row => RESEARCHED_LIMITED_EXPRESSIONS.get(row.productId) === row.record?.canonical
      && row.record?.tier === 'limited'
      && Number.isFinite(row.price) && row.price > 0)
    .map(row => ({
      sourceId: source.id,
      state: source.stateCode,
      merchantId: source.merchantId,
      storeId: source.storeId,
      storeAddress: source.address,
      city: source.city,
      lat: source.lat,
      lng: source.lng,
      productId: row.productId,
      variantId: row.variantId,
      canonicalBottleId: row.record.id,
      canonicalName: row.record.canonical,
      tier: row.record.tier,
      price: row.price,
      quantity: 0,
      quantityIsExact: false,
      inventorySemantics: 'binary_retailer_orderable_no_exact_count',
      observedAt,
      researchOnly: true,
      canAlertAsInventory: false,
      canAlertAsWatch: false,
      rawProduct: row.rawProduct,
    }));
}
