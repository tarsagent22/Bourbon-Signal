function source(id, platform, hostname, sourceLabel) {
  return Object.freeze({ id, platform, hostname, sourceLabel });
}

const SOURCES = Object.freeze({
  'frugal-macdoogal': source('frugal-macdoogal', 'cityhive', 'www.frugalmacdoogal.com', 'Frugal MacDoogal CityHive store inventory'),
  corkdorks: source('corkdorks', 'cityhive', 'corkdorkswine.com', 'Corkdorks CityHive store inventory'),
  'busters-liquors': source('busters-liquors', 'cityhive', 'bustersliquors.com', "Buster's Liquors & Wines CityHive store inventory"),
  'kimbrough-wines': source('kimbrough-wines', 'cityhive', 'kimbroughwines.com', 'Kimbrough Fine Wine & Spirits CityHive store inventory'),
  'cristys-liquor-store': source('cristys-liquor-store', 'cityhive', 'cristysliquorstore.com', "Cristy's Liquor Store CityHive store inventory"),
  'red-dog-wine-spirits': source('red-dog-wine-spirits', 'cityhive', 'shop.reddogwineandspirits.com', 'Red Dog Wine and Spirits CityHive store inventory'),
  'moon-wine-spirits': source('moon-wine-spirits', 'cityhive', 'moonwineandspirits.com', 'Moon Wine & Spirits CityHive store inventory'),
  'westside-wine-spirits': source('westside-wine-spirits', 'cityhive', 'westsidewineandspirits.com', 'Westside Wine & Spirits CityHive store inventory'),
  'lake-district-wine-liquor': source('lake-district-wine-liquor', 'cityhive', 'lakedistrictwineandliquor.com', 'Lake District Wine and Liquor CityHive store inventory'),
  'm-and-j-liquor': source('m-and-j-liquor', 'cityhive', 'mnjliquor.com', 'M&J Liquor Wine Tobacoo Chattanooga TN CityHive store inventory'),
  'red-bank-liquor': source('red-bank-liquor', 'cityhive', 'redbankliquor.com', 'My Discount Liquor Tobacco RedBank TN CityHive store inventory'),
  'discount-liquor-chattanooga': source('discount-liquor-chattanooga', 'cityhive', 'chattliquor.com', 'Ma Kalika Partnership dba Discount liquor Chattanooga TN CityHive store inventory'),
  'one-stop-wines-johnson-city': source('one-stop-wines-johnson-city', 'cityhive', 'onestopwines.net', 'One Stop Wines & Spirits Johnson City TN CityHive store inventory'),
  'northshore-wine-spirits': source('northshore-wine-spirits', 'cityhive', 'northshorews.com', 'Northshore Wine & Spirits CityHive store inventory'),
  'liquor-vault-knoxville': source('liquor-vault-knoxville', 'cityhive', 'liquorvault.com', 'Liquor Vault Knoxville CityHive store inventory'),
  'four-sixes-liquors-and-wines': source('four-sixes-liquors-and-wines', 'cityhive', 'foursixesliquors.com', 'Four Sixes Liquors & Wines CityHive store inventory'),
  'happy-ours-wine-and-spirits': source('happy-ours-wine-and-spirits', 'cityhive', 'happyour0c3f6e1f.sites.cityhive.app', 'Happy Ours Wine & Spirits CityHive store inventory'),
  'germantown-village-wine-and-liquor': source('germantown-village-wine-and-liquor', 'cityhive', 'germantownwineandliquor.com', 'Germantown Wine & Liquor CityHive store inventory'),
  'lakeshore-wine-and-spirits': source('lakeshore-wine-and-spirits', 'cityhive', 'lakeshorewineandspirit.com', 'Lakeshore Wine & Spirits CityHive store inventory'),
  'kirby-wines-liquors': source('kirby-wines-liquors', 'cityhive', 'kirbywina689aaf8.sites.cityhive.app', 'Kirby Wines & Liquors CityHive store inventory'),
  'green-meadow-wine-spirits': source('green-meadow-wine-spirits', 'cityhive', 'greenmea1758acc7.sites.cityhive.app', 'Green Meadow Wine & Spirits CityHive store inventory'),
  'junction-liquors-smyrna': source('junction-liquors-smyrna', 'cityhive', 'junction-liquors.com', 'Junction Liquors - Smyrna CityHive store inventory'),
  'pour-vous-hendersonville': source('pour-vous-hendersonville', 'cityhive', 'pourvous.us', 'Pour Vous Wine, Spirits & Beer CityHive store inventory'),
  'good-times-crossville': source('good-times-crossville', 'cityhive', 'goodtime438b8d5d.sites.cityhive.app', 'GOOD TIMES WINE SPIRITS & BREW CityHive store inventory'),
  'campbell-station-wine-spirits': source('campbell-station-wine-spirits', 'cityhive', 'campbellstationwine.com', 'Campbell Station Wine & Spirits CityHive store inventory'),
  'red-spirits-and-wine': source('red-spirits-and-wine', 'cityhive', 'shopredspirits.com', 'RED Spirits & Wine CityHive store inventory'),
  'bottle-shop-mcewen': source('bottle-shop-mcewen', 'shopify', 'thebottleshopfranklin.com', 'The Bottle Shop at McEwen Shopify bourbon inventory'),
  'cool-springs-wine-spirits': source('cool-springs-wine-spirits', 'bottlecapps', 'shop.coolspringswine.com', 'Cool Springs Wine & Spirits public catalog API'),
  'gateway-grabbl': source('gateway-grabbl', 'grabbl', 'gatewaywineandspirit.com', 'Gateway Wine & Spirits Grabbl public store API'),
});

function store(sourceId, merchantId, name, address, city, zip, options = {}) {
  const sourceConfig = SOURCES[sourceId];
  if (!sourceConfig) throw new Error(`Unknown Tennessee retailer source ${sourceId}`);
  return Object.freeze({
    sourceId,
    sourceLabel: sourceConfig.sourceLabel,
    platform: sourceConfig.platform,
    hostname: sourceConfig.hostname,
    merchantId,
    storeId: options.storeId || `${sourceId}:${merchantId}`,
    name,
    address,
    city,
    cityAliases: Object.freeze(options.cityAliases || []),
    state: 'TN',
    zip,
  });
}

export const TENNESSEE_RETAILER_STORES = Object.freeze([
  store('green-meadow-wine-spirits', '5980fcd8d05b4360e32f7ed2', 'Green Meadow Wine & Spirits', '1147 Hunters Crossing, Alcoa, TN 37701, USA', 'Alcoa', '37701', { cityAliases: ['Alcoa/Maryville'] }),
  store('moon-wine-spirits', '5ec7d3fd3fd3873558e289e0', 'Moon Wine & Spirits', '6910 Moores Ln, Brentwood, TN 37027, USA', 'Brentwood', '37027'),
  store('discount-liquor-chattanooga', '699b529abc7a0517b781e2e0', 'Discount Liquor', '6231 Perimeter Dr #213, Chattanooga, TN 37421, USA', 'Chattanooga', '37421'),
  store('m-and-j-liquor', '6978c02491ff50558a0168d5', 'M&J Liquor Wine Tobacoo', '309 Morrison Springs Rd, Chattanooga, TN 37415, USA', 'Chattanooga', '37415'),
  store('red-bank-liquor', '65e9dd7cdb12802bbb99668e', 'My Discount Liquor Tobacco', '2004 Dayton Blvd, Chattanooga, TN 37415, USA', 'Chattanooga', '37415'),
  store('good-times-crossville', '624b47df137f3348be13d671', 'GOOD TIMES WINE SPIRITS & BREW', '1369 Interstate Dr, Crossville, TN 38555, USA', 'Crossville', '38555'),
  store('cool-springs-wine-spirits', '1000-1057', 'Cool Springs Wine & Spirits', '1935 Mallory Lane, Franklin, TN 37067', 'Franklin', '37067', { storeId: 'cool-springs:1000-1057' }),
  store('happy-ours-wine-and-spirits', '65499b36b456692bd7d53c32', 'Happy Ours Wine & Spirits', '327 Independence Sq, Franklin, TN 37064, USA', 'Franklin', '37064'),
  store('red-dog-wine-spirits', '5e8c76c132b79e014d2883e2', 'Red Dog Wine and Spirits', '1031 Riverside Dr, Franklin, TN 37064, USA', 'Franklin', '37064'),
  store('bottle-shop-mcewen', 'bottle-shop-mcewen', 'The Bottle Shop at McEwen', '1556 W McEwen Dr #102, Franklin, TN 37067', 'Franklin', '37067', { storeId: 'bottle-shop-mcewen' }),
  store('westside-wine-spirits', '5f3dd0fd52b3904ef965b902', 'Westside Wine & Spirits', '188 Front St #106, Franklin, TN 37064, USA', 'Franklin', '37064'),
  store('germantown-village-wine-and-liquor', '6054cf968c3b62112b04d9f8', 'Germantown Wine & Liquor', '7730 Poplar Ave STE 5, Germantown, TN 38138, USA', 'Germantown', '38138'),
  store('pour-vous-hendersonville', '5e6f90c8712a7d0a8ee14b51', 'Pour Vous Wine, Spirits & Beer', '263 Indian Lake Blvd, Hendersonville, TN 37075, USA', 'Hendersonville', '37075'),
  store('one-stop-wines-johnson-city', '672b6a0791de502911a082b3', 'One Stop Wines & Spirits - Franklin Rd', '1735 W State of Franklin Rd #11, Johnson City, TN 37604, USA', 'Johnson City', '37604'),
  store('one-stop-wines-johnson-city', '672b8fbd53a80c28dd63b086', 'One Stop Wines & Spirits - Roan St', '2710 N Roan St, Johnson City, TN 37601, USA', 'Johnson City', '37601'),
  store('campbell-station-wine-spirits', '5f7f26b331859f2928949d72', 'Campbell Station Wine & Spirits', '707 N Campbell Station Rd, Farragut, TN 37934, USA', 'Farragut', '37934', { cityAliases: ['Knoxville'] }),
  store('cristys-liquor-store', '6060f6cb3aa83f4de4838714', "Cristy's Liquor Store", '4613 Rutledge Pike, Knoxville, TN 37914, USA', 'Knoxville', '37914'),
  store('lakeshore-wine-and-spirits', '684c7a13853c9b28ea4a4eca', 'Lakeshore Wine & Spirits', '311 S Northshore Dr, Knoxville, TN 37919, USA', 'Knoxville', '37919'),
  store('liquor-vault-knoxville', '6862952392864d25df3762b8', 'Liquor Vault Knoxville', '2901 Tazewell Pike, Knoxville, TN 37918, USA', 'Knoxville', '37918'),
  store('northshore-wine-spirits', '5980fcddd05b4360e32f7f02', 'Northshore Wine & Spirits', '9427 S Northshore Dr, Knoxville, TN 37922, USA', 'Knoxville', '37922'),
  store('lake-district-wine-liquor', '62d49efea85f7b25af50381a', 'Lake District Wine and Liquor', '9845 Lake District Dr, Lakeland, TN 38002, USA', 'Lakeland', '38002'),
  store('busters-liquors', '662124505fbcb5293d346405', 'Buster’s Liquors | East', '5851 Poplar Ave, Memphis, TN 38119, USA', 'Memphis', '38119'),
  store('busters-liquors', '599b740a1783f8451693062c', 'Buster’s Liquors | University', 'Dillard Square Shopping Center, 191 S Highland St, Memphis, TN 38111, USA', 'Memphis', '38111'),
  store('kimbrough-wines', '61f0226010e5b74ab40ee942', 'Kimbrough Fine Wine & Spirits', '1483 Union Ave, Memphis, TN 38104, USA', 'Memphis', '38104'),
  store('kirby-wines-liquors', '6054cfa68c3b62112b04dc2e', 'Kirby Wines & Liquors', '2865 Kirby Pkwy, Memphis, TN 38119, USA', 'Memphis', '38119'),
  store('four-sixes-liquors-and-wines', '6723a588d3b5392b884e024e', 'Four Sixes Liquors & Wines', '715 S Main St, Mt Pleasant, TN 38474, USA', 'Mount Pleasant', '38474', { cityAliases: ['Mt Pleasant'] }),
  store('gateway-grabbl', '528698ef-ebe1-4778-a583-c4be1cc29693', 'Gateway Wine & Spirits', '3119 Medical Center Parkway A5, Murfreesboro, TN 37129', 'Murfreesboro', '37129', { storeId: 'grabbl-gateway:528698ef-ebe1-4778-a583-c4be1cc29693' }),
  store('corkdorks', '5b52b2903ff14a3c5d9cdd19', 'Corkdorks Wine Spirits Beer - Green Hills', '4009 Hillsboro Pike, Nashville, TN 37215, USA', 'Nashville', '37215'),
  store('corkdorks', '5c2a8cae7309395802faf15d', 'Corkdorks Wine Spirits Beer - Midtown', '1610 Church St, Nashville, TN 37203, USA', 'Nashville', '37203'),
  store('frugal-macdoogal', '6599a3f98893882b7f30798d', 'Frugal MacDoogal', '701 Division St, Nashville, TN 37203, USA', 'Nashville', '37203'),
  store('red-spirits-and-wine', '5e9656b14e4e042f8a551e9f', 'RED Spirits & Wine', '7066 Hwy 70 S, Nashville, TN 37221, USA', 'Nashville', '37221'),
  store('junction-liquors-smyrna', '67d88a7a7aec9317bbb8c5ec', 'Junction Liquors - Smyrna', '401 Chaney Rd, Smyrna, TN 37167, USA', 'Smyrna', '37167'),
]);

const STORE_BY_IDENTITY = new Map(TENNESSEE_RETAILER_STORES.map((item) => [`${item.sourceId}:${item.merchantId}`, item]));

export function registeredTennesseeStore(sourceId, merchantId) {
  return STORE_BY_IDENTITY.get(`${String(sourceId || '')}:${String(merchantId || '')}`) || null;
}

export function tennesseeSourceForId(sourceId) {
  return SOURCES[String(sourceId || '')] || null;
}

export function buildTennesseeConfiguredStoreLocationSignals(observedAt) {
  return TENNESSEE_RETAILER_STORES.map((item) => ({
    id: `tennessee-configured-store-location:${item.storeId}`,
    state: 'TN',
    stateCode: 'TN',
    sourceLabel: `${item.name} first-party exact-store identity`,
    sourceUrl: `https://${item.hostname}/`,
    sourceChain: item.sourceId,
    merchantId: item.merchantId,
    rawName: item.name,
    canonicalBottleId: null,
    canonicalName: null,
    confidence: 0.8,
    eventType: 'retailer_store_location',
    locationPrecision: 'store_level',
    locationName: item.name,
    storeName: item.name,
    storeId: item.storeId,
    storeAddress: item.address,
    city: item.city,
    postalCode: item.zip,
    zip: item.zip,
    quantity: 0,
    observedAt,
    sourceAvailabilityVerified: false,
    canAlertAsInventory: false,
    canAlertAsWatch: false,
    inventorySemantics: 'Configured first-party Tennessee storefront identity only; this stable locator row is not bottle inventory.',
    evidence: `${item.name} is bound to merchant ${item.merchantId} at ${item.address} on ${item.hostname}.`,
    raw: { chain: item.sourceId, merchantId: item.merchantId, configuredStoreIdentity: true },
  }));
}
