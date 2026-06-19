export const PRECISION_RANK = {
  blocked: 0,
  statewide_policy: 1,
  statewide_catalog: 2,
  board_county: 3,
  board_warehouse: 4,
  store_aggregate: 5,
  distillery: 6,
  store_level: 6
};

export const LOCATION_PROFILES = {
  OH: { target: 'store_level', note: 'OHLQ product availability API is now collected at store level through browser/CDP with RequestVerificationToken; raw Node fetch remains Cloudflare-gated. Availability buckets are decoded from the frontend bundle as Not Available, Sold Out, Limited Supply, and In Stock.' },
  OR: { target: 'store_level', note: 'Oregon Liquor Search is intended to show carrying stores/product availability.' },
  IA: { target: 'store_level', note: 'Iowa ABD snapshot CSV exposes 14-day deliveries to Class E licensee/store locations.' },
  UT: { target: 'board_warehouse', note: 'Utah DABS product locator exposes statewide product/storeQty/warehouseQty aggregates through public DataTables API; store-detail route still needs session drilldown.' },
  AL: { target: 'board_county', note: 'Alabama limited-release pages are release/list intelligence; participating store/event pages are next precision target.' },
  VA: { target: 'store_level', note: 'Virginia ABC exposes store availability for normal products but intentionally hides limited availability inventory until release.' },
  PA: { target: 'store_level', note: 'FWGS has retail/store pickup inventory; bot-protected route requires browser/network extraction.' },
  ID: { target: 'store_level', note: 'Idaho Liquor product pages expose store-level Available status through the public check_availability AJAX route. It is status/as-of-date inventory, not bottle count.' },
  NC: { target: 'store_level', note: 'NC is fragmented by county board; Wake ABC publicly exposes store/quantity results, while state source gives allocated list/warehouse context.' },
  IN: { target: 'store_level', note: 'Indiana is a private retail market. ATC public permit lookup can provide active package-store coverage at store/city/ZIP precision; bottle inventory requires retailer-specific shop/inventory surfaces.' },
  IL: { target: 'store_level', note: "Illinois is a private retail market. Current strongest source is Binny's public Algolia product/store index, which exposes Illinois store locations plus per-store purchase availability, prices, and aisle labels for matching bourbon products." },
  NH: { target: 'store_level', note: 'NHLC product/outlet site likely has catalog/outlet data but Cloudflare blocks raw fetch.' },
  'MD-MONTGOMERY': { target: 'store_aggregate', note: 'Montgomery ABS open data currently exposes county/store-aggregate product inventory and HAL/allocated rows. Exact per-store modal drilldown remains future ASP.NET/viewstate parser work.' },
  ME: { target: 'store_level', note: 'Maine Spirits finder is Cloudflare-blocked; lottery pages remain statewide until browser/API extraction.' },
  VT: { target: 'statewide_catalog', note: '802Spirits public pricing/report PDFs are product-level; no live store availability found.' },
  MI: { target: 'statewide_catalog', note: 'MLCC price book/new item lists are statewide wholesale/catalog intelligence, not consumer store inventory.' },
  MT: { target: 'statewide_catalog', note: 'Montana price book/agency store list; no public store-level inventory located.' },
  WV: { target: 'statewide_catalog', note: 'WV ABCA search/barrel-pick pages are statewide product/release signals; no public store inventory located.' },
  WY: { target: 'statewide_catalog', note: 'Wyoming Liquor Division product pages are wholesale/product-level; no consumer store inventory found.' },
  MS: { target: 'statewide_catalog', note: 'Mississippi ABC public pages expose SPA/bailment price-change PDFs and vendor/product policy, not bottle/store inventory.' },
  KY: { target: 'distillery', note: 'Kentucky public value comes from official distillery gift-shop/drop and release-watch sources. Treat distillery signals separately from retailer store inventory.' },
  TN: { target: 'store_level', note: 'Tennessee is a private retail market; official ABC surfaces are licensing/policy, while selected public retailer e-commerce pages can expose store-level quantity/price with a verify-before-driving caveat.' },
  TX: { target: 'statewide_catalog', note: "Texas is a private retail market. Current public coverage is TABC/comptroller context plus Spec's retailer catalog/release pages; store-level inventory remains a future retailer-specific extraction target." },
  SC: { target: 'statewide_policy', note: 'South Carolina DOR ABL pages expose liquor licensing/regulatory context, not bottle/store inventory.' },
  GA: { target: 'statewide_catalog', note: 'Georgia DOR brand/label and active-license pages expose registration/license context, not public consumer bottle availability.' },
  FL: { target: 'statewide_policy', note: 'Florida ABT quota/license pages expose regulatory/lottery context, not bourbon inventory.' }
};

export function precisionRank(level) {
  return PRECISION_RANK[level] ?? 0;
}

export function bestPrecision(signals = []) {
  return signals.reduce((best, signal) => {
    const level = signal.locationPrecision || 'statewide_catalog';
    return precisionRank(level) > precisionRank(best) ? level : best;
  }, 'blocked');
}

export function locationValue(signal) {
  const level = signal.locationPrecision || 'statewide_catalog';
  const rank = precisionRank(level);
  const qty = Number(signal.quantity || signal.storeQty || signal.raw?.storeQty || 0) || 0;
  if (rank >= 6 && qty > 0) return level === 'distillery' ? 'high_distillery_drop_signal' : 'high_live_store_signal';
  if (level === 'distillery') return 'high_distillery_release_watch';
  if (rank >= 6) return 'high_precision_store_signal_no_stock';
  if (rank >= 5) return 'medium_store_aggregate_signal';
  if (rank >= 4) return 'medium_board_warehouse_signal';
  if (rank >= 3) return 'medium_board_or_county_signal';
  if (rank >= 2) return 'low_catalog_signal';
  return 'blocked_or_policy_only';
}
