import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { stableId, stripHtml, titleCase } from '../core/text.mjs';
import { collectNorthCarolinaIntelligence } from './north-carolina-intelligence.mjs';

const require = createRequire(import.meta.url);
const { PDFParse } = require('pdf-parse');

const TRACKED_TERMS = {
  OH: ['Eagle Rare'],
  IA: ['Blanton', 'Eagle Rare', 'Weller', 'Taylor', 'Buffalo Trace', 'Old Fitzgerald', 'Baker', 'Willett', 'Michter', 'Elijah Craig Barrel Proof'],
  UT: ['Eagle Rare', 'Blanton', 'Elijah Craig', 'Weller', 'Taylor', 'Buffalo Trace', 'Old Fitzgerald', 'Michter', 'Willett', 'Stagg', 'Baker'],
  NC: ['Blanton', 'Eagle Rare', 'Weller', 'Taylor', 'Willett'],
  IL: ['Blanton', 'Eagle Rare', 'Weller', 'Stagg', 'Taylor', 'Buffalo Trace', 'Old Fitzgerald', 'Michter', 'Willett', 'Baker'],
  VA: ['Blanton', 'Eagle Rare', 'Buffalo Trace', 'Taylor', 'Old Fitzgerald', '1792 Small Batch'],
  PA: ['Buffalo Trace', 'Weller', 'Blanton', 'Eagle Rare', 'Stagg', 'Old Fitzgerald'],
  'MD-MONTGOMERY': ['Blanton', 'Eagle Rare', 'Weller', 'Buffalo Trace', 'Taylor', 'Stagg', 'Old Fitzgerald', 'Michter', 'Willett', 'Baker']
};

const NC_STORE_INVENTORY_TERMS = [
  'Blanton',
  'Eagle Rare',
  'Weller',
  'E.H. Taylor',
  'Willett',
  'Buffalo Trace',
  'Stagg',
  'Old Fitzgerald',
  'Michter',
  'Van Winkle',
  'Elijah Craig Barrel Proof',
  "Baker's"
];

const GREENSBORO_WATCH_ITEM_RE = /blanton|eagle rare|weller|buffalo trace|stagg|old fitz|fitzgerald|michter|willett|pappy|van winkle|baker'?s?|e\.?\s*h\.?\s*taylor|colonel\s+taylor|elijah craig[^\n]{0,40}barrel proof/i;
const GREENSBORO_EXCLUDED_ITEM_RE = /john\s+d\s+taylor|old\s+taylor|taylor\s+port|falernum|cream|white\s+dog|rye|elijah\s+craig\s+small\s+batch(?![^\n]{0,40}barrel\s+proof)|tequila|corazon|expresiones|reposado|a[ñn]ejo|vodka|gin|rum|liqueur|cordial|beer|wine|cocktail/i;
const HIGH_POINT_WATCH_ITEM_RE = /blanton|eagle rare|weller|buffalo trace|stagg|old fitz|fitzgerald|michter|willett|pappy|van winkle|baker'?s?|e\.?\s*h\.?\s*taylor|colonel\s+taylor|elijah craig[^\n]{0,50}barrel proof|four roses|old forester|heaven hill|knob creek|woodford/i;
const HIGH_POINT_EXCLUDED_ITEM_RE = /john\s+d\s+taylor|old\s+taylor|taylor\s+port|falernum|cream|white\s+dog|elijah\s+craig\s+small\s+batch(?![^\n]{0,50}barrel\s+proof)|tequila|corazon|expresiones|reposado|a[ñn]ejo|vodka|gin|rum|liqueur|cordial|beer|wine|cocktail|glass|display|shirt|sign/i;

const RARE_RE = /blanton|eagle rare|weller|stagg|taylor|old fitz|fitzgerald|baker|willett|pappy|van winkle|elijah craig|george t|william larue|thomas h/i;
const IOWA_INVENTORY_CSV_URL = 'https://shop.iowaabd.com/snapshot/inventory?download';
const IOWA_SNAPSHOT_PAGE_URL = 'https://shop.iowaabd.com/snapshot/inventory';
const IOWA_LOTTERY_ALLOCATIONS_CSV_URL = 'https://shop.iowaabd.com/snapshot/lottery?download=allocations';
const IOWA_CODE_DELIVERY_FANOUT_LIMIT = Number(process.env.BOURBON_SIGNAL_IOWA_CODE_DELIVERY_LIMIT || 24);
const IOWA_STORE_ROW_LIMIT = Number(process.env.BOURBON_SIGNAL_IOWA_STORE_ROW_LIMIT || 360);
const IOWA_STRONG_WATCH_RE = /blanton|eagle rare|weller|stagg|e\.?\s*h\.?\s*taylor|colonel\s*taylor|buffalo trace|old fitz|fitzgerald|willett|michter|baker'?s?|booker'?s?|pappy|van winkle|elmer|rock hill|george t|william larue|thomas h|sazerac|elijah craig[^\n]{0,60}(barrel proof|single barrel|toasted|cask strength)|angels? envy[^\n]{0,60}(cask strength|10yr|10 year)|four roses[^\n]{0,60}(limited|barrel strength|single barrel|small batch select)|old forester[^\n]{0,60}(birthday|single barrel|barrel strength)|1792[^\n]{0,60}(full proof|sweet wheat|12 year|bottled in bond)|knob creek[^\n]{0,60}(12|15|18)|russell'?s[^\n]{0,60}(13|15|single barrel)|parker'?s|little book|blood oath|king of kentucky/i;
const IOWA_BOURBON_CATEGORY_RE = /bourbon|american whiskey|straight whiskey|blended whiskies/i;
const IOWA_EXCLUDED_RE = /cream|liqueur|cordial|rum|tequila|mezcal|vodka|gin|wine|beer|cocktail|ready to drink|seltzer|scotch|irish|canadian|john\s+d\s+taylor|falernum/i;
const IDAHO_LIMITED_PRODUCTS_URL = 'https://idaholiquor.com/limited-availability-products/';
const IDAHO_SPECIAL_RELEASES_URL = 'https://idaholiquor.com/special-releases/';
const IDAHO_PRODUCT_BASE_URL = 'https://idaholiquor.com/product';
const IDAHO_AVAILABILITY_AJAX_URL = 'https://idaholiquor.com/wp-admin/admin-ajax.php';
const IDAHO_AVAILABILITY_PRODUCT_LIMIT = Number(process.env.BOURBON_SIGNAL_IDAHO_AVAILABILITY_PRODUCT_LIMIT || 16);
const IDAHO_AVAILABILITY_LOCATIONS = (process.env.BOURBON_SIGNAL_IDAHO_AVAILABILITY_LOCATIONS || 'Boise,Meridian,Nampa,Idaho Falls,Twin Falls,Coeur d\'Alene,Pocatello,Lewiston,Moscow,McCall')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const IDAHO_WATCH_RE = /bourbon|whiskey|whisky|blanton|eagle rare|weller|stagg|e\.?\s*h\.?\s*taylor|colonel\s*taylor|buffalo trace|old fitz|fitzgerald|willett|michter|baker'?s?|booker'?s?|pappy|van winkle|elmer|rock hill|george t|william larue|thomas h|sazerac|heaven hill|yellowstone|penelope|four roses|old forester|1792|knob creek|russell|parker'?s|little book|blood oath|king of kentucky|woodford/i;
const IDAHO_EXCLUDE_RE = /scotch|rum|tequila|mezcal|vodka|gin|liqueur|cordial|wine|beer|cocktail|ready to drink|seltzer|cream/i;
const IDAHO_POSITIVE_AVAILABILITY_RE = /\b(in stock|available|limited supply|on hand)\b/i;
const MONTGOMERY_BOURBON_RE = /bourbon|whiskey|whisky|blanton|eagle rare|weller|stagg|e\.?h\.?\s*taylor|colonel\s*taylor|old fitz|fitzgerald|baker|willett|pappy|van winkle|michter|buffalo trace|elijah craig|george t|william larue|thomas h/i;

const BINNYS_ALGOLIA_APP_ID = process.env.BOURBON_SIGNAL_BINNYS_ALGOLIA_APP_ID || 'Z25A2A928M';
const BINNYS_ALGOLIA_SEARCH_KEY = process.env.BOURBON_SIGNAL_BINNYS_ALGOLIA_SEARCH_KEY || '88b6125855a0bbd845447e35de8d51c5';
const BINNYS_PRODUCT_INDEX = process.env.BOURBON_SIGNAL_BINNYS_PRODUCT_INDEX || 'Products_Production';
const BINNYS_STORE_INDEX = process.env.BOURBON_SIGNAL_BINNYS_STORE_INDEX || 'Stores_Production';
const BINNYS_BASE_URL = 'https://www.binnys.com';
const BINNYS_BOURBON_URL = `${BINNYS_BASE_URL}/spirits?refinementList%5BproductVarietal%5D%5B0%5D=Bourbon`;
const BINNYS_MAX_BOURBON_PAGES = Number(process.env.BOURBON_SIGNAL_BINNYS_MAX_BOURBON_PAGES || 10);
const BINNYS_HITS_PER_PAGE = Number(process.env.BOURBON_SIGNAL_BINNYS_HITS_PER_PAGE || 100);
const BINNYS_STRICT_WATCH_RE = /blanton|eagle rare|weller|stagg|e\.?h\.?\s*taylor|colonel\s*taylor|buffalo trace|old fitz|fitzgerald|willett|michter|baker'?s?|booker'?s?|van winkle|pappy|elmer|rock hill|blood oath|four roses\s+(limited|limited edition)|elijah craig[^\n]{0,50}barrel proof|russell'?s?\s+reserve|old forester[^\n]{0,40}birthday|heaven hill[^\n]{0,40}(grain|heritage|bottled in bond)|1792[^\n]{0,40}(full proof|sweet wheat|12 year|bottled in bond)|knob creek[^\n]{0,40}(12|15|18)|wild turkey[^\n]{0,40}(master|limited|70th)|little book|parker'?s/i;
const BINNYS_EXCLUDE_RE = /vodka|gin|rum|tequila|liqueur|cordial|wine|beer|seltzer|cocktail|ready to drink|cream|coffee|syrup|bitters|barrel aged stout|flavored whiskey(?![^\n]{0,40}bourbon)/i;

const AL_ABC_BASE_URL = 'https://alabcboard.gov';
const AL_MONTHLY_RELEASE_URL = `${AL_ABC_BASE_URL}/stores/events/limited-release-programs/monthly`;
const AL_QUARTERLY_RELEASE_URL = `${AL_ABC_BASE_URL}/stores/events/limited-release-programs/quarterly`;
const AL_QUARTERLY_PRODUCTS_URL = `${AL_ABC_BASE_URL}/stores/events/limited-releases/Limited-Release`;
const AL_ANNUAL_RELEASE_URL = `${AL_ABC_BASE_URL}/stores/events/limited-release-programs/annual`;
const AL_ANNUAL_PRODUCTS_URL = `${AL_ABC_BASE_URL}/stores/events/limited-release-programs/annual/price-products`;
const AL_ANNUAL_LOCATIONS_URL = `${AL_ABC_BASE_URL}/stores/events/limited-release-programs/annual/times-locations`;
const AL_ALLOCATED_LIST_URL = `${AL_ABC_BASE_URL}/stores/events/limited-releases/Allocated-Spirits-List`;
const AL_RELEASE_ROW_RE = /^(?:(\d{1,2}\/\d{1,2}\/\d{4})\s+(?:(\d+)\s+)?)?(\d{3})\s+(.+?,\s*AL,?\s+\d{5})\s+([A-Z]\d{6})\s+(.+?)\s+\$([\d,]+\.\d{2})$/;
const AL_PRODUCT_CODE_RE = /^[A-Z]\d{6}$/;
const AL_BOURBON_RE = /bourbon|whiskey|whisky|rye|blanton|weller|eagle rare|stagg|taylor|buffalo trace|pappy|van winkle|michter|willett|old fitz|fitzgerald|elijah craig|russell|four roses|booker|baker|1792|maker|woodford|knob creek|jack daniel|blood oath|parker|henry mckenna|sazerac|little book|birthday bourbon|king of kentucky|rock hill|elmer/i;
const AL_STRONG_RELEASE_RE = /blanton|weller|eagle rare|stagg|e\.?h\.?\s*taylor|colonel\s*taylor|buffalo trace|pappy|van winkle|michter|willett|old fitz|fitzgerald|elijah craig|russell|four roses|booker|baker|1792|blood oath|parker|henry mckenna|sazerac|little book|birthday bourbon|king of kentucky|rock hill|elmer|knob creek|yellowstone|penelope|wild turkey/i;
const AL_CODE_MATCH_HINTS = new Map(Object.entries({
  A000101: 'Buffalo Trace Bourbon',
  A000186: 'Eagle Rare 10 Year',
  A000249: "Blanton's Original Single Barrel",
  D004266: "Blanton's Original Single Barrel",
  A005346: 'E.H. Taylor Small Batch',
  A009281: 'Henry McKenna 10 Year',
  A010906: 'Little Book',
  L070445: 'Old Fitzgerald Bottled-in-Bond',
  A010247: 'Elijah Craig Barrel Proof',
  A010729: 'Sazerac Rye'
}));

const VIRGINIA_PRODUCTS = [
  // Product codes are taken from Virginia ABC public product/limited-availability listings.
  { code: '016850', name: "Blanton's Single Barrel Bourbon", slug: 'blantons-single-barrel-bourbon', limitedCaveat: true },
  { code: '017766', name: 'Eagle Rare 10 Year Bourbon', slug: 'eagle-rare-10-year-bourbon', limitedCaveat: true },
  { code: '018006', name: 'Buffalo Trace Bourbon', slug: 'buffalo-trace-bourbon', limitedCaveat: true },
  { code: '021602', name: 'E H Taylor Jr. Small Batch Whiskey', slug: 'e-h-taylor-jr-small-batch-whiskey', limitedCaveat: true },
  { code: '016483', name: 'Old Fitzgerald 7 Year Bottled In Bond', slug: 'old-fitzgerald-7-year-bottled-in-bond', limitedCaveat: true },
  { code: '021236', name: '1792 Small Batch Bourbon', slug: '1792-small-batch-bourbon', limitedCaveat: false }
];

// ArcGIS occasionally retains historic/closed ABC landmarks that the live VA ABC inventory API rejects.
// Keep these out of origin probes so they do not create noisy per-product roadblocks.
const VIRGINIA_INVALID_ORIGIN_STORES = new Set(['63', '74', '123', '208', '215', '298', '319', '342']);

const VIRGINIA_STORES_ARCGIS_URL = "https://vginmaps.vdem.virginia.gov/arcgis/rest/services/VA_Base_Layers/VA_Landmarks/FeatureServer/1/query?where=UPPER(LandmkName)%20LIKE%20%27%25ABC%25%27&outFields=*&returnGeometry=false&f=json";
const VIRGINIA_CACHE_PATH = 'out/cache/VA-storeNearby-signals.json';
const VIRGINIA_CACHE_MAX_AGE_MS = Number(process.env.BOURBON_SIGNAL_VA_CACHE_MAX_AGE_MS || 7 * 24 * 60 * 60_000);
const GREENSBORO_ABC_BASE_URL = 'https://shop.greensboroabc.com';
const GREENSBORO_ABC_COMPANY_ID = '5571440';
const GREENSBORO_ABC_SITE_ID = '2';
const HIGH_POINT_ABC_BASE_URL = 'https://highpointabc.com';
const HIGH_POINT_POWERBI_VIEW_URL = 'https://app.powerbi.com/view?r=eyJrIjoiMDU4OTk5MWUtZDQwNC00MmM4LWFjYmItM2M5NDYwNmVkY2YyIiwidCI6IjUwMjg1N2U1LWQxMGItNDBiZC05MGY5LWE1NDgxOWE1YzljOCIsImMiOjF9';
const HIGH_POINT_POWERBI_REPORT_URL = `${HIGH_POINT_ABC_BASE_URL}/pages/view-inventory`;
const HIGH_POINT_POWERBI_CLUSTER = 'https://wabi-us-east2-b-primary-api.analysis.windows.net';
const HIGH_POINT_POWERBI_RESOURCE_KEY = '0589991e-d404-42c8-acbb-3c94606edcf2';
const HIGH_POINT_POWERBI_MAX_ROWS = Number(process.env.BOURBON_SIGNAL_NC_HIGH_POINT_POWERBI_MAX_ROWS || 30_000);
const HIGH_POINT_STORES = [
  { field: 'WendoverAve', label: 'Wendover Ave', storeId: 'high-point-wendover-ave' },
  { field: 'FairfieldRd', label: 'Fairfield Rd', storeId: 'high-point-fairfield-rd' },
  { field: 'ParrisAve', label: 'Parris Ave', storeId: 'high-point-parris-ave' },
  { field: 'GateCityBlvd', label: 'Gate City Blvd', storeId: 'high-point-gate-city-blvd' },
  { field: 'EnglishRd', label: 'English Rd', storeId: 'high-point-english-rd' },
  { field: 'SkeetClubRd', label: 'Skeet Club Rd', storeId: 'high-point-skeet-club-rd' },
  { field: 'BrookridgeLane', label: 'Brookridge Lane', storeId: 'high-point-brookridge-lane' }
];
const IN_ATC_SEARCH_URL = 'https://mylicense.in.gov/everification/Search.aspx?facility=Y';
const IN_ATC_RESULTS_URL = 'https://mylicense.in.gov/everification/SearchResults.aspx';
const IN_ATC_ARTIFACT_PATH = 'out/browser/IN-atc-package-stores.json';
const IN_CITYHIVE_ARTIFACT_PATH = 'out/browser/IN-cityhive-retailer-inventory.json';
const IN_ATC_MAX_PAGES = Number(process.env.BOURBON_SIGNAL_IN_ATC_MAX_PAGES || 60);
const IN_ATC_CACHE_MAX_AGE_MS = Number(process.env.BOURBON_SIGNAL_IN_ATC_CACHE_MAX_AGE_MS || 7 * 24 * 60 * 60_000);
const IN_ATC_POST_TIMEOUT_MS = Number(process.env.BOURBON_SIGNAL_IN_ATC_POST_TIMEOUT_MS || 15_000);
const IN_BOURBON_WORLD_URL = 'https://bourbonworld.net/';
const INDIANA_LIQUOR_GROUP_EVENTS_URL = 'https://indianaliquor.com/our-events/';
const IN_CITYHIVE_MAX_PAGES = Number(process.env.BOURBON_SIGNAL_IN_CITYHIVE_MAX_PAGES || 8);
const IN_CITYHIVE_PER_STORE_MAX_PAGES = Number(process.env.BOURBON_SIGNAL_IN_CITYHIVE_PER_STORE_MAX_PAGES || 1);
const IN_CITYHIVE_MAX_MERCHANTS_PER_SOURCE = Number(process.env.BOURBON_SIGNAL_IN_CITYHIVE_MAX_MERCHANTS_PER_SOURCE || 48);
const IN_CITYHIVE_CACHE_MAX_AGE_MS = Number(process.env.BOURBON_SIGNAL_IN_CITYHIVE_CACHE_MAX_AGE_MS || 24 * 60 * 60_000);
const IN_CITYHIVE_LIVE_REFRESH_MIN_AGE_MS = Number(process.env.BOURBON_SIGNAL_IN_CITYHIVE_LIVE_REFRESH_MIN_AGE_MS || 45 * 60_000);
const IN_CITYHIVE_PRIORITY_CITY_RE = /indianapolis|carmel|fishers|noblesville|greenwood|avon|brownsburg|plainfield|speedway|westfield|greenfield|martinsville|bedford|french lick|morgantown|trafalgar|fort wayne|new haven|granger|goshen|roseland|huntington|valparaiso|merrillville|chesterton|bloomington|lafayette|west lafayette|south bend|mishawaka|elkhart|evansville|muncie|anderson|kokomo|terre haute|west terre haute|columbus|jeffersonville|new albany/i;
const IN_CITYHIVE_PRIORITY_CITY_ORDER = [
  'avon', 'plainfield', 'noblesville', 'speedway', 'westfield', 'greenfield',
  'south bend', 'mishawaka', 'elkhart', 'granger', 'goshen', 'roseland', 'huntington',
  'lafayette', 'west lafayette', 'evansville', 'muncie', 'anderson', 'kokomo', 'columbus', 'jeffersonville', 'new albany',
  'indianapolis', 'carmel', 'fishers', 'greenwood', 'brownsburg', 'mccordsville',
  'fort wayne', 'new haven', 'valparaiso', 'merrillville', 'chesterton', 'bloomington', 'terre haute', 'west terre haute',
  'martinsville', 'bedford', 'french lick', 'morgantown', 'trafalgar'
];
const IN_KAHNS_API_URL = 'https://www.kahnsfinewines.com/api/trpc/product.getAll';
const IN_KAHNS_SPIRITS_CATEGORY_PUBLIC_ID = '2sipcm0ec0lsm';
const IN_KAHNS_STORE = {
  id: '69',
  name: "Kahn's Fine Wines & Spirits",
  address: '5341 N Keystone Ave, Indianapolis, IN 46220',
  city: 'Indianapolis',
  zip: '46220',
  lat: 39.8498,
  lng: -86.1226
};
const IN_PAYLESS_BARREL_SELECTIONS_URL = 'https://www.paylessliquors.info/barrel-selections';
const IN_PAYLESS_EAST_STREET_STORE = {
  id: 'east-street',
  name: 'Payless Liquors - East Street',
  address: '3825 S. East Street, Indianapolis, IN 46227',
  city: 'Indianapolis',
  zip: '46227',
  lat: 39.7106,
  lng: -86.1484
};
const IN_KAHNS_MAX_PAGES = Number(process.env.BOURBON_SIGNAL_IN_KAHNS_MAX_PAGES || 4);
const IN_KAHNS_PAGE_SIZE = Math.min(100, Number(process.env.BOURBON_SIGNAL_IN_KAHNS_PAGE_SIZE || 100));
const IN_CITYHIVE_SOURCES = [
  {
    id: 'big-red',
    chainName: 'Big Red Liquors',
    sourceLabel: 'Big Red Liquors CityHive store inventory',
    baseUrl: 'https://bigredliquors.com',
    urls: [
      'https://bigredliquors.com/shop/?subtype=Bourbon',
      'https://bigredliquors.com/shop/product-groups/pages/bourbon-world?order=&subtype=Bourbon&state=Indiana'
    ]
  },
  {
    id: 'cap-n-cork',
    chainName: "Cap n' Cork",
    sourceLabel: "Cap n' Cork CityHive store inventory",
    baseUrl: 'https://capncork.com',
    urls: [
      'https://capncork.com/shop/?subtype=Bourbon',
      'https://capncork.com/pages/friday-night-flyer',
      'https://capncork.com/events'
    ]
  },
  {
    id: 'wise-guys',
    chainName: 'Wise Guys Discount Liquors',
    sourceLabel: 'Wise Guys Discount Liquors CityHive store inventory',
    baseUrl: 'https://shop.wiseguysliquors.com',
    urls: [
      'https://shop.wiseguysliquors.com/shop/?subtype=bourbon',
      'https://shop.wiseguysliquors.com/events'
    ]
  },
  {
    id: 'belmont-beverage',
    chainName: 'Belmont Beverage & Chalet Party Shoppe',
    sourceLabel: 'Belmont Beverage & Chalet Party Shoppe CityHive store inventory',
    baseUrl: 'https://belmontbev.com',
    urls: [
      'https://belmontbev.com/shop?subtype=bourbon',
      'https://belmontbev.com/pages/shop-spirits-app'
    ]
  },
  {
    id: 'cork-liquors',
    chainName: 'Cork Liquors',
    sourceLabel: 'Cork Liquors CityHive store inventory',
    baseUrl: 'https://shop.corkliquor.com',
    urls: [
      'https://shop.corkliquor.com/spirits/bourbon'
    ]
  }
];

const TN_CITYHIVE_ARTIFACT_PATH = 'out/browser/TN-cityhive-retailer-inventory.json';
const TN_CITYHIVE_MAX_PAGES = Number(process.env.BOURBON_SIGNAL_TN_CITYHIVE_MAX_PAGES || 2);
const TN_CITYHIVE_CACHE_MAX_AGE_MS = Number(process.env.BOURBON_SIGNAL_TN_CITYHIVE_CACHE_MAX_AGE_MS || 24 * 60 * 60_000);
const TN_CITYHIVE_PAGE_DELAY_MS = Number(process.env.BOURBON_SIGNAL_TN_CITYHIVE_PAGE_DELAY_MS || 1_200);
const TN_CITYHIVE_SOURCE_DELAY_MS = Number(process.env.BOURBON_SIGNAL_TN_CITYHIVE_SOURCE_DELAY_MS || 2_000);
const TN_COOL_SPRINGS_BASE_URL = 'https://shop.coolspringswine.com/s/1000-1057/';
const TN_COOL_SPRINGS_PAGE_SIZE = Math.min(100, Number(process.env.BOURBON_SIGNAL_TN_COOL_SPRINGS_PAGE_SIZE || 100));
const TN_COOL_SPRINGS_MAX_PAGES = Number(process.env.BOURBON_SIGNAL_TN_COOL_SPRINGS_MAX_PAGES || 3);
const TN_COOL_SPRINGS_STORE = {
  id: '1000-1057',
  name: 'Cool Springs Wine & Spirits',
  address: '1935 Mallory Lane, Franklin, TN 37067',
  city: 'Franklin',
  zip: '37067',
  lat: 35.955476,
  lng: -86.817278
};
const TN_CITYHIVE_SOURCES = [
  {
    id: 'frugal-macdoogal',
    chainName: 'Frugal MacDoogal',
    sourceLabel: 'Frugal MacDoogal CityHive store inventory',
    baseUrl: 'https://www.frugalmacdoogal.com',
    urls: [
      'https://www.frugalmacdoogal.com/shop/?subtype=bourbon',
      'https://www.frugalmacdoogal.com/shop/?subtype=whiskey',
      'https://www.frugalmacdoogal.com/shop/product-groups/single-barrel-bourbons'
    ]
  },
  {
    id: 'corkdorks',
    chainName: 'Corkdorks Wine Spirits Beer',
    sourceLabel: 'Corkdorks CityHive store inventory',
    baseUrl: 'https://corkdorkswine.com',
    urls: [
      'https://corkdorkswine.com/shop/?subtype=bourbon',
      'https://corkdorkswine.com/shop/?subtype=whiskey',
      'https://corkdorkswine.com/shop/?container-id=5ce3f796480ec3270468a3cc&title=Shop+Spirits'
    ]
  },
  {
    id: 'busters-liquors',
    chainName: "Buster's Liquors & Wines",
    sourceLabel: "Buster's Liquors & Wines CityHive store inventory",
    baseUrl: 'https://bustersliquors.com',
    urls: [
      'https://bustersliquors.com/shop/?subtype=bourbon',
      'https://bustersliquors.com/shop/?subtype=whiskey'
    ]
  },
  {
    id: 'kimbrough-wines',
    chainName: 'Kimbrough Fine Wine & Spirits',
    sourceLabel: 'Kimbrough Fine Wine & Spirits CityHive store inventory',
    baseUrl: 'https://kimbroughwines.com',
    urls: [
      'https://kimbroughwines.com/shop/?subtype=bourbon',
      'https://kimbroughwines.com/shop/?subtype=whiskey',
      'https://kimbroughwines.com/pages/shop-spirits'
    ]
  },
  {
    id: 'cristys-liquor-store',
    chainName: "Cristy's Liquor Store",
    sourceLabel: "Cristy's Liquor Store CityHive store inventory",
    baseUrl: 'https://cristysliquorstore.com',
    urls: [
      'https://cristysliquorstore.com/shop/?subtype=bourbon',
      'https://cristysliquorstore.com/shop/?subtype=whiskey'
    ]
  },
  {
    id: 'red-dog-wine-spirits',
    chainName: 'Red Dog Wine and Spirits',
    sourceLabel: 'Red Dog Wine and Spirits CityHive store inventory',
    baseUrl: 'https://shop.reddogwineandspirits.com',
    urls: [
      'https://shop.reddogwineandspirits.com/shop/?subtype=bourbon',
      'https://shop.reddogwineandspirits.com/shop/?subtype=whiskey'
    ]
  },
  {
    id: 'moon-wine-spirits',
    chainName: 'Moon Wine & Spirits',
    sourceLabel: 'Moon Wine & Spirits CityHive store inventory',
    baseUrl: 'https://moonwineandspirits.com',
    urls: [
      'https://moonwineandspirits.com/shop/?subtype=bourbon',
      'https://moonwineandspirits.com/shop/?subtype=whiskey'
    ]
  },
  {
    id: 'westside-wine-spirits',
    chainName: 'Westside Wine & Spirits',
    sourceLabel: 'Westside Wine & Spirits CityHive store inventory',
    baseUrl: 'https://westsidewineandspirits.com',
    urls: [
      'https://westsidewineandspirits.com/shop/?subtype=bourbon',
      'https://westsidewineandspirits.com/shop/?subtype=whiskey'
    ]
  }
];

const TX_SPECS_RELEASE_URL = 'https://specsonline.com/bourbonday2024/';
const TX_SPECS_PRODUCT_URLS = [
  'https://specsonline.com/shop/spirits/native-texas-bourbon/',
  'https://specsonline.com/shop/spirits/tx-bourbon-whiskey-6-case/',
  'https://specsonline.com/shop/spirits/specs-single-barrel-tx-bourbon/'
];
const TX_CITYHIVE_MAX_PAGES = Number(process.env.BOURBON_SIGNAL_TX_CITYHIVE_MAX_PAGES || 2);
const TX_CITYHIVE_SOURCES = [
  {
    id: 'twin-liquors',
    chainName: 'Twin Liquors',
    sourceLabel: 'Twin Liquors CityHive store inventory',
    baseUrl: 'https://twinliquors.com',
    urls: [
      'https://twinliquors.com/shop/?subtype=bourbon',
      'https://twinliquors.com/shop/?subtype=whiskey'
    ]
  }
];
const TX_WATCH_RE = /bourbon|blanton|eagle rare|weller|stagg|e\.?h\.?\s*taylor|colonel\s*taylor|buffalo trace|old fitz|fitzgerald|michter|willett|baker'?s?|booker'?s?|bardstown|holladay|single barrel|barrel pick|rare|allocated/i;

const OHLQ_SHA256_AVAILABILITY_BUCKETS = {
  '3:1bad6b8cf97131fceab8543e81f7757195fbb1d36b376ee994ad1cf17699c464': { value: -1, status: 'not_available', label: 'Not Available', positive: false },
  '3:5feceb66ffc86f38d952786c6d696c79c2dbc239dd4e91b46729d73a27fb57e9': { value: 0, status: 'sold_out', label: 'Sold Out', positive: false },
  '3:d2cbad71ff333de67d07ec676e352ab7f38248eb69c942950157220607c55e84': { value: 0.5, status: 'limited_supply', label: 'Limited Supply', positive: true },
  '3:6b86b273ff34fce19d6b804eff5a3f5747ada4eaa22f1d49c01e52ddb7875b4b': { value: 1, status: 'in_stock', label: 'In Stock', positive: true }
};

function ohlqAvailability(bucket) {
  return OHLQ_SHA256_AVAILABILITY_BUCKETS[bucket] || { value: null, status: 'unknown', label: 'Unknown', positive: false };
}

function csvRows(text) {
  const rows = [];
  let row = [], cell = '', quote = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i], next = text[i + 1];
    if (ch === '"' && quote && next === '"') { cell += '"'; i++; continue; }
    if (ch === '"') { quote = !quote; continue; }
    if (ch === ',' && !quote) { row.push(cell); cell = ''; continue; }
    if ((ch === '\n' || ch === '\r') && !quote) {
      if (cell || row.length) { row.push(cell); rows.push(row); row = []; cell = ''; }
      if (ch === '\r' && next === '\n') i++;
      continue;
    }
    cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [header = [], ...data] = rows;
  return data.map((values) => Object.fromEntries(header.map((h, i) => [h.trim(), values[i] ?? ''])));
}

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function readCachedVirginiaSignals() {
  try {
    const cached = JSON.parse(await readFile(VIRGINIA_CACHE_PATH, 'utf8'));
    return cached && Array.isArray(cached.signals) ? cached : { signals: [] };
  } catch {
    return { signals: [] };
  }
}

async function writeCachedVirginiaSignals(signals) {
  await mkdir(path.dirname(VIRGINIA_CACHE_PATH), { recursive: true });
  await writeFile(VIRGINIA_CACHE_PATH, JSON.stringify({ generatedAt: new Date().toISOString(), signals }, null, 2));
}

async function textFetch(url, options = {}) {
  const timeoutMs = Number(options.timeoutMs || process.env.BOURBON_SIGNAL_PRECISION_FETCH_TIMEOUT_MS || 18_000);
  const controller = new AbortController();
  const timeout = timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: { 'user-agent': 'Mozilla/5.0 (BourbonSignal research)', accept: 'text/html,application/json,text/csv,*/*', ...(options.headers || {}) },
      method: options.method || 'GET',
      body: options.body,
      signal: controller.signal
    });
    return { ok: res.ok, status: res.status, url: res.url, contentType: res.headers.get('content-type') || '', rawSetCookie: res.headers.get('set-cookie') || '', text: await res.text(), error: null };
  } catch (error) {
    return { ok: false, status: 0, url, contentType: '', text: '', error: error instanceof Error ? error.message : String(error) };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function decodeHtml(value = '') {
  return String(value)
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&#8217;|&rsquo;|&apos;/g, "'")
    .replace(/&#8211;|&#8212;|&ndash;|&mdash;/g, '-')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

async function binaryFetch(url, options = {}) {
  const timeoutMs = Number(options.timeoutMs || process.env.BOURBON_SIGNAL_PRECISION_FETCH_TIMEOUT_MS || 30_000);
  const controller = new AbortController();
  const timeout = timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: { 'user-agent': 'Mozilla/5.0 (BourbonSignal research)', accept: 'application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,*/*', ...(options.headers || {}) },
      signal: controller.signal
    });
    const buffer = Buffer.from(await res.arrayBuffer());
    return { ok: res.ok, status: res.status, url: res.url, contentType: res.headers.get('content-type') || '', buffer, error: null };
  } catch (error) {
    return { ok: false, status: 0, url, contentType: '', buffer: Buffer.alloc(0), error: error instanceof Error ? error.message : String(error) };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function htmlLinks(html, baseUrl) {
  return [...String(html || '').matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .map((match) => ({
      href: new URL(decodeHtml(match[1]), baseUrl).href,
      text: decodeHtml(stripHtml(match[2]))
    }))
    .filter((link) => link.href);
}

async function pdfText(url) {
  const res = await binaryFetch(url, { timeoutMs: 45_000 });
  if (!res.ok) return { ok: false, status: res.status, url: res.url || url, text: '', pages: 0, error: res.error || `HTTP ${res.status}` };
  try {
    const parser = new PDFParse({ data: res.buffer });
    const data = await parser.getText();
    await parser.destroy?.();
    return { ok: true, status: res.status, url: res.url || url, text: data.text || '', pages: data.total || data.numpages || 0, error: null };
  } catch (error) {
    return { ok: false, status: res.status, url: res.url || url, text: '', pages: 0, error: error instanceof Error ? error.message : String(error) };
  }
}

function normalizePdfLines(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function cityFromAlabamaAddress(address) {
  const match = String(address || '').match(/,\s*([^,]+),\s*AL,?\s+\d{5}\b/i);
  return match ? titleCase(match[1]) : null;
}

function zipFromAlabamaAddress(address) {
  return String(address || '').match(/\bAL,?\s+(\d{5})\b/i)?.[1] || null;
}

function normalizeAlabamaAddress(address) {
  return decodeHtml(address).replace(/,\s*AL,\s*/i, ', AL ').replace(/\s+/g, ' ').trim();
}

function parseAlabamaReleaseRows(text, sourceKind) {
  const rows = [];
  const misses = [];
  for (const line of normalizePdfLines(text)) {
    if (!/[A-Z]\d{6}/.test(line) || !/\$[\d,]+\.\d{2}/.test(line)) continue;
    const match = line.match(AL_RELEASE_ROW_RE);
    if (!match) {
      misses.push(line);
      continue;
    }
    const [, releaseDate, tableNumber, storeNumber, rawAddress, code, rawName, priceText] = match;
    const storeAddress = normalizeAlabamaAddress(rawAddress);
    rows.push({
      sourceKind,
      releaseDate: releaseDate || null,
      tableNumber: tableNumber || null,
      storeNumber,
      storeAddress,
      city: cityFromAlabamaAddress(storeAddress),
      zip: zipFromAlabamaAddress(storeAddress),
      code,
      rawName: decodeHtml(rawName).replace(/\s+/g, ' ').trim(),
      price: Number(String(priceText).replace(/,/g, '')) || null,
      line
    });
  }
  return { rows, misses };
}

function parseAlabamaAllocatedPdfRows(text) {
  const rows = [];
  for (const line of normalizePdfLines(text)) {
    const codeMatch = line.match(/\b([A-Z]\d{6})\b/);
    if (!codeMatch) continue;
    const code = codeMatch[1];
    const afterCode = line.slice(line.indexOf(code) + code.length).replace(/\s+/g, ' ').trim();
    if (!afterCode || !AL_BOURBON_RE.test(afterCode)) continue;
    const money = [...afterCode.matchAll(/\$?([\d,]+\.\d{2})/g)].map((m) => Number(m[1].replace(/,/g, ''))).filter(Number.isFinite);
    const price = money.length ? money[0] : null;
    const casePrice = money.length > 1 ? money[money.length - 1] : null;
    const firstMoney = afterCode.search(/\$?[\d,]+\.\d{2}/);
    const nameAndPack = (firstMoney >= 0 ? afterCode.slice(0, firstMoney) : afterCode).trim();
    const packMatch = nameAndPack.match(/(.+?)\s+(\d{1,3})\s*$/);
    const rawName = decodeHtml((packMatch ? packMatch[1] : nameAndPack).replace(/\s+/g, ' ').trim());
    if (!rawName || !AL_BOURBON_RE.test(rawName)) continue;
    rows.push({
      sheetName: 'Allocated Product List PDF',
      code,
      rawName,
      packSize: packMatch ? Number(packMatch[2]) || null : null,
      price,
      casePrice,
      line
    });
  }
  return rows;
}

function parseAlabamaAnnualDate(text = '') {
  const clean = stripHtml(String(text || '')).replace(/\s+/g, ' ');
  const match = clean.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s*(20\d{2})/i);
  if (!match) return null;
  return `${match[1]} ${match[2]}, ${match[3]}`;
}

function parseAlabamaAnnualProductRows(html = '') {
  const rows = [];
  let tableNumber = null;
  for (const tr of String(html || '').matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...tr[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)]
      .map((m) => decodeHtml(stripHtml(m[1])).replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    const tableCell = cells.find((cell) => /^Table\s+\d+/i.test(cell));
    if (tableCell) tableNumber = tableCell.match(/\d+/)?.[0] || tableNumber;
    const codeIndex = cells.findIndex((cell) => AL_PRODUCT_CODE_RE.test(cell));
    if (codeIndex < 0) continue;
    const code = cells[codeIndex].match(AL_PRODUCT_CODE_RE)?.[0];
    const priceText = cells.find((cell, idx) => idx > codeIndex && /\$[\d,]+\.\d{2}/.test(cell)) || cells.find((cell) => /\$[\d,]+\.\d{2}/.test(cell));
    const rawName = cells.slice(codeIndex + 1).find((cell) => cell !== priceText && AL_BOURBON_RE.test(cell)) || cells[codeIndex + 1] || '';
    if (!code || !rawName || !AL_BOURBON_RE.test(rawName)) continue;
    rows.push({
      tableNumber,
      code,
      rawName: decodeHtml(rawName).replace(/\s+/g, ' ').trim(),
      price: priceText ? Number(priceText.replace(/[$,]/g, '')) || null : null
    });
  }
  return [...new Map(rows.map((row) => [`${row.tableNumber}|${row.code}|${row.rawName}`, row])).values()];
}

function aspNetHiddenValue(html, name) {
  return html.match(new RegExp(`name=["']${name}["'][^>]*value=["']([^"']*)`, 'i'))?.[1] || '';
}

function cityZipFromIndianaPermitList(value = '') {
  const clean = decodeHtml(value);
  const match = clean.match(/^(.*?)(?:,?\s+)?IN\s+(\d{5}(?:-\d{4})?)$/i);
  if (!match) return { city: clean || null, zip: null };
  return { city: titleCase(match[1]), zip: match[2] };
}

function parseIndianaAtcRows(html) {
  const anchors = [...html.matchAll(/<a id="datagrid_results__ctl\d+_name" href="(Details\.aspx\?result=([^"]+))" target="_blank">([\s\S]*?)<\/a>/gi)];
  const rows = [];
  for (let i = 0; i < anchors.length; i++) {
    const anchor = anchors[i];
    const start = anchor.index || 0;
    const end = anchors[i + 1]?.index || html.indexOf('</table>', start + 1000);
    const chunk = html.slice(start, end > start ? end : start + 2500);
    const spans = [...chunk.matchAll(/<td><span>([\s\S]*?)<\/span><\/td>/gi)].map((m) => decodeHtml(m[1]));
    const [permitNumber, profession, licenseType, status, cityZipRaw] = spans;
    const { city, zip } = cityZipFromIndianaPermitList(cityZipRaw);
    const resultId = anchor[2];
    const name = decodeHtml(anchor[3]);
    if (!name || !permitNumber) continue;
    rows.push({
      resultId,
      detailPath: anchor[1],
      name: titleCase(name),
      rawName: name,
      permitNumber,
      profession,
      licenseType,
      status,
      city,
      zip,
      state: 'IN'
    });
  }
  return rows;
}

function pagerTargets(html) {
  return [...html.matchAll(/javascript:__doPostBack\(&#39;(datagrid_results\$_ctl\d+\$_ctl\d+)&#39;,&#39;&#39;\)/g)]
    .map((m) => decodeHtml(m[1]))
    .filter((target) => !/\$_ctl0$/.test(target));
}

async function readIndianaAtcCache() {
  try {
    const artifact = JSON.parse(await readFile(IN_ATC_ARTIFACT_PATH, 'utf8'));
    const generatedMs = new Date(artifact.generatedAt || 0).getTime();
    const fresh = Number.isFinite(generatedMs) && Date.now() - generatedMs <= IN_ATC_CACHE_MAX_AGE_MS;
    const stores = Array.isArray(artifact.stores) ? artifact.stores : [];
    if (!fresh || !stores.length) return null;
    return { ...artifact, stores, cacheReuse: true, cacheGeneratedAt: artifact.generatedAt };
  } catch {
    return null;
  }
}

async function collectIndianaAtcPackageStores() {
  const cached = await readIndianaAtcCache();
  if (process.env.BOURBON_SIGNAL_IN_FORCE_ATC_LIVE !== '1' && cached) return cached;

  const first = await textFetch(IN_ATC_SEARCH_URL, { headers: { accept: 'text/html,*/*' } });
  if (!first.ok) throw new Error(`Indiana ATC search page HTTP ${first.status}: ${first.error || first.text.slice(0, 120)}`);
  const cookie = first.rawSetCookie || '';
  const searchParams = new URLSearchParams();
  for (const name of ['__VIEWSTATE', '__VIEWSTATEGENERATOR', '__EVENTVALIDATION']) searchParams.set(name, aspNetHiddenValue(first.text, name));
  searchParams.set('t_web_lookup__profession_name', 'Alcoholic Beverage');
  searchParams.set('t_web_lookup__license_type_name', 'Beer Wine & Liquor - Package Store');
  searchParams.set('t_web_lookup__license_status_name', 'Active');
  searchParams.set('t_web_lookup__addr_state', 'IN');
  searchParams.set('sch_button', 'Search');
  searchParams.set('recaptcha', '');

  async function post(url, body, referer) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), IN_ATC_POST_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: 'POST',
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          'user-agent': 'Mozilla/5.0 (BourbonSignal research)',
          accept: 'text/html,*/*',
          'content-type': 'application/x-www-form-urlencoded',
          referer,
          ...(cookie ? { cookie } : {})
        },
        body
      });
      return { ok: res.ok, status: res.status, url: res.url, text: await res.text() };
    } finally {
      clearTimeout(timeout);
    }
  }

  let pageHtml = (await post(IN_ATC_SEARCH_URL, searchParams, IN_ATC_SEARCH_URL)).text;
  const pages = [];
  const byPermit = new Map();

  for (let page = 1; page <= IN_ATC_MAX_PAGES; page++) {
    const rows = parseIndianaAtcRows(pageHtml);
    pages.push({ page, rowCount: rows.length, firstPermit: rows[0]?.permitNumber || null, firstName: rows[0]?.name || null });
    for (const row of rows) byPermit.set(row.permitNumber, row);
    const targets = pagerTargets(pageHtml);
    const nextTarget = targets.find((target) => target.endsWith(`$_ctl${page}`));
    if (!nextTarget || !rows.length) break;
    const pageParams = new URLSearchParams();
    for (const name of ['__VIEWSTATE', '__VIEWSTATEGENERATOR', '__EVENTVALIDATION']) pageParams.set(name, aspNetHiddenValue(pageHtml, name));
    pageParams.set('__EVENTTARGET', nextTarget);
    pageParams.set('__EVENTARGUMENT', '');
    await sleep(250);
    pageHtml = (await post(IN_ATC_RESULTS_URL, pageParams, IN_ATC_RESULTS_URL)).text;
  }

  const stores = [...byPermit.values()].sort((a, b) => String(a.name).localeCompare(String(b.name)) || String(a.permitNumber).localeCompare(String(b.permitNumber)));
  const artifact = {
    generatedAt: new Date().toISOString(),
    source: 'Indiana ATC public facility permit search',
    sourceUrl: IN_ATC_SEARCH_URL,
    query: { profession: 'Alcoholic Beverage', licenseType: 'Beer Wine & Liquor - Package Store', status: 'Active', state: 'IN' },
    pageCount: pages.length,
    storeCount: stores.length,
    pages,
    stores
  };
  await mkdir(path.dirname(IN_ATC_ARTIFACT_PATH), { recursive: true });
  await writeFile(IN_ATC_ARTIFACT_PATH, JSON.stringify(artifact, null, 2));
  return artifact;
}

function parseIndianaBourbonWorldAllocated(text) {
  const cleanText = decodeHtml(stripHtml(text));
  const start = cleanText.search(/Current rare\s*&\s*allocated bottles:/i);
  if (start < 0) return [];
  const endCandidates = [
    cleanText.indexOf('NOTE:', start),
    cleanText.indexOf('TO FINALIZE ENTRY', start),
    cleanText.indexOf('Honest, straightforward', start)
  ].filter((idx) => idx > start);
  const end = endCandidates.length ? Math.min(...endCandidates) : Math.min(cleanText.length, start + 1800);
  const section = cleanText.slice(start, end);
  const itemRe = /([A-Z0-9][A-Za-z0-9 .'’&-]+?)(?:\s+(?:750|375|1\.75L|1L))?\s*[–-]\s*\$([0-9,.]+)\s*[–-]\s*(\d+)\s*bottles?/gi;
  return [...section.matchAll(itemRe)].map((match) => ({
    rawName: decodeHtml(match[1]).replace(/[’]/g, "'").trim(),
    price: Number(String(match[2]).replace(/,/g, '')) || null,
    quantity: Number(match[3]) || 0,
    rawLine: decodeHtml(match[0]).trim()
  }));
}

function indianaLiquorGroupEventDateIsCurrent(dateText, observedAt) {
  const now = new Date(observedAt);
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const text = String(dateText || '').split(/\s*&\s*/)[0].trim();
  let year = now.getUTCFullYear();
  let month = null;
  let day = null;
  const slash = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (slash) {
    month = Number(slash[1]);
    day = Number(slash[2]);
    if (slash[3]) year = Number(slash[3].length === 2 ? `20${slash[3]}` : slash[3]);
  } else {
    const named = text.match(/\b(Jan|Feb|Mar|Apr|May|June?|July?|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s*,?\s*(\d{4}))?\b/i);
    if (named) {
      month = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].findIndex((m) => named[1].toLowerCase().startsWith(m)) + 1;
      day = Number(named[2]);
      if (named[3]) year = Number(named[3]);
    }
  }
  if (!month || !day) return false;
  const eventDate = new Date(Date.UTC(year, month - 1, day));
  const maxFuture = new Date(today.getTime() + 370 * 24 * 60 * 60_000);
  return eventDate >= today && eventDate <= maxFuture;
}

function parseIndianaLiquorGroupEvents(html, observedAt = new Date().toISOString()) {
  const cleanText = decodeHtml(stripHtml(html)).replace(/&#8211;|&ndash;/g, '-').replace(/\s+/g, ' ').trim();
  const sections = [];
  const sectionRe = /EVENT DETAILS(?:\s+CANCELLED\s+EVENT DETAILS)?\s+DATE\/TIME\/LOCATION\s+([\s\S]*?)(?=\s+EVENT DETAILS(?:\s+CANCELLED\s+EVENT DETAILS)?\s+DATE\/TIME\/LOCATION|\s+Explore Careers|$)/gi;
  for (const match of cleanText.matchAll(sectionRe)) sections.push(match[1].trim());
  const cityRe = /\b(NOBLESVILLE|CARMEL|HUNTINGTON|MUNCIE|MARION|RICHMOND|ELWOOD|BLUFFTON|FRANKLIN|ANDERSON|BARGERSVILLE|GAS CITY|YORKTOWN|MONTICELLO|KOKOMO|NEW CASTLE)\b/g;
  const bourbonEventRe = /bourbon|whiskey|whisky|bulleit|maker'?s mark|traveler'?s point|remington|monk'?s road|rattle\s*&\s*snap|jim beam|knob creek|four roses/i;
  const events = [];
  for (const section of sections) {
    const firstCity = section.search(cityRe);
    if (firstCity < 0) continue;
    const rawName = section.slice(0, firstCity).replace(/\bNEW\b/gi, '').trim();
    if (!rawName || !bourbonEventRe.test(rawName)) continue;
    const matches = [...section.matchAll(cityRe)];
    for (let i = 0; i < matches.length; i++) {
      const city = titleCase(matches[i][1]);
      const chunkStart = matches[i].index + matches[i][0].length;
      const chunkEnd = i + 1 < matches.length ? matches[i + 1].index : section.length;
      const chunk = section.slice(chunkStart, chunkEnd).replace(/\bNEW\b/gi, '').trim();
      const dateMatch = chunk.match(/\b(?:\d{1,2}\/\d{1,2}|(?:Jan|Feb|Mar|Apr|May|June?|July?|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+\d{1,2}(?:st|nd|rd|th)?)(?:\s*&\s*(?:\d{1,2}\/\d{1,2}|(?:Jan|Feb|Mar|Apr|May|June?|July?|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+\d{1,2}(?:st|nd|rd|th)?))?(?:\s+\d{4})?\b/i);
      const timeMatch = chunk.match(/\b(?:from\s+)?\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s*(?:-|to|&|and)\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/i);
      const locationText = (dateMatch ? chunk.slice(0, dateMatch.index) : chunk).trim();
      if (!locationText || !dateMatch || !indianaLiquorGroupEventDateIsCurrent(dateMatch[0], observedAt)) continue;
      events.push({
        rawName,
        city,
        locationText,
        dateText: dateMatch[0],
        timeText: timeMatch?.[0] || null,
        rawLine: `${rawName} ${city} ${chunk}`.trim()
      });
    }
  }
  return events;
}

function cityHiveJsonBlobs(html) {
  const blobs = [];
  for (const match of html.matchAll(/JSON\.parse\(decodeURIComponent\("([^"]+)"\)\)/g)) {
    try { blobs.push(JSON.parse(decodeURIComponent(match[1]))); } catch {}
  }
  return blobs;
}

function cityHiveProducts(blobs) {
  const products = [];
  const visit = (value) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) { for (const child of value) visit(child); return; }
    if (Array.isArray(value.products)) products.push(...value.products);
    for (const child of Object.values(value)) if (child && typeof child === 'object') visit(child);
  };
  for (const blob of blobs) visit(blob);
  return products;
}

function cityHiveMerchantConfigs(blobs) {
  const configs = [];
  const visit = (value) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) { for (const child of value) visit(child); return; }
    if (Array.isArray(value.merchant_configs)) configs.push(...value.merchant_configs);
    for (const child of Object.values(value)) if (child && typeof child === 'object') visit(child);
  };
  for (const blob of blobs) visit(blob);
  return configs;
}

function cityHivePageUrls(seedUrl, maxPages = IN_CITYHIVE_MAX_PAGES) {
  const urls = [];
  for (let page = 0; page < maxPages; page++) {
    const url = new URL(seedUrl);
    if (page > 0) url.searchParams.set('skip', String(page * 18));
    urls.push(url.toString());
  }
  return urls;
}

function cityHiveMerchantPageUrls(seedUrl, merchantId, maxPages = IN_CITYHIVE_PER_STORE_MAX_PAGES) {
  return cityHivePageUrls(seedUrl, maxPages).map((value) => {
    const url = new URL(value);
    url.searchParams.set('merchant-id', merchantId);
    return url.toString();
  });
}

function cityHiveShouldExpandMerchants(seedUrl) {
  return /\/shop\/?\?/i.test(seedUrl);
}

function cityHiveAddressParts(address = {}) {
  const props = address.address_properties || {};
  const coords = address.location?.coordinates || [];
  return {
    fullAddress: address.full_address || props.full_address || null,
    street: address.street_address || props.street_address || null,
    city: address.city || props.city || null,
    county: address.district || props.district || null,
    zip: address.zipcode || props.zip || null,
    state: address.state || props.state || props.province || null,
    lat: Number(props.lat ?? coords[1]) || null,
    lng: Number(props.lng ?? coords[0]) || null
  };
}

function cityHivePriorityRank(merchant) {
  const text = `${merchant.name || ''} ${merchant.city || ''} ${merchant.address || ''}`.toLowerCase().replace(/\s+/g, ' ');
  const orderIndex = IN_CITYHIVE_PRIORITY_CITY_ORDER.findIndex((city) => text.includes(city));
  return orderIndex >= 0 ? orderIndex : IN_CITYHIVE_PRIORITY_CITY_ORDER.length;
}

function cityHivePriorityMerchants(blobs, source) {
  const merchants = [];
  const seen = new Set();
  let ordinal = 0;
  for (const cfg of cityHiveMerchantConfigs(blobs)) {
    const merchant = cfg?.merchant || cfg;
    if (!merchant?.id || seen.has(merchant.id)) continue;
    seen.add(merchant.id);
    const a = cityHiveAddressParts(merchant.address || {});
    if ((a.state || '').toUpperCase() && (a.state || '').toUpperCase() !== 'IN') continue;
    const haystack = `${merchant.display_name || merchant.name || ''} ${a.fullAddress || ''} ${a.city || ''}`;
    if (!IN_CITYHIVE_PRIORITY_CITY_RE.test(haystack)) continue;
    merchants.push({ id: merchant.id, name: merchant.display_name || merchant.name, city: a.city, address: a.fullAddress, sourceId: source.id, ordinal: ordinal++ });
  }
  return merchants
    .sort((a, b) => cityHivePriorityRank(a) - cityHivePriorityRank(b) || a.ordinal - b.ordinal)
    .slice(0, IN_CITYHIVE_MAX_MERCHANTS_PER_SOURCE);
}

function isBourbonRelevantProduct(product, option) {
  const text = JSON.stringify({
    name: product?.name,
    category: product?.basic_category,
    tags: option?.product_tags,
    storeTags: option?.store_specific_tags,
    props: option?.additional_properties,
    display: option?.option_display_data?.basic_category
  });
  return /bourbon|blanton|eagle rare|weller|stagg|taylor|van winkle|buffalo trace|michter|willett|old fitz|elmer|rock hill|booker|baker|blood oath|four roses|1792|russell/i.test(text);
}

function normalizedBottleText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cityHiveSafeBottleMatch(rawName, bible) {
  const { match, record } = bottleMatch(rawName, bible);
  if (!record) return { match, record: null, unsafeReason: 'no_bottle_bible_match' };
  const raw = normalizedBottleText(rawName);
  const canonical = normalizedBottleText(record.canonical);
  if (/\b(cream|liqueur|cordial|cocktail|ready to drink)\b/.test(raw) && !/\b(cream|liqueur|cordial|cocktail|ready to drink)\b/.test(canonical)) return { match, record: null, unsafeReason: 'flavored_or_liqueur_matched_core_bottle' };
  if (/\brye\b/.test(raw) && !/\brye\b/.test(canonical)) return { match, record: null, unsafeReason: 'rye_matched_non_rye' };
  if (/\bbourbon\b/.test(raw) && /\brye\b/.test(canonical) && !/\brye\b/.test(raw)) return { match, record: null, unsafeReason: 'bourbon_matched_rye' };
  if (/\bwheated\b/.test(raw) && !/\bwheated\b/.test(canonical)) return { match, record: null, unsafeReason: 'wheated_matched_non_wheated' };
  const requiredPhrases = [
    'limited edition', 'batch proof', 'barrel proof', 'single barrel', 'small batch select',
    'small batch', 'full proof', 'bottled in bond', 'private barrel', 'store pick', 'single barrel select'
  ];
  for (const phrase of requiredPhrases) {
    if (canonical.includes(phrase) && !raw.includes(phrase)) return { match, record: null, unsafeReason: `missing_modifier:${phrase}` };
  }
  for (const year of [...canonical.matchAll(/\b(\d{1,2})\s*year\b/g)].map((m) => m[1])) {
    if (!new RegExp(`\\b${year}\\s*(?:year|yr|y)\\b`).test(raw)) return { match, record: null, unsafeReason: `missing_age:${year}` };
  }
  for (const year of [...canonical.matchAll(/\b(\d{1,2})\s*y\b/g)].map((m) => m[1])) {
    if (!new RegExp(`\\b${year}\\s*(?:y|yr|year)\\b`).test(raw)) return { match, record: null, unsafeReason: `missing_age:${year}y` };
  }
  return { match, record, unsafeReason: null };
}

function kahnsProductTags(product) {
  return (product?.tags || [])
    .map((tag) => [tag?.group?.name, tag?.tag?.name].filter(Boolean).join(': '))
    .filter(Boolean);
}

function isKahnsBourbonRelevantProduct(product) {
  const text = `${product?.title || ''} ${stripHtml(product?.description || '')} ${kahnsProductTags(product).join(' ')} ${product?.tags_rollup || ''}`;
  if (/vodka|tequila|gin|rum|liqueur|seltzer|margarita|champagne|wine|beer|cognac|brandy|mezcal|ready to drink|cocktail|mint julep/i.test(text) && !/bourbon|whiskey|whisky|rye|blanton|eagle rare|weller|stagg|taylor|buffalo trace|michter|willett|old fitz|1792|booker|baker/i.test(text)) return false;
  return /bourbon|american whiskey|american whisky|rye whiskey|rye whisky|blanton|eagle rare|weller|stagg|taylor|buffalo trace|michter|willett|old fitz|1792|booker|baker|woodford|four roses|wild turkey|elijah craig|old forester|green river|bardstown|casey jones|peerless|new riff|knob creek|bulleit|maker'?s mark/i.test(text);
}

function kahnsProductUrl(product) {
  if (!product?.publicId) return 'https://www.kahnsfinewines.com/spirits?search=bourbon';
  const slug = String(product.title || 'product')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'product';
  return `https://www.kahnsfinewines.com/products/${slug}-${product.publicId}`;
}

function parsePaylessBarrelSelections(html) {
  const listRows = [...html.matchAll(/<li[^>]*>\s*<p[^>]*>([\s\S]*?)<\/p>\s*<\/li>/gi)]
    .map((match) => decodeHtml(stripHtml(match[1])))
    .filter(Boolean);
  if (listRows.length) return [...new Set(listRows.filter((line) => /bourbon|whiskey|whisky|barrel|single barrel|private|selection|rye|reserve|elijah craig|knob creek|woodford|nulu|whistlepig|rittenhouse|bulleit|jefferson|old elk|russel|russell|yellowstone|maker/i.test(line)))];

  const text = stripHtml(html)
    .replace(/\r/g, '\n')
    .replace(/Available at our East Street location/i, '\nAvailable at our East Street location')
    .replace(/Stop by and pick your bottle up today!/i, 'Stop by and pick your bottle up today!\n')
    .replace(/\s+[-•]\s+/g, '\n')
    .replace(/\n{2,}/g, '\n');
  const rows = [];
  for (const rawLine of text.split('\n')) {
    const line = decodeHtml(rawLine)
      .replace(/^[-•]\s*/, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!line || /^(Payless Liquors|Barrel Selections|Skip to Content|Home|Events|Locations|Contact)$/i.test(line)) continue;
    if (/Available at our East Street location|Stop by and pick your bottle/i.test(line)) continue;
    if (!/bourbon|whiskey|whisky|barrel|single barrel|private|selection|rye|reserve|elijah craig|knob creek|woodford|nulu|whistlepig|rittenhouse|bulleit|jefferson|old elk|russel|russell|yellowstone|maker/i.test(line)) continue;
    rows.push(line);
  }
  return [...new Set(rows)];
}

async function collectIndianaPaylessBarrelSelections(config, bible, observedAt) {
  const signals = [];
  const roadblocks = [];
  const res = await textFetch(IN_PAYLESS_BARREL_SELECTIONS_URL, { headers: { accept: 'text/html,*/*' }, timeoutMs: 18_000 });
  if (!res.ok) {
    roadblocks.push({
      state: config.id,
      source: 'Payless Liquors East Street barrel selections page',
      url: IN_PAYLESS_BARREL_SELECTIONS_URL,
      status: res.status || 0,
      error: res.error || `HTTP ${res.status}`,
      nextRoute: 'Retry the Payless barrel selections page or inspect whether the list moved to social/newsletter channels.'
    });
    return { signals, roadblocks };
  }
  const selections = parsePaylessBarrelSelections(res.text);
  for (const rawName of selections) {
    const { match, record } = bottleMatch(rawName, bible);
    if (!record) continue;
    signals.push({
      id: stableId([config.id, 'payless-east-street-barrel-selection', rawName]),
      state: config.id,
      sourceLabel: 'Payless Liquors East Street barrel selections',
      sourceUrl: IN_PAYLESS_BARREL_SELECTIONS_URL,
      rawName,
      canonicalBottleId: record.id,
      canonicalName: record.canonical,
      confidence: Math.max(0.76, match?.confidence || 0.5),
      eventType: 'retailer_store_inventory_result',
      locationPrecision: 'store_level',
      locationName: IN_PAYLESS_EAST_STREET_STORE.name,
      storeName: IN_PAYLESS_EAST_STREET_STORE.name,
      storeId: `payless-liquors:${IN_PAYLESS_EAST_STREET_STORE.id}`,
      storeAddress: IN_PAYLESS_EAST_STREET_STORE.address,
      city: IN_PAYLESS_EAST_STREET_STORE.city,
      stateCode: 'IN',
      postalCode: IN_PAYLESS_EAST_STREET_STORE.zip,
      zip: IN_PAYLESS_EAST_STREET_STORE.zip,
      lat: IN_PAYLESS_EAST_STREET_STORE.lat,
      lng: IN_PAYLESS_EAST_STREET_STORE.lng,
      quantity: 1,
      availabilityStatus: 'available_store_pick',
      availabilityLabel: 'Listed as available barrel selection',
      observedAt,
      canAlertAsInventory: true,
      canAlertAsWatch: true,
      inventorySemantics: 'Payless publishes this as a current East Street store barrel-selection list and says the bottles are available for pickup. Treat as retailer-published store-pick availability and verify before driving.',
      evidence: `Payless Liquors says ${rawName} is available at the East Street location in Indianapolis on its barrel selections page.`,
      raw: { chain: 'payless-liquors', store: IN_PAYLESS_EAST_STREET_STORE, barrelSelectionPage: true }
    });
  }
  if (!signals.length) {
    roadblocks.push({
      state: config.id,
      source: 'Payless Liquors East Street barrel selections page',
      url: IN_PAYLESS_BARREL_SELECTIONS_URL,
      status: 'reachable_no_matched_inventory',
      error: `Payless barrel selections page was reachable and exposed ${selections.length} candidate rows, but none matched the Bourbon Signal bottle bible.`,
      nextRoute: 'Review Payless store-pick names and tune bottle-bible aliases for private barrel/store-pick wording.'
    });
  }
  return { signals, roadblocks };
}

async function fetchKahnsProducts(pageIndex) {
  const input = {
    hasPromo: false,
    inStock: true,
    categories: [IN_KAHNS_SPIRITS_CATEGORY_PUBLIC_ID],
    text: 'bourbon',
    min_price: 0,
    max_price: 1_000_000,
    pagination: { pageIndex, pageSize: IN_KAHNS_PAGE_SIZE },
    categoryContext: { publicId: IN_KAHNS_SPIRITS_CATEGORY_PUBLIC_ID, slug: 'spirits' }
  };
  const url = `${IN_KAHNS_API_URL}?input=${encodeURIComponent(JSON.stringify({ json: input }))}`;
  const res = await textFetch(url, { headers: { accept: 'application/json,*/*', 'x-trpc-source': 'rsc' }, timeoutMs: 24_000 });
  if (!res.ok) return { ok: false, status: res.status, error: res.error || `HTTP ${res.status}`, url, products: [], count: 0 };
  try {
    const json = JSON.parse(res.text);
    const data = json?.result?.data?.json || {};
    return { ok: true, status: res.status, url, products: data.data || [], count: Number(data.count || 0) || 0 };
  } catch (error) {
    return { ok: false, status: res.status, error: error instanceof Error ? error.message : String(error), url, products: [], count: 0 };
  }
}

async function collectIndianaKahns(config, bible, observedAt) {
  const signals = [];
  const roadblocks = [];
  let totalCount = 0;
  const seenProducts = new Set();
  for (let pageIndex = 0; pageIndex < IN_KAHNS_MAX_PAGES; pageIndex++) {
    const page = await fetchKahnsProducts(pageIndex);
    if (!page.ok) {
      roadblocks.push({
        state: config.id,
        source: "Kahn's Fine Wines & Spirits in-stock bourbon API",
        url: page.url || IN_KAHNS_API_URL,
        status: page.status || 0,
        error: page.error || "Kahn's product API did not return parseable inventory JSON.",
        nextRoute: "Retry Kahn's Sante product.getAll endpoint with the JSON-envelope tRPC input or inspect updated app chunks."
      });
      break;
    }
    totalCount = Math.max(totalCount, page.count || 0);
    for (const product of page.products || []) {
      if (!product?.id || seenProducts.has(product.id)) continue;
      seenProducts.add(product.id);
      if (!isKahnsBourbonRelevantProduct(product)) continue;
      const rawName = product.title || product.bigcomTitle || product.sku || "Kahn's product";
      const { match, record, unsafeReason } = cityHiveSafeBottleMatch(rawName, bible);
      if (!record) continue;
      const quantity = Math.max(0, Number(product.qtyAvailableStandalone ?? product.qtyInStock_rollup ?? 0) || 0);
      if (quantity <= 0) continue;
      const price = Number(product.pricePromo ?? product.price ?? 0) / 100 || null;
      const receivedDates = (product.inventories || []).map((inv) => inv?.dateReceived).filter(Boolean).sort();
      const latestReceived = receivedDates.at(-1) || null;
      const tags = kahnsProductTags(product);
      const sourceUrl = kahnsProductUrl(product);
      signals.push({
        id: stableId([config.id, 'kahns-store-inventory', product.id, quantity, product.pricePromo ?? product.price ?? null]),
        state: config.id,
        sourceLabel: "Kahn's Fine Wines & Spirits in-stock bourbon API",
        sourceUrl,
        rawName,
        canonicalBottleId: record.id,
        canonicalName: record.canonical,
        confidence: Math.max(0.8, match?.confidence || 0.5),
        eventType: 'retailer_store_inventory_result',
        locationPrecision: 'store_level',
        locationName: IN_KAHNS_STORE.name,
        storeName: IN_KAHNS_STORE.name,
        storeId: `kahns:${IN_KAHNS_STORE.id}`,
        storeAddress: IN_KAHNS_STORE.address,
        city: IN_KAHNS_STORE.city,
        stateCode: 'IN',
        postalCode: IN_KAHNS_STORE.zip,
        zip: IN_KAHNS_STORE.zip,
        lat: IN_KAHNS_STORE.lat,
        lng: IN_KAHNS_STORE.lng,
        quantity,
        price,
        availabilityStatus: 'in_stock',
        availabilityLabel: 'In stock',
        observedAt,
        canAlertAsInventory: true,
        canAlertAsWatch: true,
        inventorySemantics: "Kahn's public Sante e-commerce API reports in-stock spirits products and available standalone quantity for online/store purchase. Treat as retailer-published availability and verify before driving.",
        evidence: `Kahn's public shop API reports ${quantity} available ${rawName}${price ? ` at $${price.toFixed(2)}` : ''}${latestReceived ? `; latest inventory receipt ${latestReceived}` : ''}.`,
        raw: { chain: 'kahns', product: { id: product.id, publicId: product.publicId, sku: product.sku, upc: product.upc, tags, qtyInStockRollup: product.qtyInStock_rollup, qtyAvailableStandalone: product.qtyAvailableStandalone, latestReceived }, matchGuard: unsafeReason }
      });
    }
    if (!page.products?.length || (pageIndex + 1) * IN_KAHNS_PAGE_SIZE >= totalCount) break;
    await sleep(300);
  }
  if (!signals.length) {
    roadblocks.push({
      state: config.id,
      source: "Kahn's Fine Wines & Spirits in-stock bourbon API",
      url: 'https://www.kahnsfinewines.com/spirits?search=bourbon',
      status: 'reachable_no_matched_inventory',
      error: `Kahn's product API returned ${totalCount || 'unknown'} in-stock search rows but no Bourbon Signal bottle matches survived relevance filtering.`,
      nextRoute: "Inspect Kahn's product tags/results and tune the bourbon relevance or bottle-bible matching rules."
    });
  }
  return { signals, roadblocks };
}

async function readIndianaCityHiveCache() {
  try {
    const cache = JSON.parse(await readFile(IN_CITYHIVE_ARTIFACT_PATH, 'utf8'));
    const generatedMs = new Date(cache.generatedAt || 0).getTime();
    const fresh = Number.isFinite(generatedMs) && Date.now() - generatedMs <= IN_CITYHIVE_CACHE_MAX_AGE_MS;
    if (!fresh) return null;
    const signals = Array.isArray(cache.signals) ? cache.signals : [];
    const roadblocks = Array.isArray(cache.roadblocks) ? cache.roadblocks : [];
    if (!signals.some((signal) => signal.eventType === 'cityhive_store_inventory_result')) return null;
    return { ...cache, signals, roadblocks };
  } catch {
    return null;
  }
}

async function writeIndianaCityHiveCache(signals, roadblocks) {
  if (!signals.some((signal) => signal.eventType === 'cityhive_store_inventory_result')) return;
  const nextChains = indianaCityHivePositiveInventoryChains(signals);
  const previous = await readIndianaCityHiveCache();
  const previousChains = indianaCityHivePositiveInventoryChains(previous?.signals || []);
  if (previousChains.size >= 3 && nextChains.size < previousChains.size) {
    return;
  }
  const payload = {
    generatedAt: new Date().toISOString(),
    source: 'Indiana CityHive retailer inventory cache',
    cacheMaxAgeMs: IN_CITYHIVE_CACHE_MAX_AGE_MS,
    sourceChainCount: nextChains.size,
    sourceChains: [...nextChains].sort(),
    signalCount: signals.length,
    positiveInventorySignalCount: signals.filter((signal) => signal.eventType === 'cityhive_store_inventory_result').length,
    storeLocationSignalCount: signals.filter((signal) => signal.eventType === 'retailer_store_location').length,
    signals,
    roadblocks
  };
  await mkdir(path.dirname(IN_CITYHIVE_ARTIFACT_PATH), { recursive: true });
  await writeFile(IN_CITYHIVE_ARTIFACT_PATH, JSON.stringify(payload, null, 2));
}

function cachedIndianaCityHiveSignals(cache, observedAt) {
  return (cache?.signals || []).map((signal) => ({
    ...signal,
    observedAt: signal.observedAt || cache.generatedAt || observedAt,
    raw: { ...(signal.raw || {}), cacheFallback: true, cacheGeneratedAt: cache.generatedAt, artifactPath: IN_CITYHIVE_ARTIFACT_PATH }
  }));
}

function indianaCityHiveSignalChain(signal) {
  if (signal?.raw?.chain) return signal.raw.chain;
  const label = String(signal?.sourceLabel || signal?.source || '');
  const source = IN_CITYHIVE_SOURCES.find((item) => label.includes(item.chainName) || label.includes(item.sourceLabel));
  return source?.id || null;
}

function indianaCityHivePositiveInventoryChains(signals = []) {
  return new Set(signals
    .filter((signal) => signal.eventType === 'cityhive_store_inventory_result')
    .map(indianaCityHiveSignalChain)
    .filter(Boolean));
}

function mergeMissingIndianaCityHiveCacheChains(signals, cache, observedAt) {
  if (!cache) return 0;
  const liveChains = new Set(signals
    .filter((signal) => /cityhive|retailer_store_location/i.test(String(signal.eventType || '')))
    .map(indianaCityHiveSignalChain)
    .filter(Boolean));
  if (!liveChains.size) return 0;
  const cached = cachedIndianaCityHiveSignals(cache, observedAt);
  let added = 0;
  for (const signal of cached) {
    const chain = indianaCityHiveSignalChain(signal);
    if (!chain || liveChains.has(chain)) continue;
    signals.push(signal);
    added += 1;
  }
  return added;
}

async function readTennesseeCityHiveCache() {
  try {
    const cache = JSON.parse(await readFile(TN_CITYHIVE_ARTIFACT_PATH, 'utf8'));
    const generatedMs = new Date(cache.generatedAt || 0).getTime();
    const fresh = Number.isFinite(generatedMs) && Date.now() - generatedMs <= TN_CITYHIVE_CACHE_MAX_AGE_MS;
    if (!fresh) return null;
    const signals = Array.isArray(cache.signals) ? cache.signals : [];
    const roadblocks = Array.isArray(cache.roadblocks) ? cache.roadblocks : [];
    if (!signals.some((signal) => signal.eventType === 'cityhive_store_inventory_result')) return null;
    return { ...cache, signals, roadblocks };
  } catch {
    return null;
  }
}

function cachedTennesseeCityHiveSignals(cache, observedAt) {
  return (cache?.signals || []).map((signal) => ({
    ...signal,
    observedAt: signal.observedAt || cache.generatedAt || observedAt,
    raw: { ...(signal.raw || {}), cacheFallback: true, cacheGeneratedAt: cache.generatedAt, artifactPath: TN_CITYHIVE_ARTIFACT_PATH }
  }));
}

function tennesseeCityHivePositiveInventoryChains(signals = []) {
  return new Set(signals
    .filter((signal) => signal.eventType === 'cityhive_store_inventory_result')
    .map((signal) => signal?.raw?.chain)
    .filter(Boolean));
}

async function writeTennesseeCityHiveCache(signals, roadblocks) {
  if (!signals.some((signal) => signal.eventType === 'cityhive_store_inventory_result')) return;
  const nextChains = tennesseeCityHivePositiveInventoryChains(signals);
  const previous = await readTennesseeCityHiveCache();
  const previousChains = tennesseeCityHivePositiveInventoryChains(previous?.signals || []);
  if (previousChains.size >= 2 && nextChains.size < previousChains.size) return;
  const payload = {
    generatedAt: new Date().toISOString(),
    source: 'Tennessee CityHive retailer inventory cache',
    cacheMaxAgeMs: TN_CITYHIVE_CACHE_MAX_AGE_MS,
    sourceChainCount: nextChains.size,
    sourceChains: [...nextChains].sort(),
    signalCount: signals.length,
    positiveInventorySignalCount: signals.filter((signal) => signal.eventType === 'cityhive_store_inventory_result').length,
    storeLocationSignalCount: signals.filter((signal) => signal.eventType === 'retailer_store_location').length,
    signals,
    roadblocks
  };
  await mkdir(path.dirname(TN_CITYHIVE_ARTIFACT_PATH), { recursive: true });
  await writeFile(TN_CITYHIVE_ARTIFACT_PATH, JSON.stringify(payload, null, 2));
}

async function collectIndianaCityHive(config, bible, observedAt) {
  const signals = [];
  const roadblocks = [];
  const cache = await readIndianaCityHiveCache();
  const cacheAgeMs = cache?.generatedAt ? Date.now() - new Date(cache.generatedAt).getTime() : Infinity;
  if (process.env.BOURBON_SIGNAL_IN_FORCE_CITYHIVE_LIVE !== '1' && cache && Number.isFinite(cacheAgeMs) && cacheAgeMs >= 0 && cacheAgeMs <= IN_CITYHIVE_CACHE_MAX_AGE_MS) {
    return {
      signals: cachedIndianaCityHiveSignals(cache, observedAt),
      roadblocks: [
        ...(cache.roadblocks || []),
        {
          state: config.id,
          source: 'Indiana CityHive retailer inventory cache reuse',
          url: IN_CITYHIVE_ARTIFACT_PATH,
          status: 200,
          error: `Using ${cache.signals.length} cached CityHive store-level rows from ${cache.generatedAt}; scheduled refresh avoids repeated retailer 429s unless BOURBON_SIGNAL_IN_FORCE_CITYHIVE_LIVE=1.`,
          nextRoute: 'Force live CityHive refresh during a maintenance window; otherwise keep cache-backed rows inside the freshness window.'
        }
      ]
    };
  }
  if (process.env.BOURBON_SIGNAL_IN_FORCE_CITYHIVE_LIVE !== '1' && cache && Number.isFinite(cacheAgeMs) && cacheAgeMs >= 0 && cacheAgeMs < IN_CITYHIVE_LIVE_REFRESH_MIN_AGE_MS) {
    return { signals: cachedIndianaCityHiveSignals(cache, observedAt), roadblocks: cache.roadblocks || [] };
  }
  const seenPageFirstProducts = new Set();
  const seenProductOptions = new Set();
  const seenStores = new Set();

  for (const source of IN_CITYHIVE_SOURCES) {
    let sourceBlocked = false;
    for (const seedUrl of source.urls) {
      if (sourceBlocked) break;
      const crawlUrls = cityHivePageUrls(seedUrl);
      const seenCrawlUrls = new Set(crawlUrls);
      let merchantPagesQueued = false;
      for (let crawlIndex = 0; crawlIndex < crawlUrls.length; crawlIndex++) {
        const url = crawlUrls[crawlIndex];
        const res = await textFetch(url, { headers: { accept: 'text/html,*/*' }, timeoutMs: 24_000 });
        if (!res.ok) {
          roadblocks.push({
            state: config.id,
            source: source.sourceLabel,
            url,
            status: res.status || 0,
            error: res.error || `HTTP ${res.status}`,
            nextRoute: 'Retry the CityHive page or inspect rendered/network calls for current product JSON shape.'
          });
          if (res.status === 429) sourceBlocked = true;
          break;
        }
        const blobs = cityHiveJsonBlobs(res.text);
        if (!merchantPagesQueued && cityHiveShouldExpandMerchants(seedUrl)) {
          merchantPagesQueued = true;
          for (const merchant of cityHivePriorityMerchants(blobs, source)) {
            for (const merchantUrl of cityHiveMerchantPageUrls(seedUrl, merchant.id)) {
              if (seenCrawlUrls.has(merchantUrl)) continue;
              seenCrawlUrls.add(merchantUrl);
              crawlUrls.push(merchantUrl);
            }
          }
        }
        const products = cityHiveProducts(blobs);
        const firstKey = products.slice(0, 3).map((p) => p?.id || p?.name).join('|');
        const selectedMerchantId = new URL(url).searchParams.get('merchant-id') || 'default';
        const repeatKey = `${source.id}|${seedUrl}|${selectedMerchantId}|${firstKey}`;
        if (!products.length || seenPageFirstProducts.has(repeatKey)) continue;
        seenPageFirstProducts.add(repeatKey);

        for (const cfg of cityHiveMerchantConfigs(blobs)) {
          const merchant = cfg?.merchant || cfg;
          if (!merchant?.id || seenStores.has(`${source.id}|${merchant.id}`)) continue;
          seenStores.add(`${source.id}|${merchant.id}`);
          const a = cityHiveAddressParts(merchant.address || {});
          if ((a.state || '').toUpperCase() && (a.state || '').toUpperCase() !== 'IN') continue;
          signals.push({
            id: stableId([config.id, 'cityhive-store-location', source.id, merchant.id]),
            state: config.id,
            sourceLabel: `${source.chainName} CityHive store locator`,
            sourceUrl: source.baseUrl,
            rawName: merchant.display_name || merchant.name,
            canonicalBottleId: null,
            canonicalName: null,
            confidence: 0.72,
            eventType: 'retailer_store_location',
            locationPrecision: 'store_level',
            locationName: merchant.display_name || merchant.name,
            storeName: merchant.display_name || merchant.name,
            storeId: `${source.id}:${merchant.id}`,
            storeAddress: a.fullAddress || [a.street, a.city, 'IN', a.zip].filter(Boolean).join(', '),
            city: a.city,
            county: a.county,
            stateCode: 'IN',
            postalCode: a.zip,
            zip: a.zip,
            lat: a.lat,
            lng: a.lng,
            quantity: 0,
            observedAt,
            canAlertAsInventory: false,
            canAlertAsWatch: false,
            inventorySemantics: `${source.chainName} CityHive store rows identify retailer locations/order-capable branches. Store rows are not bottle inventory by themselves.`,
            evidence: `${source.chainName} CityHive configuration lists ${merchant.display_name || merchant.name}${a.fullAddress ? ` at ${a.fullAddress}` : ''}.`,
            raw: { chain: source.id, merchant }
          });
        }

        for (const product of products) {
          for (const merchant of product.merchants || []) {
            for (const option of merchant.product_options || []) {
              if (!isBourbonRelevantProduct(product, option)) continue;
              const key = `${source.id}|${option.merchant_id}|${option.product_id}|${option.option_id}`;
              if (seenProductOptions.has(key)) continue;
              seenProductOptions.add(key);
              const rawName = option.option_display_data?.name || product.name;
              const { match, record, unsafeReason } = cityHiveSafeBottleMatch(rawName, bible);
              if (!record) continue;
              const quantity = Number(option.quantity || 0) || 0;
              const fullAddress = option.full_address || null;
              const city = fullAddress?.match(/,\s*([^,]+),\s*IN\s+\d{5}/i)?.[1] || null;
              const zip = fullAddress?.match(/\bIN\s+(\d{5}(?:-\d{4})?)\b/i)?.[1] || null;
              const size = option.option_params?.size ? `${option.option_params.size.quantity}${option.option_params.size.measure || ''}` : null;
              signals.push({
                id: stableId([config.id, 'cityhive-store-inventory', source.id, option.merchant_id, option.option_id, quantity, option.price]),
                state: config.id,
                sourceLabel: source.sourceLabel,
                sourceUrl: option.product_url || url,
                rawName,
                canonicalBottleId: record.id,
                canonicalName: record.canonical,
                confidence: Math.max(0.78, match?.confidence || 0.5),
                eventType: quantity > 0 ? 'cityhive_store_inventory_result' : 'cityhive_store_inventory_out_of_stock',
                locationPrecision: 'store_level',
                locationName: option.merchant_name || source.chainName,
                storeName: option.merchant_name || source.chainName,
                storeId: option.merchant_id ? `${source.id}:${option.merchant_id}` : null,
                storeAddress: fullAddress,
                city,
                stateCode: 'IN',
                postalCode: zip,
                zip,
                lat: Number(option.coordinates?.[1]) || null,
                lng: Number(option.coordinates?.[0]) || null,
                quantity,
                price: Number(option.price || 0) || null,
                availabilityStatus: quantity > 0 ? 'in_stock' : 'out_of_stock',
                availabilityLabel: quantity > 0 ? 'In stock' : 'Out of stock',
                observedAt,
                canAlertAsInventory: quantity > 0,
                canAlertAsWatch: true,
                inventorySemantics: `${source.chainName} CityHive pages embed store-level product option quantity and price for the selected branch. Treat as retailer-published pickup/order availability and ask users to verify before driving.`,
                evidence: `${source.chainName} CityHive reports ${quantity} ${size || 'unit'}${quantity === 1 ? '' : 's'} of ${rawName}${option.merchant_name ? ` at ${option.merchant_name}` : ''}${fullAddress ? ` (${fullAddress})` : ''}${option.price ? ` for $${Number(option.price).toFixed(2)}` : ''}.`,
                raw: { chain: source.id, product: { id: product.id, name: product.name, basic_category: product.basic_category }, option, matchGuard: unsafeReason }
              });
            }
          }
        }
        await sleep(450);
      }
    }
  }

  if (signals.some((signal) => signal.eventType === 'cityhive_store_inventory_result')) {
    const cacheAdded = mergeMissingIndianaCityHiveCacheChains(signals, cache, observedAt);
    if (cacheAdded) {
      roadblocks.push({
        state: config.id,
        source: 'Indiana CityHive retailer inventory cache',
        url: IN_CITYHIVE_ARTIFACT_PATH,
        status: 'partial_fresh_cache_merge',
        error: `Live CityHive fetch produced inventory but missed ${cacheAdded} cached rows from source chains that did not refresh cleanly; merged fresh cache from ${cache.generatedAt}.`,
        nextRoute: 'Keep per-store CityHive expansion paced and let missing chains refresh on the next scheduled run.'
      });
    }
  }

  if (!signals.some((signal) => signal.eventType === 'cityhive_store_inventory_result')) {
    if (cache) {
      signals.push(...cachedIndianaCityHiveSignals(cache, observedAt));
      roadblocks.push({
        state: config.id,
        source: 'Indiana CityHive retailer inventory cache',
        url: IN_CITYHIVE_ARTIFACT_PATH,
        status: 'fresh_cache_fallback',
        error: `Live CityHive fetch did not produce positive inventory rows; reused fresh cache from ${cache.generatedAt}.`,
        nextRoute: 'Keep CityHive requests paced and retry live retailer pages on next scheduled run.'
      });
    } else {
      roadblocks.push({
        state: config.id,
        source: 'Indiana CityHive retailer inventory pages',
        url: IN_CITYHIVE_SOURCES.map((source) => source.baseUrl).join(', '),
        status: 'reachable_no_inventory_rows',
        error: 'CityHive pages were reachable but no positive bourbon/whiskey store inventory rows were parsed.',
        nextRoute: 'Inspect embedded CityHive product JSON and pagination parameters; selected stores may simply be out of relevant products.'
      });
    }
  } else {
    await writeIndianaCityHiveCache(signals, roadblocks);
  }
  return { signals, roadblocks };
}

async function collectTennesseeCityHive(config, bible, observedAt) {
  const signals = [];
  const roadblocks = [];
  const cache = await readTennesseeCityHiveCache();
  const cacheAgeMs = cache?.generatedAt ? Date.now() - new Date(cache.generatedAt).getTime() : Infinity;
  if (process.env.BOURBON_SIGNAL_TN_FORCE_CITYHIVE_LIVE !== '1' && cache && Number.isFinite(cacheAgeMs) && cacheAgeMs >= 0 && cacheAgeMs <= TN_CITYHIVE_CACHE_MAX_AGE_MS) {
    return {
      signals: cachedTennesseeCityHiveSignals(cache, observedAt),
      roadblocks: [
        ...(cache.roadblocks || []),
        {
          state: config.id,
          source: 'Tennessee CityHive retailer inventory cache reuse',
          url: TN_CITYHIVE_ARTIFACT_PATH,
          status: 200,
          error: `Using ${cache.signals.length} cached CityHive store-level rows from ${cache.generatedAt}; scheduled refresh avoids repeated retailer 429s unless BOURBON_SIGNAL_TN_FORCE_CITYHIVE_LIVE=1.`,
          nextRoute: 'Force live Tennessee CityHive refresh during a maintenance window; otherwise keep cache-backed rows inside the freshness window.'
        }
      ]
    };
  }
  const seenProductOptions = new Set();
  const seenStores = new Set();
  const seenPageFirstProducts = new Set();

  for (const source of TN_CITYHIVE_SOURCES) {
    let sourceBlocked = false;
    for (const seedUrl of source.urls) {
      if (sourceBlocked) break;
      for (const url of cityHivePageUrls(seedUrl, TN_CITYHIVE_MAX_PAGES)) {
        const res = await textFetch(url, { headers: { accept: 'text/html,*/*' }, timeoutMs: 24_000 });
        if (!res.ok) {
          roadblocks.push({
            state: config.id,
            source: source.sourceLabel,
            url,
            status: res.status || 0,
            error: res.error || `HTTP ${res.status}`,
            nextRoute: 'Retry the CityHive page or inspect rendered/network calls for current product JSON shape.'
          });
          if (res.status === 429) sourceBlocked = true;
          break;
        }

        const blobs = cityHiveJsonBlobs(res.text);
        const products = cityHiveProducts(blobs);
        const firstKey = products.slice(0, 3).map((p) => p?.id || p?.name).join('|');
        const repeatKey = `${source.id}|${seedUrl}|${firstKey}`;
        if (!products.length || seenPageFirstProducts.has(repeatKey)) continue;
        seenPageFirstProducts.add(repeatKey);

        for (const cfg of cityHiveMerchantConfigs(blobs)) {
          const merchant = cfg?.merchant || cfg;
          if (!merchant?.id || seenStores.has(`${source.id}|${merchant.id}`)) continue;
          seenStores.add(`${source.id}|${merchant.id}`);
          const a = cityHiveAddressParts(merchant.address || {});
          if ((a.state || '').toUpperCase() && (a.state || '').toUpperCase() !== 'TN') continue;
          signals.push({
            id: stableId([config.id, 'cityhive-store-location', source.id, merchant.id]),
            state: config.id,
            sourceLabel: `${source.chainName} CityHive store locator`,
            sourceUrl: source.baseUrl,
            rawName: merchant.display_name || merchant.name,
            canonicalBottleId: null,
            canonicalName: null,
            confidence: 0.72,
            eventType: 'retailer_store_location',
            locationPrecision: 'store_level',
            locationName: merchant.display_name || merchant.name,
            storeName: merchant.display_name || merchant.name,
            storeId: `${source.id}:${merchant.id}`,
            storeAddress: a.fullAddress || [a.street, a.city, 'TN', a.zip].filter(Boolean).join(', '),
            city: a.city,
            county: a.county,
            stateCode: 'TN',
            postalCode: a.zip,
            zip: a.zip,
            lat: a.lat,
            lng: a.lng,
            quantity: 0,
            observedAt,
            canAlertAsInventory: false,
            canAlertAsWatch: false,
            inventorySemantics: `${source.chainName} CityHive store rows identify retailer locations/order-capable branches. Store rows are not bottle inventory by themselves.`,
            evidence: `${source.chainName} CityHive configuration lists ${merchant.display_name || merchant.name}${a.fullAddress ? ` at ${a.fullAddress}` : ''}.`,
            raw: { chain: source.id, merchant }
          });
        }

        for (const product of products) {
          for (const merchant of product.merchants || []) {
            for (const option of merchant.product_options || []) {
              if (!isBourbonRelevantProduct(product, option)) continue;
              const key = `${source.id}|${option.merchant_id}|${option.product_id}|${option.option_id}`;
              if (seenProductOptions.has(key)) continue;
              seenProductOptions.add(key);
              const rawName = option.option_display_data?.name || product.name;
              const { match, record, unsafeReason } = cityHiveSafeBottleMatch(rawName, bible);
              if (!record) continue;
              const quantity = Number(option.quantity || 0) || 0;
              const fullAddress = option.full_address || null;
              const city = fullAddress?.match(/,\s*([^,]+),\s*TN\s+\d{5}/i)?.[1] || null;
              const zip = fullAddress?.match(/\bTN\s+(\d{5}(?:-\d{4})?)\b/i)?.[1] || null;
              const size = option.option_params?.size ? `${option.option_params.size.quantity}${option.option_params.size.measure || ''}` : null;
              signals.push({
                id: stableId([config.id, 'cityhive-store-inventory', source.id, option.merchant_id, option.option_id, quantity, option.price]),
                state: config.id,
                sourceLabel: source.sourceLabel,
                sourceUrl: option.product_url || url,
                rawName,
                canonicalBottleId: record.id,
                canonicalName: record.canonical,
                confidence: Math.max(0.78, match?.confidence || 0.5),
                eventType: quantity > 0 ? 'cityhive_store_inventory_result' : 'cityhive_store_inventory_out_of_stock',
                locationPrecision: 'store_level',
                locationName: option.merchant_name || source.chainName,
                storeName: option.merchant_name || source.chainName,
                storeId: option.merchant_id ? `${source.id}:${option.merchant_id}` : null,
                storeAddress: fullAddress,
                city,
                stateCode: 'TN',
                postalCode: zip,
                zip,
                lat: Number(option.coordinates?.[1]) || null,
                lng: Number(option.coordinates?.[0]) || null,
                quantity,
                price: Number(option.price || 0) || null,
                availabilityStatus: quantity > 0 ? 'in_stock' : 'out_of_stock',
                availabilityLabel: quantity > 0 ? 'In stock' : 'Out of stock',
                observedAt,
                canAlertAsInventory: quantity > 0,
                canAlertAsWatch: true,
                inventorySemantics: `${source.chainName} CityHive pages embed store-level product option quantity and price for the selected branch. Treat as retailer-published pickup/order availability and ask users to verify before driving.`,
                evidence: `${source.chainName} CityHive reports ${quantity} ${size || 'unit'}${quantity === 1 ? '' : 's'} of ${rawName}${option.merchant_name ? ` at ${option.merchant_name}` : ''}${fullAddress ? ` (${fullAddress})` : ''}${option.price ? ` for $${Number(option.price).toFixed(2)}` : ''}.`,
                raw: { chain: source.id, product: { id: product.id, name: product.name, basic_category: product.basic_category }, option, matchGuard: unsafeReason }
              });
            }
          }
        }
        await sleep(TN_CITYHIVE_PAGE_DELAY_MS);
      }
    }
    await sleep(TN_CITYHIVE_SOURCE_DELAY_MS);
  }

  if (!signals.some((signal) => signal.eventType === 'cityhive_store_inventory_result')) {
    if (cache) {
      signals.push(...cachedTennesseeCityHiveSignals(cache, observedAt));
      roadblocks.push({
        state: config.id,
        source: 'Tennessee CityHive retailer inventory cache',
        url: TN_CITYHIVE_ARTIFACT_PATH,
        status: 'fresh_cache_fallback',
        error: `Live Tennessee CityHive fetch did not produce positive inventory rows; reused fresh cache from ${cache.generatedAt}.`,
        nextRoute: 'Keep CityHive requests paced and retry live retailer pages on next scheduled run.'
      });
    } else {
      roadblocks.push({
        state: config.id,
        source: 'Tennessee CityHive retailer inventory pages',
        url: TN_CITYHIVE_SOURCES.map((source) => source.baseUrl).join(', '),
        status: 'reachable_no_inventory_rows',
        error: 'CityHive pages were reachable but no positive bourbon/whiskey store inventory rows were parsed.',
        nextRoute: 'Inspect embedded CityHive product JSON and pagination parameters; selected stores may simply be out of relevant products.'
      });
    }
  } else {
    await writeTennesseeCityHiveCache(signals, roadblocks);
  }
  return { signals, roadblocks };
}

function isCoolSpringsBourbonRelevantProduct(item) {
  const text = `${item?.name || ''} ${item?.brand || ''} ${item?.department || ''} ${(item?.itemGroups || []).join(' ')}`;
  if (/\bcream\b/i.test(text) && !/\b(whiskey|whisky|rye)\b/i.test(text)) return false;
  if (/vodka|gin|rum|tequila|liqueur|cordial|wine|beer|seltzer|cocktail|ready to drink|coffee|bitters|margarita|brandy|cognac|mezcal/i.test(text) && !/bourbon|whiskey|whisky|rye|blanton|eagle rare|weller|stagg|taylor|buffalo trace|michter|willett|old fitz|1792|booker|baker|four roses|woodford|wild turkey|elijah craig|old forester|green river|bardstown|knob creek|bulleit|maker/i.test(text)) return false;
  return /bourbon|american whiskey|american whisky|rye whiskey|rye whisky|blanton|eagle rare|weller|stagg|taylor|buffalo trace|michter|willett|old fitz|1792|booker|baker|woodford|four roses|wild turkey|elijah craig|old forester|green river|bardstown|knob creek|bulleit|maker'?s mark|benchmark|willett/i.test(text);
}

function coolSpringsProductUrl(item) {
  return item?.id ? new URL(`i/${item.id}`, TN_COOL_SPRINGS_BASE_URL).toString() : new URL('b?q=bourbon', TN_COOL_SPRINGS_BASE_URL).toString();
}

async function fetchCoolSpringsProducts(pageNumber) {
  const body = JSON.stringify({ pn: pageNumber, ps: TN_COOL_SPRINGS_PAGE_SIZE, q: 'bourbon' });
  const res = await textFetch(new URL('api/b/', TN_COOL_SPRINGS_BASE_URL).toString(), {
    method: 'POST',
    body,
    headers: { accept: 'application/json,*/*', 'content-type': 'application/json' },
    timeoutMs: 24_000
  });
  if (!res.ok) return { ok: false, status: res.status, error: res.error || `HTTP ${res.status}`, items: [], totalCount: 0 };
  try {
    const json = JSON.parse(res.text);
    return { ok: true, status: res.status, items: Array.isArray(json.items) ? json.items : [], totalCount: Number(json.totalCount || 0) || 0 };
  } catch (error) {
    return { ok: false, status: res.status, error: error instanceof Error ? error.message : String(error), items: [], totalCount: 0 };
  }
}

async function collectTennesseeCoolSprings(config, bible, observedAt) {
  const signals = [];
  const roadblocks = [];
  const seenItems = new Set();
  let totalCount = 0;
  for (let pageNumber = 1; pageNumber <= TN_COOL_SPRINGS_MAX_PAGES; pageNumber++) {
    const page = await fetchCoolSpringsProducts(pageNumber);
    if (!page.ok) {
      roadblocks.push({
        state: config.id,
        source: 'Cool Springs Wine & Spirits public catalog API',
        url: new URL('api/b/', TN_COOL_SPRINGS_BASE_URL).toString(),
        status: page.status || 0,
        error: page.error || 'Cool Springs catalog API did not return parseable inventory JSON.',
        nextRoute: 'Retry the BottleCapps-style catalog API or inspect updated app chunks for api/b request shape.'
      });
      break;
    }
    totalCount = Math.max(totalCount, page.totalCount || 0);
    for (const item of page.items) {
      if (!item?.id || seenItems.has(item.id)) continue;
      seenItems.add(item.id);
      if (!isCoolSpringsBourbonRelevantProduct(item)) continue;
      if (item.outOfStock && !item.sellOutOfStock) continue;
      const quantity = Math.max(0, Number(item.maxBaseQuantity ?? item.maxQuantity ?? 0) || 0);
      if (quantity <= 0) continue;
      const rawName = [item.name, item.size].filter(Boolean).join(' ');
      const { match, record, unsafeReason } = cityHiveSafeBottleMatch(rawName, bible);
      if (!record) continue;
      const price = Number(item.actualPrice ?? item.suggestedPrice ?? 0) || null;
      signals.push({
        id: stableId([config.id, 'cool-springs-store-inventory', item.id, quantity, price]),
        state: config.id,
        sourceLabel: 'Cool Springs Wine & Spirits public catalog API',
        sourceUrl: coolSpringsProductUrl(item),
        rawName,
        canonicalBottleId: record.id,
        canonicalName: record.canonical,
        confidence: Math.max(0.8, match?.confidence || 0.5),
        eventType: 'retailer_store_inventory_result',
        locationPrecision: 'store_level',
        locationName: TN_COOL_SPRINGS_STORE.name,
        storeName: TN_COOL_SPRINGS_STORE.name,
        storeId: `cool-springs:${TN_COOL_SPRINGS_STORE.id}`,
        storeAddress: TN_COOL_SPRINGS_STORE.address,
        city: TN_COOL_SPRINGS_STORE.city,
        stateCode: 'TN',
        postalCode: TN_COOL_SPRINGS_STORE.zip,
        zip: TN_COOL_SPRINGS_STORE.zip,
        lat: TN_COOL_SPRINGS_STORE.lat,
        lng: TN_COOL_SPRINGS_STORE.lng,
        quantity,
        price,
        availabilityStatus: 'in_stock',
        availabilityLabel: 'In stock',
        observedAt,
        canAlertAsInventory: true,
        canAlertAsWatch: true,
        inventorySemantics: 'Cool Springs Wine & Spirits public online catalog reports item price, out-of-stock flag, and max base quantity for pickup/order. Treat as retailer-published availability and ask users to verify before driving.',
        evidence: `Cool Springs Wine & Spirits public catalog reports ${quantity} available ${rawName}${price ? ` at $${price.toFixed(2)}` : ''}.`,
        raw: { chain: 'cool-springs-wine-spirits', item, matchGuard: unsafeReason }
      });
    }
    if (!page.items.length || pageNumber * TN_COOL_SPRINGS_PAGE_SIZE >= totalCount) break;
    await sleep(500);
  }
  if (!signals.length) {
    roadblocks.push({
      state: config.id,
      source: 'Cool Springs Wine & Spirits public catalog API',
      url: new URL('b?q=bourbon', TN_COOL_SPRINGS_BASE_URL).toString(),
      status: 'reachable_no_matched_inventory',
      error: `Cool Springs catalog returned ${totalCount || 'unknown'} bourbon search rows but no positive bottle-bible matches survived filtering.`,
      nextRoute: 'Inspect Cool Springs API rows and tune bottle-bible aliases or relevance filters without accepting unsafe generic matches.'
    });
  }
  return { signals, roadblocks };
}

async function collectTennessee(config, bible) {
  const observedAt = new Date().toISOString();
  const cityHive = await collectTennesseeCityHive(config, bible, observedAt);
  const coolSprings = await collectTennesseeCoolSprings(config, bible, observedAt);
  return { signals: [...cityHive.signals, ...coolSprings.signals], roadblocks: [...cityHive.roadblocks, ...coolSprings.roadblocks] };
}

function specsProductNameFromText(text, fallbackUrl) {
  const compact = String(text || '').replace(/\s+/g, ' ').trim();
  const title = compact.match(/Leave a Review \|\s*([^|]{4,120}?)(?:Available Sizes|Product Details|Type)/i)?.[1]
    || compact.match(/^([^|]{4,120}?)(?:Available Sizes|Product Details|Type)/i)?.[1]
    || fallbackUrl.split('/').filter(Boolean).pop()?.replace(/-/g, ' ')
    || 'Spec\'s bourbon product';
  return title.replace(/•.*$/, '').replace(/\bSpec’s Wines.*$/i, '').trim();
}

async function collectTexas(config, bible) {
  const observedAt = new Date().toISOString();
  const signals = [];
  const roadblocks = [];

  for (const source of TX_CITYHIVE_SOURCES) {
    for (const seedUrl of source.urls) {
      for (const url of cityHivePageUrls(seedUrl, TX_CITYHIVE_MAX_PAGES)) {
        const res = await textFetch(url, { headers: { accept: 'text/html,*/*' }, timeoutMs: 24_000 });
        if (!res.ok) {
          roadblocks.push({
            state: config.id,
            source: source.sourceLabel,
            url,
            status: res.status,
            error: res.error || `HTTP ${res.status}`,
            nextRoute: 'Retry the Texas CityHive page or inspect rendered/network calls for current product JSON shape.'
          });
          continue;
        }
        const blobs = cityHiveJsonBlobs(res.text);
        const products = cityHiveProducts(blobs);
        for (const cfg of cityHiveMerchantConfigs(blobs)) {
          const merchant = cfg.merchant || cfg;
          if (!merchant?.id) continue;
          const a = cityHiveAddressParts(merchant.address || {});
          signals.push({
            id: stableId([config.id, 'cityhive-store-location', source.id, merchant.id]),
            state: config.id,
            sourceLabel: `${source.chainName} CityHive store locator`,
            sourceUrl: source.baseUrl,
            rawName: merchant.display_name || merchant.name || source.chainName,
            canonicalBottleId: null,
            canonicalName: null,
            confidence: 0.72,
            eventType: 'retailer_store_location',
            locationPrecision: 'store_level',
            locationName: merchant.display_name || merchant.name || source.chainName,
            storeName: merchant.display_name || merchant.name || source.chainName,
            storeId: `${source.id}:${merchant.id}`,
            storeAddress: a.fullAddress,
            city: a.city,
            stateCode: a.state || 'TX',
            postalCode: a.zip,
            zip: a.zip,
            lat: Number(merchant.lat || merchant.latitude || merchant.location?.lat) || null,
            lng: Number(merchant.lng || merchant.longitude || merchant.location?.lng) || null,
            quantity: 0,
            observedAt,
            canAlertAsInventory: false,
            canAlertAsWatch: false,
            inventorySemantics: `${source.chainName} CityHive store rows identify retailer locations/order-capable branches. Store rows are not bottle inventory by themselves.`,
            evidence: `${source.chainName} CityHive configuration lists ${merchant.display_name || merchant.name}${a.fullAddress ? ` at ${a.fullAddress}` : ''}.`,
            raw: { merchant }
          });
        }
        for (const product of products) {
          for (const merchant of product.merchants || []) {
            for (const option of merchant.product_options || []) {
              if (!isBourbonRelevantProduct(product, option)) continue;
              const rawName = option.option_display_data?.name || product.name || '';
              if (!rawName || !TX_WATCH_RE.test(rawName)) continue;
              const { match, record, unsafeReason } = cityHiveSafeBottleMatch(rawName, bible);
              if (!record) continue;
              const quantity = Number(option.quantity || 0) || 0;
              if (quantity <= 0) continue;
              const fullAddress = option.full_address || null;
              const city = fullAddress?.match(/,\s*([^,]+),\s*TX\s+\d{5}/i)?.[1] || null;
              const zip = fullAddress?.match(/\bTX\s+(\d{5}(?:-\d{4})?)\b/i)?.[1] || null;
              const price = Number(option.price || 0) || null;
              signals.push({
                id: stableId([config.id, 'cityhive-store-inventory', source.id, option.merchant_id, option.option_id, quantity, price]),
                state: config.id,
                sourceLabel: source.sourceLabel,
                sourceUrl: option.product_url || url,
                rawName,
                canonicalBottleId: record.id,
                canonicalName: record.canonical,
                confidence: Math.max(0.78, match?.confidence || 0.5),
                eventType: 'cityhive_store_inventory_result',
                locationPrecision: 'store_level',
                locationName: option.merchant_name || source.chainName,
                storeName: option.merchant_name || source.chainName,
                storeId: option.merchant_id ? `${source.id}:${option.merchant_id}` : null,
                storeAddress: fullAddress,
                city,
                stateCode: 'TX',
                postalCode: zip,
                zip,
                lat: Number(option.coordinates?.[1]) || null,
                lng: Number(option.coordinates?.[0]) || null,
                quantity,
                price,
                availabilityStatus: 'in_stock',
                availabilityLabel: 'In stock',
                observedAt,
                canAlertAsInventory: true,
                canAlertAsWatch: true,
                inventorySemantics: `${source.chainName} CityHive pages embed store-level product option quantity and price for selected branches. Treat as retailer-published pickup/order availability and ask users to verify before driving.`,
                evidence: `${source.chainName} CityHive reports ${quantity} unit${quantity === 1 ? '' : 's'} of ${rawName}${option.merchant_name ? ` at ${option.merchant_name}` : ''}${price ? ` for $${price.toFixed(2)}` : ''}.`,
                raw: { product, option, matchGuard: unsafeReason }
              });
            }
          }
        }
        await sleep(600);
      }
    }
  }

  const release = await textFetch(TX_SPECS_RELEASE_URL, { timeoutMs: 24_000 });
  if (release.ok) {
    const text = stripHtml(release.text);
    const matched = bible.scanText(text).filter((match) => TX_WATCH_RE.test(match.canonical || ''));
    const productNames = [...new Set([
      ...matched.map((match) => match.canonical),
      ...[...text.matchAll(/(?:Blanton'?s?|Baker'?s?|Bardstown|Holladay|Weller|Eagle Rare|Buffalo Trace|Taylor|Stagg)[^\n\.]{0,80}/gi)].map((m) => decodeHtml(m[0]).trim())
    ].filter(Boolean))].slice(0, 20);
    signals.push({
      id: stableId([config.id, 'specs-release-watch', TX_SPECS_RELEASE_URL, productNames.join('|') || observedAt.slice(0, 10)]),
      state: config.id,
      sourceLabel: "Spec's Bourbon Drop / rare-release event page",
      sourceUrl: TX_SPECS_RELEASE_URL,
      rawName: productNames[0] || "Spec's Bourbon Drop",
      canonicalBottleId: matched[0]?.id || null,
      canonicalName: matched[0]?.canonical || (productNames[0] || "Spec's Bourbon Drop"),
      matchedBottleCount: matched.length,
      matchedBottles: matched.slice(0, 20).map((b) => ({ id: b.id, name: b.canonical, tier: b.tier })),
      confidence: matched.length ? 0.62 : 0.48,
      eventType: 'retailer_release_watch_signal',
      locationPrecision: 'statewide_catalog',
      locationName: "Texas Spec's retailer watch",
      stateCode: 'TX',
      observedAt,
      canAlertAsInventory: false,
      canAlertAsWatch: matched.length > 0,
      inventorySemantics: "Spec's public rare bourbon drop/event page is release-watch intelligence only. It is not live shelf inventory and must not be presented as store availability.",
      evidence: productNames.length
        ? `Spec's public bourbon drop page mentions ${productNames.slice(0, 8).join(', ')}.`
        : "Spec's public bourbon drop page was reachable but no matched Bourbon Bible products were detected.",
      raw: { matchedProductNames: productNames, textSample: text.slice(0, 1200) }
    });
  } else {
    roadblocks.push({
      state: config.id,
      source: "Spec's Bourbon Drop / rare-release event page",
      url: TX_SPECS_RELEASE_URL,
      status: release.status,
      error: release.error || `HTTP ${release.status}`,
      nextRoute: "Retry Spec's release page or use browser-rendered extraction if static fetch is blocked."
    });
  }

  for (const url of TX_SPECS_PRODUCT_URLS) {
    const res = await textFetch(url, { timeoutMs: 18_000 });
    if (!res.ok) {
      roadblocks.push({ state: config.id, source: "Spec's public product page", url, status: res.status, error: res.error || `HTTP ${res.status}`, nextRoute: "Retry product page or inspect rendered page for product JSON." });
      continue;
    }
    const text = stripHtml(res.text);
    if (!TX_WATCH_RE.test(text)) continue;
    const rawName = specsProductNameFromText(text, url);
    const { match, record } = bottleMatch(rawName, bible);
    const sku = text.match(/\bSKU\s*([A-Z0-9-]+)/i)?.[1] || null;
    signals.push({
      id: stableId([config.id, 'specs-product-catalog', url, sku || rawName]),
      state: config.id,
      sourceLabel: "Spec's public product catalog",
      sourceUrl: url,
      rawName,
      canonicalBottleId: record?.id || null,
      canonicalName: record?.canonical || titleCase(rawName),
      confidence: Math.max(0.48, Math.min(0.66, match?.confidence || 0.48)),
      eventType: 'retailer_product_catalog_signal',
      locationPrecision: 'statewide_catalog',
      locationName: "Texas Spec's catalog",
      stateCode: 'TX',
      observedAt,
      canAlertAsInventory: false,
      canAlertAsWatch: false,
      inventorySemantics: "Spec's product pages are retailer catalog/price-context signals. They are not store-level availability unless a location-specific inventory row is extracted.",
      evidence: `Spec's public product page lists ${rawName}${sku ? ` with SKU ${sku}` : ''}.`,
      raw: { sku, textSample: text.slice(0, 1000) }
    });
  }

  signals.push({
    id: stableId([config.id, 'texas-source-health', observedAt.slice(0, 10), signals.length]),
    state: config.id,
    sourceLabel: 'Texas engine coverage summary',
    sourceUrl: TX_SPECS_RELEASE_URL,
    rawName: 'Texas retailer/source coverage',
    canonicalBottleId: null,
    canonicalName: null,
    confidence: signals.length ? 0.52 : 0.35,
    eventType: 'retailer_source_health',
    locationPrecision: 'statewide_catalog',
    locationName: 'Texas coverage',
    stateCode: 'TX',
    observedAt,
    quantity: 0,
    canAlertAsInventory: false,
    canAlertAsWatch: false,
    inventorySemantics: 'Internal source-health signal for Texas coverage; not a user alert candidate.',
    evidence: `Collected ${signals.length} Texas retailer/policy signals, including ${signals.filter((s) => s.eventType === 'cityhive_store_inventory_result').length} store-level CityHive inventory rows.`,
    raw: { productUrls: TX_SPECS_PRODUCT_URLS, releaseUrl: TX_SPECS_RELEASE_URL }
  });

  if (!signals.some((s) => s.eventType === 'retailer_release_watch_signal' || s.eventType === 'retailer_product_catalog_signal')) {
    roadblocks.push({
      state: config.id,
      source: 'Texas retailer public-source coverage',
      url: TX_SPECS_RELEASE_URL,
      status: 'no_public_retailer_signals',
      error: "Texas public-source pass did not extract usable Spec's catalog/release signals.",
      nextRoute: "Add a rendered/browser collector for Spec's or another Texas retailer with explicitly public store/product availability."
    });
  }
  return { signals, roadblocks };
}

async function virginiaStoreNumbers() {
  const res = await textFetch(VIRGINIA_STORES_ARCGIS_URL, { headers: { accept: 'application/json,*/*' } });
  if (!res.ok) throw new Error(`Virginia ArcGIS store list HTTP ${res.status}`);
  const json = JSON.parse(res.text);
  const stores = [];
  for (const feature of json.features || []) {
    const a = feature.attributes || {};
    const name = String(a.LandmkName || '');
    const storeNumber = name.match(/(?:store\s*)?(\d{1,4})\b/i)?.[1];
    if (!storeNumber || !/abc/i.test(name)) continue;
    stores.push({ storeNumber: String(Number(storeNumber)), name, city: a.City || null, address: a.Address || null });
  }
  return [...new Map(stores.map((store) => [store.storeNumber, store])).values()].sort((a, b) => Number(a.storeNumber) - Number(b.storeNumber));
}

function bottleMatch(raw, bible) {
  const match = bible.match(raw);
  return { match, record: match?.record };
}

function alabamaBottleMatch(raw, bible, code = null) {
  const candidates = [];
  if (code && AL_CODE_MATCH_HINTS.has(code)) candidates.push(AL_CODE_MATCH_HINTS.get(code));
  candidates.push(raw);
  const cleaned = decodeHtml(raw)
    .replace(/\bB\.I\.B\b\.?/gi, 'Bottled-in-Bond')
    .replace(/\b(\d+)\s*YR\.?\b/gi, '$1 Year')
    .replace(/\b\d+(?:\.\d+)?\s*PR\.?\b/gi, ' ')
    .replace(/\b\d+(?:\.\d+)?\s*(?:ML|L)\b/gi, ' ')
    .replace(/\bABC\s+BARREL\s+SELECT\b/gi, ' ')
    .replace(/\bPVT\s+BARREL\b/gi, 'Barrel')
    .replace(/\bSGL\b/gi, 'Single')
    .replace(/\s+/g, ' ')
    .trim();
  candidates.push(cleaned);
  candidates.push(cleaned.replace(/\bBOURBON\b/gi, ' ').replace(/\s+/g, ' ').trim());
  for (const candidate of [...new Set(candidates.filter(Boolean))]) {
    const match = bible.match(candidate);
    if (match?.record) return { match, record: match.record, matchedText: candidate };
  }
  return { match: null, record: null, matchedText: raw };
}

function signalBase(state, sourceLabel, sourceUrl, rawName, bible) {
  const { match, record } = bottleMatch(rawName, bible);
  return { match, record, base: {
    state,
    sourceLabel,
    sourceUrl,
    rawName,
    canonicalBottleId: record?.id || null,
    canonicalName: record?.canonical || titleCase(rawName),
    confidence: Math.max(0.68, match?.confidence || 0.35),
    fetchedAt: new Date().toISOString()
  }};
}
function stateAggregateUnsafeMatchReason(state, rawName, record) {
  if (!record) return null;
  const raw = normalizedBottleText(rawName);
  const canonical = normalizedBottleText(record.canonical);
  if (!['MD-MONTGOMERY', 'UT'].includes(state)) return null;
  if (/\b(cream|liqueur|cordial|cocktail|ready to drink|vodka|gin|rum|tequila|mezcal|wine|beer|scotch)\b/.test(raw) && !/\b(cream|liqueur|cordial|cocktail|ready to drink|vodka|gin|rum|tequila|mezcal|wine|beer|scotch)\b/.test(canonical)) return 'non_bourbon_or_flavored_matched_core_bottle';
  if (/four roses/.test(raw) && /\b(single barrel|small batch|bourbon)\b/.test(raw) && /limited edition/.test(canonical)) return 'four_roses_standard_not_limited_edition';
  if (/elijah craig/.test(raw) && /small batch/.test(raw) && /barrel proof/.test(canonical)) return 'elijah_craig_small_batch_not_barrel_proof';
  if (/woodford reserve/.test(raw) && !/batch proof/.test(raw) && /batch proof/.test(canonical)) return 'woodford_reserve_not_batch_proof';
  if (/weller/.test(raw) && /reserve/.test(raw) && !/single barrel/.test(raw) && /single barrel/.test(canonical)) return 'weller_reserve_not_single_barrel';
  if (/henry mckenna/.test(raw) && !/single barrel/.test(raw) && /single barrel/.test(canonical)) return 'henry_mckenna_not_single_barrel';
  if (state === 'UT' && /bakers? bourbon/.test(raw) && !/13|thirteen/.test(raw) && /13/.test(canonical)) return 'bakers_standard_not_13_year';
  return null;
}

function stateAggregateSafeBottleMatch(state, rawName, bible) {
  const { match, record } = bottleMatch(rawName, bible);
  const unsafeReason = stateAggregateUnsafeMatchReason(state, rawName, record);
  if (unsafeReason) return { match, record: null, unsafeReason };
  if (!record) return { match, record: null, unsafeReason: 'no_bottle_bible_match' };
  return { match, record, unsafeReason: null };
}

function aggregateSignalBase(state, sourceLabel, sourceUrl, rawName, bible) {
  const { match, record, unsafeReason } = stateAggregateSafeBottleMatch(state, rawName, bible);
  return { match, record, unsafeReason, base: {
    state,
    sourceLabel,
    sourceUrl,
    rawName,
    canonicalBottleId: record?.id || null,
    canonicalName: record?.canonical || titleCase(rawName),
    confidence: record ? Math.max(0.68, match?.confidence || 0.35) : 0.58,
    sourceMatchStatus: record ? 'bottle_bible_match' : unsafeReason ? `source_name_kept:${unsafeReason}` : 'source_name_kept:no_safe_bible_match',
    fetchedAt: new Date().toISOString()
  }};
}


async function collectAlabama(config, bible) {
  const signals = [];
  const roadblocks = [];
  const observedAt = new Date().toISOString();

  const monthly = await textFetch(AL_MONTHLY_RELEASE_URL, { headers: { accept: 'text/html,*/*' }, timeoutMs: 24_000 });
  const quarterlyProducts = await textFetch(AL_QUARTERLY_PRODUCTS_URL, { headers: { accept: 'text/html,*/*' }, timeoutMs: 24_000 });
  const allocatedPage = await textFetch(AL_ALLOCATED_LIST_URL, { headers: { accept: 'text/html,*/*' }, timeoutMs: 24_000 });
  const releaseDocs = [];
  let monthlyMissingCurrentReleasePdf = false;

  if (monthly.ok) {
    const links = htmlLinks(monthly.text, AL_MONTHLY_RELEASE_URL).filter((link) => /\.pdf(?:$|[?#])/i.test(link.href));
    const hold = links.find((link) => /web\s*hold|limited\s*release/i.test(`${link.text} ${decodeURIComponent(link.href)}`) && !/do\s*not\s*hold|additional|schedule|calendar/i.test(`${link.text} ${decodeURIComponent(link.href)}`));
    const additional = links.find((link) => /do\s*not\s*hold|additional\s*distribution/i.test(`${link.text} ${decodeURIComponent(link.href)}`));
    const schedule = links.find((link) => /schedule|calendar/i.test(`${link.text} ${decodeURIComponent(link.href)}`));
    if (hold) releaseDocs.push({ kind: 'monthly_hold', label: 'Alabama ABC monthly limited release hold list', url: hold.href, linkText: hold.text });
    if (additional) releaseDocs.push({ kind: 'monthly_additional_distribution', label: 'Alabama ABC monthly additional distribution list', url: additional.href, linkText: additional.text });
    if (schedule) releaseDocs.push({ kind: 'limited_release_schedule', label: 'Alabama ABC limited release schedule', url: schedule.href, linkText: schedule.text });
    if (!hold && !additional) monthlyMissingCurrentReleasePdf = true;
  } else {
    roadblocks.push({
      state: config.id,
      source: 'Alabama ABC monthly limited release page',
      url: AL_MONTHLY_RELEASE_URL,
      status: monthly.status || 0,
      error: monthly.error || `HTTP ${monthly.status}`,
      nextRoute: 'Retry the official Alabama monthly limited release page.'
    });
  }

  if (quarterlyProducts.ok) {
    const links = htmlLinks(quarterlyProducts.text, AL_QUARTERLY_PRODUCTS_URL).filter((link) => /\.pdf(?:$|[?#])/i.test(link.href));
    const quarterly = links.find((link) => /quarterly\s+release|web_\d+/i.test(`${link.text} ${decodeURIComponent(link.href)}`));
    const staycation = links.find((link) => /staycation/i.test(`${link.text} ${decodeURIComponent(link.href)}`));
    if (quarterly) releaseDocs.push({ kind: 'quarterly_release', label: 'Alabama ABC quarterly limited release products and stores', url: quarterly.href, linkText: quarterly.text });
    if (staycation) releaseDocs.push({ kind: 'quarterly_staycation_release', label: 'Alabama ABC quarterly Staycation release products and stores', url: staycation.href, linkText: staycation.text });
  } else {
    roadblocks.push({ state: config.id, source: 'Alabama ABC quarterly product/PDF page', url: AL_QUARTERLY_PRODUCTS_URL, status: quarterlyProducts.status || 0, error: quarterlyProducts.error || `HTTP ${quarterlyProducts.status}`, nextRoute: 'Retry quarterly limited-release product page and discover current PDF links.' });
  }

  // Stable fallbacks keep the collector useful if Drupal link text changes but the current official file paths remain live.
  if (!releaseDocs.some((doc) => doc.kind === 'quarterly_release')) releaseDocs.push({ kind: 'quarterly_release', label: 'Alabama ABC quarterly limited release products and stores', url: `${AL_ABC_BASE_URL}/sites/default/files/inline-files/Web_23.pdf`, fallback: true });
  if (!releaseDocs.some((doc) => doc.kind === 'monthly_hold')) releaseDocs.push({ kind: 'monthly_hold', label: 'Alabama ABC monthly limited release hold list', url: `${AL_ABC_BASE_URL}/sites/default/files/inline-files/Web%20Hold_20.pdf`, fallback: true });
  if (!releaseDocs.some((doc) => doc.kind === 'monthly_additional_distribution')) releaseDocs.push({ kind: 'monthly_additional_distribution', label: 'Alabama ABC monthly additional distribution list', url: `${AL_ABC_BASE_URL}/sites/default/files/inline-files/Web%20Do%20Not%20Hold_20.pdf`, fallback: true });
  if (!releaseDocs.some((doc) => doc.kind === 'limited_release_schedule')) releaseDocs.push({ kind: 'limited_release_schedule', label: 'Alabama ABC limited release schedule', url: `${AL_ABC_BASE_URL}/sites/default/files/inline-files/2026%20Limited%20Release%20Schedule.pdf`, fallback: true });

  for (const doc of releaseDocs.filter((d) => d.kind !== 'limited_release_schedule')) {
    const pdf = await pdfText(doc.url);
    if (!pdf.ok) {
      roadblocks.push({
        state: config.id,
        source: doc.label,
        url: doc.url,
        status: pdf.status || 0,
        error: pdf.error || 'Unable to parse official Alabama release PDF.',
        nextRoute: 'Retry PDF fetch/text extraction or inspect whether Alabama changed the release PDF layout.'
      });
      continue;
    }
    const { rows, misses } = parseAlabamaReleaseRows(pdf.text, doc.kind);
    if (misses.length) {
      roadblocks.push({
        state: config.id,
        source: `${doc.label} parser`,
        url: doc.url,
        status: 'partial_parse_misses',
        error: `${misses.length} Alabama release rows with item codes/prices did not match the expected row shape; parsed ${rows.length}.`,
        nextRoute: 'Review parser miss samples and broaden address/date matching if misses grow.',
        samples: misses.slice(0, 5)
      });
    }
    for (const row of rows) {
      if (!AL_STRONG_RELEASE_RE.test(row.rawName)) continue;
      const { match, record } = alabamaBottleMatch(row.rawName, bible, row.code);
      if (!record) continue;
      const releaseDateLabel = row.releaseDate ? ` on ${row.releaseDate}` : '';
      signals.push({
        id: stableId([config.id, 'alabc-release-row', doc.kind, row.releaseDate || 'current', row.storeNumber, row.code, row.price]),
        state: config.id,
        sourceLabel: doc.label,
        sourceUrl: doc.url,
        rawName: row.rawName,
        canonicalBottleId: record.id,
        canonicalName: record.canonical,
        confidence: Math.max(0.74, match?.confidence || 0.5),
        eventType: 'alabc_limited_release_store_drop',
        locationPrecision: 'store_level',
        locationName: `Alabama ABC Store #${row.storeNumber}${row.city ? ` - ${row.city}` : ''}`,
        storeName: `Alabama ABC Store #${row.storeNumber}`,
        storeId: `alabc:${row.storeNumber}`,
        storeAddress: row.storeAddress,
        city: row.city,
        stateCode: 'AL',
        postalCode: row.zip,
        zip: row.zip,
        quantity: 0,
        price: row.price,
        availabilityStatus: row.releaseDate ? 'scheduled_release' : 'listed_distribution',
        availabilityLabel: row.releaseDate ? `Scheduled limited release ${row.releaseDate}` : 'Listed in additional distribution',
        observedAt,
        releaseDate: row.releaseDate,
        canAlertAsInventory: false,
        canAlertAsWatch: true,
        inventorySemantics: 'Alabama ABC official limited-release PDFs list allocated products by release/distribution, store number, address, item code, and price. This is scheduled release/drop intelligence, not live shelf inventory or quantity-on-hand.',
        evidence: `Alabama ABC lists ${row.rawName} at ABC Store #${row.storeNumber}${row.city ? ` in ${row.city}` : ''}${releaseDateLabel}${row.price ? ` for $${row.price.toFixed(2)}` : ''}. Verify availability and line rules before driving.`,
        raw: { release: row, document: { kind: doc.kind, label: doc.label, pages: pdf.pages, fallback: Boolean(doc.fallback) } }
      });
    }
  }

  const scheduleDoc = releaseDocs.find((doc) => doc.kind === 'limited_release_schedule');
  if (scheduleDoc) {
    const schedule = await pdfText(scheduleDoc.url);
    if (schedule.ok) {
      const lines = normalizePdfLines(schedule.text).filter((line) => /release|available|sale|registration|whiskey|bourbon|\b2026\b|10\s*am/i.test(line));
      signals.push({
        id: stableId([config.id, 'alabc-limited-release-schedule', scheduleDoc.url, lines.join('|')]),
        state: config.id,
        sourceLabel: scheduleDoc.label,
        sourceUrl: scheduleDoc.url,
        rawName: 'Alabama ABC 2026 allocated product release schedule',
        canonicalBottleId: null,
        canonicalName: null,
        confidence: 0.62,
        eventType: 'alabc_limited_release_calendar',
        locationPrecision: 'statewide_policy',
        locationName: 'Alabama ABC statewide limited release program',
        stateCode: 'AL',
        observedAt,
        canAlertAsInventory: false,
        canAlertAsWatch: true,
        inventorySemantics: 'Alabama ABC release calendar gives publication and on-sale dates for allocated-product releases. It is timing intelligence, not bottle inventory.',
        evidence: lines.slice(0, 16).join(' | '),
        raw: { lines, pages: schedule.pages }
      });
    }
  }

  const annualProducts = await textFetch(AL_ANNUAL_PRODUCTS_URL, { headers: { accept: 'text/html,*/*' }, timeoutMs: 24_000 });
  const annualHome = await textFetch(AL_ANNUAL_RELEASE_URL, { headers: { accept: 'text/html,*/*' }, timeoutMs: 18_000 });
  const annualLocations = await textFetch(AL_ANNUAL_LOCATIONS_URL, { headers: { accept: 'text/html,*/*' }, timeoutMs: 18_000 });
  const annualDate = parseAlabamaAnnualDate(`${annualHome.text || ''} ${annualProducts.text || ''} ${annualLocations.text || ''}`);
  if (annualProducts.ok) {
    const annualRows = parseAlabamaAnnualProductRows(annualProducts.text);
    const locationText = annualLocations.ok ? stripHtml(annualLocations.text).replace(/\s+/g, ' ').trim() : '';
    for (const row of annualRows) {
      if (!AL_STRONG_RELEASE_RE.test(row.rawName)) continue;
      const { match, record } = alabamaBottleMatch(row.rawName, bible, row.code);
      if (!record) continue;
      signals.push({
        id: stableId([config.id, 'alabc-annual-limited-release-product', annualDate || 'annual', row.tableNumber || 'table', row.code]),
        state: config.id,
        sourceLabel: 'Alabama ABC annual limited release products and pricing',
        sourceUrl: AL_ANNUAL_PRODUCTS_URL,
        rawName: row.rawName,
        canonicalBottleId: record.id,
        canonicalName: record.canonical,
        confidence: Math.max(0.66, match?.confidence || 0.5),
        eventType: 'alabc_annual_limited_release_lottery_product',
        locationPrecision: 'statewide_policy',
        locationName: 'Alabama ABC annual limited release program',
        stateCode: 'AL',
        quantity: 0,
        price: row.price,
        observedAt,
        releaseDate: annualDate,
        canAlertAsInventory: false,
        canAlertAsWatch: true,
        inventorySemantics: 'Alabama ABC annual limited-release product/pricing table and times/locations pages are lottery/scheduled event intelligence. They are not live shelf inventory.',
        evidence: `Alabama ABC annual limited-release program lists ${row.rawName}${row.tableNumber ? ` on Table ${row.tableNumber}` : ''}${row.price ? ` for $${row.price.toFixed(2)}` : ''}${annualDate ? ` for the ${annualDate} event` : ''}. Sweepstakes/line rules and store times must be verified at the official source.`,
        raw: { product: row, annualDate, locationsUrl: AL_ANNUAL_LOCATIONS_URL, locationSample: locationText.slice(0, 1200) }
      });
    }
    signals.push({
      id: stableId([config.id, 'alabc-annual-limited-release-program', annualDate || 'annual', annualRows.length]),
      state: config.id,
      sourceLabel: 'Alabama ABC annual limited release program',
      sourceUrl: AL_ANNUAL_RELEASE_URL,
      rawName: 'Alabama ABC annual limited release program',
      canonicalBottleId: null,
      canonicalName: null,
      confidence: 0.64,
      eventType: 'alabc_annual_limited_release_calendar',
      locationPrecision: 'statewide_policy',
      locationName: 'Alabama ABC annual limited release program',
      stateCode: 'AL',
      observedAt,
      releaseDate: annualDate,
      canAlertAsInventory: false,
      canAlertAsWatch: true,
      inventorySemantics: 'Alabama annual limited-release pages describe sweepstakes, product tables, and participating store times/locations. This is official event intelligence, not inventory.',
      evidence: `Alabama ABC annual limited-release pages expose ${annualRows.length} product/pricing rows${annualDate ? ` for ${annualDate}` : ''} plus participating-store times/locations.`,
      raw: { annualDate, productRowCount: annualRows.length, productsUrl: AL_ANNUAL_PRODUCTS_URL, locationsUrl: AL_ANNUAL_LOCATIONS_URL, locationSample: locationText.slice(0, 1200) }
    });
  } else {
    roadblocks.push({ state: config.id, source: 'Alabama ABC annual limited release products and pricing', url: AL_ANNUAL_PRODUCTS_URL, status: annualProducts.status || 0, error: annualProducts.error || `HTTP ${annualProducts.status}`, nextRoute: 'Retry annual product/pricing page and inspect table markup.' });
  }

  const allocatedLinks = allocatedPage.ok ? htmlLinks(allocatedPage.text, AL_ALLOCATED_LIST_URL) : [];
  const allocatedPdfUrl = allocatedLinks.find((link) => /allocated.*\.pdf|allocated\s*product\s*list/i.test(`${link.text} ${decodeURIComponent(link.href)}`))?.href
    || `${AL_ABC_BASE_URL}/sites/default/files/inline-files/allocated%20for%20webpage.pdf`;

  const allocatedPdf = await pdfText(allocatedPdfUrl);
  if (allocatedPdf.ok) {
    const productRows = parseAlabamaAllocatedPdfRows(allocatedPdf.text);
    for (const row of productRows) {
      if (!AL_STRONG_RELEASE_RE.test(row.rawName)) continue;
      const { match, record } = alabamaBottleMatch(row.rawName, bible, row.code);
      if (!record) continue;
      signals.push({
        id: stableId([config.id, 'alabc-allocated-product', row.code]),
        state: config.id,
        sourceLabel: 'Alabama ABC allocated spirits master list',
        sourceUrl: allocatedPdfUrl,
        rawName: row.rawName,
        canonicalBottleId: record.id,
        canonicalName: record.canonical,
        confidence: Math.max(0.56, match?.confidence || 0.42),
        eventType: 'alabc_product_price_catalog_row',
        locationPrecision: 'statewide_catalog',
        locationName: 'Alabama ABC allocated spirits master list',
        stateCode: 'AL',
        quantity: 0,
        price: row.price,
        observedAt,
        canAlertAsInventory: false,
        canAlertAsWatch: true,
        inventorySemantics: 'Alabama ABC allocated spirits master-list rows are product/price/catalog intelligence. They do not indicate current store inventory.',
        evidence: `Alabama ABC allocated spirits master list includes ${row.rawName}${row.price ? ` at $${row.price.toFixed(2)}` : ''}.`,
        raw: { product: row, pages: allocatedPdf.pages }
      });
    }
  } else {
    roadblocks.push({
      state: config.id,
      source: 'Alabama ABC allocated spirits master list PDF',
      url: allocatedPdfUrl,
      status: allocatedPdf.status || 0,
      error: allocatedPdf.error || `HTTP ${allocatedPdf.status}`,
      nextRoute: 'Retry allocated spirits page and discover current PDF link.'
    });
  }

  if (!signals.some((signal) => signal.eventType === 'alabc_limited_release_store_drop')) {
    roadblocks.push({
      state: config.id,
      source: 'Alabama ABC limited release PDFs',
      url: AL_MONTHLY_RELEASE_URL,
      status: 'no_release_drop_rows',
      error: 'Official Alabama release PDFs were reachable but produced no matched Bourbon Signal store-level release drops.',
      nextRoute: 'Review PDF text extraction output and bottle-bible aliases for Alabama item names.'
    });
  }

  return { signals, roadblocks };
}

export async function collectPrecisionProbes(config, bible, existingSignals = []) {
  if (config.id === 'OH') return collectOhio(config, bible);
  if (config.id === 'OR') return collectOregon(config, bible);
  if (config.id === 'IA') return collectIowa(config, bible, existingSignals);
  if (config.id === 'UT') return collectUtah(config, bible);
  if (config.id === 'ID') return collectIdaho(config, bible);
  if (config.id === 'AL') return collectAlabama(config, bible);
  if (config.id === 'NC') return collectNorthCarolinaIntelligence(config, bible, collectNcStoreInventory);
  if (config.id === 'IL') return collectIllinois(config, bible);
  if (config.id === 'IN') return collectIndiana(config, bible);
  if (config.id === 'TN') return collectTennessee(config, bible);
  if (config.id === 'TX') return collectTexas(config, bible);
  if (config.id === 'VA') return collectVirginia(config, bible);
  if (config.id === 'PA') return collectPennsylvania(config, bible);
  if (config.id === 'MD-MONTGOMERY') return collectMontgomery(config, bible);
  return { signals: [], roadblocks: [] };
}

async function binnysAlgoliaQuery(indexName, params) {
  const res = await textFetch(`https://${BINNYS_ALGOLIA_APP_ID}-dsn.algolia.net/1/indexes/${encodeURIComponent(indexName)}/query`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'x-algolia-application-id': BINNYS_ALGOLIA_APP_ID,
      'x-algolia-api-key': BINNYS_ALGOLIA_SEARCH_KEY
    },
    body: JSON.stringify(params),
    timeoutMs: 30_000
  });
  if (!res.ok) throw new Error(`Binny's Algolia ${indexName} HTTP ${res.status}: ${res.error || res.text.slice(0, 180)}`);
  return JSON.parse(res.text);
}

function binnysStoreAddress(store) {
  return [store.addressLine1, store.city, 'IL', store.zipCode].filter(Boolean).join(', ');
}

function binnysProductName(hit) {
  return hit.productName || hit.shortDescription || hit.name || hit.objectID || '';
}

function binnysProductRelevant(hit) {
  const text = `${binnysProductName(hit)} ${hit.productBrandName || ''} ${hit.productType || ''} ${hit.productVarietal || ''} ${hit.area || ''} ${(hit.designations || []).join(' ')} ${hit.productDescriptionLong || ''}`;
  if (BINNYS_EXCLUDE_RE.test(text) && !/bourbon|straight bourbon|american whiskey|rye whiskey|blanton|eagle rare|weller|stagg|taylor|buffalo trace/i.test(text)) return false;
  return BINNYS_STRICT_WATCH_RE.test(text);
}

function binnysQuantity(row = {}) {
  const qty = Number(row.purchaseAvailability || 0) || 0;
  if (qty > 0) return qty;
  const label = String(row.stockMessageByStore || '');
  const only = label.match(/only\s+(\d+)\s+left/i)?.[1];
  if (only) return Number(only) || 0;
  if (/in\s+stock/i.test(label)) return 1;
  return 0;
}

function binnysPrice(row = {}, hit = {}) {
  const prices = row.prices || {};
  return Number(prices.bestPrice || prices.salePrice || prices.regularPrice || hit.onlineStoreBestPrice || 0) || null;
}

async function collectIllinois(config, bible) {
  const signals = [];
  const roadblocks = [];
  const observedAt = new Date().toISOString();

  let stores = [];
  const storesByCode = new Map();
  try {
    const storeResult = await binnysAlgoliaQuery(BINNYS_STORE_INDEX, { query: '', hitsPerPage: 100 });
    stores = (storeResult.hits || [])
      .filter((store) => String(store.state || '').toLowerCase() === 'illinois' && !store.isComingSoon && store.storeId)
      .sort((a, b) => Number(a.storeId) - Number(b.storeId));
    for (const store of stores) {
      storesByCode.set(String(store.storeId), store);
      signals.push({
        id: stableId([config.id, 'binnys-store-location', store.storeId]),
        state: config.id,
        sourceLabel: "Binny's Beverage Depot store locator",
        sourceUrl: store.storeUrl || `${BINNYS_BASE_URL}/store-locator/`,
        rawName: `Binny's ${store.storeName}`,
        canonicalBottleId: null,
        canonicalName: null,
        confidence: 0.78,
        eventType: 'retailer_store_location',
        locationPrecision: 'store_level',
        locationName: `Binny's ${store.storeName}`,
        storeName: `Binny's ${store.storeName}`,
        storeId: `binnys:${store.storeId}`,
        storeAddress: binnysStoreAddress(store),
        city: store.city || null,
        county: null,
        stateCode: 'IL',
        postalCode: store.zipCode || null,
        zip: store.zipCode || null,
        lat: Number(store.latitude) || null,
        lng: Number(store.longitude) || null,
        quantity: 0,
        observedAt,
        canAlertAsInventory: false,
        canAlertAsWatch: false,
        inventorySemantics: "Binny's public store index identifies Illinois store locations. Store rows are not bottle availability by themselves.",
        evidence: `Binny's lists ${store.storeName}${store.city ? ` in ${store.city}` : ''}${store.addressLine1 ? ` at ${binnysStoreAddress(store)}` : ''}.`,
        raw: { store }
      });
    }
  } catch (error) {
    roadblocks.push({
      state: config.id,
      source: "Binny's Algolia store index",
      url: `https://${BINNYS_ALGOLIA_APP_ID}-dsn.algolia.net/1/indexes/${BINNYS_STORE_INDEX}/query`,
      status: 0,
      error: error instanceof Error ? error.message : String(error),
      nextRoute: "Retry Binny's public Algolia Stores_Production index or fall back to rendered store-locator browser discovery."
    });
  }

  const productMap = new Map();
  const productQueries = [];
  const searchTerms = [...new Set([...(TRACKED_TERMS.IL || []), 'bourbon'])];
  for (const term of searchTerms) {
    const maxPages = term === 'bourbon' ? BINNYS_MAX_BOURBON_PAGES : 2;
    for (let page = 0; page < maxPages; page++) {
      try {
        const params = {
          query: term === 'bourbon' ? '' : term,
          page,
          hitsPerPage: BINNYS_HITS_PER_PAGE,
          facetFilters: ['productVarietal:Bourbon'],
          attributesToRetrieve: ['objectID', 'variantCode', 'productName', 'shortDescription', 'productBrandName', 'productType', 'productVarietal', 'area', 'country', 'itemSize', 'priceUnitLabel', 'proof', 'productUrl', 'onlineStoreBestPrice', 'isInStoreOnly', 'isSoldOut', 'designations', 'storesPriceAndInventory', 'inStockStores', 'onSaleStores', 'storeSaleAvailability', 'productDescriptionLong']
        };
        const result = await binnysAlgoliaQuery(BINNYS_PRODUCT_INDEX, params);
        productQueries.push({ term, page, status: 200, nbHits: result.nbHits || 0, hitCount: (result.hits || []).length });
        for (const hit of result.hits || []) {
          if (!hit.objectID || productMap.has(hit.objectID)) continue;
          if (!binnysProductRelevant(hit)) continue;
          productMap.set(hit.objectID, hit);
        }
        if (!result.hits?.length || page + 1 >= Number(result.nbPages || 0)) break;
        await sleep(120);
      } catch (error) {
        roadblocks.push({
          state: config.id,
          source: "Binny's Algolia bourbon product index",
          url: BINNYS_BOURBON_URL,
          status: 0,
          error: error instanceof Error ? error.message : String(error),
          nextRoute: "Retry Binny's public Algolia Products_Production index; if it changes, rediscover the rendered page's Algolia settings."
        });
        break;
      }
    }
  }

  let matchedProducts = 0;
  let inventoryRows = 0;
  for (const hit of productMap.values()) {
    const rawName = binnysProductName(hit);
    const { match, record } = bottleMatch(rawName, bible);
    if (!record) continue;
    matchedProducts += 1;
    const rows = Array.isArray(hit.storesPriceAndInventory) ? hit.storesPriceAndInventory : [];
    for (const row of rows) {
      const storeCode = String(row.storeCode || '');
      const store = storesByCode.get(storeCode);
      if (!store) continue;
      const quantity = binnysQuantity(row);
      const statusLabel = row.stockMessageByStore || (quantity > 0 ? 'In stock' : 'Out of stock');
      const price = binnysPrice(row, hit);
      inventoryRows += 1;
      signals.push({
        id: stableId([config.id, 'binnys-store-inventory', hit.objectID, storeCode, quantity, price, statusLabel]),
        state: config.id,
        sourceLabel: "Binny's Beverage Depot public store inventory",
        sourceUrl: hit.productUrl || BINNYS_BOURBON_URL,
        rawName,
        canonicalBottleId: record.id,
        canonicalName: record.canonical,
        confidence: Math.max(0.8, match?.confidence || 0.5),
        eventType: quantity > 0 ? 'retailer_store_inventory_result' : 'retailer_store_inventory_out_of_stock',
        locationPrecision: 'store_level',
        locationName: `Binny's ${store.storeName}`,
        storeName: `Binny's ${store.storeName}`,
        storeId: `binnys:${storeCode}`,
        storeAddress: binnysStoreAddress(store),
        city: store.city || null,
        county: null,
        stateCode: 'IL',
        postalCode: store.zipCode || null,
        zip: store.zipCode || null,
        lat: Number(store.latitude) || null,
        lng: Number(store.longitude) || null,
        quantity,
        price,
        availabilityStatus: quantity > 0 ? 'in_stock' : 'out_of_stock',
        availabilityLabel: statusLabel,
        observedAt,
        canAlertAsInventory: quantity > 0,
        canAlertAsWatch: true,
        inventorySemantics: "Binny's public search index includes per-store purchase availability, stock message, price, and aisle metadata for Illinois stores. Treat as retailer-published pickup/shelf availability and ask users to verify before driving.",
        evidence: `Binny's reports ${statusLabel} for ${rawName} at Binny's ${store.storeName}${store.city ? ` in ${store.city}` : ''}${price ? ` for $${price.toFixed(2)}` : ''}${row.aisleSection ? ` (${row.aisleSection})` : ''}.`,
        raw: { product: hit, inventory: row, store }
      });
    }
  }

  if (!matchedProducts) {
    roadblocks.push({
      state: config.id,
      source: "Binny's Algolia bourbon product index",
      url: BINNYS_BOURBON_URL,
      status: productMap.size ? 'reachable_no_bible_matches' : 'reachable_no_relevant_products',
      error: `Parsed ${productMap.size} high-signal Binny's bourbon products but none matched the Bourbon Bible seed strongly enough for alert wiring.`,
      nextRoute: 'Review Binny\'s product names against the Bourbon Bible aliases; add missing canonical aliases only when products are genuinely alert-worthy.'
    });
  }

  signals.push({
    id: stableId([config.id, 'binnys-source-health', observedAt.slice(0, 10), productMap.size, inventoryRows]),
    state: config.id,
    sourceLabel: "Binny's Illinois engine coverage summary",
    sourceUrl: BINNYS_BOURBON_URL,
    rawName: "Binny's Illinois bourbon inventory coverage",
    canonicalBottleId: null,
    canonicalName: null,
    confidence: stores.length && matchedProducts ? 0.74 : 0.45,
    eventType: 'retailer_inventory_source_health',
    locationPrecision: stores.length ? 'store_aggregate' : 'statewide_catalog',
    locationName: 'Illinois Binny\'s coverage',
    stateCode: 'IL',
    observedAt,
    quantity: 0,
    canAlertAsInventory: false,
    canAlertAsWatch: false,
    inventorySemantics: 'Internal source-health signal for Illinois coverage; not a user alert candidate.',
    evidence: `Collected ${stores.length} Illinois Binny's stores, ${productMap.size} high-signal bourbon products, ${matchedProducts} matched Bourbon Bible products, and ${inventoryRows} store inventory rows.`,
    raw: { productQueries, storeCount: stores.length, productCount: productMap.size, matchedProducts, inventoryRows }
  });

  return { signals, roadblocks };
}

async function collectIndiana(config, bible) {
  const signals = [], roadblocks = [];
  try {
    const artifact = await collectIndianaAtcPackageStores();
    const observedAt = artifact.generatedAt;
    if (artifact.cacheReuse) {
      roadblocks.push({
        state: config.id,
        source: 'Indiana ATC public facility permit search cache reuse',
        url: IN_ATC_ARTIFACT_PATH,
        status: 200,
        error: `Using ${artifact.stores?.length || 0} cached active package-store permit rows from ${artifact.cacheGeneratedAt || artifact.generatedAt}; scheduled refresh avoids the slow ASP.NET paging flow unless BOURBON_SIGNAL_IN_FORCE_ATC_LIVE=1.`,
        nextRoute: 'Force live ATC refresh during maintenance; permit rows are store-coverage infrastructure, not bottle inventory.'
      });
    }
    for (const store of artifact.stores || []) {
      signals.push({
        id: stableId([config.id, 'atc-package-store-permit', store.permitNumber]),
        state: config.id,
        sourceLabel: 'Indiana ATC public facility permit search',
        sourceUrl: `${IN_ATC_SEARCH_URL}#${encodeURIComponent(store.permitNumber)}`,
        rawName: store.name,
        canonicalBottleId: null,
        canonicalName: null,
        confidence: 0.7,
        eventType: 'licensed_package_store_location',
        locationPrecision: 'store_level',
        locationName: store.name,
        storeName: store.name,
        storeId: store.permitNumber,
        storeAddress: [store.city, 'IN', store.zip].filter(Boolean).join(', ') || null,
        city: store.city || null,
        stateCode: 'IN',
        postalCode: store.zip || null,
        zip: store.zip || null,
        quantity: 0,
        observedAt,
        canAlertAsInventory: false,
        canAlertAsWatch: false,
        inventorySemantics: 'Indiana ATC permits identify active package-store license locations. This is store coverage infrastructure, not bottle inventory or allocation evidence.',
        evidence: `Indiana ATC public permit lookup lists ${store.name}${store.city ? ` in ${store.city}` : ''}${store.zip ? ` ${store.zip}` : ''} as Active ${store.licenseType || 'package store'} permit ${store.permitNumber}.`,
        raw: { permit: store, artifactPath: IN_ATC_ARTIFACT_PATH }
      });
    }
    roadblocks.push({
      state: config.id,
      source: 'Indiana bottle-level inventory',
      url: 'https://www.in.gov/atc/public-records/',
      status: 'private_market_no_control_inventory',
      error: 'Indiana ATC exposes license/permit data, not public bottle inventory. Retailer-specific inventory/catalog collectors are required for bottle alerts.',
      nextRoute: 'Prioritize Big Red/Bourbon World, Total Wine, Cap n Cork, Crown Liquors, and other Indiana retailer shop endpoints for bottle-level inventory/watch extraction.'
    });

    const bourbonWorld = await textFetch(IN_BOURBON_WORLD_URL, { headers: { accept: 'text/html,*/*' } });
    if (bourbonWorld.ok) {
      const allocatedItems = parseIndianaBourbonWorldAllocated(bourbonWorld.text)
        .filter((item) => RARE_RE.test(item.rawName) || /van winkle|blanton|buffalo trace/i.test(item.rawName));
      for (const item of allocatedItems) {
        const { match, record } = bottleMatch(item.rawName, bible);
        if (!record) continue;
        signals.push({
          id: stableId([config.id, 'bourbon-world-allocated-raffle', record.id, item.rawName, item.quantity, item.price]),
          state: config.id,
          sourceLabel: 'Bourbon World / Big Red monthly rare & allocated bottle list',
          sourceUrl: IN_BOURBON_WORLD_URL,
          rawName: item.rawName,
          canonicalBottleId: record.id,
          canonicalName: record.canonical,
          confidence: Math.max(0.78, match?.confidence || 0.45),
          eventType: 'retailer_allocated_raffle_item',
          locationPrecision: 'store_aggregate',
          locationName: 'Big Red Liquors / Bourbon World Indiana locations',
          storeName: null,
          storeAddress: null,
          stateCode: 'IN',
          quantity: item.quantity,
          price: item.price,
          observedAt,
          canAlertAsInventory: false,
          canAlertAsWatch: true,
          inventorySemantics: 'Bourbon World lists monthly rare/allocated raffle bottles across Big Red Liquors, Vine & Table, and Cap n Cork locations. This is an actionable retailer watch signal, not guaranteed shelf inventory.',
          evidence: `${item.rawName} appears on Bourbon World's current rare/allocated bottle list with ${item.quantity} bottle${item.quantity === 1 ? '' : 's'}${item.price ? ` at $${item.price.toFixed(2)}` : ''}. Winners are drawn from VIP entrants; verify details with Bourbon World/Big Red.`,
          raw: { item, source: 'bourbonworld_current_rare_allocated_bottles' }
        });
      }
      if (!allocatedItems.length) {
        roadblocks.push({
          state: config.id,
          source: 'Bourbon World rare/allocated bottle list',
          url: IN_BOURBON_WORLD_URL,
          status: 'reachable_no_allocated_items_parsed',
          error: 'Bourbon World page loaded, but the expected Current rare & allocated bottles section was missing or changed shape.',
          nextRoute: 'Inspect rendered page text and update the Indiana Bourbon World parser.'
        });
      }
    } else {
      roadblocks.push({
        state: config.id,
        source: 'Bourbon World rare/allocated bottle list',
        url: IN_BOURBON_WORLD_URL,
        status: bourbonWorld.status || 0,
        error: bourbonWorld.error || `HTTP ${bourbonWorld.status}`,
        nextRoute: 'Retry Bourbon World with browser-assisted fetch or inspect Big Red shop endpoints for allocated-list data.'
      });
    }

    const ilgEvents = await textFetch(INDIANA_LIQUOR_GROUP_EVENTS_URL, { headers: { accept: 'text/html,*/*' } });
    if (ilgEvents.ok) {
      for (const event of parseIndianaLiquorGroupEvents(ilgEvents.text, observedAt)) {
        const { match, record } = bottleMatch(event.rawName, bible);
        if (!record) continue;
        signals.push({
          id: stableId([config.id, 'indiana-liquor-group-tasting-event', record.id, event.city, event.locationText, event.dateText, event.timeText]),
          state: config.id,
          sourceLabel: 'Indiana Liquor Group bourbon/whiskey tasting events',
          sourceUrl: INDIANA_LIQUOR_GROUP_EVENTS_URL,
          rawName: event.rawName,
          canonicalBottleId: record.id,
          canonicalName: record.canonical,
          confidence: Math.max(0.70, match?.confidence || 0.45),
          eventType: 'retailer_tasting_event',
          locationPrecision: 'store_level',
          locationName: event.locationText,
          storeName: event.locationText,
          storeAddress: `${event.locationText}, ${event.city}, IN`,
          city: event.city,
          stateCode: 'IN',
          observedAt,
          fetchedAt: observedAt,
          quantity: null,
          price: null,
          availabilityStatus: 'retailer_event_watch',
          canAlertAsInventory: false,
          canAlertAsWatch: true,
          inventorySemantics: 'Indiana Liquor Group publishes dated store tasting events. These are actionable retailer watch/event signals, not bottle inventory.',
          evidence: `${event.rawName} tasting/event listed by Indiana Liquor Group at ${event.locationText}, ${event.city}${event.dateText ? ` on ${event.dateText}` : ''}${event.timeText ? ` ${event.timeText}` : ''}. Verify with the retailer before driving.`,
          raw: { source: 'indiana_liquor_group_events', event }
        });
      }
    } else {
      roadblocks.push({
        state: config.id,
        source: 'Indiana Liquor Group bourbon/whiskey tasting events',
        url: INDIANA_LIQUOR_GROUP_EVENTS_URL,
        status: ilgEvents.status || 0,
        error: ilgEvents.error || `HTTP ${ilgEvents.status}`,
        nextRoute: 'Retry ILG public events page and keep it as event/watch only unless it exposes specific inventory or allocated draw rows.'
      });
    }

    const kahns = await collectIndianaKahns(config, bible, observedAt);
    signals.push(...kahns.signals);
    roadblocks.push(...kahns.roadblocks);

    const payless = await collectIndianaPaylessBarrelSelections(config, bible, observedAt);
    signals.push(...payless.signals);
    roadblocks.push(...payless.roadblocks);

    const cityHive = await collectIndianaCityHive(config, bible, observedAt);
    signals.push(...cityHive.signals);
    roadblocks.push(...cityHive.roadblocks);
  } catch (error) {
    roadblocks.push({
      state: config.id,
      source: 'Indiana ATC public facility permit search',
      url: IN_ATC_SEARCH_URL,
      status: 0,
      error: error instanceof Error ? error.message : String(error),
      nextRoute: 'Inspect ASP.NET form fields/session cookie handling, then retry the active package-store permit search.'
    });
  }
  return { signals, roadblocks };
}

async function collectOregon(config, bible) {
  const signals = [], roadblocks = [];
  const browserOutPath = 'out/browser/OR-product-availability.json';
  try {
    const browserRun = JSON.parse(await readFile(browserOutPath, 'utf8'));
    for (const product of browserRun.products || []) {
      if (!Array.isArray(product.stores) || !product.stores.length) continue;
      const { base } = signalBase(config.id, 'Oregon Liquor Search browser-assisted product/location search', product.pageUrl || browserOutPath, product.name || product.itemCode, bible);
      for (const store of product.stores) {
        signals.push({
          id: stableId([config.id, 'or-browser-store', product.itemCode, store.storeNo, store.quantity]),
          ...base,
          eventType: Number(store.quantity || 0) > 0 ? 'store_inventory_result' : 'store_inventory_out_of_stock',
          locationPrecision: 'store_level',
          locationName: `Oregon Liquor Store ${store.storeNo}`,
          storeName: `Oregon Liquor Store ${store.storeNo}`,
          storeId: String(store.storeNo),
          storeAddress: [store.address, store.city, 'OR', store.zip].filter(Boolean).join(', '),
          city: store.city || null,
          stateCode: 'OR',
          postalCode: store.zip || null,
          quantity: Number(store.quantity || 0) || 0,
          price: product.bottlePrice ?? null,
          observedAt: browserRun.generatedAt || base.fetchedAt,
          evidence: `Oregon Liquor Search reports ${store.quantity} bottle(s) of ${product.name || product.itemCode} at store ${store.storeNo} in ${store.city || 'Oregon'} within ${store.distanceMiles ?? '?'} miles of ${browserRun.zip}. Oregon notes quantities update daily and should be verified with the store.`,
          raw: { product, store, caveat: 'Oregon Liquor Search quantity is not real-time; updated daily.' }
        });
      }
    }
    if (signals.length) {
      roadblocks.push({ state: config.id, source: 'Oregon Liquor Search browser-assisted search', url: 'https://www.oregonliquorsearch.com/', status: 200, error: 'Store-level rows require browser/session flow with age gate and selected product code; direct guessed API routes still fail.', nextRoute: 'Promote OR browser collector into scheduled standalone runner and expand beyond Portland ZIP/test terms.' });
      return { signals, roadblocks };
    }
    roadblocks.push({ state: config.id, source: 'Oregon Liquor Search browser-assisted search', url: browserOutPath, status: 0, error: 'Browser collector output found but no store rows parsed.', nextRoute: 'Inspect current Oregon HTML table format and product code search flow.' });
  } catch (error) {
    roadblocks.push({ state: config.id, source: 'Oregon Liquor Search browser-assisted search', url: browserOutPath, status: 0, error: error.message, nextRoute: 'Run npm run or after browser is available, then rerun npm run run.' });
  }
  return { signals, roadblocks };
}

async function collectOhio(config, bible) {
  const signals = [], roadblocks = [];
  const browserOutPath = 'out/browser/ohlq-availability.json';
  const discoveryPath = 'data/browser-discovery/ohlq-product-availability-discovery.json';
  try {
    const browserRun = JSON.parse(await readFile(browserOutPath, 'utf8'));
    for (const product of browserRun.products || []) {
      if (!product.ok || !Array.isArray(product.inventories)) continue;
      const productSku = String(product.sku || '').toLowerCase();
      const matchingRows = product.inventories.filter((store) => String(store.VariantCode || '').toLowerCase() === productSku);
      const bucketCounts = matchingRows.reduce((counts, store) => {
        const availability = ohlqAvailability(store.I);
        counts[availability.status] = (counts[availability.status] || 0) + 1;
        return counts;
      }, {});
      const positiveRows = matchingRows.filter((store) => ohlqAvailability(store.I).positive);
      for (const store of positiveRows) {
        const availability = ohlqAvailability(store.I);
        const { base } = signalBase(config.id, 'OHLQ browser-assisted product availability API', product.pageUrl || product.endpoint, product.productName || product.sku, bible);
        signals.push({
          id: stableId([config.id, 'ohlq-browser-live', product.sku, store.AgencyId, store.I, store.LastModified]),
          ...base,
          eventType: availability.status === 'in_stock' ? 'browser_assisted_store_inventory_in_stock' : 'browser_assisted_store_inventory_limited_supply',
          locationPrecision: 'store_level',
          locationName: store.AgencyName || `OHLQ Agency ${store.AgencyId}`,
          storeName: store.AgencyName || null,
          storeId: String(store.AgencyId || ''),
          storeAddress: [store.Address1, store.Address2, store.City, 'OH', store.Zip].filter(Boolean).join(', ') || null,
          city: store.City || null,
          stateCode: store.State || 'OH',
          postalCode: store.Zip || null,
          latitude: Number(store.Latitude ?? 0) || null,
          longitude: Number(store.Longitude ?? 0) || null,
          quantity: null,
          observedAt: browserRun.generatedAt || base.fetchedAt,
          availabilityStatus: availability.status,
          availabilityLabel: availability.label,
          availabilityValue: availability.value,
          evidence: `OHLQ browser-assisted collector decoded ${availability.label} for ${product.productName || product.sku} at ${store.AgencyName || store.AgencyId}${store.City ? ` in ${store.City}` : ''}. VariantCode=${product.sku}; bucket=${store.I || 'unknown'}; last modified=${store.LastModified || 'unknown'}. OHLQ exposes stock status buckets, not explicit bottle counts.`,
          raw: { product: { sku: product.sku, productName: product.productName, endpoint: product.endpoint, displayStatus: product.displayStatus, inventoryCount: product.inventoryCount, matchingVariantRowCount: matchingRows.length, positiveVariantRowCount: positiveRows.length, bucketCounts, generatedAt: browserRun.generatedAt }, availability: { ...availability, bucket: store.I || null }, store }
        });
      }
      if (!matchingRows.length) {
        roadblocks.push({ state: config.id, source: 'OHLQ browser-assisted product availability API', url: product.pageUrl || product.endpoint || browserOutPath, status: product.status || 200, error: `Browser collector returned ${product.inventoryCount || product.inventories.length} agency rows, but none matched VariantCode=${product.sku}.`, nextRoute: 'Inspect OHLQ availability bucket semantics and selected SKU/exclusive flag.' });
      }
    }
    for (const product of browserRun.products || []) {
      if (product.ok) continue;
      roadblocks.push({ state: config.id, source: 'OHLQ browser-assisted product availability API', url: product.pageUrl || product.endpoint || browserOutPath, status: product.status || 0, error: product.error || 'Browser collector did not return inventory rows', nextRoute: 'Check product slug/SKU, page Cloudflare state, and OHLQ rendered csrf token.' });
    }
    if (signals.length) {
      roadblocks.push({
        state: config.id,
        source: 'OHLQ direct server fetch',
        url: 'https://www.ohlq.com/api/product-availability/{sku}',
        status: 403,
        error: 'OHLQ live rows were collected through browser/CDP. Direct Node fetch remains Cloudflare-gated, so scheduled production collection needs a browser-assisted or token/cookie bootstrap runtime.',
        nextRoute: 'Run npm run ohlq before npm run run, or promote the browser bootstrap into the future scheduled engine runner.'
      });
      return { signals, roadblocks };
    }
  } catch {
    // Fall through to static discovery evidence below; the browser collector is optional for normal raw-fetch runs.
  }
  try {
    const prior = JSON.parse(await readFile('out/current-snapshot.json', 'utf8'));
    const priorOhlq = (prior.signals || []).filter((s) => s.state === config.id && /^browser_assisted_store_inventory_/.test(String(s.eventType || '')) && ['limited_supply', 'in_stock'].includes(String(s.availabilityStatus || '')));
    for (const s of priorOhlq) {
      signals.push({
        id: stableId([config.id, 'ohlq-prior-positive-status', s.key]),
        state: config.id,
        sourceLabel: s.sourceLabel || 'OHLQ browser-assisted product availability API',
        sourceUrl: s.sourceUrl,
        rawName: s.canonicalName,
        canonicalBottleId: s.bottleId || null,
        canonicalName: s.canonicalName,
        confidence: s.baseConfidence || s.confidence || 0.92,
        eventType: s.eventType,
        locationPrecision: s.locationPrecision,
        locationName: s.locationName,
        storeName: s.storeName,
        storeAddress: s.storeAddress,
        city: s.city,
        stateCode: 'OH',
        postalCode: s.zip || null,
        latitude: s.lat,
        longitude: s.lng,
        quantity: null,
        observedAt: s.observedAt || prior.generatedAt,
        availabilityStatus: s.availabilityStatus,
        availabilityLabel: s.availabilityLabel,
        availabilityValue: s.availabilityValue,
        evidence: `${s.evidence || `Preserved prior positive OHLQ ${s.availabilityLabel || s.availabilityStatus} status for ${s.canonicalName} at ${s.storeName || s.locationName}.`} Current scheduled browser refresh could not pass OHLQ Cloudflare, so this row is retained from the latest positive-status snapshot until a warmed browser refresh succeeds.`,
        raw: { restoredFromCurrentSnapshot: true, priorKey: s.key }
      });
    }
    if (signals.length) {
      roadblocks.push({ state: config.id, source: 'OHLQ scheduled browser refresh fallback', url: browserOutPath, status: 0, error: 'Current OHLQ browser artifact did not contain positive decoded rows; retained prior positive-status snapshot rows to avoid dropping known live site coverage.', nextRoute: 'Refresh OHLQ from an already-warmed interactive browser session or improve non-headless Cloudflare handling.' });
      return { signals, roadblocks };
    }
  } catch {
    // No prior operational OHLQ snapshot is available; fall through to static discovery evidence.
  }
  try {
    const discovery = JSON.parse(await readFile(discoveryPath, 'utf8'));
    const productName = discovery.productName || 'Eagle Rare 10 Year';
    const endpointUrl = `https://www.ohlq.com/api/product-availability/${discovery.sku || '{sku}'}`;
    for (const store of discovery.sampleInventories || []) {
      const { base } = signalBase(config.id, 'OHLQ browser-captured product availability API discovery', discovery.productPage || endpointUrl, productName, bible);
      signals.push({
        id: stableId([config.id, 'ohlq-browser-discovery', discovery.sku, store.AgencyId, store.LastModified]),
        ...base,
        eventType: 'browser_captured_store_inventory_sample',
        locationPrecision: 'store_level',
        locationName: store.AgencyName || `OHLQ Agency ${store.AgencyId}`,
        storeName: store.AgencyName || null,
        storeId: String(store.AgencyId || ''),
        storeAddress: [store.Address1, store.City, 'OH', store.Zip].filter(Boolean).join(', ') || null,
        city: store.City || null,
        stateCode: 'OH',
        postalCode: store.Zip || null,
        latitude: Number(store.Latitude ?? 0) || null,
        longitude: Number(store.Longitude ?? 0) || null,
        quantity: null,
        observedAt: discovery.capturedAt || base.fetchedAt,
        evidence: `Browser/CDP discovery confirmed OHLQ product availability endpoint returns store-level agency rows for ${productName}; sample row ${store.AgencyName || store.AgencyId} last modified ${store.LastModified || 'unknown'}. Quantity is encoded as availability buckets, not an explicit bottle count.`,
        raw: { discovery: { endpoint: discovery.endpoint, requiredHeader: discovery.requiredHeader, tokenSource: discovery.tokenSource, requiredSession: discovery.requiredSession, inventoryCount: discovery.browserProbeResults?.find((r) => r.status === 200)?.inventoryCount || null }, store, sampleOnly: true }
      });
    }
    roadblocks.push({
      state: config.id,
      source: 'OHLQ product availability API',
      url: endpointUrl,
      status: 403,
      error: 'Endpoint discovered and verified in browser, but direct Node fetch remains Cloudflare-gated and tokenless browser calls return HTTP 400. Requires browser-rendered csrf token from document.documentElement.dataset.csrfToken sent as RequestVerificationToken.',
      nextRoute: 'Implement browser-assisted collector/session bootstrap or a compliant token/cookie acquisition layer before treating OHLQ as live automated inventory.'
    });
  } catch (error) {
    roadblocks.push({ state: config.id, source: 'OHLQ browser discovery fixture', url: discoveryPath, status: 0, error: error.message, nextRoute: 'Re-run browser/CDP discovery on an OHLQ product page and save endpoint evidence.' });
  }
  return { signals, roadblocks };
}

function safePercentDecode(text) {
  return text.replace(/%[0-9A-Fa-f]{2}/g, (match) => {
    try { return decodeURIComponent(match); } catch { return match; }
  });
}

function htmlAttrDecode(text = '') {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function iowaNumber(value) {
  const n = Number(String(value ?? '').replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
}

function iowaBottleLooksRelevant(rawName = '', category = '', bible) {
  const hay = `${rawName} ${category}`;
  if (!rawName) return false;
  if (IOWA_EXCLUDED_RE.test(hay) && !IOWA_BOURBON_CATEGORY_RE.test(category)) return false;
  if (IOWA_STRONG_WATCH_RE.test(hay)) return true;
  const { record } = iowaSafeBottleMatch(rawName, category, bible);
  return Boolean(record && IOWA_BOURBON_CATEGORY_RE.test(hay));
}

function iowaSafeBottleMatch(rawName, category = '', bible) {
  const safe = cityHiveSafeBottleMatch(rawName, bible);
  if (!safe.record) return safe;
  const raw = normalizedBottleText(rawName);
  const canonical = normalizedBottleText(safe.record.canonical);
  const hay = normalizedBottleText(`${rawName} ${category}`);

  if (/\b(cream|liqueur|cordial|cocktail|ready to drink|vodka|gin|rum|tequila|mezcal|wine|beer)\b/.test(hay) && !/\b(bourbon|whiskey|whisky|rye)\b/.test(hay)) {
    return { ...safe, record: null, unsafeReason: 'iowa_non_whiskey_product' };
  }
  if (/four roses/.test(raw) && /\b(single barrel|small batch|bourbon)\b/.test(raw) && /limited edition/.test(canonical)) {
    return { ...safe, record: null, unsafeReason: 'iowa_four_roses_standard_not_limited_edition' };
  }
  if (/elijah craig/.test(raw) && /small batch/.test(raw) && /barrel proof/.test(canonical)) {
    return { ...safe, record: null, unsafeReason: 'iowa_elijah_craig_small_batch_not_barrel_proof' };
  }
  if (/woodford reserve/.test(raw) && !/batch proof/.test(raw) && /batch proof/.test(canonical)) {
    return { ...safe, record: null, unsafeReason: 'iowa_woodford_reserve_not_batch_proof' };
  }
  if (/weller/.test(raw) && /reserve/.test(raw) && !/single barrel/.test(raw) && /single barrel/.test(canonical)) {
    return { ...safe, record: null, unsafeReason: 'iowa_weller_reserve_not_single_barrel' };
  }
  if (/henry mckenna/.test(raw) && !/single barrel/.test(raw) && /single barrel/.test(canonical)) {
    return { ...safe, record: null, unsafeReason: 'iowa_henry_mckenna_not_single_barrel' };
  }
  return safe;
}

function iowaSignalBase(state, sourceLabel, sourceUrl, rawName, category, bible) {
  const { match, record, unsafeReason } = iowaSafeBottleMatch(rawName, category, bible);
  return { match, record, unsafeReason, base: {
    state,
    sourceLabel,
    sourceUrl,
    rawName,
    canonicalBottleId: record?.id || null,
    canonicalName: record?.canonical || titleCase(rawName),
    confidence: Math.max(record ? 0.72 : 0.68, match?.confidence || 0.35),
    sourceMatchStatus: record ? 'bottle_bible_match' : unsafeReason ? `source_name_kept:${unsafeReason}` : 'source_name_kept:no_safe_bible_match',
    fetchedAt: new Date().toISOString()
  }};
}

function iowaProductPriority(row, bible) {
  const rawName = row.Name || row.name || '';
  const category = row.Category || row.category || '';
  const delivered = iowaNumber(row.Delivered);
  const stock = iowaNumber(row.Stock);
  const { record } = iowaSafeBottleMatch(rawName, category, bible);
  return (IOWA_STRONG_WATCH_RE.test(`${rawName} ${category}`) ? 10000 : 0)
    + (record?.tier === 'unicorn' ? 5000 : record?.tier === 'allocated' ? 3500 : record?.tier === 'limited' ? 2000 : 0)
    + Math.min(delivered, 1500)
    + Math.min(stock, 800);
}

async function collectIowa(config, bible) {
  const signals = [], roadblocks = [];
  const observedAt = new Date().toISOString();
  const productByCode = new Map();
  let productRows = [];

  const inventoryRes = await textFetch(IOWA_INVENTORY_CSV_URL, { headers: { accept: 'text/csv,*/*', referer: IOWA_SNAPSHOT_PAGE_URL }, timeoutMs: 45_000 });
  if (!inventoryRes.ok || !/Name\s*,\s*Code\s*,\s*Category\s*,\s*Size\s*,\s*Stock\s*,\s*Delivered/i.test(inventoryRes.text)) {
    roadblocks.push({ state: config.id, source: 'Iowa ABD product inventory/delivery CSV', url: IOWA_INVENTORY_CSV_URL, status: inventoryRes.status || 0, error: inventoryRes.error || inventoryRes.text.slice(0, 240) || 'No product inventory CSV returned', nextRoute: 'Retry official shop.iowaabd.com/snapshot/inventory?download CSV or inspect the snapshot page for changed download parameters.' });
  } else {
    productRows = csvRows(inventoryRes.text)
      .filter((row) => row.Code && iowaBottleLooksRelevant(row.Name, row.Category, bible))
      .map((row) => ({ ...row, stockNumber: iowaNumber(row.Stock), deliveredNumber: iowaNumber(row.Delivered), priority: iowaProductPriority(row, bible) }))
      .filter((row) => row.stockNumber > 0 || row.deliveredNumber > 0)
      .sort((a, b) => b.priority - a.priority || b.deliveredNumber - a.deliveredNumber || b.stockNumber - a.stockNumber);

    for (const row of productRows.slice(0, 120)) {
      productByCode.set(String(row.Code).trim(), row);
      const rawName = row.Name;
      const { base, unsafeReason } = iowaSignalBase(config.id, 'Iowa ABD product inventory/delivery CSV', IOWA_INVENTORY_CSV_URL, rawName, row.Category, bible);
      signals.push({
        id: stableId([config.id, 'iowa-product-snapshot', row.Code, row.Stock, row.Delivered]),
        ...base,
        confidence: Math.max(0.72, base.confidence),
        eventType: row.deliveredNumber > 0 ? 'statewide_product_delivery_snapshot' : 'statewide_product_inventory_snapshot',
        locationPrecision: 'board_warehouse',
        locationName: 'Iowa ABD statewide product snapshot',
        stateCode: 'IA',
        itemCode: String(row.Code).trim(),
        size: row.Size || null,
        category: row.Category || null,
        quantity: row.deliveredNumber,
        warehouseQty: row.stockNumber,
        observedAt,
        canAlertAsInventory: false,
        canAlertAsWatch: true,
        inventorySemantics: 'Official Iowa ABD product snapshot reports statewide warehouse stock and 14-day delivered bottle totals. This is statewide delivery/warehouse intelligence, not live shelf inventory.',
        evidence: `Iowa ABD snapshot lists ${rawName} (#${row.Code}) with ${row.stockNumber} warehouse stock and ${row.deliveredNumber} bottles delivered statewide in the last 14 days.`,
        raw: { product: row, endpoint: IOWA_INVENTORY_CSV_URL, sourceCaveat: 'Statewide product/warehouse/delivery CSV; use code-specific CSV for licensee delivery rows. Not live shelf inventory.', sourceMatchStatus: base.sourceMatchStatus, unsafeReason: unsafeReason || null }
      });
    }
  }

  const deliveryProducts = productRows.filter((row) => row.deliveredNumber > 0).slice(0, IOWA_CODE_DELIVERY_FANOUT_LIMIT);
  let storeDeliveryRows = 0;
  for (const product of deliveryProducts) {
    if (storeDeliveryRows >= IOWA_STORE_ROW_LIMIT) break;
    const code = String(product.Code).trim();
    const url = `https://shop.iowaabd.com/snapshot/inventory?code=${encodeURIComponent(code)}&download`;
    try {
      const res = await textFetch(url, { headers: { accept: 'text/csv,*/*', referer: `${IOWA_SNAPSHOT_PAGE_URL}?code=${encodeURIComponent(code)}` }, timeoutMs: 30_000 });
      if (!res.ok || !/Location\s*,\s*Street\s*,\s*City\s*,\s*State\s*,\s*Zip\s*,\s*"?Bottles Delivered"?/i.test(res.text)) {
        roadblocks.push({ state: config.id, source: 'Iowa ABD code-specific 14-day delivery CSV', url, status: res.status || 0, error: res.error || res.text.slice(0, 180) || 'No code-specific delivery CSV returned', nextRoute: 'Retry code-specific snapshot CSV for the product code or inspect current snapshot parameters.' });
        continue;
      }
      for (const row of csvRows(res.text)) {
        if (storeDeliveryRows >= IOWA_STORE_ROW_LIMIT) break;
        const qty = iowaNumber(row['Bottles Delivered']);
        if (!qty || !row.Location) continue;
        storeDeliveryRows += 1;
        const rawName = product.Name;
        const { base, unsafeReason } = iowaSignalBase(config.id, 'Iowa ABD 14-day store delivery snapshot', url, rawName, product.Category, bible);
        const storeAddress = [row.Street, row.City, row.State, row.Zip].filter(Boolean).join(', ');
        signals.push({
          id: stableId([config.id, 'iowa-store-delivery', code, row.Location, row.Street, row.Zip, qty]),
          ...base,
          confidence: Math.max(0.78, base.confidence),
          eventType: 'store_delivery_snapshot',
          locationPrecision: 'store_level',
          locationName: row.Location || null,
          storeName: row.Location || null,
          storeId: stableId(['iowa-abd-licensee', row.Location, row.Street, row.Zip]),
          storeAddress,
          city: row.City || null,
          stateCode: row.State || 'IA',
          postalCode: row.Zip || null,
          zip: row.Zip || null,
          itemCode: code,
          size: product.Size || null,
          quantity: qty,
          warehouseQty: product.stockNumber,
          availabilityStatus: 'recent_delivery',
          availabilityLabel: `${qty} delivered in last 14 days`,
          observedAt,
          canAlertAsInventory: false,
          canAlertAsWatch: true,
          inventorySemantics: 'Official Iowa ABD code-specific CSV reports bottles delivered to a Class E licensee/store in the last 14 days. Delivery is a strong lead, but it is not current shelf stock or a hold/reservation.',
          evidence: `Iowa ABD reports ${qty} bottle(s) of ${rawName} (#${code}) delivered to ${row.Location}${storeAddress ? ` at ${storeAddress}` : ''} in the last 14 days. Verify directly before driving.`,
          raw: { code, product, delivery: row, endpoint: url, sourceCaveat: '14-day licensee delivery snapshot; not live shelf inventory.', sourceMatchStatus: base.sourceMatchStatus, unsafeReason: unsafeReason || null }
        });
      }
    } catch (error) {
      roadblocks.push({ state: config.id, source: 'Iowa ABD code-specific 14-day delivery CSV', url, status: 0, error: error.message, nextRoute: 'Retry code-specific snapshot CSV.' });
    }
  }

  const lotteryRes = await textFetch(IOWA_LOTTERY_ALLOCATIONS_CSV_URL, { headers: { accept: 'text/csv,*/*', referer: 'https://shop.iowaabd.com/snapshot/lottery' }, timeoutMs: 45_000 });
  if (!lotteryRes.ok || !/Code\s*,\s*Name\s*,\s*Bottles\s*,\s*Location/i.test(lotteryRes.text)) {
    roadblocks.push({ state: config.id, source: 'Iowa ABD allocated lottery allocations CSV', url: IOWA_LOTTERY_ALLOCATIONS_CSV_URL, status: lotteryRes.status || 0, error: lotteryRes.error || lotteryRes.text.slice(0, 240) || 'No lottery allocation CSV returned', nextRoute: 'Retry official lottery allocation CSV or inspect current Iowa ABD snapshot lottery download route.' });
  } else {
    let lotteryRows = 0;
    for (const row of csvRows(lotteryRes.text)) {
      if (lotteryRows >= IOWA_STORE_ROW_LIMIT) break;
      const rawName = row.Name || productByCode.get(row.Code)?.Name || '';
      if (!iowaBottleLooksRelevant(rawName, 'allocated bourbon whiskey lottery', bible)) continue;
      const qty = iowaNumber(row.Bottles);
      if (!qty || !row.Location) continue;
      lotteryRows += 1;
      const { base, unsafeReason } = iowaSignalBase(config.id, 'Iowa ABD allocated lottery store distribution CSV', IOWA_LOTTERY_ALLOCATIONS_CSV_URL, rawName, 'allocated bourbon whiskey lottery', bible);
      const storeAddress = [row.Street, row.City, row.State, row.Zip].filter(Boolean).join(', ');
      signals.push({
        id: stableId([config.id, 'iowa-store-allocation', row.Code, row.Location, row.Street, row.Zip, qty]),
        ...base,
        confidence: Math.max(0.8, base.confidence),
        eventType: 'store_allocation_snapshot',
        locationPrecision: 'store_level',
        locationName: row.Location || null,
        storeName: row.Location || null,
        storeId: stableId(['iowa-abd-licensee', row.Location, row.Street, row.Zip]),
        storeAddress,
        city: row.City || null,
        stateCode: row.State || 'IA',
        postalCode: row.Zip || null,
        zip: row.Zip || null,
        itemCode: row.Code || null,
        quantity: qty,
        availabilityStatus: 'allocated_distribution',
        availabilityLabel: `${qty} allocated via Iowa ABD lottery distribution`,
        observedAt,
        canAlertAsInventory: false,
        canAlertAsWatch: true,
        inventorySemantics: 'Official Iowa ABD lottery allocation CSV reports allocated bottles distributed to licensee/store locations. This is release/distribution intelligence, not live shelf inventory.',
        evidence: `Iowa ABD lottery allocation CSV lists ${qty} bottle(s) of ${rawName}${row.Code ? ` (#${row.Code})` : ''} for ${row.Location}${storeAddress ? ` at ${storeAddress}` : ''}. Verify lottery/distribution timing and store handling before driving.`,
        raw: { allocation: row, endpoint: IOWA_LOTTERY_ALLOCATIONS_CSV_URL, sourceCaveat: 'Allocated lottery distribution CSV; not live shelf inventory.', sourceMatchStatus: base.sourceMatchStatus, unsafeReason: unsafeReason || null }
      });
    }
  }

  if (!signals.some((signal) => signal.eventType === 'store_delivery_snapshot' || signal.eventType === 'store_allocation_snapshot')) {
    roadblocks.push({ state: config.id, source: 'Iowa ABD store-level snapshot expansion', url: IOWA_SNAPSHOT_PAGE_URL, status: 'no_store_rows', error: 'Official Iowa CSV endpoints were checked but no matching store-level delivery/allocation rows were emitted.', nextRoute: 'Inspect CSV filters/product-code fanout and broaden watch terms carefully.' });
  }

  return { signals, roadblocks };
}

async function collectUtah(config, bible) {
  const signals = [], roadblocks = [];
  for (const term of TRACKED_TERMS.UT) {
    try {
      const itemRes = await textFetch(`https://webapps2.abc.utah.gov/ProdApps/ProductLocatorCore/Products/GetItemsForTerm?term=${encodeURIComponent(term)}`, { headers: { 'x-requested-with': 'XMLHttpRequest', accept: 'application/json,*/*' }});
      const items = JSON.parse(itemRes.text);
      for (const item of items.slice(0, 4)) {
        const params = new URLSearchParams({ draw: '1', start: '0', length: '10', item_code: item.code, item_name: '', category: '', sub_category: '', price_min: '', price_max: '', on_spa: 'false', new_items: 'false', in_stock: 'false', status: '', 'order[0][column]': '0', 'order[0][dir]': 'asc', 'search[value]': '', 'search[regex]': 'false' });
        ['name','sku','displayGroup','status','warehouseQty','storeQty','onOrderQty','caseCost','bottlePrice','splitCaseFee','onSpa','isNewItem'].forEach((c,i)=>{ params.set(`columns[${i}][data]`, c); params.set(`columns[${i}][searchable]`, 'true'); params.set(`columns[${i}][orderable]`, 'true'); params.set(`columns[${i}][search][value]`, ''); params.set(`columns[${i}][search][regex]`, 'false'); });
        const res = await textFetch('https://webapps2.abc.utah.gov/ProdApps/ProductLocatorCore/Products/LoadProductTable', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8', 'x-requested-with': 'XMLHttpRequest', accept: 'application/json,*/*' }, body: params });
        const json = JSON.parse(res.text);
        for (const row of json.data || []) {
          const { base, unsafeReason } = aggregateSignalBase(config.id, 'Utah DABS Product Locator DataTables API', 'https://webapps2.abc.utah.gov/ProdApps/ProductLocatorCore', row.name, bible);
          const storeQty = Number(row.storeQty || 0) || 0;
          const warehouseQty = Number(row.warehouseQty || 0) || 0;
          signals.push({ id: stableId([config.id, row.sku, row.storeQty, row.warehouseQty, row.status]), ...base, eventType: 'board_inventory_aggregate', locationPrecision: 'board_warehouse', locationName: 'Utah DABS statewide locator aggregate', storeQty, warehouseQty, quantity: storeQty, onOrderQty: row.onOrderQty ?? null, price: Number(row.bottlePrice || row.currentPrice || 0) || null, availabilityStatus: storeQty > 0 ? 'STORE_AGGREGATE_POSITIVE' : warehouseQty > 0 ? 'WAREHOUSE_AGGREGATE_POSITIVE' : 'AGGREGATE_ZERO', availabilityLabel: storeQty > 0 ? `${storeQty} statewide store units reported` : warehouseQty > 0 ? `${warehouseQty} warehouse units reported` : 'No aggregate stock reported', observedAt: base.fetchedAt, canAlertAsInventory: false, canAlertAsWatch: false, inventorySemantics: 'Utah DABS Product Locator reports statewide storeQty and warehouseQty aggregates by SKU. This is board/warehouse intelligence, not exact store shelf inventory.', evidence: `Utah DABS API row for ${row.name}: storeQty=${row.storeQty}, warehouseQty=${row.warehouseQty}, status=${row.status}. This is statewide aggregate data, not a per-store shelf count.`, raw: { ...row, sourceCaveat: 'Statewide store/warehouse aggregate; exact store drilldown not extracted.', sourceMatchStatus: base.sourceMatchStatus, unsafeReason: unsafeReason || null } });
        }
      }
    } catch (error) {
      roadblocks.push({ state: config.id, source: 'Utah DABS Product Locator API', url: 'https://webapps2.abc.utah.gov/ProdApps/ProductLocatorCore', status: 0, error: error.message, nextRoute: 'Inspect product-detail session flow for per-store breakout.' });
    }
  }
  return { signals, roadblocks };
}

function idahoPriceFromCard(card = '') {
  const priceMatch = card.match(/product-price[\s\S]*?\$\s*([\d,]+)\s*<sup>(\d{2})<\/sup>/i);
  if (!priceMatch) return null;
  const dollars = Number(priceMatch[1].replace(/,/g, ''));
  const cents = Number(priceMatch[2]);
  if (!Number.isFinite(dollars) || !Number.isFinite(cents)) return null;
  return dollars + cents / 100;
}

function parseIdahoProductCards(html = '', pageUrl, sourceLabel) {
  const cards = [];
  const re = /<a\b[^>]*class=["'][^"']*\bproduct-loop-item\b[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of String(html || '').matchAll(re)) {
    const href = new URL(decodeHtml(match[1]), pageUrl).href;
    const card = match[2];
    const rawName = decodeHtml(stripHtml(card.match(/<h3\b[^>]*class=["'][^"']*\bproduct-title\b[^"']*["'][^>]*>([\s\S]*?)<\/h3>/i)?.[1] || '')).replace(/\s+/g, ' ').trim();
    const code = decodeHtml(stripHtml(card.match(/Product\s+Code:\s*([^<]+)/i)?.[1] || '')).replace(/\s+/g, ' ').trim() || href.match(/[?&]nabca=(\d+)/i)?.[1] || null;
    const size = decodeHtml(stripHtml(card.match(/<span\b[^>]*class=["'][^"']*\bproduct-size\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)?.[1] || '')).replace(/\s+/g, ' ').trim() || null;
    const proof = decodeHtml(stripHtml(card.match(/<span\b[^>]*class=["'][^"']*\bproduct-proof\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)?.[1] || '')).replace(/\s+/g, ' ').trim() || null;
    const price = idahoPriceFromCard(card);
    if (!rawName || !code) continue;
    cards.push({ rawName, code, size, proof, price, href, sourceLabel, pageUrl });
  }
  return cards;
}

function idahoProductRelevant(product, bible) {
  const hay = `${product.rawName || ''} ${product.description || ''}`;
  if (!hay.trim()) return false;
  if (IDAHO_EXCLUDE_RE.test(hay)) return false;
  if (IDAHO_WATCH_RE.test(hay)) return true;
  const { record } = bottleMatch(product.rawName, bible);
  return Boolean(record && /bourbon|whiskey|whisky/i.test(hay));
}

function idahoSafeBottleMatch(rawName, bible) {
  const safe = cityHiveSafeBottleMatch(rawName, bible);
  if (!safe.record) return safe;
  const raw = normalizedBottleText(rawName);
  const canonical = normalizedBottleText(safe.record.canonical);
  if (/four roses/.test(raw) && /single barrel/.test(raw) && /limited edition|small batch/.test(canonical)) {
    return { ...safe, record: null, unsafeReason: 'idaho_four_roses_single_barrel_not_limited_edition' };
  }
  if (/taylor/.test(raw) && /single barrel/.test(raw) && /small batch/.test(canonical)) {
    return { ...safe, record: null, unsafeReason: 'idaho_taylor_single_barrel_not_small_batch' };
  }
  return safe;
}

function idahoProductPriority(product, bible) {
  const { record } = idahoSafeBottleMatch(product.rawName, bible);
  return (RARE_RE.test(product.rawName) ? 10000 : 0)
    + (record?.tier === 'unicorn' ? 5000 : record?.tier === 'allocated' ? 3500 : record?.tier === 'limited' ? 2000 : 0)
    + (/single barrel|barrel|private|store pick|limited availability|special releases/i.test(product.rawName) ? 900 : 0)
    + (/special releases/i.test(product.sourceLabel) ? 700 : 0)
    + (/limited availability/i.test(product.sourceLabel) ? 500 : 0);
}

function idahoSignalBase(state, sourceLabel, sourceUrl, rawName, bible) {
  const { match, record, unsafeReason } = idahoSafeBottleMatch(rawName, bible);
  return { match, record, unsafeReason, base: {
    state,
    sourceLabel,
    sourceUrl,
    rawName,
    canonicalBottleId: record?.id || null,
    canonicalName: record?.canonical || titleCase(rawName),
    confidence: Math.max(record ? 0.76 : 0.72, match?.confidence || 0.35),
    sourceMatchStatus: record ? 'bottle_bible_match' : unsafeReason ? `source_name_kept:${unsafeReason}` : 'source_name_kept:no_safe_bible_match',
    fetchedAt: new Date().toISOString()
  }};
}

function idahoSourceEventAt(asOfText, observedAt) {
  const clean = String(asOfText || '').replace(/^as of\s+/i, '').trim();
  if (!clean) return null;
  const parsed = Date.parse(clean);
  if (!Number.isFinite(parsed)) return null;
  const ceiling = Date.parse(observedAt || '') || Date.now();
  if (parsed > ceiling + 5 * 60 * 1000) return null;
  return new Date(parsed).toISOString();
}

function parseIdahoAvailabilityRows(html = '') {
  const rows = [];
  const blocks = [...String(html || '').matchAll(/<li\b[^>]*class=["'][^"']*\blist-item\b[^"']*["'][^>]*>([\s\S]*?)<\/li>/gi)].map((m) => m[1]);
  for (const block of blocks) {
    const storeRaw = decodeHtml(stripHtml(block.match(/<strong>\s*Store:\s*<\/strong>\s*([\s\S]*?)<br\s*\/?>/i)?.[1] || '')).replace(/\s+/g, ' ').trim();
    const address = decodeHtml(stripHtml(block.match(/<strong>\s*Address:\s*<\/strong>\s*([\s\S]*?)<br\s*\/?>/i)?.[1] || '')).replace(/\s+/g, ' ').trim();
    const phone = decodeHtml(stripHtml(block.match(/<strong>\s*Phone:\s*<\/strong>\s*([\s\S]*?)(?:<a\b|<br\s*\/?>|<\/div>)/i)?.[1] || '')).replace(/\s+/g, ' ').trim() || null;
    const statusText = decodeHtml(stripHtml(block.match(/<span\b[^>]*class=["'][^"']*\bqty\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)?.[1] || '')).replace(/\s+/g, ' ').trim();
    const asOfText = decodeHtml(stripHtml(block.match(/<small\b[^>]*>([\s\S]*?)<\/small>/i)?.[1] || '')).replace(/\s+/g, ' ').trim() || null;
    if (!storeRaw || !IDAHO_POSITIVE_AVAILABILITY_RE.test(statusText) || /not\s+available|unavailable/i.test(statusText)) continue;
    const storeNumber = storeRaw.match(/Store\s+(\d+)/i)?.[1] || null;
    const distanceMiles = Number(storeRaw.match(/\((\d+(?:\.\d+)?)mi\)/i)?.[1]) || null;
    const storeName = storeRaw.replace(/\s*\(\d+(?:\.\d+)?mi\)\s*$/i, '').trim();
    const city = address.match(/,\s*([^,]+),\s*ID\s+\d{5}/i)?.[1]?.trim() || storeName.replace(/\s*\(Store\s+\d+\).*$/i, '').trim() || null;
    const zip = address.match(/\bID\s+(\d{5})(?:-\d{4})?\b/i)?.[1] || null;
    rows.push({ storeRaw, storeName, storeNumber, distanceMiles, address, phone, statusText, asOfText, city, zip });
  }
  return rows;
}

async function fetchIdahoAvailability(product, location) {
  const body = new URLSearchParams({ action: 'check_availability', location, nabca: product.code, name: product.rawName });
  return textFetch(IDAHO_AVAILABILITY_AJAX_URL, {
    method: 'POST',
    headers: {
      accept: 'text/html,*/*',
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'x-requested-with': 'XMLHttpRequest',
      referer: product.href || `${IDAHO_PRODUCT_BASE_URL}/?nabca=${encodeURIComponent(product.code)}`
    },
    body,
    timeoutMs: 30_000
  });
}

async function collectIdaho(config, bible) {
  const signals = [];
  const roadblocks = [];
  const observedAt = new Date().toISOString();
  const productMap = new Map();

  for (const source of [
    { url: IDAHO_LIMITED_PRODUCTS_URL, label: 'Idaho Liquor limited availability products' },
    { url: IDAHO_SPECIAL_RELEASES_URL, label: 'Idaho Liquor special releases' }
  ]) {
    const res = await textFetch(source.url, { headers: { accept: 'text/html,*/*' }, timeoutMs: 30_000 });
    if (!res.ok) {
      roadblocks.push({ state: config.id, source: source.label, url: source.url, status: res.status || 0, error: res.error || res.text.slice(0, 180), nextRoute: 'Retry Idaho Liquor public product-list page.' });
      continue;
    }
    for (const product of parseIdahoProductCards(res.text, source.url, source.label)) {
      if (!idahoProductRelevant(product, bible)) continue;
      const existing = productMap.get(product.code);
      if (!existing || idahoProductPriority(product, bible) > idahoProductPriority(existing, bible)) productMap.set(product.code, product);
    }
  }

  const products = [...productMap.values()]
    .sort((a, b) => idahoProductPriority(b, bible) - idahoProductPriority(a, bible) || String(a.rawName).localeCompare(String(b.rawName)))
    .slice(0, IDAHO_AVAILABILITY_PRODUCT_LIMIT);

  for (const product of products) {
    const { base, unsafeReason } = idahoSignalBase(config.id, product.sourceLabel, product.href, product.rawName, bible);
    signals.push({
      id: stableId([config.id, 'idaho-limited-product', product.code, product.rawName, product.sourceLabel]),
      ...base,
      confidence: Math.max(0.68, base.confidence),
      eventType: /special releases/i.test(product.sourceLabel) ? 'state_release_product_row' : 'limited_availability_product_row',
      locationPrecision: 'statewide_catalog',
      locationName: 'Idaho State Liquor Division',
      stateCode: 'ID',
      itemCode: product.code,
      size: product.size,
      proof: product.proof,
      price: product.price,
      observedAt,
      canAlertAsInventory: false,
      canAlertAsWatch: true,
      inventorySemantics: 'Idaho Liquor product-list pages expose limited/special-release catalog rows. Catalog rows are watch intelligence until a store availability row is separately extracted.',
      evidence: `Idaho Liquor lists ${product.rawName}${product.code ? ` (#${product.code})` : ''}${product.price ? ` at $${product.price.toFixed(2)}` : ''} on ${product.sourceLabel}.`,
      raw: { product, sourceMatchStatus: base.sourceMatchStatus, unsafeReason: unsafeReason || null }
    });
  }

  const seenStoreRows = new Set();
  let availabilityRows = 0;
  for (const product of products) {
    for (const location of IDAHO_AVAILABILITY_LOCATIONS) {
      let res;
      try {
        res = await fetchIdahoAvailability(product, location);
      } catch (error) {
        roadblocks.push({ state: config.id, source: 'Idaho Liquor product availability AJAX', url: IDAHO_AVAILABILITY_AJAX_URL, status: 0, error: error.message, nextRoute: 'Retry public WordPress check_availability AJAX endpoint.' });
        continue;
      }
      if (!res.ok) {
        roadblocks.push({ state: config.id, source: 'Idaho Liquor product availability AJAX', url: IDAHO_AVAILABILITY_AJAX_URL, status: res.status || 0, error: res.error || res.text.slice(0, 180), nextRoute: 'Retry public WordPress check_availability AJAX endpoint or inspect availability-modal.js for action parameter changes.' });
        continue;
      }
      const rows = parseIdahoAvailabilityRows(res.text);
      for (const row of rows) {
        const sourceEventAt = idahoSourceEventAt(row.asOfText, observedAt);
        const key = `${product.code}|${row.storeNumber || row.storeName}|${row.address}`;
        if (seenStoreRows.has(key)) continue;
        seenStoreRows.add(key);
        availabilityRows += 1;
        const { base, unsafeReason } = idahoSignalBase(config.id, 'Idaho Liquor product availability AJAX', product.href, product.rawName, bible);
        signals.push({
          id: stableId([config.id, 'idaho-store-availability', product.code, row.storeNumber || row.storeName, row.address, row.asOfText]),
          ...base,
          confidence: Math.max(0.82, base.confidence),
          eventType: 'store_inventory_result',
          locationPrecision: 'store_level',
          locationName: row.storeName,
          storeName: row.storeName,
          storeId: row.storeNumber ? `idaho-liquor-store-${row.storeNumber}` : stableId(['idaho-liquor-store', row.storeName, row.address]),
          storeAddress: row.address,
          city: row.city,
          stateCode: 'ID',
          postalCode: row.zip,
          zip: row.zip,
          phone: row.phone,
          itemCode: product.code,
          size: product.size,
          proof: product.proof,
          price: product.price,
          quantity: 0,
          availabilityStatus: 'in_stock',
          availabilityLabel: row.asOfText ? `Available (${row.asOfText})` : 'Available',
          availabilityValue: 'official_available_status',
          observedAt,
          sourceEventAt,
          canAlertAsInventory: true,
          canAlertAsWatch: true,
          inventorySemantics: 'Official Idaho Liquor public availability modal reports store-level Available status by product and searched location. It exposes status/as-of-date, not a bottle count or reservation; verify before driving.',
          evidence: `Idaho Liquor reports ${product.rawName}${product.code ? ` (#${product.code})` : ''} as Available at ${row.storeName}${row.address ? ` (${row.address})` : ''}${row.asOfText ? `, ${row.asOfText}` : ''}. Verify before driving; no bottle count is exposed.`,
          raw: { product, availability: row, searchedLocation: location, endpoint: IDAHO_AVAILABILITY_AJAX_URL, sourceCaveat: 'Store-level official availability status/as-of date, not a bottle count or reservation.', sourceMatchStatus: base.sourceMatchStatus, unsafeReason: unsafeReason || null }
        });
      }
      await sleep(150);
    }
  }

  if (products.length && !availabilityRows) {
    roadblocks.push({ state: config.id, source: 'Idaho Liquor product availability AJAX', url: IDAHO_AVAILABILITY_AJAX_URL, status: 'no_available_rows', error: 'Product-list pages were reachable but availability AJAX returned no parsed Available store rows for the configured Idaho location probes.', nextRoute: 'Inspect availability-modal.js/check_availability output shape or expand location probes.' });
  }

  return { signals, roadblocks };
}

const WAKE_WATCH_ITEM_RE = /blanton|eagle rare|weller|buffalo trace|stagg|old fitz|fitzgerald|michter|willett|pappy|van winkle|baker'?s?|e\.?\s*h\.?\s*taylor|colonel\s+taylor|elijah craig[^\n]{0,50}barrel proof|woodford|four roses|knob creek/i;
const WAKE_EXCLUDED_ITEM_RE = /john\s+d\s+taylor|old\s+taylor|taylor\s+port|falernum|cream|white\s+dog|tequila|corazon|expresiones|reposado|a[ñn]ejo|vodka|gin|rum|liqueur|cordial|beer|wine|cocktail|seltzer|moonshine/i;

function wakeProductBlocks(html = '') {
  const text = String(html);
  const blocks = [];
  const re = /<div\s+class=["'][^"']*\bwake-product\b[^"']*["'][^>]*>/gi;
  const starts = [...text.matchAll(re)].map((match) => match.index).filter(Number.isInteger);
  for (let i = 0; i < starts.length; i += 1) {
    blocks.push(text.slice(starts[i], starts[i + 1] ?? text.length));
  }
  return blocks;
}

function normalizeWakeAddress(html = '') {
  return stripHtml(String(html).replace(/<br\s*\/?\s*>/gi, ', ')).replace(/\s*,\s*/g, ', ').replace(/\s+/g, ' ').trim();
}

function parseWakeAddressParts(address = '') {
  const match = String(address).match(/^(.*?),\s*([^,]+),\s*NC\s+(\d{5})(?:-\d{4})?$/i);
  if (!match) return { city: null, postalCode: null };
  return { city: match[2].trim(), postalCode: match[3] };
}

function parseWakeProducts(html, config, bible, url, term) {
  const blocks = wakeProductBlocks(html);
  const signals = [];
  let positiveStoreRows = 0;
  let matchedProductBlocks = 0;

  for (const block of blocks) {
    const rawName = stripHtml(block.match(/<h4[^>]*>([\s\S]*?)<\/h4>/i)?.[1] || '').replace(/\s+/g, ' ').trim();
    if (!rawName || !WAKE_WATCH_ITEM_RE.test(rawName) || WAKE_EXCLUDED_ITEM_RE.test(rawName)) continue;
    if (/^BAKER'?S$/i.test(rawName)) continue;
    const plu = stripHtml(block.match(/PLU:\s*([^<]+)/i)?.[1] || '').replace(/\s+/g, ' ').trim();
    const price = Number(stripHtml(block.match(/<span[^>]+class=["']price["'][^>]*>([\s\S]*?)<\/span>/i)?.[1] || '').replace(/[^\d.]/g, '')) || null;
    const size = stripHtml(block.match(/<span[^>]+class=["']size["'][^>]*>([\s\S]*?)<\/span>/i)?.[1] || '').replace(/\s+/g, ' ').trim() || null;
    const storeRows = [...block.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)];
    if (!storeRows.length) continue;
    matchedProductBlocks += 1;

    for (const rowMatch of storeRows) {
      const row = rowMatch[1];
      const address = normalizeWakeAddress(row.match(/<span[^>]+class=["']address["'][^>]*>([\s\S]*?)<\/span>/i)?.[1] || '');
      const quantityText = stripHtml(row.match(/<span[^>]+class=["']quantity["'][^>]*>([\s\S]*?)<\/span>/i)?.[1] || '').replace(/\s+/g, ' ').trim();
      const quantity = Number(quantityText.match(/(\d+)/)?.[1] || 0);
      if (!address || !Number.isFinite(quantity) || quantity <= 0) continue;
      positiveStoreRows += 1;
      const { city, postalCode } = parseWakeAddressParts(address);
      const { base } = signalBase(config.id, 'Wake County ABC store inventory search', url, rawName, bible);
      signals.push({
        id: stableId([config.id, 'wake-store-inventory', plu || rawName, address, quantity]),
        ...base,
        confidence: Math.max(0.82, base.confidence),
        eventType: 'store_inventory_result',
        locationPrecision: 'store_level',
        locationName: `Wake County ABC - ${address}`,
        storeName: `Wake County ABC - ${address}`,
        storeId: stableId(['wake-abc-store', address]),
        storeAddress: address,
        city,
        county: 'Wake',
        stateCode: 'NC',
        postalCode,
        ncCode: plu || null,
        price,
        size,
        quantity,
        availabilityLabel: `${quantity} reported in stock`,
        observedAt: base.fetchedAt,
        canAlertAsInventory: true,
        canAlertAsWatch: true,
        inventorySemantics: 'Official Wake County ABC public inventory search result with per-store bottle counts. Verify before driving.',
        evidence: `Wake County ABC public inventory reports ${quantity} bottle(s) of ${rawName}${plu ? ` (PLU ${plu})` : ''} at ${address}${price ? ` for $${price.toFixed(2)}` : ''}. Verify before driving.`,
        raw: { term, plu, rawName, price, size, quantityText, endpoint: 'https://wakeabc.com/search-results/', sourceCaveat: 'Public Wake County ABC inventory search; official per-store count, not a hold/reservation.' }
      });
    }
  }

  return { signals, probe: { term, productBlocks: blocks.length, matchedProductBlocks, positiveStoreRows } };
}

async function collectWakeNc(config, bible) {
  const signals = [];
  const roadblocks = [];
  const probeReports = [];
  const url = 'https://wakeabc.com/search-results/';

  for (const term of NC_STORE_INVENTORY_TERMS) {
    try {
      const res = await textFetch(url, {
        method: 'POST',
        headers: { accept: 'text/html,*/*', 'content-type': 'application/x-www-form-urlencoded', referer: 'https://wakeabc.com/search-our-inventory/' },
        body: new URLSearchParams({ productSearch: term }),
        timeoutMs: 30_000
      });
      if (!res.ok) {
        roadblocks.push({ state: config.id, source: 'Wake County ABC store inventory search', url, status: res.status || 0, error: res.error || res.text.slice(0, 240), nextRoute: 'Retry Wake County ABC public inventory POST or inspect form changes.' });
        continue;
      }
      const parsed = parseWakeProducts(res.text, config, bible, `${url}?productSearch=${encodeURIComponent(term)}`, term);
      signals.push(...parsed.signals);
      probeReports.push({ source: 'Wake County ABC store inventory search', url, term, status: res.status, ...parsed.probe });
    } catch (error) {
      roadblocks.push({ state: config.id, source: 'Wake County ABC store inventory search', url, status: 0, error: error.message, nextRoute: 'Use browser form submission/network capture.' });
    }
  }

  if (!signals.length) {
    roadblocks.push({ state: config.id, source: 'Wake County ABC store inventory search', url, status: 'no_positive_store_rows', error: 'Public inventory form was reachable but no tracked bourbon/whiskey searches produced positive store quantities.', nextRoute: 'Inspect Wake search result HTML for changed classes or broaden terms carefully.' });
  }

  return { signals, roadblocks, probeReports };
}

function safeGreensboroCoordinate(value, kind) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (kind === 'lat') return n >= 33 && n <= 37 ? n : null;
  return n <= -75 && n >= -85 ? n : null;
}

function normalizeGreensboroStore(record) {
  const id = String(record.internalid || '').trim();
  const name = String(record.name || '').trim();
  const address1 = String(record.address1 || '').trim();
  const city = String(record.city || '').trim() || 'Greensboro';
  const state = String(record.state || '').trim() || 'NC';
  const zip = String(record.zip || '').trim();
  const isRetailStore = record.locationtype === '1' && /^Store\s+\d+\b/i.test(name) && address1 && state === 'NC';
  if (!id || !isRetailStore) return null;
  return {
    id,
    name,
    address: [address1, city, state, zip].filter(Boolean).join(', '),
    city,
    state,
    zip,
    phone: String(record.phone || '').trim() || null,
    lat: safeGreensboroCoordinate(record.location?.latitude, 'lat'),
    lng: safeGreensboroCoordinate(record.location?.longitude, 'lng'),
    raw: record
  };
}

async function greensboroStores() {
  const url = `${GREENSBORO_ABC_BASE_URL}/scs/services/Location.Service.ss?c=${GREENSBORO_ABC_COMPANY_ID}&n=${GREENSBORO_ABC_SITE_ID}&results_per_page=50`;
  const res = await textFetch(url, {
    headers: { accept: 'application/json,*/*', referer: `${GREENSBORO_ABC_BASE_URL}/stores` },
    timeoutMs: 20_000
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}${res.error ? `: ${res.error}` : ''}`);
  const json = JSON.parse(res.text);
  const stores = new Map();
  for (const record of json.records || []) {
    const store = normalizeGreensboroStore(record);
    if (store) stores.set(store.id, store);
  }
  return { url, rawCount: (json.records || []).length, totalRecordsFound: json.totalRecordsFound || null, stores };
}

function greensboroItemName(item) {
  return String(item.storedisplayname2 || item.displayname || item.itemid || '').replace(/\s+/g, ' ').trim();
}

function greensboroProductUrl(item) {
  const slug = String(item.urlcomponent || '').trim();
  return slug ? `${GREENSBORO_ABC_BASE_URL}/${encodeURIComponent(slug).replace(/%2F/gi, '/')}` : `${GREENSBORO_ABC_BASE_URL}/search?keywords=${encodeURIComponent(greensboroItemName(item))}`;
}

function isGreensboroBourbonWatchItem(name, bible) {
  if (!name || !GREENSBORO_WATCH_ITEM_RE.test(name)) return false;
  if (GREENSBORO_EXCLUDED_ITEM_RE.test(name)) return false;
  return Boolean(bible.match(name)?.record);
}

function powerBiHeaders(resourceKey = HIGH_POINT_POWERBI_RESOURCE_KEY) {
  return {
    accept: 'application/json',
    activityid: randomUUID(),
    requestid: randomUUID(),
    'x-powerbi-resourcekey': resourceKey
  };
}

function powerBiCellValue(value, selector, valueDicts) {
  if (selector?.DN && Number.isInteger(value) && Array.isArray(valueDicts?.[selector.DN])) {
    return valueDicts[selector.DN][value] ?? value;
  }
  return value;
}

function decodePowerBiRows(queryData) {
  const data = queryData?.results?.[0]?.result?.data;
  const ds = data?.dsr?.DS?.[0];
  const rows = ds?.PH?.[0]?.DM0 || [];
  const selectors = rows[0]?.S || [];
  const valueDicts = ds?.ValueDicts || {};
  const decoded = [];
  for (const row of rows) {
    if (!Array.isArray(row.C)) continue;
    const out = {};
    let cIndex = 0;
    for (let i = 0; i < selectors.length; i += 1) {
      const selector = selectors[i];
      const omitted = row.R && (row.R & (1 << i));
      const key = selector.N;
      if (omitted) {
        out[key] = null;
        continue;
      }
      out[key] = powerBiCellValue(row.C[cIndex], selector, valueDicts);
      cIndex += 1;
    }
    decoded.push(out);
  }
  return { rows: decoded, rowCount: data?.metrics?.Events?.find((event) => event.Metrics?.RowCount)?.Metrics?.RowCount || decoded.length, timestamp: data?.timestamp || null };
}

function highPointPowerBiProductQuery(model) {
  const visual = model?.exploration?.sections?.flatMap((section) => section.visualContainers || [])
    .find((container) => /tableEx/.test(container.config || '') && /Stock Levels\.WendoverAve/.test(container.query || ''));
  if (!visual?.query || !model?.models?.[0]?.id) return null;
  const query = JSON.parse(visual.query);
  const command = query.Commands?.[0]?.SemanticQueryDataShapeCommand;
  if (command?.Binding?.DataReduction?.Primary) command.Binding.DataReduction.Primary = { Top: { Count: HIGH_POINT_POWERBI_MAX_ROWS } };
  return {
    version: '1.0.0',
    queries: [{
      Query: query,
      ApplicationContext: {
        DatasetId: model.models[0].dbName,
        Sources: [{ ReportId: model.exploration?.id || HIGH_POINT_POWERBI_RESOURCE_KEY, VisualId: String(visual.id || '') }]
      }
    }],
    cancelQueries: [],
    modelId: model.models[0].id
  };
}

async function collectHighPointPowerBiNc(config, bible) {
  const signals = [];
  const roadblocks = [];
  const probeReports = [];
  const observedAt = new Date().toISOString();
  const modelUrl = `${HIGH_POINT_POWERBI_CLUSTER}/public/reports/${HIGH_POINT_POWERBI_RESOURCE_KEY}/modelsAndExploration?preferReadOnlySession=true`;
  const queryUrl = `${HIGH_POINT_POWERBI_CLUSTER}/public/reports/querydata`;

  const modelRes = await textFetch(modelUrl, { headers: powerBiHeaders(), timeoutMs: 30_000 });
  if (!modelRes.ok) {
    roadblocks.push({ state: config.id, source: 'High Point ABC public Power BI inventory model', url: HIGH_POINT_POWERBI_REPORT_URL, status: modelRes.status, error: modelRes.error || modelRes.text.slice(0, 240), nextRoute: 'Retry the public Power BI embed model endpoint from High Point ABC View Inventory.' });
    return { signals, roadblocks, probeReports };
  }

  let model;
  try {
    model = JSON.parse(modelRes.text);
  } catch (error) {
    roadblocks.push({ state: config.id, source: 'High Point ABC public Power BI inventory model', url: HIGH_POINT_POWERBI_REPORT_URL, status: modelRes.status, error: `Could not parse model JSON: ${error.message}`, nextRoute: 'Inspect public Power BI modelsAndExploration response contract.' });
    return { signals, roadblocks, probeReports };
  }

  const body = highPointPowerBiProductQuery(model);
  if (!body) {
    roadblocks.push({ state: config.id, source: 'High Point ABC public Power BI inventory query', url: HIGH_POINT_POWERBI_REPORT_URL, status: 'query_not_found', error: 'Could not find Stock Levels table visual/query in public Power BI model.', nextRoute: 'Inspect the embedded Power BI exploration for renamed visuals or fields.' });
    return { signals, roadblocks, probeReports };
  }

  const queryRes = await textFetch(queryUrl, { method: 'POST', body: JSON.stringify(body), headers: { ...powerBiHeaders(), 'content-type': 'application/json' }, timeoutMs: 45_000 });
  if (!queryRes.ok) {
    roadblocks.push({ state: config.id, source: 'High Point ABC public Power BI inventory querydata', url: HIGH_POINT_POWERBI_REPORT_URL, status: queryRes.status, error: queryRes.error || queryRes.text.slice(0, 240), nextRoute: 'Retry Power BI querydata POST with the current table visual query and model id.' });
    return { signals, roadblocks, probeReports };
  }

  let queryData;
  try {
    queryData = JSON.parse(queryRes.text);
  } catch (error) {
    roadblocks.push({ state: config.id, source: 'High Point ABC public Power BI inventory querydata', url: HIGH_POINT_POWERBI_REPORT_URL, status: queryRes.status, error: `Could not parse querydata JSON: ${error.message}`, nextRoute: 'Inspect public Power BI querydata response contract.' });
    return { signals, roadblocks, probeReports };
  }

  const { rows, rowCount, timestamp } = decodePowerBiRows(queryData);
  const matchedProducts = new Set();
  let positiveStoreRows = 0;
  for (const row of rows) {
    const rawName = String(row.G1 || '').replace(/\s+/g, ' ').trim();
    const ncCode = String(row.G0 || '').trim();
    const hay = `${rawName} ${ncCode}`;
    if (!rawName || !HIGH_POINT_WATCH_ITEM_RE.test(hay) || HIGH_POINT_EXCLUDED_ITEM_RE.test(hay)) continue;
    matchedProducts.add(`${ncCode}|${rawName}`);
    const price = Number(row.M7 || 0) || null;
    const sizeLiters = Number(row.M8 || 0) || null;
    for (const [storeIndex, store] of HIGH_POINT_STORES.entries()) {
      const qty = Number(row[`M${storeIndex}`] || 0);
      if (!Number.isFinite(qty) || qty <= 0) continue;
      positiveStoreRows += 1;
      const { base } = signalBase(config.id, 'High Point ABC public Power BI store inventory', HIGH_POINT_POWERBI_REPORT_URL, rawName, bible);
      signals.push({
        id: stableId([config.id, 'high-point-powerbi-store-inventory', ncCode, store.storeId, qty, price]),
        ...base,
        canonicalBottleId: base.canonicalBottleId,
        canonicalName: base.canonicalName || titleCase(rawName),
        confidence: Math.max(0.82, base.confidence),
        eventType: 'store_inventory_result',
        locationPrecision: 'store_level',
        locationName: `High Point ABC - ${store.label}`,
        storeName: `High Point ABC - ${store.label}`,
        storeId: store.storeId,
        city: 'High Point',
        county: 'Guilford',
        ncCode,
        price,
        size: sizeLiters ? `${sizeLiters}L` : null,
        quantity: qty,
        observedAt: timestamp || observedAt,
        availabilityStatus: 'in_stock',
        availabilityLabel: `${qty} reported available at ${store.label}`,
        canAlertAsInventory: true,
        canAlertAsWatch: true,
        inventorySemantics: 'Official High Point ABC public Power BI inventory table with per-store bottle counts. Verify before driving.',
        evidence: `High Point ABC public inventory reports ${qty} bottle(s) of ${rawName}${ncCode ? ` (NC Code ${ncCode})` : ''} at ${store.label}${price ? ` for $${price.toFixed(2)}` : ''}.`,
        raw: { ncCode, rawName, price, sizeLiters, storeField: store.field, endpoint: HIGH_POINT_POWERBI_VIEW_URL, sourceCaveat: 'Public Power BI embed on High Point ABC View Inventory; official per-store count, not a hold/reservation.' }
      });
    }
  }

  probeReports.push({ source: 'High Point ABC public Power BI store inventory', url: HIGH_POINT_POWERBI_REPORT_URL, modelUrl, queryUrl, status: queryRes.status, totalRows: rowCount, decodedRows: rows.length, matchedProductCount: matchedProducts.size, positiveStoreRows, storeColumns: HIGH_POINT_STORES.map((store) => store.label), observedAt: timestamp || observedAt });
  if (!signals.length) {
    roadblocks.push({ state: config.id, source: 'High Point ABC public Power BI store inventory', url: HIGH_POINT_POWERBI_REPORT_URL, status: 'no_positive_tracked_rows', error: 'Power BI table was reachable but no matched tracked bourbon/whiskey rows had positive store quantities.', nextRoute: 'Broaden tracked terms carefully or inspect table filters/field names.' });
  }
  return { signals, roadblocks, probeReports };
}

async function collectHighPointNc(config, bible) {
  const signals = [];
  const roadblocks = [];
  const probeReports = [];
  const seen = new Set();
  const observedAt = new Date().toISOString();

  const powerBi = await collectHighPointPowerBiNc(config, bible);
  signals.push(...powerBi.signals);
  roadblocks.push(...powerBi.roadblocks);
  probeReports.push(...(powerBi.probeReports || []));

  for (const term of NC_STORE_INVENTORY_TERMS) {
    const url = `${HIGH_POINT_ABC_BASE_URL}/search/suggest.json?q=${encodeURIComponent(term)}&resources[type]=product&resources[limit]=10`;
    let json;
    try {
      const res = await textFetch(url, { headers: { accept: 'application/json,*/*', referer: `${HIGH_POINT_ABC_BASE_URL}/pages/view-inventory` }, timeoutMs: 20_000 });
      if (!res.ok) throw new Error(`HTTP ${res.status}${res.error ? `: ${res.error}` : ''}`);
      json = JSON.parse(res.text);
      const products = json.resources?.results?.products || [];
      probeReports.push({ source: 'High Point ABC Shopify product suggestion API', url, status: res.status, term, returned: products.length });
    } catch (error) {
      roadblocks.push({
        state: config.id,
        source: 'High Point ABC Shopify product suggestion API',
        url,
        status: 0,
        error: error.message,
        nextRoute: 'Retry public Shopify /search/suggest.json or inspect the public View Inventory page network calls.'
      });
      continue;
    }

    for (const product of json.resources?.results?.products || []) {
      const rawName = stripHtml(product.body || product.title || '').replace(/\s+/g, ' ').trim() || stripHtml(product.title || '');
      const hay = `${product.title || ''} ${product.body || ''}`;
      if (!rawName || !HIGH_POINT_WATCH_ITEM_RE.test(hay) || HIGH_POINT_EXCLUDED_ITEM_RE.test(hay)) continue;
      const productId = String(product.id || product.handle || rawName);
      if (seen.has(productId)) continue;
      seen.add(productId);
      if (!bible.match(rawName)?.record && !bible.match(product.title || '')?.record) continue;
      const available = product.available === true;
      const productUrl = product.url ? new URL(product.url, HIGH_POINT_ABC_BASE_URL).toString() : `${HIGH_POINT_ABC_BASE_URL}/search?q=${encodeURIComponent(rawName)}`;
      const price = Number(product.price || product.price_min || product.price_max || 0) || null;
      const { base } = signalBase(config.id, 'High Point ABC Shopify product availability', productUrl, rawName, bible);
      signals.push({
        id: stableId([config.id, 'high-point-shopify-availability', productId, available ? 'available' : 'sold-out', price]),
        ...base,
        confidence: Math.max(available ? 0.7 : 0.62, base.confidence),
        eventType: available ? 'store_inventory_aggregate' : 'store_inventory_out_of_stock',
        locationPrecision: 'store_aggregate',
        locationName: 'High Point ABC stores',
        county: 'Guilford',
        price,
        quantity: null,
        observedAt,
        availabilityStatus: available ? 'available_in_board_catalog' : 'sold_out_in_board_catalog',
        availabilityLabel: available ? 'Listed available by High Point ABC storefront' : 'Listed sold out by High Point ABC storefront',
        canAlertAsInventory: false,
        canAlertAsWatch: true,
        inventorySemantics: 'Official Shopify storefront product availability for High Point ABC; public endpoint does not expose per-store quantity.',
        evidence: `High Point ABC public storefront lists ${rawName}${available ? ' as available' : ' as sold out'}${price ? ` at $${price.toFixed(2)}` : ''}. This is board storefront availability, not a per-store shelf count.`,
        raw: { product, endpoint: url, precisionCaveat: 'Shopify product availability only; no per-store pickup rows exposed by the public endpoint.' }
      });
    }
  }

  if (!signals.length) {
    roadblocks.push({
      state: config.id,
      source: 'High Point ABC Shopify product availability',
      url: `${HIGH_POINT_ABC_BASE_URL}/pages/view-inventory`,
      status: 'no_tracked_rows',
      error: 'Public Shopify suggestion endpoint was reachable but did not produce matched tracked bourbon/whiskey rows.',
      nextRoute: 'Broaden terms carefully or inspect rendered product pages for a store-pickup component.'
    });
  }

  return { signals, roadblocks, probeReports };
}

async function collectGreensboroNc(config, bible) {
  const signals = [];
  const roadblocks = [];
  let storeResult;
  try {
    storeResult = await greensboroStores();
  } catch (error) {
    roadblocks.push({
      state: config.id,
      source: 'Greensboro ABC SuiteCommerce store locator service',
      url: `${GREENSBORO_ABC_BASE_URL}/scs/services/Location.Service.ss?c=${GREENSBORO_ABC_COMPANY_ID}&n=${GREENSBORO_ABC_SITE_ID}`,
      status: 0,
      error: error.message,
      nextRoute: 'Retry the public SuiteCommerce Location.Service endpoint from the rendered /stores page.'
    });
    return { signals, roadblocks, probeReports: [] };
  }

  const seenItems = new Set();
  const observedAt = new Date().toISOString();
  const probeReports = [{
    source: 'Greensboro ABC SuiteCommerce store locator service',
    url: storeResult.url,
    status: 200,
    rawLocationCount: storeResult.rawCount,
    retailStoreCount: storeResult.stores.size,
    note: 'Maps SuiteCommerce internal pickup location IDs to Greensboro ABC public store names and addresses.'
  }];

  for (const term of NC_STORE_INVENTORY_TERMS) {
    const apiUrl = `${GREENSBORO_ABC_BASE_URL}/api/items?c=${GREENSBORO_ABC_COMPANY_ID}&country=US&currency=USD&fieldset=search&include=facets&language=en&limit=24&n=${GREENSBORO_ABC_SITE_ID}&offset=0&pricelevel=5&q=${encodeURIComponent(term)}&sort=custitem_ns_sc_ext_ts_7_quantity%3Adesc&use_pcv=T`;
    let json;
    try {
      const res = await textFetch(apiUrl, {
        headers: { accept: 'application/json,*/*', referer: `${GREENSBORO_ABC_BASE_URL}/search?keywords=${encodeURIComponent(term)}` },
        timeoutMs: 20_000
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}${res.error ? `: ${res.error}` : ''}`);
      json = JSON.parse(res.text);
      probeReports.push({ source: 'Greensboro ABC SuiteCommerce item search API', url: apiUrl, status: res.status, term, total: json.total || 0, returned: (json.items || []).length });
    } catch (error) {
      roadblocks.push({
        state: config.id,
        source: 'Greensboro ABC SuiteCommerce item search API',
        url: apiUrl,
        status: 0,
        error: error.message,
        nextRoute: 'Retry the public /api/items search endpoint and inspect rendered search network calls if the contract changed.'
      });
      continue;
    }

    for (const item of json.items || []) {
      const itemId = String(item.internalid || item.itemid || greensboroItemName(item));
      if (seenItems.has(itemId)) continue;
      seenItems.add(itemId);
      const rawName = greensboroItemName(item);
      if (!isGreensboroBourbonWatchItem(rawName, bible)) continue;
      const rows = item.quantityavailableforstorepickup_detail?.locations || [];
      for (const row of rows) {
        const qty = Number(row.qtyavailableforstorepickup || 0);
        if (!Number.isFinite(qty) || qty <= 0) continue;
        const store = storeResult.stores.get(String(row.internalid));
        if (!store) continue;
        const { base } = signalBase(config.id, 'Greensboro ABC SuiteCommerce pickup inventory', greensboroProductUrl(item), rawName, bible);
        signals.push({
          id: stableId([config.id, 'greensboro-suitecommerce-pickup', item.internalid || item.itemid, store.id, qty]),
          ...base,
          eventType: 'store_inventory_result',
          locationPrecision: 'store_level',
          locationName: store.name,
          storeName: store.name,
          storeId: `greensboro-${store.id}`,
          storeAddress: store.address,
          city: store.city,
          county: 'Guilford',
          zip: store.zip,
          lat: store.lat,
          lng: store.lng,
          quantity: qty,
          observedAt,
          availabilityStatus: 'in_stock',
          availabilityLabel: `${qty} reported available for pickup`,
          canAlertAsInventory: true,
          canAlertAsWatch: true,
          inventorySemantics: 'Greensboro ABC public SuiteCommerce pickup API reports positive per-store pickup quantity. Treat as official storefront availability and verify before driving.',
          evidence: `Greensboro ABC public storefront reports ${qty} bottle(s) of ${rawName} available for pickup at ${store.name}, ${store.address}. Verify with the store before driving.`,
          raw: {
            item: {
              internalid: item.internalid || null,
              itemid: item.itemid || null,
              displayname: item.displayname || null,
              storedisplayname2: item.storedisplayname2 || null,
              urlcomponent: item.urlcomponent || null,
              isinstock: item.isinstock ?? null,
              storefrontQuantityField: item.custitem_ns_sc_ext_ts_7_quantity ?? null
            },
            store: { internalid: store.id, name: store.name, address: store.address, phone: store.phone },
            endpoint: apiUrl,
            sourceCaveat: 'Public SuiteCommerce pickup quantity by store. Treat as official storefront availability with verify-before-driving caveat, not a guaranteed shelf hold.'
          }
        });
      }
    }
  }

  if (!signals.length) {
    roadblocks.push({
      state: config.id,
      source: 'Greensboro ABC SuiteCommerce pickup inventory',
      url: `${GREENSBORO_ABC_BASE_URL}/search`,
      status: 'no_positive_tracked_rows',
      error: 'Public item API and store locator were reachable, but tracked rare-bourbon terms produced no mapped positive pickup quantities.',
      nextRoute: 'Broaden tracked terms carefully or inspect rendered product pages for item-specific pickup rows.'
    });
  }

  return { signals, roadblocks, probeReports };
}

async function collectNcStoreInventory(config, bible) {
  const signals = [];
  const roadblocks = [];
  const probeReports = [];

  const wake = await collectWakeNc(config, bible);
  signals.push(...wake.signals);
  roadblocks.push(...wake.roadblocks);
  probeReports.push(...(wake.probeReports || []));

  const greensboro = await collectGreensboroNc(config, bible);
  signals.push(...greensboro.signals);
  roadblocks.push(...greensboro.roadblocks);
  probeReports.push(...(greensboro.probeReports || []));

  const highPoint = await collectHighPointNc(config, bible);
  signals.push(...highPoint.signals);
  roadblocks.push(...highPoint.roadblocks);
  probeReports.push(...(highPoint.probeReports || []));

  return {
    signals,
    roadblocks,
    probeReports,
    boardCapabilities: [
      { boardName: 'Wake County ABC Board', capabilities: ['store_inventory_search_attached', 'store_level_probe_attached'], precisionLevel: 'store_inventory_search' },
      { boardName: 'Greensboro ABC Board', capabilities: ['suitecommerce_pickup_inventory_attached', 'store_level_probe_attached'], precisionLevel: 'store_inventory_search' },
      { boardName: 'High Point ABC Board', capabilities: ['public_powerbi_store_inventory_attached', 'shopify_product_availability_attached', 'official_board_storefront_availability', 'store_level_probe_attached'], precisionLevel: 'store_inventory_search' }
    ]
  };
}

function virginiaStoreSignals(product, json, config, bible, url) {
  const signals = [];
  const rows = [];
  for (const productRow of json.products || []) {
    if (productRow.storeInfo) rows.push({ ...productRow.storeInfo, relation: 'selected_store' });
    for (const store of productRow.nearbyStores || []) rows.push({ ...store, relation: 'nearby_store' });
  }
  const seen = new Set();
  for (const store of rows) {
    const storeId = store.storeId || store.storeNumber || store.id;
    const key = `${product.code}|${storeId}|${store.quantity ?? ''}`;
    if (!storeId || seen.has(key)) continue;
    seen.add(key);
    const quantity = Number(store.quantity ?? 0) || 0;
    const { base } = signalBase(config.id, 'Virginia ABC storeNearby inventory API', url, product.name, bible);
    signals.push({
      id: stableId([config.id, product.code, storeId, quantity, store.address]),
      ...base,
      eventType: quantity > 0 ? 'store_inventory_result' : 'store_inventory_out_of_stock',
      locationPrecision: 'store_level',
      locationName: `Virginia ABC Store ${storeId}`,
      storeName: `Virginia ABC Store ${storeId}`,
      storeId: String(storeId),
      storeAddress: store.address || [store.address1, store.address2, store.city, store.state, store.zip].filter(Boolean).join(', '),
      city: store.city || null,
      stateCode: store.state || 'VA',
      postalCode: store.zip || null,
      latitude: Number(store.latitude ?? 0) || null,
      longitude: Number(store.longitude ?? 0) || null,
      distance: Number(store.distance ?? 0) || null,
      quantity,
      availabilityStatus: quantity > 0 ? 'in_stock' : 'out_of_stock',
      availabilityLabel: quantity > 0 ? `${quantity} reported available` : 'Out of stock',
      observedAt: base.fetchedAt,
      canAlertAsInventory: quantity > 0,
      canAlertAsWatch: true,
      inventorySemantics: 'Virginia ABC public storeNearby API reports per-store inventory rows for regular catalog products. Limited-availability products may be hidden/randomized by policy outside release windows; verify before driving.',
      evidence: `Virginia ABC API reports ${quantity} bottle(s) of ${product.name} at Store ${storeId}${store.city ? ` in ${store.city}` : ''}. ${product.limitedCaveat ? 'Limited-availability products may be intentionally hidden/randomized by policy outside release windows.' : 'Normal product inventory signal.'}`,
      raw: { product, store }
    });
  }
  return signals;
}

function enrichVirginiaCachedSignal(signal, cacheGeneratedAt) {
  const quantity = Number(signal.quantity ?? 0) || 0;
  const eventType = signal.eventType || (quantity > 0 ? 'store_inventory_result' : 'store_inventory_out_of_stock');
  return {
    ...signal,
    eventType,
    availabilityStatus: signal.availabilityStatus || (quantity > 0 ? 'in_stock' : 'out_of_stock'),
    availabilityLabel: signal.availabilityLabel || (quantity > 0 ? `${quantity} reported available` : 'Out of stock'),
    canAlertAsInventory: signal.canAlertAsInventory ?? quantity > 0,
    canAlertAsWatch: signal.canAlertAsWatch ?? true,
    inventorySemantics: signal.inventorySemantics || 'Virginia ABC public storeNearby API reports per-store inventory rows for regular catalog products. Limited-availability products may be hidden/randomized by policy outside release windows; verify before driving.',
    raw: { ...(signal.raw || {}), cacheReuse: true, cacheGeneratedAt }
  };
}

async function collectVirginia(config, bible) {
  const signals = [], roadblocks = [];
  const cached = await readCachedVirginiaSignals();
  const cachedSignals = cached.signals || [];
  const cacheAgeMs = cached.generatedAt ? Date.now() - new Date(cached.generatedAt).getTime() : Infinity;
  if (process.env.BOURBON_SIGNAL_VA_FORCE_LIVE !== '1' && cachedSignals.length >= 700 && cacheAgeMs >= 0 && cacheAgeMs <= VIRGINIA_CACHE_MAX_AGE_MS) {
    roadblocks.push({
      state: config.id,
      source: 'Virginia ABC storeNearby inventory API cache reuse',
      url: VIRGINIA_CACHE_PATH,
      status: 200,
      error: `Using ${cachedSignals.length} cached store-level VA rows from ${cached.generatedAt}; scheduled refresh avoids the full multi-origin scan unless BOURBON_SIGNAL_VA_FORCE_LIVE=1.`,
      nextRoute: 'Run npm run verify:va or BOURBON_SIGNAL_VA_FORCE_LIVE=1 node src/run-state.mjs VA for a full live VA cache refresh.'
    });
    return { signals: cachedSignals.map((signal) => enrichVirginiaCachedSignal(signal, cached.generatedAt)), roadblocks };
  }
  let stores = [{ storeNumber: '101', name: 'Virginia ABC Store 101' }];
  try {
    stores = (await virginiaStoreNumbers()).filter((store) => !VIRGINIA_INVALID_ORIGIN_STORES.has(String(Number(store.storeNumber))));
    if (!stores.length) throw new Error('No Virginia ABC stores parsed from ArcGIS');
  } catch (error) {
    roadblocks.push({ state: config.id, source: 'Virginia ABC stores ArcGIS', url: VIRGINIA_STORES_ARCGIS_URL, status: 0, error: error.message, nextRoute: 'Use location bible official store export or Virginia ABC store locator as fallback.' });
  }

  const seenSignalIds = new Set();
  let rateLimitErrors = 0;
  for (const product of VIRGINIA_PRODUCTS) {
    let productRows = 0;
    let errors = 0;
    const batchSize = 2;
    for (let i = 0; i < stores.length; i += batchSize) {
      if (i > 0) await sleep(180);
      const batch = stores.slice(i, i + batchSize);
      const results = await Promise.allSettled(batch.map(async (origin) => {
        const url = `https://www.abc.virginia.gov/webapi/inventory/storeNearby?storeNumber=${encodeURIComponent(origin.storeNumber)}&productCode=${encodeURIComponent(product.code)}&mileRadius=999&storeCount=5&buffer=0`;
        const res = await textFetch(url, { headers: { accept: 'application/json,*/*', referer: `https://www.abc.virginia.gov/products/bourbon/${product.slug}` } });
        if (!res.ok) return { ok: false, url, status: res.status, error: res.text.slice(0, 300) };
        return { ok: true, url, json: JSON.parse(res.text) };
      }));
      for (const result of results) {
        if (result.status === 'rejected') {
          errors += 1;
          if (errors <= 5) roadblocks.push({ state: config.id, source: 'Virginia ABC storeNearby inventory API', url: `https://www.abc.virginia.gov/products/bourbon/${product.slug}`, status: 0, error: result.reason?.message || String(result.reason), nextRoute: 'Retry with current product code from browser product page.' });
          continue;
        }
        if (!result.value.ok) {
          errors += 1;
          if (Number(result.value.status) === 429) rateLimitErrors += 1;
          if (errors <= 5) roadblocks.push({ state: config.id, source: 'Virginia ABC storeNearby inventory API', url: result.value.url, status: result.value.status, error: result.value.error, nextRoute: 'Use browser session/network capture for VA ABC inventory calls.' });
          if (rateLimitErrors >= 10 && cachedSignals.length >= 700) {
            roadblocks.push({ state: config.id, source: 'Virginia ABC storeNearby inventory API cache fallback', url: VIRGINIA_CACHE_PATH, status: 429, error: `VA ABC API returned repeated 429 responses; using ${cachedSignals.length} cached store-level rows from last healthy probe instead of publishing a partial run.`, nextRoute: 'Let VA rate limit cool down, then rerun with the throttled collector.' });
            return { signals: cachedSignals, roadblocks };
          }
          continue;
        }
        const extracted = virginiaStoreSignals(product, result.value.json, config, bible, result.value.url);
        for (const signal of extracted) {
          if (seenSignalIds.has(signal.id)) continue;
          seenSignalIds.add(signal.id);
          signals.push(signal);
          productRows += 1;
        }
      }
    }
    if (!productRows) {
      roadblocks.push({ state: config.id, source: 'Virginia ABC storeNearby inventory API', url: `https://www.abc.virginia.gov/products/bourbon/${product.slug}`, status: 200, error: `No store rows parsed after probing ${stores.length} Virginia ABC store origins for ${product.name}.`, nextRoute: 'Inspect product policy/current code; limited products may be hidden outside release windows.' });
    }
    if (errors > 5) {
      roadblocks.push({ state: config.id, source: 'Virginia ABC storeNearby inventory API', url: `https://www.abc.virginia.gov/products/bourbon/${product.slug}`, status: 0, error: `${errors} store-origin probes failed for ${product.name}; first five recorded separately.`, nextRoute: 'Throttle requests or use a browser/session collector if VA starts gating API calls.' });
    }
  }
  if (signals.length >= 700 && rateLimitErrors === 0) await writeCachedVirginiaSignals(signals);
  return { signals, roadblocks };
}

const PA_SEARCH_TERMS = [
  'buffalo trace bourbon', 'weller bourbon', 'blanton bourbon', 'eagle rare bourbon', 'stagg bourbon',
  'old fitzgerald bourbon', 'old fitzgerald bottled in bond', 'willett bourbon', 'michter bourbon',
  'eh taylor bourbon', 'elmer t lee bourbon'
];

const PA_BOURBON_RE = /bourbon|straight rye|american whiskey|michter|willett|buffalo trace|eagle rare|weller|blanton|stagg|old fitz|fitzgerald|e\.?h\.?\s*taylor|elmer t|colonel\s*taylor/i;
const PA_EXCLUDE_RE = /cream|cocktail|wine|cabernet|chardonnay|sauvignon|cava|grenache|merlot|vodka|gin|rum|tequila|liqueur|ready to drink|flavored whiskey|black cherry/i;

function paDecodePage(text) {
  return htmlAttrDecode(safePercentDecode(text));
}

function paAttr(block, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return block.match(new RegExp(`"${escaped}":\\["([^"]*)"\\]`))?.[1] || null;
}

function paInventoryMap(decoded) {
  const map = new Map();
  for (const match of decoded.matchAll(/"([0-9]{8,9})":\{"default":\{([^}]+)\}\}/g)) {
    const sku = match[1];
    const body = match[2];
    const qty = Number(body.match(/"inStockQuantity":(\d+)/)?.[1] || body.match(/"orderableQuantity":(\d+)/)?.[1] || 0) || 0;
    const stockStatus = body.match(/"stockStatus":"([^"]+)"/)?.[1] || null;
    const prior = map.get(sku);
    if (!prior || qty > prior.inStockQuantity || (stockStatus === 'IN_STOCK' && prior.stockStatus !== 'IN_STOCK')) {
      map.set(sku, { sku, stockStatus, inStockQuantity: qty, orderableQuantity: Number(body.match(/"orderableQuantity":(\d+)/)?.[1] || 0) || 0 });
    }
  }
  return map;
}

function paProductRows(decoded) {
  const inventory = paInventoryMap(decoded);
  const rows = [];
  for (const match of decoded.matchAll(/"attributes":\{[\s\S]*?\}\}/g)) {
    const block = match[0];
    if (!block.includes('product.displayName')) continue;
    const sku = paAttr(block, 'product.repositoryId') || paAttr(block, 'sku.repositoryId') || paAttr(block, 'sku.listingId');
    const name = paAttr(block, 'product.displayName');
    const brand = paAttr(block, 'product.brand');
    const category = paAttr(block, 'parentCategory.displayName');
    const type = paAttr(block, 'B2CProduct.x_type');
    const route = paAttr(block, 'product.route');
    if (!sku || !name) continue;
    const searchable = `${name} ${brand || ''} ${category || ''} ${type || ''}`;
    if (!PA_BOURBON_RE.test(searchable) || PA_EXCLUDE_RE.test(searchable)) continue;
    rows.push({
      sku,
      name,
      brand,
      category,
      type,
      route,
      price: Number(paAttr(block, 'sku.activePrice') || paAttr(block, 'product.salePrice') || paAttr(block, 'product.listPrice') || 0) || null,
      onlineAvailable: paAttr(block, 'product.b2c_onlineAvailable') || null,
      bopisDisabled: paAttr(block, 'B2CProduct.b2c_disableBopis') || null,
      highlyAllocated: paAttr(block, 'B2CProduct.b2c_highlyAllocatedProduct') || null,
      lotteryProduct: paAttr(block, 'B2CProduct.b2c_lotteryProduct') || null,
      inventory: inventory.get(sku) || { sku, stockStatus: null, inStockQuantity: 0, orderableQuantity: 0 }
    });
  }
  return rows;
}

async function collectPennsylvania(config, bible) {
  const signals = [], roadblocks = [];
  const seen = new Set();

  try {
    const browserRun = JSON.parse(await readFile('out/browser/fwgs-store-inventory.json', 'utf8'));
    for (const row of browserRun.inventoryRows || []) {
      const product = row.product || {};
      const store = row.location || {};
      const quantity = Number(row.quantity || 0) || 0;
      if (!product.sku || !product.name || !store.locationId || quantity <= 0) continue;
      const { base } = signalBase(config.id, 'FWGS store pickup inventory API browser-assisted collector', product.route ? `https://www.finewineandgoodspirits.com${product.route}` : 'out/browser/fwgs-store-inventory.json', product.name, bible);
      signals.push({
        id: stableId([config.id, 'fwgs-store-pickup-inventory', product.sku, store.locationId, quantity]),
        ...base,
        confidence: Math.max(0.78, base.confidence),
        eventType: 'store_inventory_result',
        locationPrecision: 'store_level',
        locationName: store.name || `Fine Wine & Good Spirits #${store.locationId}`,
        storeName: store.name || `Fine Wine & Good Spirits #${store.locationId}`,
        storeId: String(store.locationId),
        storeAddress: [store.address1, store.address2, store.city, store.stateAddress || 'PA', store.postalCode].filter(Boolean).join(', ') || null,
        city: store.city || null,
        county: store.county || null,
        stateCode: store.stateAddress || 'PA',
        postalCode: store.postalCode || null,
        latitude: Number(store.latitude ?? 0) || null,
        longitude: Number(store.longitude ?? 0) || null,
        quantity,
        price: product.price ?? null,
        observedAt: browserRun.generatedAt || base.fetchedAt,
        availabilityStatus: 'IN_STOCK',
        availabilityLabel: 'Available for pickup',
        evidence: `FWGS pickup inventory API reported ${quantity} unit(s) of ${product.name} (${product.sku}) at ${store.name || `store ${store.locationId}`}${store.city ? ` in ${store.city}` : ''}${store.county ? `, ${store.county} County` : ''}. Source route: /ccstorex/custom/v1/b2b/get-inventory with method=pickup, location=${store.locationId}.`,
        raw: { product, store, quantity, generatedAt: browserRun.generatedAt, inventoryEndpoint: browserRun.inventoryEndpoint, browserAssisted: true }
      });
      seen.add(product.sku);
    }
    if (browserRun.summary?.positiveInventoryRowCount) {
      roadblocks.push({
        state: config.id,
        source: 'FWGS direct server fetch',
        url: 'https://www.finewineandgoodspirits.com/ccstorex/custom/v1/b2b/get-inventory',
        status: 403,
        error: 'Store-level PA inventory was collected through browser/CDP because raw Node fetches are Akamai/session gated.',
        nextRoute: 'Run npm run fwgs before npm run run, or promote the FWGS browser bootstrap into the scheduled engine runner.'
      });
    }
  } catch {
    // Browser-assisted FWGS pickup inventory is optional; fall back to statewide Oracle Commerce hydration below.
  }

  for (const term of PA_SEARCH_TERMS) {
    const searchUrl = `https://www.finewineandgoodspirits.com/search?Ntt=${encodeURIComponent(term)}`;
    try {
      const res = await textFetch(searchUrl, { timeoutMs: 22000 });
      if (!res.ok) {
        roadblocks.push({ state: config.id, source: 'FWGS Oracle Commerce search hydration', url: searchUrl, status: res.status, error: res.error || 'Search page did not load', nextRoute: 'Use browser/network extraction for Oracle Commerce search and pickup APIs.' });
        continue;
      }
      const decoded = paDecodePage(res.text);
      const pageCount = Number(decoded.match(/PRODUCTS\s*\(\s*(?:<!--\s*-->\s*)?(\d+)/i)?.[1] || decoded.match(/"totalMatchingRecords":(\d+)/i)?.[1] || 0) || 0;
      const rows = paProductRows(decoded);
      if (!rows.length && pageCount > 0) {
        roadblocks.push({ state: config.id, source: 'FWGS Oracle Commerce search hydration', url: searchUrl, status: res.status, error: `Search returned ${pageCount} result(s), but no focused bourbon rows survived parser filters.`, nextRoute: 'Inspect product attributes/filters for this search term and update PA_BOURBON_RE/PA_EXCLUDE_RE if appropriate.' });
      }

      for (const row of rows) {
        const key = row.sku;
        if (seen.has(key)) continue;
        seen.add(key);
        const { base } = signalBase(config.id, 'FWGS Oracle Commerce product/inventory hydration', row.route ? `https://www.finewineandgoodspirits.com${row.route}` : searchUrl, row.name, bible);
        const qty = Math.max(row.inventory.inStockQuantity || 0, row.inventory.orderableQuantity || 0);
        const inStock = row.inventory.stockStatus === 'IN_STOCK' || qty > 0;
        const allocated = row.highlyAllocated === 'Y' || row.lotteryProduct === 'Y' || RARE_RE.test(row.name);
        signals.push({
          id: stableId([config.id, 'fwgs-hydrated-product', row.sku, row.inventory.stockStatus, qty, row.price]),
          ...base,
          confidence: Math.max(allocated ? 0.72 : 0.66, base.confidence),
          eventType: inStock ? 'store_inventory_aggregate' : allocated ? 'allocated_product_watch' : 'product_catalog_watch',
          locationPrecision: 'store_aggregate',
          locationName: 'Pennsylvania FWGS statewide search',
          stateCode: 'PA',
          quantity: qty,
          availabilityStatus: row.inventory.stockStatus || (inStock ? 'IN_STOCK' : 'UNKNOWN'),
          availabilityLabel: row.inventory.stockStatus === 'IN_STOCK' ? 'In stock in FWGS online/statewide inventory' : row.inventory.stockStatus === 'OUT_OF_STOCK' ? 'Out of stock in FWGS online/statewide inventory' : null,
          price: row.price,
          observedAt: base.fetchedAt,
          evidence: `FWGS Oracle Commerce hydration lists ${row.name} (${row.sku})${row.price ? ` at $${row.price}` : ''} with status ${row.inventory.stockStatus || 'unknown'}${qty ? ` and ${qty} orderable/in-stock unit(s)` : ''}. This is statewide FWGS online/search inventory, not per-store shelf inventory; store-specific pickup still needs fulfillment/store API extraction.`,
          raw: { ...row, term, pageCount, precisionCaveat: 'FWGS statewide/search aggregate; not per-store pickup inventory.' }
        });
      }

      if (pageCount && !rows.length) {
        const { base } = signalBase(config.id, 'FWGS Oracle Commerce product search count', searchUrl, term, bible);
        signals.push({
          id: stableId([config.id, 'fwgs-search-count', term, pageCount]),
          ...base,
          eventType: 'product_search_count',
          locationPrecision: 'store_aggregate',
          locationName: 'Pennsylvania FWGS statewide search',
          stateCode: 'PA',
          quantity: pageCount,
          observedAt: base.fetchedAt,
          evidence: `FWGS product search returned ${pageCount} result(s) for ${term}; no focused bourbon inventory row was parsed from the hydrated payload.`,
          raw: { term, pageCount }
        });
      }
    } catch (error) {
      roadblocks.push({ state: config.id, source: 'FWGS Oracle Commerce search hydration', url: searchUrl, status: 0, error: error.message, nextRoute: 'Retry through browser/network extraction.' });
    }
  }

  if (!signals.some((signal) => signal.eventType === 'store_inventory_aggregate')) {
    roadblocks.push({ state: config.id, source: 'FWGS Oracle Commerce inventory hydration', url: 'https://www.finewineandgoodspirits.com/search', status: 200, error: 'No positive focused bourbon inventory aggregates parsed from FWGS search hydration.', nextRoute: 'Capture selected-store fulfillment/API calls to move from statewide online inventory to county/store pickup rows.' });
  }
  return { signals, roadblocks };
}

async function collectMontgomery(config, bible) {
  const signals = [], roadblocks = [];
  await collectMontgomeryOpenData(config, bible, signals, roadblocks);
  const url = 'https://www2.montgomerycountymd.gov/abssearch/webservice.asmx/SearchByName';
  for (const term of TRACKED_TERMS['MD-MONTGOMERY']) {
    try {
      const res = await textFetch(url, { method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8', accept: 'application/json,*/*' }, body: `{'Name':'${term.replace(/'/g, '')}'}` });
      const json = JSON.parse(res.text);
      for (const row of json.d || []) {
        const name = row.text || row.value;
        const { base, unsafeReason } = aggregateSignalBase(config.id, 'Montgomery County ABS product autocomplete', url, name, bible);
        signals.push({ id: stableId([config.id, 'moco', name]), ...base, eventType: 'county_product_search_match', locationPrecision: 'board_county', locationName: 'Montgomery County ABS', county: 'Montgomery', observedAt: base.fetchedAt, canAlertAsInventory: false, canAlertAsWatch: false, inventorySemantics: 'Montgomery County ABS product search rows are county/product intelligence, not exact store shelf inventory.', evidence: `Montgomery ABS product search match: ${name}. Store inventory modal exists but needs ASP.NET postback/viewstate extraction.`, raw: { ...row, sourceCaveat: 'Product search/autocomplete row; not inventory.', sourceMatchStatus: base.sourceMatchStatus, unsafeReason: unsafeReason || null } });
      }
    } catch (error) { roadblocks.push({ state: config.id, source: 'Montgomery ABS SearchByName', url, status: 0, error: error.message, nextRoute: 'Replay ASP.NET selected item/postback to open StoreInventory modal.' }); }
  }
  const pageUrl = 'https://www2.montgomerycountymd.gov/abssearch/default.aspx';
  for (const term of TRACKED_TERMS['MD-MONTGOMERY']) {
    try {
      const first = await textFetch(pageUrl);
      const state = (name) => first.text.match(new RegExp(`name=["']${name}["'][^>]*value=["']([^"']*)`, 'i'))?.[1]
        || first.text.match(new RegExp(`id=["']${name}["'][^>]*value=["']([^"']*)`, 'i'))?.[1]
        || '';
      const params = new URLSearchParams({
        __VIEWSTATE: state('__VIEWSTATE'),
        __VIEWSTATEGENERATOR: state('__VIEWSTATEGENERATOR'),
        __EVENTVALIDATION: state('__EVENTVALIDATION'),
        __EVENTTARGET: 'btnSearch',
        __EVENTARGUMENT: '',
        txtKeyword: term,
        SpiritList: 'Search By Spirit',
        WineList: 'Search By Wine',
        BeerList: 'Search By Beer',
        fldBrowserType: '0'
      });
      const res = await textFetch(pageUrl, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: params });
      const cards = res.text.split(/<div class="col-md-2 mb-3 card-size">/i).slice(1);
      for (const card of cards) {
        const rawName = stripHtml(card.match(/<span class="indigo-text descfont">([\s\S]*?)<\/span>/i)?.[1] || '').replace(/\s+/g, ' ').trim();
        if (!rawName || !RARE_RE.test(rawName)) continue;
        const code = stripHtml(card.match(/#\s*([^|<]+)/i)?.[1] || '').trim();
        const size = stripHtml(card.match(/<span class="blue-text">([^<]+)<\/span>/i)?.[1] || '').trim();
        const price = Number((card.match(/item-price">\$([0-9,.]+)/i)?.[1] || '').replace(/,/g, '').trim()) || null;
        const allocated = /ALLOCATED/i.test(card);
        const highlyAllocated = /HIGHLY\s+ALLOCATED/i.test(card);
        const { base, unsafeReason } = aggregateSignalBase(config.id, 'Montgomery County ABS ASP.NET product search', pageUrl, rawName, bible);
        signals.push({
          id: stableId([config.id, 'moco-product-postback', code || rawName, price]),
          ...base,
          eventType: allocated || highlyAllocated ? 'county_allocated_product_row' : 'county_product_row',
          locationPrecision: 'board_county',
          locationName: 'Montgomery County ABS',
          county: 'Montgomery',
          price,
          observedAt: base.fetchedAt,
          evidence: `Montgomery ABS ASP.NET product search row: ${rawName}${code ? ` (#${code})` : ''}${price ? ` at $${price}` : ''}${allocated ? '; marked allocated' : ''}. Store-level modal is not exposed for these allocated rows in the product-card HTML.`,
          raw: { code, size, price, allocated, highlyAllocated, term, sourceCaveat: 'County product/HAL search row; not live shelf inventory.', sourceMatchStatus: base.sourceMatchStatus, unsafeReason: unsafeReason || null }
        });
      }
    } catch (error) {
      roadblocks.push({ state: config.id, source: 'Montgomery ABS ASP.NET product search', url: pageUrl, status: 0, error: error.message, nextRoute: 'Use browser click/network capture for any item rows that expose StoreInventory modal arguments.' });
    }
  }
  return { signals, roadblocks };
}

async function collectMontgomeryOpenData(config, bible, signals, roadblocks) {
  const sourceUrl = 'https://data.montgomerycountymd.gov/resource/ib5t-5ncy.json';
  const observedAt = new Date().toISOString();
  const seen = new Set();

  async function fetchRows(queryLabel, query) {
    const url = `${sourceUrl}?$query=${encodeURIComponent(query)}`;
    const res = await textFetch(url, { headers: { accept: 'application/json,*/*' }, timeoutMs: 20000 });
    if (!res.ok) {
      roadblocks.push({ state: config.id, source: `Montgomery ABS open data - ${queryLabel}`, url, status: res.status, error: res.error || res.text.slice(0, 300), nextRoute: 'Retry Socrata resource ib5t-5ncy or inspect data portal metadata for schema changes.' });
      return [];
    }
    try {
      const json = JSON.parse(res.text);
      if (Array.isArray(json)) return json;
      if (json?.error) throw new Error(json.message || json.code || 'Socrata query error');
      return [];
    } catch (error) {
      roadblocks.push({ state: config.id, source: `Montgomery ABS open data - ${queryLabel}`, url, status: res.status, error: error.message, nextRoute: 'Inspect Socrata response and adjust SoQL query.' });
      return [];
    }
  }

  const rows = [];
  for (const term of TRACKED_TERMS['MD-MONTGOMERY']) {
    const safe = term.toLowerCase().replace(/'/g, "''");
    rows.push(...await fetchRows(term, `select code,category,description,size,totalinventory,price,saleprice,saleenddate where lower(description) like '%${safe}%' limit 50`));
  }
  rows.push(...await fetchRows('positive bourbon inventory sample', "select code,category,description,size,totalinventory,price,saleprice,saleenddate where totalinventory > '0' and lower(category) like '%bourbon%' limit 250"));

  const focused = rows
    .filter((row) => row?.description && MONTGOMERY_BOURBON_RE.test(`${row.category} ${row.description}`) && !/\b(port|vodka|gin|rum|tequila|mezcal|scotch|cognac|brandy|liqueur|soju|wine)\b/i.test(`${row.category} ${row.description}`))
    .map((row) => ({ ...row, totalinventoryNumber: Number(String(row.totalinventory || '0').replace(/,/g, '')) || 0, priceNumber: Number(String(row.price || '').replace(/,/g, '')) || null, salePriceNumber: Number(String(row.saleprice || '').replace(/,/g, '')) || null }))
    .sort((a, b) => (RARE_RE.test(b.description) ? 1 : 0) - (RARE_RE.test(a.description) ? 1 : 0) || b.totalinventoryNumber - a.totalinventoryNumber)
    .slice(0, 160);

  for (const row of focused) {
    const key = `${row.code || ''}:${row.description || ''}:${row.totalinventory || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const rawName = row.description;
    const { base, unsafeReason } = aggregateSignalBase(config.id, 'Montgomery County ABS open inventory dataset', sourceUrl, rawName, bible);
    const qty = row.totalinventoryNumber;
    const rare = MONTGOMERY_BOURBON_RE.test(rawName) && (RARE_RE.test(rawName) || /buffalo trace|michter/i.test(rawName));
    const onSale = row.salePriceNumber != null && row.salePriceNumber > 0;
    signals.push({
      id: stableId([config.id, 'moco-open-data', row.code || rawName, qty, row.price, row.saleprice]),
      ...base,
      confidence: Math.max(rare ? 0.76 : 0.66, base.confidence),
      eventType: qty > 0 ? 'county_inventory_aggregate' : rare ? 'county_rare_product_catalog_row' : 'county_product_catalog_row',
      locationPrecision: 'store_aggregate',
      locationName: 'Montgomery County ABS stores',
      county: 'Montgomery',
      quantity: qty,
      price: row.priceNumber,
      salePrice: row.salePriceNumber,
      availabilityStatus: qty > 0 ? 'COUNTY_AGGREGATE_POSITIVE' : 'COUNTY_AGGREGATE_ZERO',
      availabilityLabel: qty > 0 ? `${qty} total county inventory units reported` : 'No positive county aggregate inventory reported',
      observedAt,
      canAlertAsInventory: false,
      canAlertAsWatch: false,
      inventorySemantics: 'Montgomery County ABS open data reports countywide aggregate inventory/pricing by product. This is Montgomery County intelligence, not exact per-store shelf inventory.',
      evidence: `Montgomery County ABS open data lists ${rawName}${row.code ? ` (#${row.code})` : ''}${qty > 0 ? ` with ${qty} total bottle(s) across ABS inventory` : ' with no positive total inventory in the open dataset'}${row.priceNumber ? ` at $${row.priceNumber}` : ''}${onSale ? `, sale $${row.salePriceNumber}` : ''}. This is county inventory/pricing intelligence, not a per-store shelf count.`,
      raw: { ...row, precisionCaveat: 'County aggregate/open-data inventory; per-store rows require ABS search/modal extraction.', sourceDataset: 'ib5t-5ncy', sourceMatchStatus: base.sourceMatchStatus, unsafeReason: unsafeReason || null }
    });
  }
}
