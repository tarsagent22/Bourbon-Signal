import { locationValue, precisionRank } from './location-precision.mjs';
import { isCostcoSpiritsEligibleState } from './costco-eligibility.mjs';
import { isArizonaRetailerSignalIdentity } from './arizona-retailer-policy.mjs';
import { isFloridaRetailerSignalIdentity } from './florida-retailer-policy.mjs';
import { isGeorgiaRetailerInventory, isGeorgiaRetailerSignalIdentity } from './georgia-retailer-policy.mjs';
import { isIndianaRetailerInventory, isIndianaRetailerSignalIdentity } from './indiana-retailer-policy.mjs';
import { isTexasRetailerInventory, isTexasRetailerSignalIdentity } from './texas-retailer-policy.mjs';
import { isCaliforniaRetailerInventory, isCaliforniaRetailerSignalIdentity } from './california-retailer-policy.mjs';
import { isNevadaRetailerInventory, isNevadaRetailerSignalIdentity } from './nevada-retailer-policy.mjs';
import { isMetroRetailerInventory, isMetroRetailerSignalIdentity } from './metro-retailer-policy.mjs';
import { isMississippiRetailerInventory, isMississippiRetailerSignalIdentity } from './mississippi-retailer-policy.mjs';
import { isTennesseeRetailerInventory, isTennesseeRetailerSignalIdentity } from './tennessee-retailer-policy.mjs';
import { isSouthCarolinaDunesInventory, isSouthCarolinaDunesSignal } from './south-carolina-dunes-policy.mjs';
import { isSouthCarolinaAllAmericanInventory, isSouthCarolinaAllAmericanSignal, isSouthCarolinaDiscountLiquorInventory, isSouthCarolinaDiscountLiquorSignal, isSouthCarolinaSouthernSpiritsInventory, isSouthCarolinaSouthernSpiritsSignal } from './south-carolina-retailer-policy.mjs';
import { lifecycleAllowsInventoryAlert, lifecycleAllowsWatchAlert } from './state-lifecycle.mjs';

export const STATE_CONFIDENCE_POLICY = {
  OH: { maxAlertMode: 'browser_store_inventory_status', inventorySemantics: 'OHLQ store-level product availability is collected through browser/CDP via /api/product-availability/{sku} with RequestVerificationToken from the rendered page. The frontend bundle decodes hashed availability buckets as Not Available, Sold Out, Limited Supply, and In Stock. Direct server fetch is Cloudflare-gated and OHLQ does not expose explicit bottle counts, so alerts should describe status, not quantity.', defaultCadence: '15-60m' },
  OR: { maxAlertMode: 'alert_store_inventory_daily_caveat', inventorySemantics: 'Oregon Liquor Search browser/session flow now extracts store-level quantity rows after age gate and product-code drilldown. Quantities are updated daily rather than real-time, so alerts must carry a verify-with-store caveat.', defaultCadence: 'daily-60m' },
  IA: { maxAlertMode: 'alert_delivery_snapshot', inventorySemantics: 'Iowa 14-day CSV is store/licensee delivery evidence, not guaranteed current shelf stock. Strong drop/shipment signal with freshness caveat.', defaultCadence: 'daily-60m' },
  UT: { maxAlertMode: 'alert_board_aggregate', inventorySemantics: 'Utah Product Locator exposes statewide storeQty/warehouseQty aggregates by SKU. Useful availability pressure, not per-store shelf inventory.', defaultCadence: 'daily-60m' },
  AL: { maxAlertMode: 'release_watch', inventorySemantics: 'Alabama ABC official limited-release PDFs list allocated products by release/distribution, store number, address, item code, and price. Treat these as scheduled release/drop intelligence, not live shelf inventory or quantity-on-hand.', defaultCadence: 'daily-monthly' },
  VA: { maxAlertMode: 'normal_product_store_only', inventorySemantics: 'Virginia normal products may expose store availability. Limited availability inventory is intentionally hidden before release and must stay watch/policy only.', defaultCadence: 'daily-60m' },
  PA: { maxAlertMode: 'alert_store_inventory_pickup_api', inventorySemantics: 'FWGS browser/CDP collection uses the Oracle Commerce store-location endpoint plus /ccstorex/custom/v1/b2b/get-inventory to collect pickup quantity by SKU and store. Direct server fetch is Akamai/session gated, so scheduled collection needs a browser-assisted session bootstrap.', defaultCadence: '15-60m' },
  ID: { maxAlertMode: 'alert_store_inventory_daily_caveat', inventorySemantics: 'Idaho Liquor public product pages expose a store-level availability modal via WordPress AJAX. Rows report Available status and an as-of date, not bottle counts or reservations, so alerts must carry verify-before-driving caveats.', defaultCadence: 'daily' },
  NC: { maxAlertMode: 'alert_county_store_inventory', inventorySemantics: 'NC is fragmented by local ABC boards. Wake can expose store-level inventory, NC Stock Shipped Data gives board-level shipment evidence, and the NC warehouse page is statewide early-warning radar. Board/warehouse signals are useful planning intelligence but must not be described as exact shelf inventory.', defaultCadence: '15-60m' },
  IN: { maxAlertMode: 'alert_retailer_store_inventory_caveat', inventorySemantics: 'Indiana is a private retail market. ATC permit rows identify active package-store locations but are not bottle inventory. Retailer shop endpoints/pages such as CityHive can produce store-level bottle inventory/watch signals, with a verify-before-driving caveat.', defaultCadence: 'daily-60m' },
  IL: { maxAlertMode: 'alert_retailer_store_inventory_caveat', inventorySemantics: "Illinois is a private retail market. Binny's public Algolia product/store index can produce store-level retailer inventory rows with purchase availability, stock labels, price, and aisle metadata; alert as retailer-published availability with a verify-before-driving caveat.", defaultCadence: '15-60m' },
  NH: { maxAlertMode: 'watch_until_browser_api', inventorySemantics: 'NHLC site is Cloudflare-gated to raw fetch. Treat as watch/catalog until browser/API extraction yields outlet rows.', defaultCadence: 'daily-60m' },
  'MD-MONTGOMERY': { maxAlertMode: 'alert_county_product_or_store_when_available', inventorySemantics: 'Montgomery ABS product search/postback exposes county product rows and HAL/allocated flags. Store-level modal rows remain separate and should only alert as store inventory when extracted.', defaultCadence: 'daily-60m' },
  ME: { maxAlertMode: 'watch_until_browser_api', inventorySemantics: 'Maine Spirits finder is Cloudflare/browser dependent. Treat current signals as catalog/lottery/watch only.', defaultCadence: 'daily-weekly' },
  VT: { maxAlertMode: 'catalog_price_watch', inventorySemantics: 'Vermont pricing/report PDFs are product/price intelligence, not live store availability.', defaultCadence: 'daily-weekly' },
  MI: { maxAlertMode: 'catalog_price_watch', inventorySemantics: 'Michigan MLCC price book/new item lists are wholesale/catalog intelligence, not consumer store inventory.', defaultCadence: 'monthly-weekly' },
  MT: { maxAlertMode: 'catalog_price_watch', inventorySemantics: 'Montana public sources are price book/agency store context. Public store-level inventory not located.', defaultCadence: 'weekly' },
  WV: { maxAlertMode: 'catalog_release_watch', inventorySemantics: 'WV sources are product/search/release context. No live store inventory route found.', defaultCadence: 'daily-weekly' },
  WY: { maxAlertMode: 'wholesale_catalog_watch', inventorySemantics: 'Wyoming public data is wholesale/product-level. No consumer store inventory found.', defaultCadence: 'monthly-weekly' },
  MS: { maxAlertMode: 'policy_only', inventorySemantics: 'Mississippi is a mixed private-retail and controlled-wholesale market. DOR permits, SPA, bailment, pricing, catalog, wholesale, and policy sources are intelligence only. Exact allowlisted first-party retailer rows use binary pickup/orderability with no invented count and remain nonalertable while the state is research_only.', defaultCadence: '30-60m' },
  KY: { maxAlertMode: 'distillery_release_watch', inventorySemantics: 'Kentucky has official distillery gift-shop/product availability and release-watch pages. Treat these as a distinct distillery drop/release lane, not retailer store inventory. Alerts/cards must clearly distinguish distillery pickup/release leads from store shipment/inventory alerts.', defaultCadence: 'daily-60m' },
  TN: { maxAlertMode: 'license_document_watch', inventorySemantics: 'Tennessee ABC official public surfaces expose public information/forms and license lists for a private retail market. Treat official pages as source-discovery/license intelligence only; retailer CityHive/e-commerce rows may separately qualify as caveated store inventory.', defaultCadence: 'daily-60m' },
  TX: { maxAlertMode: 'catalog_release_watch', inventorySemantics: "Texas is a private retail market. TABC/comptroller pages are policy/license context; Spec's public product/event pages are retailer catalog or release-watch signals, not live shelf inventory unless a store-specific row is later extracted.", defaultCadence: 'daily-weekly' },
  SC: { maxAlertMode: 'policy_only', inventorySemantics: 'South Carolina DOR ABL official pages expose licensing/regulatory context only. Do not present as bottle availability. Whitelisted public retailer inventory rows are evaluated separately with retailer-published availability caveats.', defaultCadence: 'weekly-monthly' },
  GA: { maxAlertMode: 'policy_only', inventorySemantics: 'Georgia is a private retail market. Only explicitly whitelisted first-party retailer rows with exact merchant/store identity and positive Add to Cart or CityHive availability evidence may alert. Catalog, locator, and regulatory rows remain non-inventory.', defaultCadence: '30-60m' },
  FL: { maxAlertMode: 'policy_only', inventorySemantics: 'Florida ABT official pages expose licensing/quota-license lottery context, not bourbon product availability.', defaultCadence: 'weekly-monthly' },
  AZ: { maxAlertMode: 'policy_only', inventorySemantics: 'Arizona is a private retail market. Only explicitly whitelisted retailer merchant inventory rows may alert; policy and store-location context remain non-inventory.', defaultCadence: '30-60m' },
  CA: { maxAlertMode: 'policy_only', inventorySemantics: 'California is a private retail market. Only explicitly whitelisted first-party retailer rows with exact San Diego premises identity and positive pickup/order availability may alert; catalog-only rows remain watch context.', defaultCadence: '30-60m' },
  NV: { maxAlertMode: 'policy_only', inventorySemantics: 'Nevada is a private retail market. Only explicitly whitelisted first-party retailer rows with exact premises identity and positive store pickup/orderability may alert; catalog, shipping, delivery-only, and blocked rows remain watch context.', defaultCadence: '30-60m' },
  NY: { maxAlertMode: 'policy_only', inventorySemantics: 'New York coverage is deliberately limited to the New York City and Nassau County first-party retailer allowlist. Only exact merchant, premises, product URL, pickup, and positive orderability evidence may alert; broader New York catalog or shipping presence remains non-inventory.', defaultCadence: '30-60m' },
  CO: { maxAlertMode: 'policy_only', inventorySemantics: 'Colorado coverage is deliberately limited to the Denver Metro first-party retailer allowlist. Only exact merchant, premises, product URL, pickup, and positive orderability evidence may alert; broader Colorado catalog or shipping presence remains non-inventory.', defaultCadence: '30-60m' }
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

const VIRGINIA_INVENTORY_MAX_AGE_MS = Math.max(60 * 60_000, Number(process.env.BOURBON_SIGNAL_VA_INVENTORY_MAX_AGE_MS || 24 * 60 * 60_000));

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
  alert_costco_warehouse_inventory_caveat: 0.84,
  catalog_release_watch: 0.58,
  wholesale_catalog_watch: 0.5,
  store_aggregate_until_pickup_api: 0.76,
  alert_store_inventory_pickup_api: 0.9,
  alert_board_aggregate: 0.82,
  normal_product_store_only: 0.78,
  alert_county_product_or_store_when_available: 0.78,
  alert_county_store_inventory: 0.9,
  distillery_release_watch: 0.88,
  alert_delivery_snapshot: 0.92
};

const NON_INVENTORY_ALERT_EVENT_RE = /store_delivery_snapshot|store_allocation_snapshot|statewide_product_delivery_snapshot|statewide_product_inventory_snapshot|board_shipment|shipment_snapshot|stock_shipped|allocated|lottery|release|catalog|policy|official-source-seed/i;

function watchAlertsBlockedByStateSemantics(signal, eventType) {
  if (signal.state === 'MD-MONTGOMERY' && /county_inventory_aggregate|county_product|county_allocated|catalog|product_search/i.test(eventType)) return true;
  if (signal.state === 'UT' && /board_inventory_aggregate|catalog|release_document|allocated_release|bottle_inventory_signal/i.test(eventType)) return true;
  if (signal.state === 'NC' && /nc_board_shipment_snapshot|stock_shipped/i.test(eventType)) return true;
  return false;
}

function clamp(n, min = 0, max = 1) { return Math.max(min, Math.min(max, n)); }

const TENNESSEE_CITYHIVE_POLICY = {
  maxAlertMode: 'alert_retailer_store_inventory_caveat',
  inventorySemantics: 'Tennessee is a private retail market. Retailer CityHive pages can expose store-level bottle quantity and price for pickup/order-capable branches; alert as retailer-published availability with a verify-before-driving caveat.',
  defaultCadence: 'daily-60m'
};

const TEXAS_CITYHIVE_POLICY = {
  maxAlertMode: 'alert_retailer_store_inventory_caveat',
  inventorySemantics: 'Texas is a private retail market. Retailer CityHive pages can expose store-level bottle quantity and price for pickup/order-capable branches; alert as retailer-published availability with a verify-before-driving caveat.',
  defaultCadence: 'daily-60m'
};

const SOUTH_CAROLINA_RETAILER_POLICY = {
  maxAlertMode: 'alert_retailer_store_inventory_caveat',
  inventorySemantics: 'South Carolina is a private retail market. Whitelisted public retailer sources (CityHive merchant-id pages, Da Brown Bag Clover, Southern Spirits Shopify, Discount Liquor Square Online, and identity-bound Dunes Liquor runtime-store inventory) can expose store-level retailer-published bottle availability; alert with a verify-before-driving caveat and preserve exact quantity semantics from the source.',
  defaultCadence: 'daily-60m'
};

const ARIZONA_RETAILER_POLICY = {
  maxAlertMode: 'alert_retailer_store_inventory_caveat',
  inventorySemantics: 'Arizona is a private retail market. Explicitly whitelisted CityHive merchant pages can expose store-level bottle availability and price; alert as retailer-published availability with a verify-before-driving caveat.',
  defaultCadence: '30-60m'
};

const FLORIDA_RETAILER_POLICY = {
  maxAlertMode: 'alert_retailer_store_inventory_caveat',
  inventorySemantics: 'Florida is a private retail market. Only explicitly whitelisted retailer storefront and store-fulfillment rows may alert, with retailer-published availability and verify-before-driving caveats.',
  defaultCadence: '30-60m'
};

const INDIANA_RETAILER_POLICY = {
  maxAlertMode: 'alert_retailer_store_inventory_caveat',
  inventorySemantics: 'Indiana is a private retail market. Only identity-bound first-party retailer inventory or verified store-orderability rows may alert. Binary availability remains distinct from exact quantity, and delivery aggregators remain watch-only.',
  defaultCadence: '30-60m'
};

const GEORGIA_RETAILER_POLICY = {
  maxAlertMode: 'alert_retailer_store_inventory_caveat',
  inventorySemantics: 'Georgia first-party retailer rows are bound to exact storefront, merchant/store ID, and Georgia premises. Binary Add to Cart availability remains distinct from exact CityHive quantities, and every alert carries a verify-before-driving caveat.',
  defaultCadence: '30-60m'
};

const CALIFORNIA_RETAILER_POLICY = {
  maxAlertMode: 'alert_retailer_store_inventory_caveat',
  inventorySemantics: 'California San Diego retailer rows use first-party binary pickup/order availability bound to an exact physical retailer. Exact shelf count is not published; verify pickup directly before driving.',
  defaultCadence: '30-60m'
};

const NEVADA_RETAILER_POLICY = {
  maxAlertMode: 'alert_retailer_store_inventory_caveat',
  inventorySemantics: 'Nevada retailer rows use first-party store availability or pickup orderability bound to an exact physical retailer. Binary sources do not publish exact shelf count; verify directly before driving.',
  defaultCadence: '30-60m'
};

const METRO_RETAILER_POLICY = {
  maxAlertMode: 'alert_retailer_store_inventory_caveat',
  inventorySemantics: 'Whitelisted New York City, Nassau County, and Denver Metro retailer rows are bound to an exact first-party host, merchant, physical premises, and product identity. CityHive counts below 100 retain exact retailer-reported quantity; sentinel counts and Shopify availability remain binary orderability. Verify pickup before driving.',
  defaultCadence: '30-60m'
};

const MISSISSIPPI_RETAILER_POLICY = {
  maxAlertMode: 'alert_retailer_store_inventory_caveat',
  inventorySemantics: 'Allowlisted Mississippi retailer rows are bound to an exact current permit, first-party host, merchant/store ID, physical premises, product identity, and pickup/orderability evidence. Availability is binary with quantity zero and no exact shelf-count claim.',
  defaultCadence: '30-60m'
};


const KENTUCKY_DISTILLERY_POLICY = {
  maxAlertMode: 'distillery_release_watch',
  inventorySemantics: 'Official Kentucky distillery source. Gift-shop/product-availability rows are distillery pickup/drop leads and upcoming-release rows are release-watch leads; neither is retailer store shipment inventory.',
  defaultCadence: 'daily-60m'
};

const COSTCO_WAREHOUSE_POLICY = {
  maxAlertMode: 'alert_costco_warehouse_inventory_caveat',
  inventorySemantics: 'Costco warehouse/app availability can expose allocated bourbon by item number and warehouse. Treat as retailer-published warehouse availability with a verify-before-driving caveat; keep copy in Bourbon Signal style rather than Discord bot syntax.',
  defaultCadence: '15-60m'
};

function policyForSignal(signal, nowMs = Date.now()) {
  const basePolicy = STATE_CONFIDENCE_POLICY[signal.state] || { maxAlertMode: 'unknown', inventorySemantics: 'No policy defined.' };
  const eventType = String(signal.eventType || signal.signalType || '');
  const source = String(signal.sourceLabel || signal.source || '');
  if (signal.state === 'TN'
    && /^(cityhive_store_inventory_result|retailer_store_inventory_result)$/i.test(eventType)
    && isTennesseeRetailerSignalIdentity(signal)
    && isTennesseeRetailerInventory(signal)) return TENNESSEE_CITYHIVE_POLICY;
  if (signal.state === 'TX'
    && /^(cityhive_store_inventory_result|retailer_store_inventory_result)$/i.test(eventType)
    && isTexasRetailerSignalIdentity(signal)) return TEXAS_CITYHIVE_POLICY;
  if (signal.state === 'SC'
    && /^(cityhive_store_inventory|retailer_store_inventory)/i.test(eventType)
    && (/CityHive|Green's Beverage|Wine & Bourbon Barn|Da Brown Bag|Clover|Southern Spirits|Shopify/i.test(source)
      || isSouthCarolinaDunesInventory(signal, nowMs)
      || isSouthCarolinaAllAmericanInventory(signal, nowMs)
      || isSouthCarolinaDiscountLiquorInventory(signal, nowMs))) return SOUTH_CAROLINA_RETAILER_POLICY;
  if (signal.state === 'AZ'
    && /^(cityhive_store_inventory_result|retailer_store_inventory_result)$/i.test(eventType)
    && isArizonaRetailerSignalIdentity(signal)) return ARIZONA_RETAILER_POLICY;
  if (signal.state === 'FL'
    && /^(cityhive_store_inventory_result|retailer_store_inventory_result)$/i.test(eventType)
    && isFloridaRetailerSignalIdentity(signal)) return FLORIDA_RETAILER_POLICY;
  if (signal.state === 'IN'
    && /^(cityhive_store_inventory_result|retailer_store_inventory_result)$/i.test(eventType)
    && isIndianaRetailerSignalIdentity(signal)) return INDIANA_RETAILER_POLICY;
  if (signal.state === 'GA'
    && /^(cityhive_store_inventory_result|retailer_store_inventory_result)$/i.test(eventType)
    && isGeorgiaRetailerSignalIdentity(signal)
    && isGeorgiaRetailerInventory(signal)) return GEORGIA_RETAILER_POLICY;
  if (signal.state === 'CA'
    && /^retailer_store_inventory_result$/i.test(eventType)
    && isCaliforniaRetailerSignalIdentity(signal)) return CALIFORNIA_RETAILER_POLICY;
  if (signal.state === 'NV'
    && /^retailer_store_inventory_result$/i.test(eventType)
    && isNevadaRetailerSignalIdentity(signal)) return NEVADA_RETAILER_POLICY;
  if (['NY', 'CO'].includes(signal.state)
    && /^(cityhive_store_inventory_result|retailer_store_inventory_result)$/i.test(eventType)
    && isMetroRetailerSignalIdentity(signal)
    && isMetroRetailerInventory(signal)) return METRO_RETAILER_POLICY;
  if (signal.state === 'MS'
    && /^(cityhive_store_inventory_result|retailer_store_inventory_result)$/i.test(eventType)
    && isMississippiRetailerSignalIdentity(signal)
    && isMississippiRetailerInventory(signal)) return MISSISSIPPI_RETAILER_POLICY;
  if (signal.state === 'KY' && /^distillery_/i.test(eventType)) return KENTUCKY_DISTILLERY_POLICY;
  if (isCostcoSpiritsEligibleState(signal.state) && /^costco_warehouse_inventory/i.test(eventType)) return COSTCO_WAREHOUSE_POLICY;
  return basePolicy;
}

export function confidenceForSignal(signal, { nowMs = Date.now() } = {}) {
  const policy = policyForSignal(signal, nowMs);
  const precision = signal.locationPrecision || 'statewide_catalog';
  const rank = precisionRank(precision);
  let confidence = Number(signal.confidence || 0.35) || 0.35;
  confidence += rank >= 6 ? 0.25 : rank >= 5 ? 0.16 : rank >= 4 ? 0.13 : rank >= 3 ? 0.09 : rank >= 2 ? 0.03 : -0.05;
  const eventType = String(signal.eventType || signal.signalType || '');
  for (const [re, weight] of EVENT_WEIGHTS) if (re.test(eventType)) { confidence += weight; break; }
  const qty = Number(signal.quantity ?? signal.storeQty ?? signal.raw?.storeQty ?? 0) || 0;
  if (qty > 0) confidence += 0.08;
  if (signal.fallback || signal.mode === 'official-source-seed') confidence -= 0.12;
  const positiveAvailabilityStatus = /in_stock|limited_supply/i.test(String(signal.availabilityStatus || signal.raw?.availability?.status || ''));
  const hasPositiveInventory = (qty > 0 || positiveAvailabilityStatus) && !/out_of_stock|sold_out|not_available/i.test(eventType);
  const isSampleOnly = Boolean(signal.raw?.sampleOnly);
  if (isSampleOnly) confidence = Math.min(confidence, 0.49);
  const isVirginiaLimitedCaveat = signal.state === 'VA' && signal.raw?.product?.limitedCaveat;
  const isVirginiaOfficialStoreInventory = isVirginiaLimitedCaveat && hasPositiveInventory && rank >= 6 && /store_inventory/i.test(eventType);
  if (((/limited/i.test(eventType) && signal.state === 'VA') || isVirginiaLimitedCaveat) && !isVirginiaOfficialStoreInventory) confidence = Math.min(confidence, 0.68);
  confidence = Math.min(confidence, MODE_CAPS[policy.maxAlertMode] ?? 0.7);
  const inventoryBlockedBySemantics = NON_INVENTORY_ALERT_EVENT_RE.test(`${eventType} ${signal.mode || ''}`);
  const isDistilleryLane = signal.state === 'KY' && /^distillery_/i.test(eventType);
  const watchBlockedBySemantics = watchAlertsBlockedByStateSemantics(signal, eventType);
  const texasInventoryAllowed = signal.state !== 'TX' || isTexasRetailerInventory(signal);
  const indianaRetailerEvent = signal.state === 'IN' && /^(cityhive_store_inventory_result|retailer_store_inventory_result)$/i.test(eventType);
  const indianaInventoryAllowed = !indianaRetailerEvent || isIndianaRetailerInventory(signal);
  const indianaWatchAllowed = !indianaRetailerEvent || isIndianaRetailerSignalIdentity(signal);
  const georgiaRetailerEvent = signal.state === 'GA' && /^(cityhive_store_inventory_result|retailer_store_inventory_result)$/i.test(eventType);
  const georgiaInventoryAllowed = !georgiaRetailerEvent || isGeorgiaRetailerInventory(signal);
  const georgiaWatchAllowed = !georgiaRetailerEvent || (isGeorgiaRetailerSignalIdentity(signal) && isGeorgiaRetailerInventory(signal));
  const tennesseeRetailerEvent = signal.state === 'TN' && /^(cityhive_store_inventory_result|retailer_store_inventory_result)$/i.test(eventType);
  const tennesseeInventoryAllowed = !tennesseeRetailerEvent || isTennesseeRetailerInventory(signal);
  const tennesseeWatchAllowed = !tennesseeRetailerEvent || (isTennesseeRetailerSignalIdentity(signal) && isTennesseeRetailerInventory(signal));
  const californiaRetailerEvent = signal.state === 'CA' && /^retailer_store_inventory_result$/i.test(eventType);
  const californiaInventoryAllowed = !californiaRetailerEvent || isCaliforniaRetailerInventory(signal);
  const californiaWatchAllowed = !californiaRetailerEvent || isCaliforniaRetailerSignalIdentity(signal);
  const nevadaRetailerEvent = signal.state === 'NV' && /^retailer_store_inventory_result$/i.test(eventType);
  const nevadaInventoryAllowed = !nevadaRetailerEvent || isNevadaRetailerInventory(signal);
  const nevadaWatchAllowed = !nevadaRetailerEvent || isNevadaRetailerSignalIdentity(signal);
  const metroRetailerEvent = ['NY', 'CO'].includes(signal.state) && /^(cityhive_store_inventory_result|retailer_store_inventory_result)$/i.test(eventType);
  const metroInventoryAllowed = !metroRetailerEvent || isMetroRetailerInventory(signal);
  const metroWatchAllowed = !metroRetailerEvent || (isMetroRetailerSignalIdentity(signal) && isMetroRetailerInventory(signal));
  const southCarolinaDunesEvent = /^(cityhive_store_inventory|retailer_store_inventory)/i.test(eventType)
    && isSouthCarolinaDunesSignal(signal);
  const southCarolinaDunesAllowed = !southCarolinaDunesEvent || isSouthCarolinaDunesInventory(signal, nowMs);
  const southCarolinaSouthernSpiritsEvent = /^(cityhive_store_inventory|retailer_store_inventory)/i.test(eventType)
    && isSouthCarolinaSouthernSpiritsSignal(signal);
  const southCarolinaSouthernSpiritsAllowed = !southCarolinaSouthernSpiritsEvent || isSouthCarolinaSouthernSpiritsInventory(signal, nowMs);
  const southCarolinaAllAmericanEvent = /^(cityhive_store_inventory|retailer_store_inventory)/i.test(eventType)
    && isSouthCarolinaAllAmericanSignal(signal);
  const southCarolinaAllAmericanAllowed = !southCarolinaAllAmericanEvent || isSouthCarolinaAllAmericanInventory(signal, nowMs);
  const southCarolinaDiscountLiquorEvent = /^(cityhive_store_inventory|retailer_store_inventory)/i.test(eventType)
    && isSouthCarolinaDiscountLiquorSignal(signal);
  const southCarolinaDiscountLiquorAllowed = !southCarolinaDiscountLiquorEvent || isSouthCarolinaDiscountLiquorInventory(signal, nowMs);
  const mississippiRetailerEvent = signal.state === 'MS' && /^(cityhive_store_inventory_result|retailer_store_inventory_result)$/i.test(eventType);
  const mississippiInventoryAllowed = !mississippiRetailerEvent
    || (isMississippiRetailerInventory(signal) && lifecycleAllowsInventoryAlert('MS'));
  const mississippiWatchAllowed = !mississippiRetailerEvent
    || (isMississippiRetailerSignalIdentity(signal) && isMississippiRetailerInventory(signal) && lifecycleAllowsWatchAlert('MS'));
  const virginiaObservedAt = Date.parse(String(signal.observedAt || signal.fetchedAt || ''));
  const virginiaInventoryExpired = signal.state === 'VA'
    && /store_inventory/i.test(eventType)
    && (!Number.isFinite(virginiaObservedAt) || Date.now() - virginiaObservedAt > VIRGINIA_INVENTORY_MAX_AGE_MS);
  const runtimeAlertBlocked = signal.stale === true
    || signal.sourceStale === true
    || virginiaInventoryExpired
    || signal.quarantined === true
    || signal.raw?.sourceRuntimeNonAlertable === true
    || signal.raw?.staleFallback === true;
  return {
    confidence: clamp(confidence),
    policyMode: policy.maxAlertMode,
    inventorySemantics: policy.inventorySemantics,
    locationValue: locationValue(signal),
    canAlertAsInventory: !runtimeAlertBlocked && texasInventoryAllowed && indianaInventoryAllowed && georgiaInventoryAllowed && tennesseeInventoryAllowed && californiaInventoryAllowed && nevadaInventoryAllowed && metroInventoryAllowed && southCarolinaDunesAllowed && southCarolinaSouthernSpiritsAllowed && southCarolinaAllAmericanAllowed && southCarolinaDiscountLiquorAllowed && mississippiInventoryAllowed && !isDistilleryLane && hasPositiveInventory && !inventoryBlockedBySemantics && rank >= 6 && confidence >= 0.72,
    canAlertAsWatch: !runtimeAlertBlocked && indianaWatchAllowed && georgiaWatchAllowed && tennesseeWatchAllowed && californiaWatchAllowed && nevadaWatchAllowed && metroWatchAllowed && southCarolinaDunesAllowed && southCarolinaSouthernSpiritsAllowed && southCarolinaAllAmericanAllowed && southCarolinaDiscountLiquorAllowed && mississippiWatchAllowed && !isSampleOnly && !watchBlockedBySemantics && confidence >= 0.5 && policy.maxAlertMode !== 'policy_only'
  };
}
