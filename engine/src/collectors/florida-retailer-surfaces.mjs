import { createHash } from 'node:crypto';
import FLORIDA_STAR_LIQUORS_REGISTRY from '../../data/florida-star-liquors-store-registry.json' with { type: 'json' };

import { stableId } from '../core/text.mjs';

function stores(rows) {
  return new Map(rows.map(([id, name, address, city, zip, lat, lng]) => {
    const store = { id, name, address, city, zip };
    if (Number.isFinite(lat) && Number.isFinite(lng)) Object.assign(store, { lat, lng });
    return [id, Object.freeze(store)];
  }));
}


export const FLORIDA_STAR_LIQUORS_REGISTRY_SHA256 = '88a77fc4eeccc115f8c8d7004a285db284b28723654dc5a371ccfcdf15ae76e8';

const starRegistryRows = (FLORIDA_STAR_LIQUORS_REGISTRY.stores || []).map((row) => ({
  id: String(row.id),
  name: String(row.name),
  address: String(row.address),
  city: String(row.city),
  zip: String(row.zip),
  lat: Number(row.lat),
  lng: Number(row.lng),
}));
const starRegistryDigest = createHash('sha256').update(JSON.stringify(starRegistryRows)).digest('hex');
if (FLORIDA_STAR_LIQUORS_REGISTRY.contractVersion !== 'bourbon-signal/florida-star-liquors-store-registry@1'
  || FLORIDA_STAR_LIQUORS_REGISTRY.sha256 !== FLORIDA_STAR_LIQUORS_REGISTRY_SHA256
  || starRegistryDigest !== FLORIDA_STAR_LIQUORS_REGISTRY_SHA256
  || starRegistryRows.length !== 24
  || new Set(starRegistryRows.map((row) => row.id)).size !== 24
  || new Set(starRegistryRows.map((row) => row.address)).size !== 24
  || starRegistryRows.some((row) => !/, FL \d{5}, USA$/u.test(row.address) || !Number.isFinite(row.lat) || !Number.isFinite(row.lng))) {
  throw new Error('Immutable Florida Star Liquors exact-store registry contract mismatch.');
}

export const FLORIDA_STAR_LIQUORS_SOURCE = Object.freeze({
  id: 'star-liquors',
  chainName: 'Star Liquors',
  sourceLabel: 'Star Liquors Florida CityHive store inventory',
  baseUrl: 'https://starlq.com',
  categoryUrl: 'https://starlq.com/shop/?subtype=Bourbon',
  strictInventoryContract: true,
  merchants: stores(starRegistryRows.map((row) => [row.id, row.name, row.address, row.city, row.zip, row.lat, row.lng])),
});

export const FLORIDA_CITYHIVE_SOURCES = Object.freeze([
  {
    id: 'my-florida-liquors',
    chainName: '1001 Liquors / My Florida Liquors',
    sourceLabel: '1001 Liquors / My Florida Liquors CityHive store inventory',
    baseUrl: 'https://myfloridaliquors.com',
    categoryUrl: 'https://myfloridaliquors.com/shop/?subtype=Bourbon',
    merchants: stores([
      ['5f58f60980eb420def3fd51b', '1001 Liquors', '14904 E Orange Lake Blvd, Kissimmee, FL 34747, USA', 'Kissimmee', '34747'],
      ['5f58f6a9f6a57131c1c4c46e', '1002 Liquors', '3230 Rolling Oaks Blvd, Kissimmee, FL 34747, USA', 'Kissimmee', '34747'],
      ['5f58f7024918d869fb9662d3', '1003 Liquors', '833 Cypress Pkwy, Kissimmee, FL 34759, USA', 'Kissimmee', '34759'],
      ['5f52751f5e156626139b87aa', '1005 Liquors', '8305 Champions Gate Blvd, Davenport, FL 33896, USA', 'Davenport', '33896'],
    ]),
  },
  {
    id: 'paradise-fubar-liquors',
    chainName: 'Paradise Liquors & Wine',
    sourceLabel: 'Paradise Liquors & Wine Florida CityHive store inventory',
    baseUrl: 'https://shopparadiseliquor.com',
    categoryUrl: 'https://shopparadiseliquor.com/shop/?subtype=Bourbon',
    merchants: stores([
      ['691f7f979c3eeb27a9a25f7d', 'Paradise Liquors & Wine - Sunrise', '15928 W State Rd 84, Sunrise, FL 33326, USA', 'Sunrise', '33326'],
      ['691f8374054a225be5c82459', 'Paradise Liquors & Wine - Pensacola', '4469 Mobile Hwy, Pensacola, FL 32506, USA', 'Pensacola', '32506'],
    ]),
  },
  {
    id: 'balm-liquor',
    chainName: 'Balm Liquor',
    sourceLabel: 'Balm Liquor Riverview CityHive store inventory',
    baseUrl: 'https://balmliquor.com',
    categoryUrl: 'https://balmliquor.com/shop/?subtype=Bourbon',
    merchants: stores([
      ['690be4c9ff35540f65da977b', 'Balm Liquor Store', '12302 Balm Riverview Rd, Riverview, FL 33569, USA', 'Riverview', '33569'],
    ]),
  },
  {
    id: 'sunshine-food-spirits',
    chainName: 'Sunshine Food & Spirits',
    sourceLabel: 'Sunshine Food & Spirits Clearwater CityHive store inventory',
    baseUrl: 'https://sunshineliquorsclearwater.com',
    categoryUrl: 'https://sunshineliquorsclearwater.com/shop/?subtype=Bourbon',
    merchants: stores([
      ['68cb1b32de882540d44d64e1', 'Sunshine Food & Spirits', '800 Chestnut St, Clearwater, FL 33756, USA', 'Clearwater', '33756'],
    ]),
  },
  {
    id: 'big-daddys-liquors',
    chainName: "Big Daddy's Wine & Liquors",
    sourceLabel: "Big Daddy's South Florida CityHive store inventory",
    baseUrl: 'https://bigdaddysliquors.com',
    categoryUrl: 'https://bigdaddysliquors.com/shop/?subtype=bourbon',
    merchants: stores([
      ['5d4c3678c9bb183d498c2c50', "Big Daddy's Liquors - West Palm Beach", '330 Southern Blvd, West Palm Beach, FL 33405, USA', 'West Palm Beach', '33405'],
      ['5d4c3684c9bb183d498c2c70', "Big Daddy's Liquors - Surfside", '9494 Harding Ave, Surfside, FL 33154, USA', 'Surfside', '33154'],
      ['5d4c3679c9bb183d498c2c54', "Big Daddy's Liquors - Pompano Beach", '2500 E Atlantic Blvd, Pompano Beach, FL 33062, USA', 'Pompano Beach', '33062'],
      ['5d4c3683c9bb183d498c2c6c', "Big Daddy's Liquors - North Miami", '13185 Biscayne Blvd, North Miami, FL 33181, USA', 'North Miami', '33181'],
      ['5d4c367bc9bb183d498c2c58', "Big Daddy's Liquors - North Lauderdale", '5450 N State Rd 7, Fort Lauderdale, FL 33309, USA', 'Fort Lauderdale', '33309'],
      ['5d4c3689c9bb183d498c2c7c', "Big Daddy's Liquors - Miami (Coconut Grove)", '2988 SW 27th Ave, Miami, FL 33133, USA', 'Miami', '33133'],
      ['5d4c3687c9bb183d498c2c78', "Big Daddy's Liquors - Miami", '8600 Biscayne Blvd, Miami, FL 33138, USA', 'Miami', '33138'],
      ['5d4c367fc9bb183d498c2c64', "Big Daddy's Liquors - Hollywood (Taft Street)", '7003 Taft St, Pembroke Pines, FL 33024, USA', 'Pembroke Pines', '33024'],
      ['5d4c3686c9bb183d498c2c74', "Big Daddy's Liquors - Hialeah", '1550 W 84th St, Hialeah, FL 33014, USA', 'Hialeah', '33014'],
      ['5d4c3681c9bb183d498c2c68', "Big Daddy's Liquors - Hallandale", '4 N Federal Hwy, Hallandale Beach, FL 33009, USA', 'Hallandale Beach', '33009'],
      ['5d4c367cc9bb183d498c2c5c', "Big Daddy's Liquors - Fort Lauderdale", '959 FL-84, Fort Lauderdale, FL 33315, USA', 'Fort Lauderdale', '33315'],
      ['5dd70f603c329d1aac8d32e1', "Big Daddy's Liquors - Kendall", '12776 SW 88th St, Miami, FL 33186, USA', 'Miami', '33186'],
      ['5d4c367ec9bb183d498c2c60', "Big Daddy's Liquors - Hollywood (University Dr.)", '2505 N University Dr BUILDING A, Hollywood, FL 33024, USA', 'Hollywood', '33024'],
      ['64134e2fd49c702a732e124d', "Big Daddy's Liquors - Miramar", '11225 Miramar Pkwy #245, Miramar, FL 33025, USA', 'Miramar', '33025'],
    ]),
  },
  {
    id: 'golden-ox-liquors',
    chainName: 'Golden Ox Liquors',
    sourceLabel: 'Golden Ox Liquors Florida CityHive store inventory',
    baseUrl: 'https://goldenoxliquors.com',
    categoryUrl: 'https://goldenoxliquors.com/shop/?subtype=Bourbon',
    merchants: stores([
      ['5c5c8696e2b6475f65dd8abf', 'Golden Ox Liquors - Normandy', '7903 Normandy Blvd, Jacksonville, FL 32221, USA', 'Jacksonville', '32221'],
      ['5bff10401859dd0f29367fd0', 'Golden Ox Liquors - Groveland', '7965 FL-50 #1200, Groveland, FL 34736, USA', 'Groveland', '34736'],
      ['5bd75df8e87474659683893b', 'Golden Ox Liquors - Clermont', '240 Citrus Tower Blvd, Clermont, FL 34711, USA', 'Clermont', '34711'],
    ]),
  },
  {
    id: 'ocean-wine-spirits',
    chainName: 'Ocean Wine & Spirits',
    sourceLabel: 'Ocean Wine & Spirits Fort Lauderdale CityHive store inventory',
    baseUrl: 'https://oceansliquor.com',
    categoryUrl: 'https://oceansliquor.com/shop/?subtype=Bourbon',
    merchants: stores([
      ['5d2fd529e7648c5a75c92a60', 'Ocean Wine & Spirits Las Olas', '2901 E Las Olas Blvd, Fort Lauderdale, FL 33316, USA', 'Fort Lauderdale', '33316'],
      ['62c490c21dec3125d5e11303', 'Ocean Wine & Spirits Bayview', '2780 E Oakland Park Blvd, Fort Lauderdale, FL 33306, USA', 'Fort Lauderdale', '33306'],
    ]),
  },
  {
    id: 'beach-liquors',
    chainName: 'Beach Liquors',
    sourceLabel: 'Beach Liquors Florida Panhandle CityHive store inventory',
    baseUrl: 'https://beachliquors.net',
    categoryUrl: 'https://beachliquors.net/shop/?subtype=Bourbon',
    merchants: stores([
      ['5d8b3f9382d8295acf449835', 'Beach Liquors - Fort Walton Beach', '247 Miracle Strip Pkwy SE, Fort Walton Beach, FL 32548, USA', 'Fort Walton Beach', '32548'],
      ['5e6f9f0a712a7d0a4ee1ff66', 'Beach Liquors - Panama City Beach', '2435 Thomas Dr, Panama City Beach, FL 32408, USA', 'Panama City Beach', '32408'],
      ['5e6fa03673a2e156b67594fb', 'Beach Liquors - Crestview', '1336 N Ferdon Blvd, Crestview, FL 32536, USA', 'Crestview', '32536'],
      ['5e6fa1ad58ba0e239a46eef6', 'Beach Liquors - Destin', '1257 Airport Rd, Destin, FL 32541, USA', 'Destin', '32541'],
      ['65c1586ceeb7b43bca2dab71', 'Beach Liquors - Pensacola Beach', '16 Via De Luna Dr, Gulf Breeze, FL 32561, USA', 'Gulf Breeze', '32561'],
    ]),
  },
  {
    id: 'sarasota-wine-liquors',
    chainName: 'Sarasota Wine & Liquors',
    sourceLabel: 'Sarasota Wine & Liquors CityHive store inventory',
    baseUrl: 'https://sarasotawineliquors.com',
    categoryUrl: 'https://sarasotawineliquors.com/shop/?subtype=bourbon',
    merchants: stores([
      ['625d92134d905117662abd0f', 'Sarasota Wine & Liquors', '4055 Cattlemen Rd, Sarasota, FL 34233, USA', 'Sarasota', '34233'],
    ]),
  },
  {
    id: 'bourbon-barn-gainesville',
    chainName: 'The Bourbon Barn',
    sourceLabel: 'The Bourbon Barn Gainesville CityHive store inventory',
    baseUrl: 'https://bourbonbarnfl.com',
    categoryUrl: 'https://bourbonbarnfl.com/shop/?subtype=bourbon',
    merchants: stores([
      ['68ac9741700b9b25a87e0f3b', 'The Bourbon Barn', '2331 NW 13th St, Gainesville, FL 32609, USA', 'Gainesville', '32609'],
    ]),
  },
  FLORIDA_STAR_LIQUORS_SOURCE,
]);

export function registeredFloridaStore(sourceId, merchantId) {
  return FLORIDA_CITYHIVE_SOURCES.find((source) => source.id === sourceId)?.merchants.get(String(merchantId)) || null;
}

export function buildFloridaConfiguredStoreLocationSignals(observedAt) {
  const signals = [];
  for (const source of FLORIDA_CITYHIVE_SOURCES) {
    for (const store of source.merchants.values()) {
      signals.push({
        id: stableId(['FL', 'cityhive-store-location', source.id, store.id]),
        state: 'FL',
        sourceLabel: `${source.chainName} CityHive store registry`,
        sourceUrl: source.categoryUrl,
        sourceChain: source.id,
        merchantId: store.id,
        rawName: store.name,
        canonicalBottleId: null,
        canonicalName: null,
        confidence: 0.8,
        eventType: 'retailer_store_location',
        locationPrecision: 'store_level',
        locationName: store.name,
        storeName: store.name,
        storeId: `${source.id}:${store.id}`,
        storeAddress: store.address,
        city: store.city,
        stateCode: 'FL',
        postalCode: store.zip,
        zip: store.zip,
        quantity: 0,
        observedAt,
        canAlertAsInventory: false,
        canAlertAsWatch: false,
        inventorySemantics: `${source.chainName} first-party CityHive configuration identifies an exact Florida retailer location. The registry row is not bottle inventory.`,
        evidence: `${source.chainName} identifies ${store.name} at ${store.address}.`,
        raw: { chain: source.id, merchantId: store.id, configuredStoreIdentity: true },
      });
    }
  }
  return signals;
}
