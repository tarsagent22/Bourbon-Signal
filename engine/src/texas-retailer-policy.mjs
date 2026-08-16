const TEXAS_RETAILER_IDENTITIES = new Map([
  ['Twin Liquors CityHive store inventory', { chain: 'twin-liquors', hostname: 'twinliquors.com', merchantPattern: /^[0-9a-f]{24}$/i }],
  ['Zipps Liquor CityHive store inventory', { chain: 'zipps-liquor', hostname: 'shop.zippsliquor.com', merchantPattern: /^[0-9a-f]{24}$/i }],
  ['Pelican Liquor McKinney CityHive store inventory', { chain: 'pelican-liquor', hostname: 'pelicanliquor.com', merchantPattern: /^[0-9a-f]{24}$/i }],
  ['Tipsy Liquor Round Rock CityHive store inventory', { chain: 'tipsy-liquor-round-rock', hostname: 'tipsyliquorroundrock.com', merchantPattern: /^[0-9a-f]{24}$/i }],
  ['WB Liquors & Wine Texas CityHive store inventory', { chain: 'wb-liquors', hostname: 'wbliquors.com', merchantPattern: /^[0-9a-f]{24}$/i }],
  ['JB Maverick of Texas CityHive store inventory', { chain: 'jb-maverick-texas', hostname: 'shop.maverickbevtx.com', merchantPattern: /^[0-9a-f]{24}$/i }],
  ['Oak Liquor Cabinet Austin CityHive store inventory', { chain: 'oak-liquor-cabinet', hostname: 'oakliquorcabinet.com', merchantPattern: /^[0-9a-f]{24}$/i }],
  ['Liquorpedia Riverstone CityHive store inventory', { chain: 'liquorpedia-riverstone', hostname: 'liquorpedia.us', merchantPattern: /^[0-9a-f]{24}$/i }],
  ["Spanky's Liquor Texas CityHive store inventory", { chain: 'spankys-liquor', hostname: 'spankysliquor.com', merchantPattern: /^[0-9a-f]{24}$/i }],
  ["Steve's Liquor Austin CityHive store inventory", { chain: 'steves-liquor-austin', hostname: 'steves-liquor.com', merchantPattern: /^[0-9a-f]{24}$/i }],
  ['Liquor Hub Fort Worth CityHive store inventory', { chain: 'liquor-hub-fort-worth', hostname: 'shop.liquordepotusa.com', merchantPattern: /^[0-9a-f]{24}$/i }],
  ['Longhorn Liquor Lumberton CityHive store inventory', { chain: 'longhorn-liquor', hostname: 'longhornliquor.com', merchantPattern: /^[0-9a-f]{24}$/i }],
  ['Texas Cheer Liquor San Antonio CityHive store inventory', { chain: 'texas-cheer-liquor', hostname: 'texascheerliquor.com', merchantPattern: /^[0-9a-f]{24}$/i }],
  ['Whitesboro Liquor CityHive store inventory', { chain: 'whitesboro-liquor', hostname: 'whitesboroliquor.com', merchantPattern: /^[0-9a-f]{24}$/i }],
  ['Spirit Six Austin CityHive store inventory', { chain: 'spirit-six-austin', hostname: 'spiritsix.com', merchantPattern: /^[0-9a-f]{24}$/i }],
]);

function sourceHostname(signal) {
  try { return new URL(String(signal.sourceUrl || '')).hostname.replace(/^www\./i, '').toLowerCase(); } catch { return ''; }
}

export function isTexasRetailerSignalIdentity(signal) {
  const source = String(signal.sourceLabel || signal.source || '');
  const identity = TEXAS_RETAILER_IDENTITIES.get(source);
  if (!identity) return false;
  const chain = String(signal.sourceChain || signal.raw?.chain || '');
  const merchantId = String(signal.merchantId || signal.raw?.merchantId || '');
  return chain === identity.chain
    && sourceHostname(signal) === identity.hostname
    && identity.merchantPattern.test(merchantId)
    && String(signal.storeId || '') === `${chain}:${merchantId}`
    && Boolean(signal.productId || signal.raw?.productId || signal.raw?.product?.id)
    && Boolean(signal.optionId || signal.raw?.optionId || signal.raw?.option?.option_id);
}

export function isTexasRetailerInventory(signal) {
  const quantity = Number(signal.quantity || 0);
  const positiveAvailability = quantity > 0
    || (quantity === 0 && signal.availabilityStatus === 'in_stock' && signal.sourceAvailabilityVerified === true);
  return signal.state === 'TX'
    && signal.stateCode === 'TX'
    && /^(cityhive_store_inventory_result|retailer_store_inventory_result)$/i.test(String(signal.eventType || signal.type || ''))
    && isTexasRetailerSignalIdentity(signal)
    && signal.locationPrecision === 'store_level'
    && Boolean(signal.storeId)
    && /,\s*TX\s+\d{5}/i.test(String(signal.storeAddress || ''))
    && positiveAvailability;
}

export { TEXAS_RETAILER_IDENTITIES };
