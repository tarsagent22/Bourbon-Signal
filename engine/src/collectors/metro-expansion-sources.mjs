import { metroCityHiveDepthPolicy } from './metro-cityhive-depth-policy.mjs';

// First-party exact-premises captures reviewed on 2026-10-22.
// New stores use quantity-bearing merchant options; JSON-LD catalog fallback is disabled.
function cityHiveExpansionSource({ id, chainName, baseUrl, stateCode, area, merchantId, address, city, zip }) {
  return Object.freeze({
    id, chainName, sourceLabel: `${chainName} CityHive ${area} store inventory`,
    platform: 'cityhive', inventoryMode: 'premises_quantity', baseUrl,
    host: new URL(baseUrl).hostname, productsUrl: `${baseUrl}/shop/?subtype=Bourbon`,
    fulfillmentPolicyUrl: `${baseUrl}/shop/?subtype=Bourbon`, maxPages: 1, depthDiscovery: metroCityHiveDepthPolicy(id),
    stateCode, area, inventoryEligible: true,
    stores: Object.freeze([Object.freeze({
      id: `${id}:${merchantId}`, name: chainName, merchantId, address, city, state: stateCode, stateCode, zip,
    })]),
  });
}

export const NEW_YORK_EXPANSION_RETAILER_SOURCES = Object.freeze([
  cityHiveExpansionSource({
    "id": "hurley-wine-market",
    "chainName": "Hurley Wine & Liquor Market",
    "baseUrl": "https://www.hurleywinemarket.com",
    "stateCode": "NY",
    "area": "Hudson Valley",
    "merchantId": "6060f62c39cc55664c26682a",
    "address": "295 NY-375 #2, West Hurley, NY 12491, USA",
    "city": "West Hurley",
    "zip": "12491"
  }),
  cityHiveExpansionSource({
    "id": "michaels-liquor-rochester",
    "chainName": "Michaels Liquor Store",
    "baseUrl": "https://rochesterwineandspirits.com",
    "stateCode": "NY",
    "area": "Rochester Metro",
    "merchantId": "6818c7bc4ef405294491d87c",
    "address": "1430 N Clinton Ave, Rochester, NY 14621, USA",
    "city": "Rochester",
    "zip": "14621"
  }),
  cityHiveExpansionSource({
    "id": "bittersweet-wine-liquor",
    "chainName": "Bittersweet Wines & Liquors",
    "baseUrl": "https://bittersweetwineandliquor.com",
    "stateCode": "NY",
    "area": "Lake George",
    "merchantId": "61190a05e22b957ef7343d3f",
    "address": "3242 Lake Shore Dr, Lake George, NY 12845, USA",
    "city": "Lake George",
    "zip": "12845"
  }),
  cityHiveExpansionSource({
    "id": "wj-wines-liquors",
    "chainName": "W & J Wine",
    "baseUrl": "https://wjwine.org",
    "stateCode": "NY",
    "area": "New York City",
    "merchantId": "5eea24de2157b828af6ac17a",
    "address": "468 4th Ave, Brooklyn, NY 11215, USA",
    "city": "Brooklyn",
    "zip": "11215"
  }),
]);

export const COLORADO_EXPANSION_RETAILER_SOURCES = Object.freeze([
  cityHiveExpansionSource({
    "id": "springs-liquor-outlet",
    "chainName": "Springs Liquor Outlet",
    "baseUrl": "https://www.springsliquor.com",
    "stateCode": "CO",
    "area": "Colorado Springs",
    "merchantId": "60e4f95ccedf7461ed8e6bf4",
    "address": "6010 Carefree Cir N, Colorado Springs, CO 80922, USA",
    "city": "Colorado Springs",
    "zip": "80922"
  }),
  cityHiveExpansionSource({
    "id": "wallabys-liquor-warehouse",
    "chainName": "WALLABYS LIQUOR WAREHOUSE",
    "baseUrl": "https://wallabysliquorwarehouse.com",
    "stateCode": "CO",
    "area": "Denver Metro",
    "merchantId": "637b8843a678e952077d5fd5",
    "address": "1550 S Parker Rd, Denver, CO 80231, USA",
    "city": "Denver",
    "zip": "80231"
  }),
  cityHiveExpansionSource({
    "id": "peak-wine-spirits",
    "chainName": "Peak Wine and Spirits",
    "baseUrl": "https://peakwineandspirits.com",
    "stateCode": "CO",
    "area": "Boulder County",
    "merchantId": "5e7e18a25c462e7abe648388",
    "address": "150 N Jefferson St b2, Nederland, CO 80466, USA",
    "city": "Nederland",
    "zip": "80466"
  }),
  cityHiveExpansionSource({
    "id": "south-park-liquor",
    "chainName": "South Park Liquor",
    "baseUrl": "https://southparkliquor.shop",
    "stateCode": "CO",
    "area": "Denver Metro",
    "merchantId": "697822d31fb51b26ba80ab47",
    "address": "7945 S Broadway, Littleton, CO 80122, USA",
    "city": "Littleton",
    "zip": "80122"
  }),
]);
