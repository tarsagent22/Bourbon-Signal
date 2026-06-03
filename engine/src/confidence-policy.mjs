import { locationValue, precisionRank } from './location-precision.mjs';

export const STATE_CONFIDENCE_POLICY = {
  OH: { maxAlertMode: 'browser_store_inventory_status', inventorySemantics: 'OHLQ store-level product availability is collected through browser/CDP via /api/product-availability/{sku} with RequestVerificationToken from the rendered page. The frontend bundle decodes hashed availability buckets as Not Available, Sold Out, Limited Supply, and In Stock. Direct server fetch is Cloudflare-gated and OHLQ does not expose explicit bottle counts, so alerts should describe status, not quantity.', defaultCadence: '15-60m' },
  OR: { maxAlertMode: 'alert_store_inventory_daily_caveat', inventorySemantics: 'Oregon Liquor Search browser/session flow now extracts store-level quantity rows after age gate and product-code drilldown. Quantities are updated daily rather than real-time, so alerts must carry a verify-with-store caveat.', defaultCadence: 'daily-60m' },
  IA: { maxAlertMode: 'alert_delivery_snapshot', inventorySemantics: 'Iowa 14-day CSV is store/licensee delivery evidence, not guaranteed current shelf stock. Strong drop/shipment signal with freshness caveat.', defaultCadence: 'daily-60m' },
  UT: { maxAlertMode: 'alert_board_aggregate', inventorySemantics: 'Utah Product Locator exposes statewide storeQty/warehouseQty aggregates by SKU. Useful availability pressure, not per-store shelf inventory.', defaultCadence: 'daily-60m' },
  AL: { maxAlertMode: 'release_watch', inventorySemantics: 'Alabama ABC official limited-release PDFs list allocated products by release/distribution, store number, address, item code, and price. Treat these as scheduled release/drop intelligence, not live shelf inventory or quantity-on-hand.', defaultCadence: 'daily-monthly' },
  VA: { maxAlertMode: 'normal_product_store_only', inventorySemantics: 'Virginia normal products may expose store availability. Limited availability inventory is intentionally hidden before release and must stay watch/policy only.', defaultCadence: 'daily-60m' },
  PA: { maxAlertMode: 'alert_store_inventory_pickup_api', inventorySemantics: 'FWGS browser/CDP collection uses the Oracle Commerce store-location endpoint plus /ccstorex/custom/v1/b2b/get-inventory to collect pickup quantity by SKU and store. Direct server fetch is Akamai/session gated, so scheduled collection needs a browser-assisted session bootstrap.', defaultCadence: '15-60m' },
  ID: { maxAlertMode: 'release_watch', inventorySemantics: 'Idaho public sources are catalog/special-release/allocated context. Store-level quantity route not found.', defaultCadence: 'daily' },
  NC: { maxAlertMode: 'alert_county_store_inventory', inventorySemantics: 'NC is fragmented by local ABC boards. Wake can expose store-level inventory, NC Stock Shipped Data gives board-level shipment evidence, and the NC warehouse page is statewide early-warning radar. Board/warehouse signals are useful planning intelligence but must not be described as exact shelf inventory.', defaultCadence: '15-60m' },
  IN: { maxAlertMode: 'alert_retailer_store_inventory_caveat', inventorySemantics: 'Indiana is a private retail market. ATC permit rows identify active package-store locations but are not bottle inventory. Retailer shop endpoints/pages such as CityHive can produce store-level bottle inventory/watch signals, with a verify-before-driving caveat.', defaultCadence: 'daily-60m' },
  NH: { maxAlertMode: 'watch_until_browser_api', inventorySemantics: 'NHLC site is Cloudflare-gated to raw fetch. Treat as watch/catalog until browser/API extraction yields outlet rows.', defaultCadence: 'daily-60m' },
  'MD-MONTGOMERY': { maxAlertMode: 'alert_county_product_or_store_when_available', inventorySemantics: 'Montgomery ABS product search/postback exposes county product rows and HAL/allocated flags. Store-level modal rows remain separate and should only alert as store inventory when extracted.', defaultCadence: 'daily-60m' },
  ME: { maxAlertMode: 'watch_until_browser_api', inventorySemantics: 'Maine Spirits finder is Cloudflare/browser dependent. Treat current signals as catalog/lottery/watch only.', defaultCadence: 'daily-weekly' },
  VT: { maxAlertMode: 'catalog_price_watch', inventorySemantics: 'Vermont pricing/report PDFs are product/price intelligence, not live store availability.', defaultCadence: 'daily-weekly' },
  MI: { maxAlertMode: 'catalog_price_watch', inventorySemantics: 'Michigan MLCC price book/new item lists are wholesale/catalog intelligence, not consumer store inventory.', defaultCadence: 'monthly-weekly' },
  MT: { maxAlertMode: 'catalog_price_watch', inventorySemantics: 'Montana public sources are price book/agency store context. Public store-level inventory not located.', defaultCadence: 'weekly' },
  WV: { maxAlertMode: 'catalog_release_watch', inventorySemantics: 'WV sources are product/search/release context. No live store inventory route found.', defaultCadence: 'daily-weekly' },
  WY: { maxAlertMode: 'wholesale_catalog_watch', inventorySemantics: 'Wyoming public data is wholesale/product-level. No consumer store inventory found.', defaultCadence: 'monthly-weekly' },
  MS: { maxAlertMode: 'catalog_price_watch', inventorySemantics: 'Mississippi public sources expose monthly SPA/bailment price-change PDFs plus vendor/product policy. Treat as product/price-change intelligence, not live store inventory.', defaultCadence: 'monthly-weekly' },
  KY: { maxAlertMode: 'catalog_price_watch', inventorySemantics: 'Kentucky ABC official public surfaces found so far are active-brand/licensing context, not consumer store inventory. Treat Kentucky as product/brand watch only until a bottle-level public feed is found.', defaultCadence: 'weekly-monthly' },
  TN: { maxAlertMode: 'license_document_watch', inventorySemantics: 'Tennessee ABC official public surfaces expose public information/forms and license lists for a private retail market. Treat as source-discovery/license intelligence only; do not produce bottle/store alerts from these sources.', defaultCadence: 'weekly-monthly' },
  SC: { maxAlertMode: 'policy_only', inventorySemantics: 'South Carolina DOR ABL official pages expose licensing/regulatory context only. Do not present as bottle availability.', defaultCadence: 'weekly-monthly' },
  GA: { maxAlertMode: 'catalog_price_watch', inventorySemantics: 'Georgia DOR official pages expose brand/label registration guidance, active alcohol license reports, and shipment reporting context. Treat as source-discovery/catalog infrastructure, not consumer bottle inventory.', defaultCadence: 'weekly-monthly' },
  FL: { maxAlertMode: 'policy_only', inventorySemantics: 'Florida ABT official pages expose licensing/quota-license lottery context, not bourbon product availability.', defaultCadence: 'weekly-monthly' }
};

const EVENT_WEIGHTS = [
  [/store_delivery_snapshot/i, 0.24],
  [/store_inventory_result|store_inventory/i, 0.24],
  [/store_pickup|store_aggregate/i, 0.15],
  [/board_shipment|stock_shipped|shipment_snapshot/i, 0.16],
  [/board_inventory_aggregate|warehouse/i, 0.13],
  [/county_allocated_product_row|county_product_row/i, 0.11],
  [/allocated|limited|lottery|release/i, 0.08],
  [/catalog|product_search|product_row/i, 0.03],
  [/policy/i, -0.08]
];

const MODE_CAPS = {
  policy_only: 0.35,
  watch_until_store_api: 0.62,
  browser_store_watch_caveated: 0.72,
  browser_store_inventory_status: 0.82,
  alert_store_inventory_daily_caveat: 0.84,
  watch_until_store_locator: 0.6,
  watch_until_browser_api: 0.56,
  release_watch: 0.68,
  catalog_price_watch: 0.58,
  license_document_watch: 0.48,
  license_spine_plus_retailer_watch: 0.54,
  alert_retailer_store_inventory_caveat: 0.86,
  catalog_release_watch: 0.58,
  wholesale_catalog_watch: 0.5,
  store_aggregate_until_pickup_api: 0.76,
  alert_store_inventory_pickup_api: 0.9,
  alert_board_aggregate: 0.82,
  normal_product_store_only: 0.78,
  alert_county_product_or_store_when_available: 0.78,
  alert_county_store_inventory: 0.9,
  alert_delivery_snapshot: 0.92
};

function clamp(n, min = 0, max = 1) { return Math.max(min, Math.min(max, n)); }

export function confidenceForSignal(signal) {
  const policy = STATE_CONFIDENCE_POLICY[signal.state] || { maxAlertMode: 'unknown', inventorySemantics: 'No policy defined.' };
  const precision = signal.locationPrecision || 'statewide_catalog';
  const rank = precisionRank(precision);
  let confidence = Number(signal.confidence || 0.35) || 0.35;
  confidence += rank >= 6 ? 0.25 : rank >= 5 ? 0.16 : rank >= 4 ? 0.13 : rank >= 3 ? 0.09 : rank >= 2 ? 0.03 : -0.05;
  const eventType = String(signal.eventType || signal.signalType || '');
  for (const [re, weight] of EVENT_WEIGHTS) if (re.test(eventType)) { confidence += weight; break; }
  const qty = Number(signal.quantity ?? signal.storeQty ?? signal.raw?.storeQty ?? 0) || 0;
  if (qty > 0) confidence += 0.08;
  if (signal.fallback || signal.mode === 'official-source-seed') confidence -= 0.12;
  const isSampleOnly = Boolean(signal.raw?.sampleOnly);
  if (isSampleOnly) confidence = Math.min(confidence, 0.49);
  const isVirginiaLimitedCaveat = signal.state === 'VA' && signal.raw?.product?.limitedCaveat;
  if ((/limited/i.test(eventType) && signal.state === 'VA') || isVirginiaLimitedCaveat) confidence = Math.min(confidence, 0.68);
  confidence = Math.min(confidence, MODE_CAPS[policy.maxAlertMode] ?? 0.7);
  const positiveAvailabilityStatus = /in_stock|limited_supply/i.test(String(signal.availabilityStatus || signal.raw?.availability?.status || ''));
  const hasPositiveInventory = (qty > 0 || positiveAvailabilityStatus) && !/out_of_stock|sold_out|not_available/i.test(eventType);
  return {
    confidence: clamp(confidence),
    policyMode: policy.maxAlertMode,
    inventorySemantics: policy.inventorySemantics,
    locationValue: locationValue(signal),
    canAlertAsInventory: hasPositiveInventory && !isVirginiaLimitedCaveat && rank >= 6 && confidence >= 0.72 && !/policy|catalog|official-source-seed/i.test(`${eventType} ${signal.mode || ''}`),
    canAlertAsWatch: !isSampleOnly && confidence >= 0.5 && policy.maxAlertMode !== 'policy_only'
  };
}
