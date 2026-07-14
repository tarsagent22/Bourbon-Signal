import { INDIANA_TARGET_STORES } from './collectors/indiana-retailer-surfaces.mjs';

export const INDIANA_CITYHIVE_IDENTITIES = new Map([
  ['Big Red Liquors CityHive store inventory', { chain: 'big-red', hostnames: new Set(['bigredliquors.com', 'crownliquors.net']) }],
  ["Cap n' Cork CityHive store inventory", { chain: 'cap-n-cork', hostnames: new Set(['capncork.com']) }],
  ['Wise Guys Discount Liquors CityHive store inventory', { chain: 'wise-guys', hostnames: new Set(['shop.wiseguysliquors.com']) }],
  ['Belmont Beverage & Chalet Party Shoppe CityHive store inventory', { chain: 'belmont-beverage', hostnames: new Set(['belmontbev.com']) }],
  ['Cork Liquors CityHive store inventory', { chain: 'cork-liquors', hostnames: new Set(['shop.corkliquor.com']) }],
  ['21st Amendment Wine & Spirits CityHive store inventory', { chain: '21st-amendment', hostnames: new Set(['21stamendment.com']) }],
  ['Holiday Liquors Jasper CityHive store inventory', { chain: 'holiday-liquors-jasper', hostnames: new Set(['holidayliquorsinc.com', 'holidayl7c37e10a.sites.cityhive.app']) }],
  ["Gays Hops-N-Schnapps CityHive store inventory", { chain: 'gays-hops-n-schnapps', hostnames: new Set(['gayshopsnschnapps.com', 'gayshopsb1eca398.sites.cityhive.app']) }],
  ['Vine & Table CityHive store inventory', { chain: 'vine-and-table', hostnames: new Set(['vineandtable.com', 'vinetabl687fd7df.sites.cityhive.app']) }],
]);

const FIXED_IDENTITIES = new Map([
  ['Payless Liquors East Street barrel selections', { hostnames: new Set(['paylessliquors.info']), stores: new Set(['payless-liquors:east-street']), chain: 'payless-liquors' }],
  ['Penguin Liquor Lafayette in-stock product pages', { hostnames: new Set(['penguinliquor.com']), stores: new Set(['penguin-liquor:96']) }],
  ["Kahn's Fine Wines & Spirits in-stock bourbon API", { hostnames: new Set(['kahnsfinewines.com']), stores: new Set(['kahns:69']), chain: 'kahns' }],
]);

const DOORDASH_IDENTITY = {
  source: 'DoorDash Frontier Liquors Evansville marketplace inventory',
  hostname: 'doordash.com',
  storeId: 'doordash:26286224',
  rawSource: 'doordash_frontier_liquors_public_store_page',
};

function hostname(value) {
  try { return new URL(String(value || '')).hostname.replace(/^www\./i, '').toLowerCase(); } catch { return ''; }
}

function chainFor(signal) {
  const storeId = String(signal.storeId || '');
  return String(signal.sourceChain || signal.raw?.chain || (storeId.includes(':') ? storeId.slice(0, storeId.indexOf(':')) : ''));
}

function merchantFor(signal) {
  const direct = signal.merchantId || signal.raw?.merchantId || signal.raw?.option?.merchant_id;
  if (direct) return String(direct);
  const storeId = String(signal.storeId || '');
  return storeId.includes(':') ? storeId.slice(storeId.indexOf(':') + 1) : '';
}

export function isIndianaRetailerSignalIdentity(signal) {
  if (signal?.state !== 'IN' || (signal?.stateCode && signal.stateCode !== 'IN')) return false;
  const source = String(signal.sourceLabel || signal.source || '');
  const sourceHostname = hostname(signal.sourceUrl);
  const storeId = String(signal.storeId || '');

  if (source === 'Target Indiana RedSky store fulfillment') {
    const merchantId = merchantFor(signal);
    return chainFor(signal) === 'target'
      && sourceHostname === 'target.com'
      && INDIANA_TARGET_STORES.has(merchantId)
      && storeId === `target:${merchantId}`;
  }

  const cityHive = INDIANA_CITYHIVE_IDENTITIES.get(source);
  if (cityHive) {
    const merchantId = merchantFor(signal);
    return chainFor(signal) === cityHive.chain
      && cityHive.hostnames.has(sourceHostname)
      && /^[0-9a-f]{24}$/i.test(merchantId)
      && storeId === `${cityHive.chain}:${merchantId}`;
  }

  const fixed = FIXED_IDENTITIES.get(source);
  if (fixed) {
    return fixed.hostnames.has(sourceHostname)
      && fixed.stores.has(storeId)
      && (!fixed.chain || chainFor(signal) === fixed.chain);
  }

  if (source === DOORDASH_IDENTITY.source) {
    return sourceHostname === DOORDASH_IDENTITY.hostname
      && storeId === DOORDASH_IDENTITY.storeId;
  }
  return false;
}

export function isIndianaRetailerInventory(signal) {
  const source = String(signal.sourceLabel || signal.source || '');
  if (source === DOORDASH_IDENTITY.source) return false;
  const reportedQuantity = Number(signal.raw?.reportedQuantity);
  const invalidSentinelProjection = Number.isFinite(reportedQuantity) && reportedQuantity >= 100 && Number(signal.quantity || 0) > 1;
  const positive = Number(signal.quantity || 0) > 0
    || (signal.availabilityStatus === 'in_stock' && signal.sourceAvailabilityVerified === true);
  return /^(retailer_store_inventory_result|cityhive_store_inventory_result)$/i.test(String(signal.eventType || signal.type || ''))
    && isIndianaRetailerSignalIdentity(signal)
    && signal.locationPrecision === 'store_level'
    && positive
    && !invalidSentinelProjection
    && Boolean(signal.storeId)
    && /,\s*IN\s+\d{5}/i.test(String(signal.storeAddress || ''));
}

export { DOORDASH_IDENTITY, INDIANA_TARGET_STORES };
