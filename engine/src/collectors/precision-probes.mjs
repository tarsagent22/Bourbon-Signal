import { renameSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { stableId, stripHtml, titleCase } from '../core/text.mjs';
import { runBoundedSourceLanes } from '../core/bounded-source-pool.mjs';
import { collectNorthCarolinaIntelligence } from './north-carolina-intelligence.mjs';
import { freshCityHivePositiveSignals, normalizeCityHiveReportedQuantity, oldestSourceEvidenceCohort, reconcileCityHiveRateLimitsWithCache, rotatingSourceCohort } from './cityhive-hardening.mjs';
import { attachConfiguredStoreIdentity, configuredStoreId, isTerminalProbeFailure, summarizeRepeatedPlatformFailures } from './probe-hardening.mjs';
import { createSourceAdapter } from '../sources/source-adapter.mjs';
import { MalformedSourceError, sourceErrorForHttp, TransientSourceError } from '../sources/source-error.mjs';
import { summarizeSourceResult } from '../sources/source-result.mjs';
import { runSourceAdapters } from '../sources/source-runner.mjs';
import { legacyPrecisionSourceId, runLegacyPrecisionSource } from '../sources/legacy-precision-runtime.mjs';
import {
  FLORIDA_LUEKENS_STORES,
  FLORIDA_TAMPA_TARGET_STORES,
  parseLightspeedCatalogEntries,
  parseLightspeedProductInventory,
  parseLuekensPickupAvailability,
  parseSquarespaceInventoryItems,
  isUsefulBourbonSize,
  isAllowedHttpsHost,
} from './florida-tampa-surfaces.mjs';
import {
  buildFloridaConfiguredStoreLocationSignals,
  FLORIDA_CITYHIVE_SOURCES,
  registeredFloridaStore,
} from './florida-retailer-surfaces.mjs';
import {
  buildPensacolaShopifyStoreLocationSignals,
  isUsefulPensacolaShopifyFormat,
  parsePensacolaShopifyCollectionLinks,
  parsePensacolaShopifyProductPage,
  parsePensacolaShopifyVariantPickup,
  pensacolaVariantPickupUrl,
  PENSACOLA_SHOPIFY_SOURCE,
} from './florida-pensacola-surfaces.mjs';
import {
  floridaCityHiveProductIdentity,
  floridaCityHiveSignalIdentityParts,
  markFloridaCityHiveFallbackNonAlertable,
  mergeFloridaTargetProbeHistory,
} from './florida-cityhive-policy.mjs';
import {
  buildGeorgiaConfiguredStoreLocationSignals,
  GEORGIA_CITYHIVE_SOURCES,
  GEORGIA_GOTOLIQUOR_STORES,
  GEORGIA_LIGHTSPEED_STORES,
  isAllowedGeorgiaBourbonIdentity,
  isAllowedGeorgiaBottleFormat,
  normalizeGeorgiaCityHiveQuantity,
  parseGeorgiaGoToLiquorStoreProducts,
  parseGeorgiaLightspeedProducts,
} from './georgia-retailer-surfaces.mjs';
import {
  buildTennesseeConfiguredStoreLocationSignals,
  registeredTennesseeStore,
  tennesseeStoresForSource,
} from './tennessee-retailer-surfaces.mjs';
import {
  hasReviewedTennesseeCityHivePayload,
  mergeTennesseeCityHiveCacheSignals,
  selectTennesseeCityHiveSourceCohort,
  tennesseeCityHiveSignalSourceId,
  updateTennesseeCityHiveSourceAttemptAt,
  updateTennesseeCityHiveSourceRefreshAt,
} from './tennessee-cityhive-policy.mjs';
import {
  isAllowedTennesseeBottleFormat,
  isTennesseeRetailerInventory,
  normalizeTennesseeCityHiveQuantity,
} from '../tennessee-retailer-policy.mjs';
import {
  CALIFORNIA_SAN_DIEGO_SHOPIFY_SOURCES,
  buildCaliforniaSourceCacheSignals,
  filterFreshCaliforniaSignals,
  parseCaliforniaShopifyProducts,
  verifyCaliforniaFulfillmentPolicy,
} from './california-san-diego-surfaces.mjs';
import {
  NEVADA_RETAILER_SOURCES,
  filterFreshNevadaSignals,
  mergeNevadaSourceCacheSignals,
  parseNevadaCityHiveHtml,
  parseNevadaPos360Html,
  parseNevadaAlbertsonsXapi,
  verifyNevadaCityHiveStorePage,
  verifyNevadaFulfillmentPolicy,
} from './nevada-retailer-surfaces.mjs';
import {
  COLORADO_RETAILER_SOURCES,
  NEW_YORK_RETAILER_SOURCES,
  filterFreshMetroSignals,
  mergeMetroSourceCacheSignals,
  parseMetroCityHiveHtml,
  parseMetroShopifyProducts,
  verifyMetroShopifyFulfillmentPolicy,
} from './metro-retailer-surfaces.mjs';
import { isMetroRetailerInventory } from '../metro-retailer-policy.mjs';
import { isSouthCarolinaAllAmericanInventory } from '../south-carolina-retailer-policy.mjs';
import {
  buildIndianaTargetStoreLocationSignals,
  INDIANA_TARGET_STORES,
  filterFreshIndianaTargetSignals,
  indianaCityHivePriorityRank,
  isIndianaCityHivePriorityMarket,
  mergeIndianaTargetCacheSignals,
  parseIndianaTargetFulfillment,
  parseIndianaTargetSearchProducts,
  shouldWriteIndianaTargetCache,
} from './indiana-retailer-surfaces.mjs';
import {
  applyVirginiaInventoryFreshness,
  evaluateVirginiaProductCoverage,
  isVirginiaRegularInventoryExpired,
  isVirginiaRetiredOriginFailure,
  mergeVirginiaProductPartitions,
  seedVirginiaInventoryCacheSignals,
  sanitizeVirginiaInventoryCacheSignals,
  selectVirginiaOriginStoreRows,
  selectVirginiaProductsForRefresh,
  summarizeVirginiaProductErrors,
  throwIfVirginiaAborted,
  virginiaAbortableDelay,
  virginiaProductCode
} from './virginia-inventory-recovery.mjs';
import { loadOhioInventoryRecoverySeed, seedOhioInventoryCacheSignals } from './ohio-inventory-recovery.mjs';
import { collectMississippiRetailers } from './mississippi-retailer-collector.mjs';

const require = createRequire(import.meta.url);
const { PDFParse } = require('pdf-parse');
const execFileAsync = promisify(execFile);

const CA_SAN_DIEGO_SHOPIFY_ARTIFACT_PATH = 'out/browser/CA-san-diego-shopify.json';
const CA_SAN_DIEGO_SHOPIFY_CACHE_MAX_AGE_MS = Number(process.env.BOURBON_SIGNAL_CA_SHOPIFY_CACHE_MAX_AGE_MS || 4 * 60 * 60_000);
const CA_SAN_DIEGO_SHOPIFY_SOURCE_DELAY_MS = Math.max(250, Math.min(10_000, Number(process.env.BOURBON_SIGNAL_CA_SHOPIFY_SOURCE_DELAY_MS) || 750));
const NEVADA_RETAILER_ARTIFACT_PATH = 'out/browser/NV-retailer-inventory.json';
const NEVADA_RETAILER_CACHE_MAX_AGE_MS = Number(process.env.BOURBON_SIGNAL_NV_CACHE_MAX_AGE_MS || 4 * 60 * 60_000);
const NEVADA_RETAILER_SOURCE_DELAY_MS = Math.max(400, Math.min(10_000, Number(process.env.BOURBON_SIGNAL_NV_SOURCE_DELAY_MS) || 900));
const METRO_RETAILER_CACHE_MAX_AGE_MS = Math.max(60_000, Number(process.env.BOURBON_SIGNAL_METRO_CACHE_MAX_AGE_MS || 4 * 60 * 60_000));
const METRO_RETAILER_SOURCE_DELAY_MS = Math.max(250, Math.min(10_000, Number(process.env.BOURBON_SIGNAL_METRO_SOURCE_DELAY_MS) || 750));
const METRO_RETAILER_SOURCES_BY_STATE = Object.freeze({
  NY: NEW_YORK_RETAILER_SOURCES,
  CO: COLORADO_RETAILER_SOURCES,
});


const TRACKED_TERMS = {
  OH: ['Eagle Rare'],
  IA: ['Blanton', 'Eagle Rare', 'Weller', 'Taylor', 'Buffalo Trace', 'Old Fitzgerald', 'Baker', 'Willett', 'Michter', 'Elijah Craig Barrel Proof'],
  UT: ['Eagle Rare', 'Blanton', 'Elijah Craig', 'Weller', 'Taylor', 'Buffalo Trace', 'Old Fitzgerald', 'Michter', 'Willett', 'Stagg', 'Baker'],
  NC: ['Blanton', 'Eagle Rare', 'Weller', 'Taylor', 'Willett'],
  IL: ['Blanton', 'Eagle Rare', 'Weller', 'Stagg', 'Taylor', 'Buffalo Trace', 'Old Fitzgerald', 'Michter', 'Willett', 'Baker'],
  VA: ['Blanton', 'Eagle Rare', 'Buffalo Trace', 'Taylor', 'Old Fitzgerald', '1792 Small Batch'],
  PA: ['Buffalo Trace', 'Weller', 'Blanton', 'Eagle Rare', 'Stagg', 'Old Fitzgerald', "Booker's", "Baker's", 'Elijah Craig Barrel Proof', 'Larceny Barrel Proof', 'Four Roses Limited Edition', 'Russell', 'Old Forester Birthday', 'Blood Oath', 'Little Book', '1792 Full Proof'],
  SC: ['Blanton', 'Eagle Rare', 'Weller', 'Taylor', 'Buffalo Trace', 'Old Fitzgerald', 'Michter', 'Willett', 'Stagg', '1792'],
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
const IOWA_CODE_DELIVERY_FANOUT_LIMIT = Number(process.env.BOURBON_SIGNAL_IOWA_CODE_DELIVERY_LIMIT || 80);
const IOWA_STORE_ROW_LIMIT = Number(process.env.BOURBON_SIGNAL_IOWA_STORE_ROW_LIMIT || 1200);
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
  // Product codes are taken from Virginia ABC public product pages and official quarterly product-price downloads.
  // Limited-availability rows remain official watch intelligence unless the API itself returns positive exact-store quantity; catalog/policy semantics never become inventory alerts.
  { code: '016850', name: "Blanton's Single Barrel Bourbon", limitedCaveat: true },
  { code: '016809', name: "Blanton's Straight From The Barrel Bourbon", limitedCaveat: true },
  { code: '016841', name: 'Blantons Gold Edition Bourbon', limitedCaveat: true },
  { code: '017766', name: 'Eagle Rare 10 Year Bourbon', limitedCaveat: true },
  { code: '017756', name: 'Eagle Rare 17 Year Kentucky Straight Bourbon', limitedCaveat: true },
  { code: '018006', name: 'Buffalo Trace Bourbon', limitedCaveat: true, bootstrapPriority: true },
  { code: '021602', name: 'E H Taylor Jr. Small Batch Whiskey', limitedCaveat: true },
  { code: '021600', name: 'E H Taylor Jr Barrel Proof Bourbon', limitedCaveat: true },
  { code: '021589', name: 'E H Taylor Jr Single Barrel Bourbon', limitedCaveat: true },
  { code: '021605', name: 'E H Taylor Jr. Four Grain Bourbon', limitedCaveat: true },
  { code: '022036', name: 'Old Weller Antique 107 Bourbon', limitedCaveat: true },
  { code: '021986', name: 'W L Weller Special Reserve Bourbon', limitedCaveat: true },
  { code: '022026', name: 'Weller 12 Year Wheated Bourbon', limitedCaveat: true },
  { code: '022044', name: 'Weller Full Proof', limitedCaveat: true },
  { code: '022042', name: 'Weller C.y.p.b. Bourbon', limitedCaveat: true },
  { code: '022046', name: 'Weller Single Barrel', limitedCaveat: true },
  { code: '022086', name: 'William Larue Weller Bourbon', limitedCaveat: true },
  { code: '018416', name: 'George T. Stagg Bourbon', limitedCaveat: true },
  { code: '021538', name: 'Stagg Bourbon', limitedCaveat: true },
  { code: '016483', name: 'Old Fitzgerald 7 Yr Bottled In Bond', limitedCaveat: true },
  { code: '016381', name: 'Old Fitzgerald 8 Yr Bottled In Bond Bourbon', limitedCaveat: true },
  { code: '028383', name: 'Old Fitzgerald Bottled In Bond Decanter', limitedCaveat: true },
  { code: '021236', name: '1792 Small Batch Bourbon', limitedCaveat: false },
  { code: '021443', name: '1792 Aged 12 Year Bourbon', limitedCaveat: true },
  { code: '021228', name: '1792 Full Proof Bourbon', limitedCaveat: true },
  { code: '021244', name: '1792 Single Barrel Bourbon', limitedCaveat: true },
  { code: '021242', name: '1792 Sweet Wheat Bourbon', limitedCaveat: true },
  { code: '017917', name: 'Elijah Craig Barrel Proof Bourbon', limitedCaveat: true },
  { code: '017920', name: 'Elijah Craig 18 Year Single Barrel Bourbon', limitedCaveat: true },
  { code: '017913', name: 'Elijah Craig Toasted Barrel', limitedCaveat: false },
  { code: '019880', name: "Michter's Us1 Small Batch Bourbon", limitedCaveat: false },
  { code: '019876', name: 'Michters 10 Yr Old Bourbon', limitedCaveat: true },
  { code: '019878', name: 'Michters Limited Release 20 Year Bourbon', limitedCaveat: true },
  { code: '022092', name: 'Willett Pot Still Reserve Straight Bourbon', limitedCaveat: false },
  { code: '016906', name: "Booker's Bourbon", limitedCaveat: true },
  { code: '016580', name: "Baker's Bourbon", limitedCaveat: false },
  { code: '020384', name: 'Old Forester 1924 Craft Bourbon', limitedCaveat: true },
  { code: '020376', name: 'Old Forester 1920 Craft Bourbon', limitedCaveat: false },
  { code: '020380', name: 'Old Forester Single Barrel Barrel Proof', limitedCaveat: true },
  { code: '016017', name: 'Heaven Hill Bottled In Bond Bourbon', limitedCaveat: false },
  { code: '022288', name: 'Woodford Reserve Batch Proof Bourbon', limitedCaveat: true },
  { code: '022175', name: "Russell's Reserve 10 Year Bourbon", limitedCaveat: false },
  { code: '022178', name: "Russell's Reserve Single Barrel Bourbon", limitedCaveat: false },
  { code: '022179', name: 'Russells Reserve 13-year Bourbon', limitedCaveat: true },
  { code: '018860', name: 'Larceny Barrel Proof', limitedCaveat: true },
  { code: '019239', name: 'Knob Creek 12 Year Bourbon', limitedCaveat: false }
].map((product) => ({ ...product, slug: product.slug || slugifyVirginiaProduct(product.name) }));

function slugifyVirginiaProduct(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const VIRGINIA_PRODUCTS_PER_RUN = Math.max(1, Math.min(VIRGINIA_PRODUCTS.length, Number(process.env.BOURBON_SIGNAL_VA_PRODUCTS_PER_RUN || 5)));
const VIRGINIA_COLD_START_PRODUCTS_PER_RUN = Math.max(12, Math.min(VIRGINIA_PRODUCTS.length, Number(process.env.BOURBON_SIGNAL_VA_COLD_START_PRODUCTS_PER_RUN || 12)));
const VIRGINIA_REGULAR_REFRESH_MS = Math.max(30 * 60_000, Number(process.env.BOURBON_SIGNAL_VA_REGULAR_REFRESH_MS || 4 * 60 * 60_000));
const VIRGINIA_LIMITED_REFRESH_MS = Math.max(60 * 60_000, Number(process.env.BOURBON_SIGNAL_VA_LIMITED_REFRESH_MS || 20 * 60 * 60_000));
const VIRGINIA_INVENTORY_MAX_AGE_MS = Math.max(60 * 60_000, Number(process.env.BOURBON_SIGNAL_VA_INVENTORY_MAX_AGE_MS || 24 * 60 * 60_000));

// ArcGIS occasionally retains historic/closed ABC landmarks that the live VA ABC inventory API rejects.
// Keep these out of origin probes so they do not create noisy per-product roadblocks.
const VIRGINIA_INVALID_ORIGIN_STORES = new Set(['63', '74', '123', '208', '215', '261', '273', '298', '319', '342', '415']);

const VIRGINIA_STORES_ARCGIS_URL = "https://vginmaps.vdem.virginia.gov/arcgis/rest/services/VA_Base_Layers/VA_Landmarks/FeatureServer/1/query?where=UPPER(LandmkName)%20LIKE%20%27%25ABC%25%27&outFields=*&returnGeometry=false&f=json";
const VIRGINIA_CACHE_PATH = 'out/cache/VA-storeNearby-signals.json';
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
const IN_TARGET_ARTIFACT_PATH = 'out/browser/IN-target-retailer-inventory.json';
const IN_TARGET_KEY = String(process.env.BOURBON_SIGNAL_TARGET_REDSKY_KEY || '').trim();
const IN_TARGET_CACHE_MAX_AGE_MS = Math.max(60 * 60_000, Number(process.env.BOURBON_SIGNAL_IN_TARGET_CACHE_MAX_AGE_MS) || 10 * 60 * 60_000);
const IN_TARGET_COHORT_SIZE = Math.max(1, Math.min(INDIANA_TARGET_STORES.size, Number(process.env.BOURBON_SIGNAL_IN_TARGET_COHORT_SIZE) || 3));
const IN_TARGET_ROTATION_MS = Math.max(30 * 60_000, Number(process.env.BOURBON_SIGNAL_IN_TARGET_ROTATION_MS) || 2 * 60 * 60_000);
const IN_TARGET_PRODUCT_LIMIT = Math.max(1, Math.min(24, Number(process.env.BOURBON_SIGNAL_IN_TARGET_PRODUCT_LIMIT) || 12));
const IN_TARGET_REQUEST_DELAY_MS = Math.max(250, Math.min(5_000, Number(process.env.BOURBON_SIGNAL_IN_TARGET_REQUEST_DELAY_MS) || 450));
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
const IN_CITYHIVE_PAGE_DELAY_MS = Number(process.env.BOURBON_SIGNAL_IN_CITYHIVE_PAGE_DELAY_MS || 1_250);
const IN_CITYHIVE_SOURCE_DELAY_MS = Number(process.env.BOURBON_SIGNAL_IN_CITYHIVE_SOURCE_DELAY_MS || 2_500);

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
const IN_PENGUIN_BASE_URL = 'https://www.penguinliquor.com';
const IN_PENGUIN_CATEGORY_URLS = [
  `${IN_PENGUIN_BASE_URL}/c/spirits/whiskey/19`
];
const IN_PENGUIN_SEED_PRODUCT_URLS = [
  `${IN_PENGUIN_BASE_URL}/p/buffalo-trace-bourbon/1138`,
  `${IN_PENGUIN_BASE_URL}/p/colonel-eh-taylor-small-batch-bourbon/1164`,
  `${IN_PENGUIN_BASE_URL}/p/blantons-the-original-single-barrel-bourbon/3259`,
  `${IN_PENGUIN_BASE_URL}/p/bookers-bourbon/2626`,
  `${IN_PENGUIN_BASE_URL}/p/eagle-rare-10-year-old-bourbon/4847`,
  `${IN_PENGUIN_BASE_URL}/p/four-roses-small-batch-select-bourbon/6259`
];
const IN_PENGUIN_STORE = {
  id: '96',
  name: 'Penguin Liquor - Teal Road',
  address: '3295 Teal Road, Lafayette, IN 47905',
  city: 'Lafayette',
  zip: '47905',
  lat: 40.3849,
  lng: -86.8556
};
const IN_PENGUIN_MAX_PRODUCT_PAGES = Number(process.env.BOURBON_SIGNAL_IN_PENGUIN_MAX_PRODUCT_PAGES || 36);
const PENGUIN_BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';
const IN_DOORDASH_FRONTIER_STORE = {
  id: '26286224',
  businessId: '11821467',
  name: 'Frontier Liquors - Oak Hill Road',
  url: 'https://www.doordash.com/convenience/store/frontier-liquors-evansville-26286224/',
  address: '1701 Oak Hill Road, Evansville, IN 47711',
  city: 'Evansville',
  zip: '47711',
  lat: 37.992805,
  lng: -87.52567
};
const IN_DOORDASH_MAX_FRONTIER_ITEMS = Number(process.env.BOURBON_SIGNAL_IN_DOORDASH_MAX_FRONTIER_ITEMS || 60);
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
  },
  {
    id: '21st-amendment',
    chainName: '21st Amendment Wine & Spirits',
    sourceLabel: '21st Amendment Wine & Spirits CityHive store inventory',
    baseUrl: 'https://21stamendment.com',
    urls: [
      'https://21stamendment.com/shop/?subtype=Bourbon'
    ]
  },
  {
    id: 'holiday-liquors-jasper',
    chainName: 'Holiday Liquors Jasper',
    sourceLabel: 'Holiday Liquors Jasper CityHive store inventory',
    baseUrl: 'https://holidayl7c37e10a.sites.cityhive.app',
    urls: [
      'https://holidayl7c37e10a.sites.cityhive.app/shop/?subtype=Bourbon'
    ]
  },
  {
    id: 'gays-hops-n-schnapps',
    chainName: "Gays Hops-N-Schnapps",
    sourceLabel: "Gays Hops-N-Schnapps CityHive store inventory",
    baseUrl: 'https://gayshopsb1eca398.sites.cityhive.app',
    urls: [
      'https://gayshopsb1eca398.sites.cityhive.app/shop/?subtype=Bourbon'
    ]
  },
  {
    id: 'vine-and-table',
    chainName: 'Vine & Table',
    sourceLabel: 'Vine & Table CityHive store inventory',
    baseUrl: 'https://vinetabl687fd7df.sites.cityhive.app',
    urls: [
      'https://vinetabl687fd7df.sites.cityhive.app/shop/?subtype=Bourbon'
    ]
  }
];

const TN_CITYHIVE_ARTIFACT_PATH = 'out/browser/TN-cityhive-retailer-inventory.json';
const TN_CITYHIVE_MAX_PAGES = Number(process.env.BOURBON_SIGNAL_TN_CITYHIVE_MAX_PAGES || 2);
// Tennessee CityHive rows are fast-moving retailer inventory. Keep cache reuse inside the
// public export freshness window so cached positive rows do not pass verify:tn while being
// too old to appear as customer-facing drops.
const TN_CITYHIVE_CACHE_MAX_AGE_MS = Number(process.env.BOURBON_SIGNAL_TN_CITYHIVE_CACHE_MAX_AGE_MS || 10 * 60 * 60_000);
const TN_CITYHIVE_PAGE_DELAY_MS = Number(process.env.BOURBON_SIGNAL_TN_CITYHIVE_PAGE_DELAY_MS || 1_200);
const TN_CITYHIVE_SOURCE_DELAY_MS = Number(process.env.BOURBON_SIGNAL_TN_CITYHIVE_SOURCE_DELAY_MS || 2_000);
const TN_CITYHIVE_SOURCE_COHORT_SIZE = Math.max(1, Math.min(8, Number(process.env.BOURBON_SIGNAL_TN_CITYHIVE_SOURCE_COHORT_SIZE) || 4));


const TN_COOL_SPRINGS_BASE_URL = 'https://shop.coolspringswine.com/s/1000-1057/';
const TN_COOL_SPRINGS_PAGE_SIZE = Math.min(100, Number(process.env.BOURBON_SIGNAL_TN_COOL_SPRINGS_PAGE_SIZE || 100));
const TN_COOL_SPRINGS_MAX_PAGES = Number(process.env.BOURBON_SIGNAL_TN_COOL_SPRINGS_MAX_PAGES || 3);
const TN_SHOPIFY_MAX_PRODUCTS = Math.min(250, Number(process.env.BOURBON_SIGNAL_TN_SHOPIFY_MAX_PRODUCTS || 120));
const TN_SHOPIFY_SOURCES = [
  {
    id: 'bottle-shop-mcewen',
    chainName: 'The Bottle Shop at McEwen',
    sourceLabel: 'The Bottle Shop at McEwen Shopify bourbon inventory',
    baseUrl: 'https://thebottleshopfranklin.com',
    collectionUrl: 'https://thebottleshopfranklin.com/collections/bourbon/products.json?limit=250',
    address: '1556 W McEwen Dr #102, Franklin, TN 37067',
    city: 'Franklin',
    zip: '37067',
    lat: 35.9336,
    lng: -86.8227
  }
];
const TN_GRABBL_BASE_URL = 'https://backend-prod.grabbl.io';
const TN_GRABBL_GATEWAY_APP_ID = '40b00b93-3936-4edc-a8a9-eb3ea9d8c83a';
const TN_GRABBL_GATEWAY_SEARCH_TERMS = ['bourbon', 'blanton', 'eagle rare', 'buffalo trace', 'weller', '1792', 'four roses', 'woodford', 'elijah craig', 'old forester', 'knob creek', 'maker'];
const TN_GRABBL_SEARCH_LIMIT = Math.min(50, Number(process.env.BOURBON_SIGNAL_TN_GRABBL_SEARCH_LIMIT || 30));
const TN_GRABBL_MAX_TERMS = Math.min(TN_GRABBL_GATEWAY_SEARCH_TERMS.length, Number(process.env.BOURBON_SIGNAL_TN_GRABBL_MAX_TERMS || TN_GRABBL_GATEWAY_SEARCH_TERMS.length));
const TN_GRABBL_GATEWAY_STORE = {
  appId: TN_GRABBL_GATEWAY_APP_ID,
  id: '528698ef-ebe1-4778-a583-c4be1cc29693',
  name: 'Gateway Wine & Spirits',
  address: '3119 Medical Center Parkway A5, Murfreesboro, TN 37129',
  city: 'Murfreesboro',
  zip: '37129',
  lat: 35.8660287,
  lng: -86.4538028
};
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
  },
  {
    id: 'lake-district-wine-liquor',
    chainName: 'Lake District Wine and Liquor',
    sourceLabel: 'Lake District Wine and Liquor CityHive store inventory',
    baseUrl: 'https://lakedistrictwineandliquor.com',
    urls: [
      'https://lakedistrictwineandliquor.com/shop/?subtype=bourbon',
      'https://lakedistrictwineandliquor.com/shop/?subtype=whiskey'
    ]
  },
  {
    id: 'm-and-j-liquor',
    chainName: 'M&J Liquor Wine Tobacoo Chattanooga TN',
    sourceLabel: 'M&J Liquor Wine Tobacoo Chattanooga TN CityHive store inventory',
    baseUrl: 'https://mnjliquor.com',
    urls: [
      'https://mnjliquor.com/shop/?subtype=bourbon',
      'https://mnjliquor.com/shop/?subtype=whiskey'
    ]
  },
  {
    id: 'red-bank-liquor',
    chainName: 'My Discount Liquor Tobacco RedBank TN',
    sourceLabel: 'My Discount Liquor Tobacco RedBank TN CityHive store inventory',
    baseUrl: 'https://redbankliquor.com',
    urls: [
      'https://redbankliquor.com/shop/?subtype=bourbon',
      'https://redbankliquor.com/shop/?subtype=whiskey'
    ]
  },
  {
    id: 'discount-liquor-chattanooga',
    chainName: 'Ma Kalika Partnership dba Discount liquor Chattanooga TN',
    sourceLabel: 'Ma Kalika Partnership dba Discount liquor Chattanooga TN CityHive store inventory',
    baseUrl: 'https://chattliquor.com',
    urls: [
      'https://chattliquor.com/shop/?subtype=bourbon',
      'https://chattliquor.com/shop/?subtype=whiskey'
    ]
  },
  {
    id: 'one-stop-wines-johnson-city',
    chainName: 'One Stop Wines & Spirits Johnson City TN',
    sourceLabel: 'One Stop Wines & Spirits Johnson City TN CityHive store inventory',
    baseUrl: 'https://onestopwines.net',
    urls: [
      'https://onestopwines.net/shop/?subtype=bourbon',
      'https://onestopwines.net/shop/?subtype=whiskey'
    ]
  },
  {
    id: 'northshore-wine-spirits',
    chainName: 'Northshore Wine & Spirits',
    sourceLabel: 'Northshore Wine & Spirits CityHive store inventory',
    baseUrl: 'https://northshorews.com',
    urls: [
      'https://northshorews.com/shop/?subtype=bourbon',
      'https://northshorews.com/shop/?subtype=whiskey'
    ]
  },
  {
    id: 'liquor-vault-knoxville',
    chainName: 'Liquor Vault Knoxville',
    sourceLabel: 'Liquor Vault Knoxville CityHive store inventory',
    baseUrl: 'https://liquorvault.com',
    urls: [
      'https://liquorvault.com/shop/?subtype=bourbon',
      'https://liquorvault.com/shop/?subtype=whiskey'
    ]
  },
  {
    id: 'four-sixes-liquors-and-wines',
    chainName: 'Four Sixes Liquors & Wines',
    sourceLabel: 'Four Sixes Liquors & Wines CityHive store inventory',
    baseUrl: 'https://foursixesliquors.com',
    urls: [
      'https://foursixesliquors.com/shop/?subtype=bourbon',
      'https://foursixesliquors.com/shop/?subtype=whiskey'
    ]
  },
  {
    id: 'happy-ours-wine-and-spirits',
    chainName: 'Happy Ours Wine & Spirits',
    sourceLabel: 'Happy Ours Wine & Spirits CityHive store inventory',
    baseUrl: 'https://happyour0c3f6e1f.sites.cityhive.app',
    urls: [
      'https://happyour0c3f6e1f.sites.cityhive.app/shop/?subtype=bourbon',
      'https://happyour0c3f6e1f.sites.cityhive.app/shop/?subtype=whiskey'
    ]
  },
  {
    id: 'germantown-village-wine-and-liquor',
    chainName: 'Germantown Wine & Liquor',
    sourceLabel: 'Germantown Wine & Liquor CityHive store inventory',
    baseUrl: 'https://germanto0f24660d.sites.cityhive.app',
    urls: [
      'https://germanto0f24660d.sites.cityhive.app/shop/?subtype=bourbon',
      'https://germanto0f24660d.sites.cityhive.app/shop/?subtype=whiskey'
    ]
  },
  {
    id: 'lakeshore-wine-and-spirits',
    chainName: 'Lakeshore Wine & Spirits',
    sourceLabel: 'Lakeshore Wine & Spirits CityHive store inventory',
    baseUrl: 'https://lakeshorewineandspirit.com',
    urls: [
      'https://lakeshorewineandspirit.com/shop/?subtype=bourbon',
      'https://lakeshorewineandspirit.com/shop/?subtype=whiskey'
    ]
  },
  {
    id: 'kirby-wines-liquors',
    chainName: 'Kirby Wines & Liquors',
    sourceLabel: 'Kirby Wines & Liquors CityHive store inventory',
    baseUrl: 'https://kirbywina689aaf8.sites.cityhive.app',
    urls: [
      'https://kirbywina689aaf8.sites.cityhive.app/shop/?subtype=bourbon',
      'https://kirbywina689aaf8.sites.cityhive.app/shop/?subtype=whiskey'
    ]
  },
  {
    id: 'green-meadow-wine-spirits',
    chainName: 'Green Meadow Wine & Spirits',
    sourceLabel: 'Green Meadow Wine & Spirits CityHive store inventory',
    baseUrl: 'https://greenmea1758acc7.sites.cityhive.app',
    urls: [
      'https://greenmea1758acc7.sites.cityhive.app/shop/?subtype=bourbon',
      'https://greenmea1758acc7.sites.cityhive.app/shop/?subtype=whiskey'
    ]
  },
  {
    id: 'junction-liquors-smyrna',
    chainName: 'Junction Liquors - Smyrna',
    sourceLabel: 'Junction Liquors - Smyrna CityHive store inventory',
    baseUrl: 'https://junction-liquors.com',
    urls: [
      'https://junction-liquors.com/shop/?subtype=bourbon',
      'https://junction-liquors.com/shop/?subtype=whiskey'
    ]
  },
  {
    id: 'pour-vous-hendersonville',
    chainName: 'Pour Vous Wine, Spirits & Beer',
    sourceLabel: 'Pour Vous Wine, Spirits & Beer CityHive store inventory',
    baseUrl: 'https://pourvous.us',
    urls: [
      'https://pourvous.us/shop/?subtype=bourbon',
      'https://pourvous.us/shop/?subtype=whiskey'
    ]
  },
  {
    id: 'good-times-crossville',
    chainName: 'GOOD TIMES WINE SPIRITS & BREW',
    sourceLabel: 'GOOD TIMES WINE SPIRITS & BREW CityHive store inventory',
    baseUrl: 'https://goodtime438b8d5d.sites.cityhive.app',
    urls: [
      'https://goodtime438b8d5d.sites.cityhive.app/shop/?subtype=bourbon',
      'https://goodtime438b8d5d.sites.cityhive.app/shop/?subtype=whiskey'
    ]
  },
  {
    id: 'campbell-station-wine-spirits',
    chainName: 'Campbell Station Wine & Spirits',
    sourceLabel: 'Campbell Station Wine & Spirits CityHive store inventory',
    baseUrl: 'https://campbellstationwine.com',
    urls: [
      'https://campbellstationwine.com/shop/?subtype=bourbon',
      'https://campbellstationwine.com/shop/?subtype=whiskey'
    ]
  },
  {
    id: 'red-spirits-and-wine',
    chainName: 'RED Spirits & Wine',
    sourceLabel: 'RED Spirits & Wine CityHive store inventory',
    baseUrl: 'https://shopredspirits.com',
    urls: [
      'https://shopredspirits.com/shop/?subtype=bourbon',
      'https://shopredspirits.com/shop/?subtype=whiskey'
    ]
  }

];

const AZ_CITYHIVE_MAX_PAGES = Math.max(1, Math.min(4, Number(process.env.BOURBON_SIGNAL_AZ_CITYHIVE_MAX_PAGES) || 2));
const AZ_CITYHIVE_PAGE_DELAY_MS = Math.max(500, Math.min(10_000, Number(process.env.BOURBON_SIGNAL_AZ_CITYHIVE_PAGE_DELAY_MS) || 1_200));
const AZ_CITYHIVE_SOURCES = [
  {
    id: 'paradise-liquor-phoenix',
    chainName: 'Paradise Liquor Mini Mart',
    sourceLabel: 'Paradise Liquor Mini Mart Phoenix CityHive store inventory',
    baseUrl: 'https://paradiseliquoraz.com',
    merchantIds: ['6060f68f2641d516427b8bc6'],
    urls: [
      'https://paradiseliquoraz.com/shop/?subtype=bourbon',
      'https://paradiseliquoraz.com/shop/?subtype=whiskey'
    ]
  },
  {
    id: 'liquor-vault-scottsdale',
    chainName: 'Liquor Vault',
    sourceLabel: 'Liquor Vault Scottsdale CityHive store inventory',
    baseUrl: 'https://azliquorvault.com',
    merchantIds: ['6060f74f93fbc722f35ec763'],
    urls: ['https://azliquorvault.com/shop/?subtype=bourbon']
  },
  {
    id: 'skyline-liquor',
    chainName: 'Skyline Liquor',
    sourceLabel: 'Skyline Liquor Arizona CityHive store inventory',
    baseUrl: 'https://skylinebroadway.com',
    merchantIds: ['598100c3d05b4360e32fa9b6', '686c048672e27f25df6deeda'],
    urls: ['https://skylinebroadway.com/shop/?subtype=bourbon']
  },
  {
    id: 'chandler-liquors',
    chainName: 'Chandler Liquors',
    sourceLabel: 'Chandler Liquors CityHive store inventory',
    baseUrl: 'https://chandlerliquorsaz.com',
    merchantIds: ['5e8e0a0778e8f16f128f7e5a'],
    urls: ['https://chandlerliquorsaz.com/shop/?subtype=Bourbon']
  },
  {
    id: 'luckys-liquor-phoenix',
    chainName: "Lucky's Liquor",
    sourceLabel: "Lucky's Liquor Phoenix CityHive store inventory",
    baseUrl: 'https://luckysliquor.com',
    merchantIds: ['65fe530ba854f17fbd29a744'],
    urls: ['https://luckysliquor.com/shop/?search=bourbon']
  },
  {
    id: 'one-stop-drive-thru-phoenix',
    chainName: 'One Stop Drive Thru Liquor',
    sourceLabel: 'One Stop Drive Thru Liquor Phoenix CityHive store inventory',
    baseUrl: 'https://onestopdrivethruliquor.com',
    merchantIds: ['6377cc75b9615e6a2b8290c1'],
    urls: ['https://onestopdrivethruliquor.com/shop/?search=bourbon']
  },
  {
    id: 'liquor-express-tempe',
    chainName: 'Liquor Express Tempe',
    sourceLabel: 'Liquor Express Tempe CityHive store inventory',
    baseUrl: 'https://liquorexpresstempe.store',
    merchantIds: ['5f88c1ab8f687229c6c2c8a4'],
    urls: ['https://liquorexpresstempe.store/shop/?subtype=bourbon', 'https://liquorexpresstempe.store/shop/?search=bourbon']
  }
];

const AZ_MESA_LIQUOR_BASE_URL = 'https://mesaliquorstore.com';
const AZ_MESA_LIQUOR_SOURCE_LABEL = 'Mesa Liquor WooCommerce store inventory';
const AZ_MESA_LIQUOR_STORE = { id: 'mesa-liquor:7143-e-southern', name: 'Mesa Liquor', address: '7143 E Southern Ave, Mesa, AZ 85209', city: 'Mesa', zip: '85209' };
const AZ_MESA_LIQUOR_TERMS = ['bourbon', 'blanton', 'weller', 'eagle rare', 'buffalo trace', 'stagg', 'e h taylor'];
const AZ_MESA_LIQUOR_DELAY_MS = Math.max(500, Math.min(10_000, Number(process.env.BOURBON_SIGNAL_AZ_MESA_LIQUOR_DELAY_MS) || 900));
const AZ_BEST_LIQUOR_BASE_URL = 'https://bestliquortempe.com';
const AZ_BEST_LIQUOR_SOURCE_LABEL = 'Best Liquor Tempe WooCommerce store inventory';
const AZ_BEST_LIQUOR_STORE = { id: 'best-liquor-tempe:3320-s-priest', name: 'Best Liquor', address: '3320 S Priest Dr, Tempe, AZ 85282', city: 'Tempe', zip: '85282' };
const AZ_FLAGSTAFF_LIQUOR_URL = 'https://flagstaffliquor.com/products.json?limit=250';
const AZ_FLAGSTAFF_LIQUOR_SOURCE_LABEL = 'Flagstaff Liquor Shopify store inventory';
const AZ_FLAGSTAFF_LIQUOR_STORE = { id: 'flagstaff-liquor:1700-e-route-66', name: 'Flagstaff Liquor', address: '1700 E Route 66, Flagstaff, AZ 86004', city: 'Flagstaff', zip: '86004' };
const AZ_ALBERTSONS_STORE_KEY = process.env.BOURBON_SIGNAL_ALBERTSONS_STORE_KEY || '7bad9afbb87043b28519c4443106db06';
const AZ_ALBERTSONS_SEARCH_KEY = process.env.BOURBON_SIGNAL_ALBERTSONS_SEARCH_KEY || 'e914eec9448c4d5eb672debf5011cf8f';
const AZ_ALBERTSONS_ZIPS = String(process.env.BOURBON_SIGNAL_ALBERTSONS_ZIPS || '85001,85251,85301,85201,85224,85234,85142,85323,85338,85345,85374,85396,85701,85635,85364,86403,86001,86301').split(',').map((x) => x.trim()).filter(Boolean);
const AZ_ALBERTSONS_TERMS = String(process.env.BOURBON_SIGNAL_ALBERTSONS_TERMS || "bourbon,blanton's,weller,buffalo trace,e.h. taylor").split(',').map((x) => x.trim()).filter(Boolean);
const AZ_ALBERTSONS_MAX_STORES = Math.max(1, Math.min(80, Number(process.env.BOURBON_SIGNAL_ALBERTSONS_MAX_STORES) || 24));
const AZ_ALBERTSONS_DELAY_MS = Math.max(500, Math.min(10_000, Number(process.env.BOURBON_SIGNAL_ALBERTSONS_DELAY_MS) || 900));
const AZ_TARGET_KEY = process.env.BOURBON_SIGNAL_TARGET_REDSKY_KEY || '9f36aeafbe60771e321a7cc95a78140772ab3e96';
const AZ_TARGET_STORES = new Map([
  ['233', { name: 'Target Paradise Valley', address: '12602 N Paradise Village Pkwy W, Phoenix, AZ 85032', city: 'Phoenix', zip: '85032' }],
  ['251', { name: 'Target Mesa Central', address: '1135 S Gilbert Rd, Mesa, AZ 85204', city: 'Mesa', zip: '85204' }],
  ['319', { name: 'Target Tempe', address: '1818 E Baseline Rd, Tempe, AZ 85283', city: 'Tempe', zip: '85283' }],
  ['363', { name: 'Target Scottsdale Talking Stick Way', address: '9000 E Talking Stick Way, Scottsdale, AZ 85250', city: 'Scottsdale', zip: '85250' }],
  ['639', { name: 'Target Mesa East', address: '1525 S Power Rd, Mesa, AZ 85206', city: 'Mesa', zip: '85206' }],
  ['700', { name: 'Target Oro Valley', address: '10555 N Oracle Rd, Oro Valley, AZ 85737', city: 'Oro Valley', zip: '85737' }],
  ['825', { name: 'Target Peoria North', address: '8055 W Bell Rd, Peoria, AZ 85382', city: 'Peoria', zip: '85382' }],
  ['851', { name: 'Target Westridge', address: '7409 W Virginia Ave, Phoenix, AZ 85035', city: 'Phoenix', zip: '85035' }],
  ['854', { name: 'Target Marana', address: '3901 W Ina Rd, Tucson, AZ 85741', city: 'Tucson', zip: '85741' }],
  ['855', { name: 'Target Tucson NE', address: '6500 E Grant Rd, Tucson, AZ 85715', city: 'Tucson', zip: '85715' }],
  ['884', { name: 'Target Prescott', address: '1851 E Highway 69, Prescott, AZ 86301', city: 'Prescott', zip: '86301' }],
  ['909', { name: 'Target Ahwatukee', address: '4734 E Ray Rd, Phoenix, AZ 85044', city: 'Phoenix', zip: '85044' }],
  ['935', { name: 'Target Flagstaff', address: '1650 S Milton Rd, Flagstaff, AZ 86001', city: 'Flagstaff', zip: '86001' }],
  ['936', { name: 'Target Frank Lloyd Wright Blvd', address: '15444 N Frank Lloyd Wright Blvd, Scottsdale, AZ 85260', city: 'Scottsdale', zip: '85260' }],
  ['950', { name: 'Target Arcadia Crossing', address: '4515 E Thomas Rd, Phoenix, AZ 85018', city: 'Phoenix', zip: '85018' }],
  ['1141', { name: 'Target Phoenix I17 and SR101', address: '2727 W Agua Fria Fwy, Phoenix, AZ 85027', city: 'Phoenix', zip: '85027' }],
  ['1209', { name: 'Target Gilbert Val Vista', address: '1515 E Warner Rd, Gilbert, AZ 85296', city: 'Gilbert', zip: '85296' }],
  ['1242', { name: 'Target Goodyear', address: '1515 N Litchfield Rd, Goodyear, AZ 85395', city: 'Goodyear', zip: '85395' }],
  ['1316', { name: 'Target Tucson SW', address: '1225 W Irvington Rd, Tucson, AZ 85714', city: 'Tucson', zip: '85714' }],
  ['1327', { name: 'Target Scottsdale Road', address: '32351 N Scottsdale Rd, Scottsdale, AZ 85266', city: 'Scottsdale', zip: '85266' }],
  ['1335', { name: 'Target Surprise', address: '13731 W Bell Rd, Surprise, AZ 85374', city: 'Surprise', zip: '85374' }],
  ['1360', { name: 'Target Phoenix NE', address: '21001 N Tatum Blvd Ste 20, Phoenix, AZ 85050', city: 'Phoenix', zip: '85050' }],
  ['1361', { name: 'Target Peoria SW', address: '9350 W Northern Ave, Glendale, AZ 85305', city: 'Glendale', zip: '85305' }],
  ['1386', { name: 'Target Mesa Red Mountain', address: '2151 N Power Rd, Mesa, AZ 85215', city: 'Mesa', zip: '85215' }],
  ['1429', { name: 'Target Mesa West', address: '1230 S Longmore Ave, Mesa, AZ 85202', city: 'Mesa', zip: '85202' }],
  ['1432', { name: 'Target Fountain Hills', address: '16825 E Shea Blvd, Fountain Hills, AZ 85268', city: 'Fountain Hills', zip: '85268' }],
  ['1439', { name: 'Target Tucson El Con Mall', address: '3699 E Broadway Blvd, Tucson, AZ 85716', city: 'Tucson', zip: '85716' }],
  ['1838', { name: 'Target Chandler Fashion Center', address: '3425 W Frye Rd, Chandler, AZ 85226', city: 'Chandler', zip: '85226' }],
  ['1863', { name: 'Target Tucson SE', address: '9615 E Old Spanish Trl, Tucson, AZ 85748', city: 'Tucson', zip: '85748' }],
  ['1905', { name: 'Target South Mountain', address: '2140 E Baseline Rd, Phoenix, AZ 85042', city: 'Phoenix', zip: '85042' }],
  ['1959', { name: 'Target Gilbert Gateway', address: '5110 S Power Rd, Mesa, AZ 85212', city: 'Mesa', zip: '85212' }],
  ['1960', { name: 'Target Gilbert SW', address: '3931 S Gilbert Rd, Gilbert, AZ 85297', city: 'Gilbert', zip: '85297' }],
  ['2083', { name: 'Target Yuma', address: '1450 S Yuma Palms Pkwy, Yuma, AZ 85365', city: 'Yuma', zip: '85365' }],
  ['2140', { name: 'Target Tucson North', address: '4040 N Oracle Rd, Tucson, AZ 85705', city: 'Tucson', zip: '85705' }],
  ['2149', { name: 'Target Phoenix SW', address: '9830 W Lower Buckeye Rd, Tolleson, AZ 85353', city: 'Tolleson', zip: '85353' }],
  ['2176', { name: 'Target Tempe Rio Salado', address: '1800 E Rio Salado Pkwy, Tempe, AZ 85281', city: 'Tempe', zip: '85281' }],
  ['2227', { name: 'Target Peoria Lake Pleasant Pkwy', address: '24890 N Lake Pleasant Pkwy, Peoria, AZ 85383', city: 'Peoria', zip: '85383' }],
  ['2236', { name: 'Target Phoenix 7th Street and Bell', address: '16806 N 7th St, Phoenix, AZ 85022', city: 'Phoenix', zip: '85022' }],
  ['2341', { name: 'Target Glendale', address: '10404 N 43rd Ave, Glendale, AZ 85302', city: 'Glendale', zip: '85302' }],
  ['2354', { name: 'Target Phoenix Spectrum', address: '5715 N 19th Ave, Phoenix, AZ 85015', city: 'Phoenix', zip: '85015' }],
  ['2365', { name: 'Target Queen Creek', address: '21398 S Ellsworth Loop Rd, Queen Creek, AZ 85142', city: 'Queen Creek', zip: '85142' }],
  ['2368', { name: 'Target Bullhead City', address: '3699 Hwy 95, Bullhead City, AZ 86442', city: 'Bullhead City', zip: '86442' }],
  ['2400', { name: 'Target Goodyear West', address: '995 S Cotton Ln, Goodyear, AZ 85338', city: 'Goodyear', zip: '85338' }],
  ['2747', { name: 'Target Chandler South', address: '3777 S Arizona Ave, Chandler, AZ 85248', city: 'Chandler', zip: '85248' }],
  ['2915', { name: 'Target Surprise West Prasada', address: '14101 N Prasada Pkwy, Surprise, AZ 85388', city: 'Surprise', zip: '85388' }],
  ['2920', { name: 'Target Queen Creek Gantzel and Combs', address: '37854 N Gantzel Rd, Queen Creek, AZ 85140', city: 'Queen Creek', zip: '85140' }],
  ['2944', { name: 'Target Buckeye - Verrado', address: '1355 N Verrado Way, Buckeye, AZ 85396', city: 'Buckeye', zip: '85396' }],
  ['2953', { name: 'Target Casa Grande Promenade', address: '951 N Promenade Pkwy, Casa Grande, AZ 85194', city: 'Casa Grande', zip: '85194' }],
  ['3261', { name: 'Target Phoenix Uptown Camelback', address: '1625 E Camelback Rd, Phoenix, AZ 85016', city: 'Phoenix', zip: '85016' }]
]);
const AZ_TARGET_COHORT_SIZE = Math.max(1, Math.min(6, Number(process.env.BOURBON_SIGNAL_TARGET_COHORT_SIZE) || 3));

const FL_MDP_PRODUCTS_BASE_URL = 'https://mdpliquorfl.com/products.json?limit=250';
const FL_MDP_STORE = { id: 'mdp-liquor-kissimmee:4636-w-irlo-bronson', name: 'MDP Liquor Kissimmee', address: '4636 W Irlo Bronson Memorial Hwy, Kissimmee, FL 34746', city: 'Kissimmee', zip: '34746' };
const FL_MDP_MAX_PAGES = Math.max(1, Math.min(8, Number(process.env.BOURBON_SIGNAL_FL_MDP_MAX_PAGES) || 3));
const FL_MDP_DELAY_MS = Math.max(300, Math.min(10_000, Number(process.env.BOURBON_SIGNAL_FL_MDP_DELAY_MS) || 600));
const FL_SHOPIFY_RETAILERS = [
  {
    id: 'luekens', chain: 'luekens', label: 'Luekens Wine & Spirits Shopify store pickup inventory', host: 'www.luekensliquors.com',
    productsUrl: 'https://www.luekensliquors.com/products.json?limit=250', maxPages: 3, pickupStores: true
  },
  {
    id: 'jensens-miami', chain: 'jensens-liquors', label: "Jensen's Liquors Miami Shopify pickup inventory", host: 'jensensliquors.com',
    productsUrl: 'https://jensensliquors.com/products.json?limit=250', maxPages: 3,
    store: { id: 'jensens-liquors:1646-sw-27th', name: "Jensen's Liquors - SW 27th Ave", address: '1646 SW 27th Ave, Miami, FL 33145', city: 'Miami', zip: '33145' }
  }
];
const FL_ABC_SEARCHSPRING_URL = 'https://api.searchspring.net/api/search/search.json?siteId=p16j4k&q=bourbon&resultsFormat=native&resultsPerPage=100';
const FL_TARGET_KEY = process.env.BOURBON_SIGNAL_TARGET_REDSKY_KEY || AZ_TARGET_KEY;
const FL_TARGET_STORES = new Map([
  ['649', { name: 'Target East Colonial', address: '718 Maguire Blvd, Orlando, FL 32803', city: 'Orlando', zip: '32803' }],
  ['650', { name: 'Target Orlando Sand Lake Rd', address: '880 Sand Lake Rd, Orlando, FL 32809', city: 'Orlando', zip: '32809' }],
  ['1518', { name: 'Target Orlando Millenia', address: '4750 Millenia Plaza Way, Orlando, FL 32839', city: 'Orlando', zip: '32839' }],
  ['1760', { name: 'Target Waterford Lakes', address: '325 N Alafaya Trl, Orlando, FL 32828', city: 'Orlando', zip: '32828' }],
  ['2376', { name: 'Target Orlando Sodo', address: '120 W Grant St, Orlando, FL 32806', city: 'Orlando', zip: '32806' }],
  ...FLORIDA_TAMPA_TARGET_STORES,
]);
const FL_TARGET_COHORT_SIZE = Math.max(1, Math.min(6, Number(process.env.BOURBON_SIGNAL_FL_TARGET_COHORT_SIZE) || 4));
const FL_SOURCE_CONCURRENCY = Math.max(1, Math.min(3, Number(process.env.BOURBON_SIGNAL_FL_SOURCE_CONCURRENCY) || 3));
const FL_CITYHIVE_PAGE_DELAY_MS = Math.max(300, Math.min(5_000, Number(process.env.BOURBON_SIGNAL_FL_CITYHIVE_PAGE_DELAY_MS) || 500));
const FL_CITYHIVE_SOURCE_DELAY_MS = Math.max(1_000, Math.min(10_000, Number(process.env.BOURBON_SIGNAL_FL_CITYHIVE_SOURCE_DELAY_MS) || 2_000));
const FL_CITYHIVE_FALLBACK_MAX_AGE_MS = Math.max(30 * 60_000, Number(process.env.BOURBON_SIGNAL_FL_CITYHIVE_FALLBACK_MAX_AGE_MS) || 6 * 60 * 60_000);
const FL_PENSACOLA_MAX_COLLECTION_PAGES = Math.max(1, Math.min(3, Number(process.env.BOURBON_SIGNAL_FL_PENSACOLA_MAX_COLLECTION_PAGES) || 1));
const FL_PENSACOLA_MAX_PRODUCT_PAGES = Math.max(1, Math.min(24, Number(process.env.BOURBON_SIGNAL_FL_PENSACOLA_MAX_PRODUCT_PAGES) || 10));
const FL_PENSACOLA_MATCH_TARGET = Math.max(1, Math.min(8, Number(process.env.BOURBON_SIGNAL_FL_PENSACOLA_MATCH_TARGET) || 3));
const FL_PENSACOLA_PAGE_DELAY_MS = Math.max(400, Math.min(5_000, Number(process.env.BOURBON_SIGNAL_FL_PENSACOLA_PAGE_DELAY_MS) || 650));
export const FL_CITYHIVE_SOURCES = FLORIDA_CITYHIVE_SOURCES;
const FL_GASPARS_BOURBON_URL = 'https://www.gasparsliquorshoppe.com/bourbon/';
const FL_GASPARS_MAX_PAGES = Math.max(1, Math.min(40, Number(process.env.BOURBON_SIGNAL_FL_GASPARS_MAX_PAGES) || 40));
const FL_GASPARS_DELAY_MS = Math.max(300, Math.min(5_000, Number(process.env.BOURBON_SIGNAL_FL_GASPARS_DELAY_MS) || 500));
const FL_GASPARS_STORE = { id: 'gaspars-liquor-shoppe:tampa-56th', name: "Gaspar's Liquor Shoppe", address: '8448 N 56th St, Tampa, FL 33617', city: 'Tampa', zip: '33617' };
const FL_LIQUOR_DEPOT_URL = 'https://www.liquordepottampa.com/shop-picks';

const GA_CITYHIVE_PAGE_DELAY_MS = Math.max(500, Math.min(5_000, Number(process.env.BOURBON_SIGNAL_GA_CITYHIVE_PAGE_DELAY_MS) || 750));
const GA_CITYHIVE_SOURCE_DELAY_MS = Math.max(750, Math.min(10_000, Number(process.env.BOURBON_SIGNAL_GA_CITYHIVE_SOURCE_DELAY_MS) || 1_000));
const GA_GOTOLIQUOR_SOURCE_DELAY_MS = Math.max(500, Math.min(5_000, Number(process.env.BOURBON_SIGNAL_GA_GOTOLIQUOR_SOURCE_DELAY_MS) || 750));
const GA_SOURCE_CONCURRENCY = Math.max(1, Math.min(3, Number(process.env.BOURBON_SIGNAL_GA_SOURCE_CONCURRENCY) || 3));

const TX_SPECS_RELEASE_URL = 'https://specsonline.com/bourbonday2024/';
const TX_INVENTORY_CACHE_PATH = 'out/cache/tx-cityhive-inventory.json';
const TX_INVENTORY_CACHE_MAX_AGE_MS = Math.max(30 * 60_000, Number(process.env.BOURBON_SIGNAL_TX_INVENTORY_CACHE_MAX_AGE_MS) || 6 * 60 * 60_000);
const TX_SPECS_PRODUCT_URLS = [
  'https://specsonline.com/shop/spirits/native-texas-bourbon/',
  'https://specsonline.com/shop/spirits/tx-bourbon-whiskey-6-case/',
  'https://specsonline.com/shop/spirits/specs-single-barrel-tx-bourbon/'
];
export function texasCityHiveRequestLimits(env = process.env) {
  return {
    // One broad category request across four branches produced useful Twin inventory without
    // the 429 caused by the former 28-branch x two-page request matrix. Keep overrides bounded.
    maxPages: Math.max(1, Math.min(3, Number(env.BOURBON_SIGNAL_TX_CITYHIVE_MAX_PAGES) || 1)),
    twinMaxMerchants: Math.max(1, Math.min(40, Number(env.BOURBON_SIGNAL_TX_TWIN_MAX_MERCHANTS) || 4)),
  };
}
const { maxPages: TX_CITYHIVE_MAX_PAGES, twinMaxMerchants: TX_TWIN_MAX_MERCHANTS } = texasCityHiveRequestLimits();
const TX_TWIN_MERCHANT_IDS = [
  '5af17b54c8852b44f5995f46', '5af17b52c8852b44f5995f41', '5ada5b59db109f209fb1b63d', '546ba9ef3932330002910100',
  '5af17ad1c8852b44f5995ed8', '5ada111597465774e9268c20', '5af17bacc8852b44f5995f78', '5af17be2c8852b44f5995fb9',
  '5af17be4c8852b44f5995fbe', '5af17c0ec8852b44f5995fd7', '5af17c10c8852b44f5995fdc', '5af17836c8852b44f5995e96',
  '5d81685dc3b543272efe63e6', '5af17c3bc8852b44f5995fff', '5d81675ecc23515b1707d1f6', '5d816904c3b543271ffe6fac',
  '5d8167fda1c7fa5597262ed0', '5d8168ab384009231fb508ef', '5af17b4cc8852b44f5995f32', '5af17b1cc8852b44f5995f05',
  '5af17c15c8852b44f5995fe6', '5af17bddc8852b44f5995faf', '5af17b9fc8852b44f5995f5f', '5af17bd1c8852b44f5995f91',
  '5af17c17c8852b44f5995feb', '5af17c3ac8852b44f5995ffa', '5af17bdcc8852b44f5995faa', '5af17a75c8852b44f5995ea6'
];
const TX_CITYHIVE_MERCHANT_COHORTS = {
  'twin-liquors': TX_TWIN_MERCHANT_IDS.slice(0, TX_TWIN_MAX_MERCHANTS),
  'wb-liquors': [
    '6060f687e17e773238490ddc', '648cb54bb2fadf2a86856f05', '648cb5866b21332a821b5706', '648cb5d720a8582a9053eb3d', '648cb664132b1b2a7f0caedf',
    '648cb6df0a94182aaa3a337e', '648cb72079337d2ad1af6945', '648cb7920c3b492a993d9cdb', '648cb7cf711b392a9607244a', '648cb80ff3e7a62aa5fdca9c',
    '648cba980c3b492a913dba11', '648cbaea711b392a8b0735a8', '648cbb3370e7a2482d21acc3', '648cbb6b06d1f9274361ed16', '648cbb9c0c980c43adbb375d',
    '648cbbd379337d2ad1aff1be', '648cbc120c3b492a993e10a9', '648cc46a4aa0ea46855420ba', '648cc4b74aa0ea456854112d', '648cc5a5d7df9c2aa8dc62a9',
    '648cc5e0d2b12c2aa870a73b', '648cc6250a3e60471c8fc8c1', '648cc73e06d1f9274362d6ad', '648cc77d0c3b4945cd3b72a5', '648cc7e14aa0ea4685545a2a',
    '648cc8214aa0ea4685545f1d', '648cc85144a86b45f20d5d13', '648cc8859d8cf2273fff6cc6', '648cc963c704d72a6cf7ab99', '648dcdc9d701e12a85594feb',
    '648dce4867293e2aa535e376'
  ],
  'spankys-liquor': ['6351f69ad97d1925924544b1', '636149add1dc3840de108e86', '636149e612f67f29976df315', '63614a12bad2862922986dda', '63614a4612f67f29976dfee1', '63614b8ebfa4a167804f0eca', '63614be6bfa4a166dc4f104d', '63614c12d1dc38417a10a55e', '63614c39f428d12939961eaa', '63614c5ebfa4a166dc4f1905']
};
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
  },
  { id: 'zipps-liquor', chainName: 'Zipps Liquor', sourceLabel: 'Zipps Liquor CityHive store inventory', baseUrl: 'https://shop.zippsliquor.com', urls: ['https://shop.zippsliquor.com/shop/?tags=bourbon'] },
  { id: 'pelican-liquor', chainName: 'Pelican Liquor', sourceLabel: 'Pelican Liquor McKinney CityHive store inventory', baseUrl: 'https://www.pelicanliquor.com', urls: ['https://www.pelicanliquor.com/shop/?subtype=Bourbon'] },
  { id: 'tipsy-liquor-round-rock', chainName: 'Tipsy Liquor Round Rock', sourceLabel: 'Tipsy Liquor Round Rock CityHive store inventory', baseUrl: 'https://tipsyliquorroundrock.com', urls: ['https://tipsyliquorroundrock.com/shop/?subtype=Bourbon'] },
  { id: 'wb-liquors', chainName: 'WB Liquors & Wine', sourceLabel: 'WB Liquors & Wine Texas CityHive store inventory', baseUrl: 'https://wbliquors.com', urls: ['https://wbliquors.com/shop/?subtype=whiskey'] },
  { id: 'jb-maverick-texas', chainName: 'JB Maverick of Texas', sourceLabel: 'JB Maverick of Texas CityHive store inventory', baseUrl: 'https://shop.maverickbevtx.com', urls: ['https://shop.maverickbevtx.com/shop/?subtype=Whiskey'] },
  { id: 'oak-liquor-cabinet', chainName: 'Oak Liquor Cabinet', sourceLabel: 'Oak Liquor Cabinet Austin CityHive store inventory', baseUrl: 'https://oakliquorcabinet.com', urls: ['https://oakliquorcabinet.com/shop/?subtype=Bourbon'] },
  { id: 'liquorpedia-riverstone', chainName: 'Liquorpedia Riverstone', sourceLabel: 'Liquorpedia Riverstone CityHive store inventory', baseUrl: 'https://liquorpebcd48c8c.sites.cityhive.app', urls: ['https://liquorpebcd48c8c.sites.cityhive.app/shop/?subtype=Bourbon'] },
  { id: 'spankys-liquor', chainName: "Spanky's Liquor, Beer and Wine", sourceLabel: "Spanky's Liquor Texas CityHive store inventory", baseUrl: 'https://spankysl9f9e48c3.sites.cityhive.app', urls: ['https://spankysl9f9e48c3.sites.cityhive.app/shop/?subtype=Bourbon'] },
  { id: 'steves-liquor-austin', chainName: "Steve's Liquor & Fine Wines", sourceLabel: "Steve's Liquor Austin CityHive store inventory", baseUrl: 'https://stevesli404f9321.sites.cityhive.app', urls: ['https://stevesli404f9321.sites.cityhive.app/shop/?subtype=Bourbon'] },
  { id: 'liquor-hub-fort-worth', chainName: 'Liquor Hub', sourceLabel: 'Liquor Hub Fort Worth CityHive store inventory', baseUrl: 'https://liquorde0800e82f.sites.cityhive.app', urls: ['https://liquorde0800e82f.sites.cityhive.app/shop/?subtype=Bourbon'] },
  { id: 'longhorn-liquor', chainName: 'Longhorn Liquor', sourceLabel: 'Longhorn Liquor Lumberton CityHive store inventory', baseUrl: 'https://longhorn.sites.cityhive.app', urls: ['https://longhorn.sites.cityhive.app/shop/?subtype=Bourbon'] },
  { id: 'texas-cheer-liquor', chainName: 'Texas Cheer Liquor', sourceLabel: 'Texas Cheer Liquor San Antonio CityHive store inventory', baseUrl: 'https://texascheb103f7cc.sites.cityhive.app', urls: ['https://texascheb103f7cc.sites.cityhive.app/shop/?subtype=Bourbon'] },
  { id: 'whitesboro-liquor', chainName: 'Whitesboro Liquor', sourceLabel: 'Whitesboro Liquor CityHive store inventory', baseUrl: 'https://whitesboroliquor.com', urls: ['https://whitesboroliquor.com/shop/?subtype=Bourbon'] },
  { id: 'spirit-six-austin', chainName: 'Spirit Six', sourceLabel: 'Spirit Six Austin CityHive store inventory', baseUrl: 'https://www.spiritsix.com', urls: ['https://www.spiritsix.com/shop/?subtype=Bourbon'] }
];
const TX_WATCH_RE = /bourbon|blanton|eagle rare|weller|stagg|e\.?h\.?\s*taylor|colonel\s*taylor|buffalo trace|old fitz|fitzgerald|michter|willett|baker'?s?|booker'?s?|bardstown|holladay|single barrel|barrel pick|rare|allocated/i;

const SC_CITYHIVE_ARTIFACT_PATH = 'out/browser/SC-cityhive-retailer-inventory.json';
// One bourbon category page per selected merchant currently yields broad SC coverage while
// avoiding the request amplification that caused blocked refreshes. Inventory cache reuse is
// capped at six hours so positive Myrtle Beach rows remain inside the public freshness window.
const SC_CITYHIVE_MAX_PAGES = Number(process.env.BOURBON_SIGNAL_SC_CITYHIVE_MAX_PAGES || 1);
const SC_CITYHIVE_CACHE_MAX_AGE_MS = Number(process.env.BOURBON_SIGNAL_SC_CITYHIVE_CACHE_MAX_AGE_MS || 6 * 60 * 60_000);
const SC_CITYHIVE_PAGE_DELAY_MS = Number(process.env.BOURBON_SIGNAL_SC_CITYHIVE_PAGE_DELAY_MS || 650);
const SC_ALL_AMERICAN_BASE_URL = 'https://www.aalmauldin.com';
const SC_ALL_AMERICAN_SOURCE_LABEL = 'All American Liquor Mauldin WooCommerce in-store availability';
const SC_ALL_AMERICAN_ARTIFACT_PATH = 'out/browser/SC-all-american-inventory.json';
const SC_ALL_AMERICAN_CACHE_MAX_AGE_MS = Number(process.env.BOURBON_SIGNAL_SC_ALL_AMERICAN_CACHE_MAX_AGE_MS || 2 * 60 * 60_000);
const SC_ALL_AMERICAN_DELAY_MS = Number(process.env.BOURBON_SIGNAL_SC_ALL_AMERICAN_DELAY_MS || 650);
const SC_ALL_AMERICAN_TERMS = ['blanton', 'weller', 'eagle rare', 'stagg', 'taylor', '1792', 'buffalo trace', 'booker', 'baker'];
const SC_ALL_AMERICAN_STORE = { id: 'all-american-liquor-mauldin', name: 'All American Liquor', address: '121 W Butler Rd, Mauldin, SC 29662', city: 'Mauldin', zip: '29662' };
const SC_DUNES_BASE_URL = 'https://www.dunesliquor.com';
const SC_DUNES_SOURCE_LABEL = 'Dunes Liquor Myrtle Beach integrated-cart inventory';
const SC_DUNES_RUNTIME_ID = 'retailer:sc:dunes:6178';
const SC_DUNES_RUNTIME_STORE_ID = '6178';
const SC_DUNES_ARTIFACT_PATH = 'out/browser/SC-dunes-liquor-inventory.json';
const SC_DUNES_CACHE_MAX_AGE_MS = Math.max(30 * 60_000, Math.min(6 * 60 * 60_000, Number(process.env.BOURBON_SIGNAL_SC_DUNES_CACHE_MAX_AGE_MS) || 6 * 60 * 60_000));
const SC_DUNES_MAX_ITEMS = Math.max(1, Math.min(47, Number(process.env.BOURBON_SIGNAL_SC_DUNES_MAX_ITEMS) || 47));
const SC_DUNES_DETAIL_CONCURRENCY = Math.max(1, Math.min(4, Number(process.env.BOURBON_SIGNAL_SC_DUNES_DETAIL_CONCURRENCY) || 4));
const SC_DUNES_DELAY_MS = Math.max(100, Math.min(2_000, Number(process.env.BOURBON_SIGNAL_SC_DUNES_DELAY_MS) || 250));
const SC_DUNES_JSON_MAX_BYTES = 256 * 1_024;
const SC_DUNES_STOREFRONT_MAX_BYTES = 512 * 1_024;
const SC_DUNES_SEARCH_TERMS = ['blanton', 'buffalo', 'eagle rare', 'stagg', 'weller', 'michter', '1792', 'wild turkey rare', 'booker', 'baker', 'elijah craig', 'woodford double', 'old forester', 'willett', 'bardstown'];
const SC_DUNES_STORE = { id: 'dunes-liquor-myrtle-beach', name: 'Dunes Liquor', address: '980 Cipriana Drive, Unit A5-B, Myrtle Beach, SC 29572', city: 'Myrtle Beach', zip: '29572' };
const SC_CITYHIVE_SOURCES = [
  {
    id: 'greens-beverage',
    chainName: "Green's Beverage",
    sourceLabel: "Green's Beverage South Carolina CityHive store inventory",
    baseUrl: 'https://www.greensbeverages.com',
    urls: [
      'https://greensbeb2c6efe1.sites.cityhive.app/shop/?subtype=bourbon'
    ],
    merchantIds: [
      '61dc4ab6a1d5721307e9c20e',
      '61e1d04c823936166693c7f3',
      '61dc62fca1d5721d92e837cf',
      '61dc583152bc522be69a8b9e',
      '61b7517362f55f727e469da5'
    ]
  },
  {
    id: 'wine-bourbon-barn',
    chainName: 'Wine & Bourbon Barn',
    sourceLabel: 'Wine & Bourbon Barn CityHive store inventory',
    baseUrl: 'https://winebarnsc.com',
    urls: [
      'https://winebarnsc.com/shop/?subtype=bourbon',
      'https://winebarnsc.com/shop/?subtype=whiskey'
    ],
    merchantIds: [
      '69930e7bed5bdd2a34c085c3',
      '699754a7b0035e3df3e7f3a4',
      '69977a118f10a026bd985189'
    ]
  },
  {
    id: 'odarbys-liquor-barn',
    chainName: "O'Darby's Liquor Barn",
    sourceLabel: "O'Darby's Liquor Barn South Carolina CityHive store inventory",
    baseUrl: 'https://odarbysliquorbarn.com',
    urls: [
      'https://odarbysliquorbarn.com/shop/?subtype=bourbon',
      'https://odarbysliquorbarn.com/shop/?subtype=whiskey'
    ],
    merchantIds: [
      '607f9d38b73eb4091ef97ff7',
      '607f9bdbb73eb4091ef976e7',
      '607f1c35f568f15818499db8',
      '607af19a07c9e57bbd8de002',
      '6060f7262c63853de749dda2'
    ]
  },
  {
    id: 'beach-discount-beverages',
    chainName: 'Beach Discount Beverages',
    sourceLabel: 'Beach Discount Beverages South Carolina CityHive store inventory',
    baseUrl: 'https://beachdiscountbeverages.com',
    urls: [
      'https://beachdis0402bdcd.sites.cityhive.app/shop/?subtype=bourbon'
    ],
    merchantIds: ['6144e1c2085a5f20a622a15f']
  },
  {
    id: 'palmetto-liquor',
    chainName: 'Palmetto Liquor',
    sourceLabel: 'Palmetto Liquor South Carolina CityHive store inventory',
    baseUrl: 'https://palmettoliquor.com',
    urls: [
      'https://palmettoliquor.com/shop/?subtype=bourbon',
      'https://palmettoliquor.com/shop/?subtype=whiskey'
    ],
    merchantIds: ['66c9e5c12556e329502b0e5e']
  },
  {
    id: 'dev-liquors',
    chainName: 'DEV Liquors',
    sourceLabel: 'DEV Liquors South Carolina CityHive store inventory',
    baseUrl: 'https://devliquors.com',
    urls: [
      'https://devliquors.com/shop/?subtype=bourbon',
      'https://devliquors.com/shop/?subtype=whiskey'
    ],
    merchantIds: ['620164924a3ea84d57c21d6f']
  },
  {
    id: 'moss-creek-village-spirits',
    chainName: 'Moss Creek Village Spirits & Wine',
    sourceLabel: 'Moss Creek Village Spirits & Wine South Carolina CityHive store inventory',
    baseUrl: 'https://www.mosscreekvillagespiritsandwine.com',
    urls: [
      'https://www.mosscreekvillagespiritsandwine.com/shop/?subtype=bourbon',
      'https://www.mosscreekvillagespiritsandwine.com/shop/?subtype=whiskey'
    ],
    merchantIds: ['67cf72208b17425acbba9e10']
  },
  {
    id: 'rollers-wine-and-spirits',
    chainName: 'Rollers Wine & Spirits',
    sourceLabel: 'Rollers Wine & Spirits South Carolina CityHive store inventory',
    baseUrl: 'https://rollerswineandspirits.com',
    urls: [
      'https://rollerswineandspirits.com/shop/?subtype=bourbon',
      'https://rollerswineandspirits.com/shop/?subtype=whiskey'
    ],
    merchantIds: ['5ea832d3b62f75270c45a976']
  }
];
const SC_CITYHIVE_MERCHANT_IDS = new Set(SC_CITYHIVE_SOURCES.flatMap((source) => source.merchantIds || []));
// Keep this expansion inside the requested 10-15 additional-store boundary while
// retaining the complete known-store directory. Two same-city O'Darby's branches
// remain searchable but are not promoted into this inventory cohort.
const SC_CITYHIVE_EXCLUDED_EXPANSION_MERCHANT_IDS = new Set([
  '607f9bdbb73eb4091ef976e7',
  '607f1c35f568f15818499db8',
]);
const SC_CITYHIVE_INVENTORY_MERCHANT_IDS = new Set(
  [...SC_CITYHIVE_MERCHANT_IDS].filter((merchantId) => !SC_CITYHIVE_EXCLUDED_EXPANSION_MERCHANT_IDS.has(merchantId)),
);
const SC_DA_BROWN_BAG_BASE_URL = 'https://dabrownbag.com';
const SC_DA_BROWN_BAG_SEARCH_TERMS = ['bourbon', 'whiskey', 'weller', 'buffalo', 'blanton', 'eagle rare', 'taylor', 'stagg', '1792', 'four roses', 'woodford', 'elijah craig', 'old forester', 'knob creek', 'maker', 'willett', 'michter'];
const SC_DA_BROWN_BAG_STORE = {
  id: 'da-brown-bag-north-charleston',
  name: 'Da Brown Bag ABC Store',
  address: '1709 Remount Road, Suite 107, North Charleston, SC 29406',
  city: 'North Charleston',
  zip: '29406'
};
const SC_SOUTHERN_SPIRITS_STORE = {
  id: 'southern-spirits-indian-land',
  name: 'Southern Spirits',
  address: '9989 Charlotte Hwy, Indian Land, SC 29707',
  city: 'Indian Land',
  zip: '29707'
};
const SC_SOUTHERN_SPIRITS_PRODUCTS_URL = 'https://southernspirits.com/products.json?limit=250';
const SC_SOUTHERN_SPIRITS_MAX_PAGES = Number(process.env.BOURBON_SIGNAL_SC_SOUTHERN_SPIRITS_MAX_PAGES || 2);
const SC_PHASE1_ARTIFACT_PATH = 'out/browser/SC-phase1-myrtle-watch.json';
const SC_PHASE1_CACHE_MAX_AGE_MS = Number(process.env.BOURBON_SIGNAL_SC_PHASE1_CACHE_MAX_AGE_MS || 24 * 60 * 60_000);
const SC_PHASE1_DELAY_MS = Number(process.env.BOURBON_SIGNAL_SC_PHASE1_DELAY_MS || 900);
const SC_OWENS_COOLDOWN_FILE = 'out/browser/SC-owens-cooldown.json';
const SC_OWENS_BLOCKED_BACKOFF_MS = Number(process.env.BOURBON_SIGNAL_SC_OWENS_BLOCKED_BACKOFF_MS || 7 * 24 * 60 * 60_000);
const SC_LIQUOR_STORE_NEAR_ME_BASE_URL = 'https://liquorstorenearmemyrtlebeach.com';
const SC_LIQUOR_STORE_NEAR_ME_STORE = {
  id: 'liquor-store-near-me-myrtle-beach',
  name: 'Liquor Store Near Me Myrtle Beach',
  address: '4032 River Oaks Dr Ste 5, Myrtle Beach, SC 29579',
  city: 'Myrtle Beach',
  zip: '29579'
};
const SC_LIQUOR_STORE_NEAR_ME_TERMS = ['bourbon', 'blanton', 'weller', 'pappy', 'michter', 'birthday bourbon'];
const SC_BURNT_BARREL_BASE_URL = 'https://burntbarrelwineandspirits.com';
const SC_BURNT_BARREL_STORE = {
  id: 'burnt-barrel-wine-and-spirits',
  name: 'Burnt Barrel Wine & Spirits',
  address: '235 Village Center Blvd Unit 5, Myrtle Beach, SC 29579',
  city: 'Myrtle Beach',
  zip: '29579'
};
const SC_OWENS_BASE_URL = 'https://www.owensliquors.com';
const SC_OWENS_STORE = {
  id: 'owens-liquors-myrtle-beach',
  name: 'Owens Liquors',
  address: '8000 N Kings Hwy, Myrtle Beach, SC 29572',
  city: 'Myrtle Beach',
  zip: '29572'
};
const SC_OWENS_SEED_URLS = [
  'https://www.owensliquors.com/shop/product/1792-small-batch-bourbon/573141c869702d067c152900?option-id=b13e0e8769f8bc6d7a03a7aa345223fb3c94300f47ff54f1945b2fe002759cfd',
  'https://www.owensliquors.com/shop/product/larceny-small-batch-bourbon/5521cef465613100039e0100?option-id=a713f0543e1425cfdaa2a9e40f0ee444062ac1160c8dcd84bff1acb031f06c10'
];
const SC_RETAILER_WATCH_RE = /bourbon|american whiskey|american whisky|rye whiskey|rye whisky|blanton|eagle rare|weller|stagg|e\.?\s*h\.?\s*taylor|colonel\s*taylor|buffalo trace|old fitz|fitzgerald|michter|willett|baker'?s?|booker'?s?|pappy|van winkle|elmer|rock hill|blood oath|four roses|1792|russell|woodford|wild turkey|elijah craig|old forester|heaven hill|green river|bardstown|knob creek|bulleit|maker'?s|yellowstone|penelope|jack daniel/i;
const SC_RETAILER_EXCLUDE_RE = /gift\s*card|bundle|curated\s*bundle|wine\s*bundle|event|ticket|shirt|hat|glass|cup|stout|beer|wine|vodka|gin|rum|tequila|mezcal|brandy|cognac|liqueur|cordial|cocktail|ready\s*to\s*drink|seltzer|cream|coffee|cinnamon|peach|apple|honey|vanilla|peanut\s*butter|chocolate/i;

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

function sleepWithSignal(ms, signal) {
  signal?.throwIfAborted();
  if (!signal) return sleep(ms);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason instanceof Error ? signal.reason : new Error('Collector aborted'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

async function readCachedVirginiaSignals() {
  try {
    const cached = JSON.parse(await readFile(VIRGINIA_CACHE_PATH, 'utf8'));
    if (cached && Array.isArray(cached.signals) && cached.signals.length) return cached;
  } catch {
    // A cold hosted runner has no rolling cache; hydrate from the last trusted state report below.
  }
  try {
    const stateReport = JSON.parse(await readFile('out/states/VA.json', 'utf8'));
    const seeded = seedVirginiaInventoryCacheSignals(stateReport);
    if (seeded.signals.length) return seeded;
  } catch {
    // A genuinely new state has neither a rolling cache nor a hydrated report.
  }
  return { signals: [] };
}

async function writeCachedVirginiaSignals(signals, signal) {
  throwIfVirginiaAborted(signal);
  await mkdir(path.dirname(VIRGINIA_CACHE_PATH), { recursive: true });
  const temporaryPath = `${VIRGINIA_CACHE_PATH}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, JSON.stringify({ generatedAt: new Date().toISOString(), signals }, null, 2));
    throwIfVirginiaAborted(signal);
    renameSync(temporaryPath, VIRGINIA_CACHE_PATH);
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => {});
  }
}

async function textFetch(url, options = {}) {
  const timeoutMs = Number(options.timeoutMs || process.env.BOURBON_SIGNAL_PRECISION_FETCH_TIMEOUT_MS || 18_000);
  const controller = new AbortController();
  const timeout = timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null;
  const signals = [controller.signal, options.signal].filter(Boolean);
  try {
    const res = await fetch(url, {
      redirect: options.redirect || 'follow',
      headers: { 'user-agent': 'Mozilla/5.0 (BourbonSignal research)', accept: 'text/html,application/json,text/csv,*/*', ...(options.headers || {}) },
      method: options.method || 'GET',
      body: options.body,
      signal: signals.length > 1 ? AbortSignal.any(signals) : controller.signal
    });
    return { ok: res.ok, status: res.status, url: res.url, contentType: res.headers.get('content-type') || '', rawSetCookie: res.headers.get('set-cookie') || '', retryAfter: res.headers.get('retry-after'), text: await res.text(), error: null };
  } catch (error) {
    if (options.signal?.aborted) throw error;
    return { ok: false, status: 0, url, contentType: '', text: '', error: error instanceof Error ? error.message : String(error) };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function curlTextFetch(url, options = {}) {
  options.signal?.throwIfAborted();
  const timeoutMs = Number(options.timeoutMs || process.env.BOURBON_SIGNAL_PRECISION_FETCH_TIMEOUT_MS || 25_000);
  const timeoutSeconds = String(Math.max(1, Math.ceil(timeoutMs / 1000)));
  const marker = '\n__BOURBON_SIGNAL_HTTP_STATUS__:';
  const args = [
    ...(options.followRedirects === false ? [] : ['-L']),
    '--max-time', timeoutSeconds,
    '-sS',
    '-A', options.userAgent || PENGUIN_BROWSER_UA
  ];
  const headers = { accept: 'text/html,application/xhtml+xml,*/*', 'accept-language': 'en-US,en;q=0.9', ...(options.headers || {}) };
  for (const [name, value] of Object.entries(headers)) args.push('-H', `${name}: ${value}`);
  args.push('-w', `${marker}%{http_code}`, url);
  try {
    const runExecFile = options.execFileAsync || execFileAsync;
    const { stdout } = await runExecFile(options.command || 'curl', args, { maxBuffer: options.maxBuffer || 3 * 1024 * 1024, windowsHide: true, signal: options.signal });
    const splitAt = stdout.lastIndexOf(marker);
    const text = splitAt >= 0 ? stdout.slice(0, splitAt) : stdout;
    const status = splitAt >= 0 ? Number(stdout.slice(splitAt + marker.length).trim()) || 0 : 0;
    return { ok: status >= 200 && status < 300, status, url, contentType: '', rawSetCookie: '', text, error: status >= 200 && status < 300 ? null : `HTTP ${status || 'unknown'}` };
  } catch (error) {
    if (options.signal?.aborted) throw error;
    return { ok: false, status: 0, url, contentType: '', rawSetCookie: '', text: error?.stdout || '', error: error instanceof Error ? error.message : String(error) };
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
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_match, dec) => String.fromCodePoint(Number.parseInt(dec, 10)))
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

function indianaBourbonWorldBottleMatchName(rawName) {
  const text = String(rawName || '').replace(/\s+/g, ' ').trim();
  if (/^Weller\s+12\s*yr\b/i.test(text)) return 'Weller 12 Year';
  if (/^Weller\s+Single\s+Barrel\b/i.test(text)) return 'Weller Single Barrel';
  return text;
}

function indianaLiquorGroupEventDateParts(dateText, observedAt) {
  const now = new Date(observedAt);
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
  return month && day ? { year, month, day } : null;
}

function indianaLiquorGroupEventIsoDate(dateText, observedAt) {
  const parts = indianaLiquorGroupEventDateParts(dateText, observedAt);
  if (!parts) return null;
  const mm = String(parts.month).padStart(2, '0');
  const dd = String(parts.day).padStart(2, '0');
  return `${parts.year}-${mm}-${dd}`;
}

function indianaLiquorGroupEventDateIsCurrent(dateText, observedAt) {
  const now = new Date(observedAt);
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const parts = indianaLiquorGroupEventDateParts(dateText, observedAt);
  if (!parts) return false;
  const eventDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
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
        eventDate: indianaLiquorGroupEventIsoDate(dateMatch[0], observedAt),
        rawLine: `${rawName} ${city} ${chunk}`.trim()
      });
    }
  }
  events.push(...parseIndianaLiquorGroupFeaturedWhiskeyEvents(cleanText, observedAt));
  return events;
}

function indianaLiquorGroupBottleMatchName(rawName) {
  const text = String(rawName || '').replace(/\s+/g, ' ').trim();
  const withoutPick = text.replace(/\s+ILG\s+Pick\b/i, '').trim();
  if (/^Eagle Rare\b/i.test(withoutPick)) return 'Eagle Rare';
  if (/^Buffalo Trace\b/i.test(withoutPick)) return 'Buffalo Trace';
  return text;
}

function parseIndianaLiquorGroupFeaturedWhiskeyEvents(cleanText, observedAt = new Date().toISOString()) {
  const normalized = String(cleanText || '').replace(/[–—]/g, '-');
  const section = normalized.match(/Jeff Clark Whiskey Tastings in June\s+Featuring:\s+([\s\S]*?)\s+Dates:\s+([\s\S]*?)(?=\s+JEFF CLARK ILG WHISKEY EVENTS|\s+Explore Careers|$)/i);
  if (!section) return [];
  const products = [...new Set((section[1].match(/(?:Old Forester 100pf Black Label|Eagle Rare|Buffalo Trace|Green River Bourbon|Green River Wheated|Barrell Bourbon Foundation)(?:\s+ILG Pick)?/gi) || [])
    .map((value) => value.replace(/\s+/g, ' ').trim()))];
  if (!products.length) return [];
  const events = [];
  const dateVenueRe = /\bo\s+(\d{1,2}\/\d{1,2})\s*@\s*([^•]+?)\s*•\s*([^•]+?)\s*-\s*([0-9][^o]+?)(?=\s+o\s+\d{1,2}\/\d{1,2}\s*@|\s+JEFF CLARK|$)/gi;
  const cityRe = /\b(Anderson|Noblesville|Muncie|Marion|New Castle|Bargersville|Franklin|Yorktown|Kokomo|Carmel|Huntington)\b/i;
  for (const match of section[2].matchAll(dateVenueRe)) {
    const dateText = match[1];
    if (!indianaLiquorGroupEventDateIsCurrent(dateText, observedAt)) continue;
    const venueLabel = match[2].replace(/\s+/g, ' ').trim();
    const address = match[3].replace(/\s+/g, ' ').trim();
    const timeText = match[4].replace(/\s+/g, ' ').trim();
    const city = titleCase(venueLabel.match(cityRe)?.[1] || address.match(cityRe)?.[1] || venueLabel.replace(/^NWS\s+/i, '').trim());
    const locationText = [venueLabel, address].filter(Boolean).join(' — ');
    for (const rawName of products) {
      events.push({
        rawName,
        city,
        locationText,
        dateText,
        timeText,
        eventDate: indianaLiquorGroupEventIsoDate(dateText, observedAt),
        rawLine: `${rawName} tasting at ${locationText} on ${dateText} ${timeText}`.trim()
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

function cityHiveHasProductPayload(blobs) {
  let found = false;
  const visit = (value) => {
    if (found || !value || typeof value !== 'object') return;
    if (Array.isArray(value)) { for (const child of value) visit(child); return; }
    if (Object.prototype.hasOwnProperty.call(value, 'products') && Array.isArray(value.products)) {
      found = true;
      return;
    }
    for (const child of Object.values(value)) if (child && typeof child === 'object') visit(child);
  };
  for (const blob of blobs) visit(blob);
  return found;
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
  const text = `${merchant.name || ''} ${merchant.city || ''} ${merchant.address || ''}`;
  return indianaCityHivePriorityRank(text);
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
    if (!isIndianaCityHivePriorityMarket(haystack)) continue;
    merchants.push({ id: merchant.id, name: merchant.display_name || merchant.name, city: a.city, address: a.fullAddress, sourceId: source.id, ordinal: ordinal++ });
  }
  return merchants
    .sort((a, b) => cityHivePriorityRank(a) - cityHivePriorityRank(b) || a.ordinal - b.ordinal)
    .slice(0, IN_CITYHIVE_MAX_MERCHANTS_PER_SOURCE);
}

export function isFloridaCityHiveAddressAllowed(source, address = {}) {
  const state = String(address.state || '').toUpperCase();
  const fullAddress = String(address.fullAddress || address.full_address || '');
  if (state !== 'FL' && !/,\s*FL\s+\d{5}/i.test(fullAddress)) return false;
  if (!(source?.merchants instanceof Map)) return false;
  return [...source.merchants.values()].some((store) => store.address === fullAddress);
}

export function floridaCityHivePriorityMerchants(blobs, source) {
  const merchants = [];
  const seen = new Set();
  for (const cfg of cityHiveMerchantConfigs(blobs)) {
    const merchant = cfg?.merchant || cfg;
    const id = String(merchant?.id || '');
    const configured = source?.merchants?.get(id);
    if (!id || !configured || seen.has(id)) continue;
    const address = cityHiveAddressParts(merchant.address || {});
    if (address.fullAddress !== configured.address) continue;
    seen.add(id);
    merchants.push({ id, name: configured.name, city: configured.city, address: merchant.address || {} });
  }
  return merchants;
}

export function isFloridaCityHiveProductOptionAllowed(source, selectedMerchantIds, option = {}) {
  const merchantId = String(option.merchant_id || '');
  const configured = source?.merchants?.get(merchantId);
  return Boolean(configured
    && selectedMerchantIds?.has(merchantId)
    && String(option.full_address || '') === configured.address);
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
  return /bourbon|american whiskey|american whisky|rye whiskey|rye whisky|single barrel|barrel proof|cask strength|private selection|private barrel|store pick|allocated|limited edition|blanton|eagle rare|weller|stagg|taylor|colonel|van winkle|pappy|buffalo trace|michter|willett|old fitz|fitzgerald|elmer|rock hill|booker|baker|little book|blood oath|four roses|1792|russell|elijah craig|larceny|old forester|birthday bourbon|wild turkey|master'?s? keep|rare breed|rare character|four gate|woodford|batch proof|knob creek|maker|bardstown|green river|heaven hill|henry mckenna|new riff|barrell|yellowstone|smoke wagon|penelope|casey jones|peerless/i.test(text);
}

function normalizedBottleText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function cityHiveSafeBottleMatch(rawName, bible) {
  const { match, record } = bottleMatch(rawName, bible);
  if (!record) return { match, record: null, unsafeReason: 'no_bottle_bible_match' };
  const raw = normalizedBottleText(rawName);
  const canonical = normalizedBottleText(record.canonical);
  if (/\b(cream|liqueur|cordial|cocktail|ready to drink)\b/.test(raw) && !/\b(cream|liqueur|cordial|cocktail|ready to drink)\b/.test(canonical)) return { match, record: null, unsafeReason: 'flavored_or_liqueur_matched_core_bottle' };
  if (/\brye\b/.test(raw) && !/\brye\b/.test(canonical)) return { match, record: null, unsafeReason: 'rye_matched_non_rye' };
  if (/\bbourbon\b/.test(raw) && /\brye\b/.test(canonical) && !/\brye\b/.test(raw)) return { match, record: null, unsafeReason: 'bourbon_matched_rye' };
  if (/\bwheated\b/.test(raw) && !/\bwheated\b/.test(canonical)) return { match, record: null, unsafeReason: 'wheated_matched_non_wheated' };
  if (/\breserve\b/.test(raw) && !/\breserve\b/.test(canonical)) return { match, record: null, unsafeReason: 'reserve_matched_non_reserve' };
  const rawSpecificPhrases = ['single barrel', 'full proof', 'barrel proof', 'cask strength', 'limited edition', 'small batch select', 'private selection', 'store pick'];
  for (const phrase of rawSpecificPhrases) {
    if (raw.includes(phrase) && !canonical.includes(phrase) && !(phrase === 'cask strength' && canonical.includes('barrel proof'))) return { match, record: null, unsafeReason: `specific_raw_modifier_matched_generic:${phrase}` };
  }
  const requiredPhrases = [
    'limited edition', 'batch proof', 'barrel proof', 'single barrel', 'small batch select',
    'small batch', 'full proof', 'bottled in bond', 'private barrel', 'store pick', 'single barrel select'
  ];
  for (const phrase of requiredPhrases) {
    if (canonical.includes(phrase) && !raw.includes(phrase)) return { match, record: null, unsafeReason: `missing_modifier:${phrase}` };
  }
  if (/\bfour roses\b/.test(canonical) && /\bbarrel strength\b/.test(canonical)) {
    const hasBarrelStrengthSignal = /\b(barrel strength|cask strength|private selection|private barrel|single barrel select|oes[foqkv]|obs[foqkv])\b/.test(raw);
    if (!hasBarrelStrengthSignal) return { match, record: null, unsafeReason: 'four_roses_standard_single_barrel_not_barrel_strength' };
  }
  for (const yearExpression of [...canonical.matchAll(/\b((?:18|19|20)\d{2})\b/g)].map((m) => m[1])) {
    if (!new RegExp(`\\b${yearExpression}\\b`).test(raw)) return { match, record: null, unsafeReason: `missing_expression:${yearExpression}` };
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

function htmlTagAttribute(tag, name) {
  const match = String(tag || '').match(new RegExp(`${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, 'i'));
  return match ? decodeHtml(match[2]) : null;
}

function htmlMetaContent(html, propertyName) {
  const wanted = String(propertyName || '').toLowerCase();
  for (const match of String(html || '').matchAll(/<meta\b[^>]*>/gi)) {
    const tag = match[0];
    const property = (htmlTagAttribute(tag, 'property') || htmlTagAttribute(tag, 'name') || '').toLowerCase();
    if (property === wanted) return htmlTagAttribute(tag, 'content') || null;
  }
  return null;
}

function htmlTitle(html) {
  const match = String(html || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? decodeHtml(stripHtml(match[1])) : null;
}

function penguinProductLinks(html) {
  const links = [];
  for (const match of String(html || '').matchAll(/href=["']([^"']*\/p\/[^"'#?]+(?:\?[^"'#]*)?)["']/gi)) {
    try {
      const href = new URL(decodeHtml(match[1]), IN_PENGUIN_BASE_URL).href;
      if (href.startsWith(`${IN_PENGUIN_BASE_URL}/p/`) && !links.includes(href)) links.push(href);
    } catch {}
  }
  return links;
}

function parsePenguinProductPage(html, url) {
  const title = htmlMetaContent(html, 'og:title') || htmlTitle(html) || '';
  const rawName = decodeHtml(title)
    .replace(/\s+-\s+Buy Online\s*\|\s*Penguin Liquor$/i, '')
    .replace(/\s*\|\s*Penguin Liquor$/i, '')
    .trim();
  const availability = (htmlMetaContent(html, 'product:availability') || '').toLowerCase().trim();
  const price = Number(htmlMetaContent(html, 'product:price:amount') || '') || null;
  const retailerItemId = htmlMetaContent(html, 'product:retailer_item_id') || url.match(/\/(\d+)(?:[?#].*)?$/)?.[1] || null;
  const size = decodeHtml(stripHtml(String(html).match(/id=["']productSize["'][^>]*>([\s\S]*?)<\//i)?.[1] || '')) || null;
  const storeAddress = String(html).includes(IN_PENGUIN_STORE.address) ? IN_PENGUIN_STORE.address : null;
  return { rawName, availability, price, retailerItemId, size, storeAddress };
}

function isPenguinBourbonCandidate(product) {
  const text = normalizedBottleText(`${product.rawName || ''} ${product.size || ''}`);
  if (!text) return false;
  const include = /\b(bourbon|blanton|eagle rare|weller|stagg|taylor|buffalo trace|michter|willett|old fitz|booker|baker|four roses|1792|elijah craig|woodford|angels envy|basil hayden|jefferson|rare character)\b/i.test(text);
  const excluded = /\b(scotch|irish|canadian|japanese|vodka|gin|rum|tequila|mezcal|liqueur|cordial|wine|beer|seltzer|cocktail|ready to drink|peanut butter|vanilla|chocolate|cinnamon|honey|apple|peach|cream)\b/i.test(text);
  return include && (!excluded || /\bbourbon\b/i.test(text));
}

async function collectIndianaPenguinLiquor(config, bible, observedAt) {
  const signals = [];
  const roadblocks = [];
  const productUrls = new Set(IN_PENGUIN_SEED_PRODUCT_URLS);
  let categoryBlocked = false;

  for (const categoryUrl of IN_PENGUIN_CATEGORY_URLS) {
    const res = await curlTextFetch(categoryUrl, { timeoutMs: 30_000 });
    if (!res.ok) {
      roadblocks.push({
        state: config.id,
        source: 'Penguin Liquor Lafayette product category pages',
        url: categoryUrl,
        status: res.status || 0,
        error: res.error || `HTTP ${res.status}`,
        nextRoute: 'Penguin rejects Node fetch; retry source-specific curl/browser fetch or inspect GotoLiquorStore page changes.'
      });
      if (isTerminalProbeFailure(res.status)) {
        categoryBlocked = true;
        break;
      }
      continue;
    }
    for (const href of penguinProductLinks(res.text)) {
      productUrls.add(href);
      if (productUrls.size >= IN_PENGUIN_MAX_PRODUCT_PAGES) break;
    }
  }

  const seenProducts = new Set();
  let parsedPages = 0;
  for (const productUrl of categoryBlocked ? [] : [...productUrls].slice(0, IN_PENGUIN_MAX_PRODUCT_PAGES)) {
    const res = await curlTextFetch(productUrl, { timeoutMs: 30_000 });
    if (!res.ok) {
      roadblocks.push({
        state: config.id,
        source: 'Penguin Liquor Lafayette product pages',
        url: productUrl,
        status: res.status || 0,
        error: res.error || `HTTP ${res.status}`,
        nextRoute: 'Retry with curl/browser fetch; keep Penguin rows fail-closed when product pages cannot be read.'
      });
      if (isTerminalProbeFailure(res.status)) break;
      continue;
    }
    parsedPages += 1;
    const product = parsePenguinProductPage(res.text, productUrl);
    if (!product.rawName || product.availability !== 'in stock' || !product.storeAddress) continue;
    if (!isPenguinBourbonCandidate(product)) continue;
    const { match, record, unsafeReason } = cityHiveSafeBottleMatch(product.rawName, bible);
    if (!record) continue;
    const key = `${record.id}|${product.retailerItemId || productUrl}`;
    if (seenProducts.has(key)) continue;
    seenProducts.add(key);
    signals.push({
      id: stableId([config.id, 'penguin-liquor-lafayette-in-stock', product.retailerItemId || productUrl, record.id, product.price]),
      state: config.id,
      sourceLabel: 'Penguin Liquor Lafayette in-stock product pages',
      sourceUrl: productUrl,
      rawName: product.rawName,
      canonicalBottleId: record.id,
      canonicalName: record.canonical,
      confidence: Math.max(0.80, match?.confidence || 0.5),
      eventType: 'retailer_store_inventory_result',
      locationPrecision: 'store_level',
      locationName: IN_PENGUIN_STORE.name,
      storeName: IN_PENGUIN_STORE.name,
      storeId: `penguin-liquor:${IN_PENGUIN_STORE.id}`,
      storeAddress: IN_PENGUIN_STORE.address,
      city: IN_PENGUIN_STORE.city,
      stateCode: 'IN',
      postalCode: IN_PENGUIN_STORE.zip,
      zip: IN_PENGUIN_STORE.zip,
      lat: IN_PENGUIN_STORE.lat,
      lng: IN_PENGUIN_STORE.lng,
      quantity: 1,
      price: product.price,
      availabilityStatus: 'in_stock',
      availabilityLabel: 'In stock',
      observedAt,
      canAlertAsInventory: true,
      canAlertAsWatch: true,
      inventorySemantics: 'Penguin Liquor/GotoLiquorStore product pages publish store-level in-stock status and price for the Lafayette Teal Road store, but do not expose exact bottle counts. Quantity is a lower-bound availability marker; verify before driving.',
      evidence: `Penguin Liquor product page reports ${product.rawName}${product.size ? ` (${product.size})` : ''} in stock at ${IN_PENGUIN_STORE.address}${product.price ? ` for $${product.price.toFixed(2)}` : ''}; exact count is not exposed.`,
      raw: { source: 'penguin_liquor_gotoliquorstore_product_page', retailerItemId: product.retailerItemId, product, quantitySemantics: 'in_stock_no_exact_count', matchGuard: unsafeReason }
    });
    await sleep(200);
  }

  if (!signals.length && !categoryBlocked && !roadblocks.some((roadblock) => isTerminalProbeFailure(roadblock.status))) {
    roadblocks.push({
      state: config.id,
      source: 'Penguin Liquor Lafayette in-stock product pages',
      url: IN_PENGUIN_CATEGORY_URLS.join(', '),
      status: parsedPages ? 'reachable_no_matched_inventory' : 'no_product_pages_read',
      error: parsedPages ? `Read ${parsedPages} Penguin product pages, but no in-stock Bourbon Signal bottle matches survived source guards.` : 'Penguin category/product pages did not return parseable product HTML.',
      nextRoute: 'Inspect Penguin/GotoLiquorStore page HTML and tune strict bourbon link discovery without promoting non-bourbon whiskey rows.'
    });
  }
  return { signals, roadblocks };
}

function decodeDoorDashEscaped(value = '') {
  const text = String(value || '');
  try { return JSON.parse(`"${text.replace(/"/g, '\\"')}"`); }
  catch {
    return text
      .replace(/\\u0026/g, '&')
      .replace(/\\u0027/g, "'")
      .replace(/\\n/g, ' ')
      .replace(/\\\//g, '/')
      .replace(/\\"/g, '"')
      .replace(/\s+/g, ' ')
      .trim();
  }
}

function parseDoorDashRetailItems(html, store) {
  const rows = [];
  const seen = new Set();
  const text = String(html || '');
  const nameRe = /\\"item_name\\":\\"([^\\"]+)\\"/g;
  for (const match of text.matchAll(nameRe)) {
    const context = text.slice(Math.max(0, match.index - 2500), Math.min(text.length, match.index + 5000));
    if (!context.includes(`\\"store_id\\":\\"${store.id}\\"`)) continue;
    if (!context.includes('\\"item_data\\"') && !context.includes('\\"retail_item_card\\"')) continue;
    if (/\\"is_out_of_stock\\":true|\\"is_likely_out_of_stock\\":true/i.test(context)) continue;
    const itemName = decodeDoorDashEscaped(match[1]);
    const itemId = context.match(/\\"item_id\\":\\"([^\\"]+)\\"/)?.[1] || null;
    const itemMsid = context.match(/\\"item_msid\\":\\"([^\\"]+)\\"/)?.[1] || null;
    const menuId = context.match(/\\"menu_id\\":\\"([^\\"]+)\\"/)?.[1] || null;
    const priceDisplay = decodeDoorDashEscaped(context.match(/\\"display_string\\":\\"([^\\"]+)\\"/)?.[1] || '');
    const unitAmount = Number(context.match(/\\"unit_amount\\":(\d+)/)?.[1] || '') || null;
    const price = unitAmount ? unitAmount / 100 : Number(String(priceDisplay).replace(/[^0-9.]/g, '')) || null;
    const isOutOfStock = /\\"is_out_of_stock\\":false/i.test(context) ? false : null;
    const isLikelyOutOfStock = /\\"is_likely_out_of_stock\\":false/i.test(context) ? false : null;
    const key = itemId || itemMsid || `${itemName}|${priceDisplay}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ itemName, itemId, itemMsid, menuId, price, priceDisplay, isOutOfStock, isLikelyOutOfStock });
    if (rows.length >= IN_DOORDASH_MAX_FRONTIER_ITEMS) break;
  }
  return rows;
}

function isDoorDashBourbonCandidate(item) {
  const text = normalizedBottleText(item.itemName || '');
  if (!text) return false;
  if (!/\b(bourbon|american whiskey|straight whiskey|rabbit hole|tincup|green river|barrell bourbon|bulleit|maker|woodford|wild turkey|elijah craig|old forester|four roses|knob creek|1792)\b/i.test(text)) return false;
  if (/\b(scotch|irish|canadian|japanese|vodka|gin|rum|tequila|mezcal|liqueur|cordial|wine|beer|seltzer|cocktail|ready to drink|crown royal|johnnie walker|glenlivet|balvenie|oban|hibiki|monkey shoulder|sexton)\b/i.test(text)) return false;
  if (/\b(apple|peach|honey|vanilla|cinnamon|maple|cream|peanut butter|chocolate|coffee)\b/i.test(text)) return false;
  return /\bbourbon\b/i.test(text);
}

async function collectIndianaDoorDashFrontier(config, bible, observedAt) {
  const signals = [];
  const roadblocks = [];
  const store = IN_DOORDASH_FRONTIER_STORE;
  const res = await curlTextFetch(store.url, { timeoutMs: 45_000, maxBuffer: 6 * 1024 * 1024 });
  if (!res.ok) {
    roadblocks.push({
      state: config.id,
      source: 'DoorDash Frontier Liquors Evansville marketplace page',
      url: store.url,
      status: res.status || 0,
      error: res.error || `HTTP ${res.status}`,
      nextRoute: 'Retry DoorDash public store page or inspect Frontier/marketplace page shape; keep rows fail-closed when embedded retail item cards are unavailable.'
    });
    return { signals, roadblocks };
  }
  const items = parseDoorDashRetailItems(res.text, store).filter(isDoorDashBourbonCandidate);
  const seen = new Set();
  for (const item of items) {
    const { match, record, unsafeReason } = cityHiveSafeBottleMatch(item.itemName, bible);
    if (!record) continue;
    const key = `${record.id}|${item.itemId || item.itemMsid || item.itemName}`;
    if (seen.has(key)) continue;
    seen.add(key);
    signals.push({
      id: stableId([config.id, 'doordash-frontier-evansville-in-stock', item.itemId || item.itemMsid || item.itemName, record.id, item.price]),
      state: config.id,
      sourceLabel: 'DoorDash Frontier Liquors Evansville marketplace inventory',
      sourceUrl: store.url,
      rawName: item.itemName,
      canonicalBottleId: record.id,
      canonicalName: record.canonical,
      confidence: Math.max(0.78, match?.confidence || 0.5),
      eventType: 'retailer_store_inventory_result',
      locationPrecision: 'store_level',
      locationName: store.name,
      storeName: store.name,
      storeId: `doordash:${store.id}`,
      storeAddress: store.address,
      city: store.city,
      stateCode: 'IN',
      postalCode: store.zip,
      zip: store.zip,
      lat: store.lat,
      lng: store.lng,
      quantity: 1,
      price: item.price,
      availabilityStatus: 'marketplace_listed_not_out_of_stock',
      availabilityLabel: 'Listed on DoorDash; not marked out of stock',
      observedAt,
      canAlertAsInventory: false,
      canAlertAsWatch: true,
      inventorySemantics: 'DoorDash public retail item cards list this SKU for Frontier Liquors in Evansville with price and no out-of-stock flags. This is third-party delivery-marketplace orderability, not first-party shelf inventory or an exact bottle count; publish as a watch lead only.',
      evidence: `DoorDash lists ${item.itemName} at ${store.name}, ${store.address}${item.price ? ` for $${item.price.toFixed(2)}` : ''}, with no out-of-stock flag in the public retail item card.`,
      raw: { source: 'doordash_frontier_liquors_public_store_page', store, item, quantitySemantics: 'listed_not_out_of_stock_no_exact_count', matchGuard: unsafeReason }
    });
  }
  if (!signals.length) {
    roadblocks.push({
      state: config.id,
      source: 'DoorDash Frontier Liquors Evansville marketplace inventory',
      url: store.url,
      status: 'reachable_no_safe_bourbon_inventory',
      error: `Read DoorDash Frontier public page and parsed ${items.length} bourbon-like item(s), but none survived bottle-bible and false-positive guards.`,
      nextRoute: 'Inspect embedded DoorDash retail item cards for new bourbon SKUs and add exact standard bottle aliases only when identities are unambiguous.'
    });
  }
  return { signals, roadblocks };
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
  let requestFailed = false;
  const seenProducts = new Set();
  for (let pageIndex = 0; pageIndex < IN_KAHNS_MAX_PAGES; pageIndex++) {
    const page = await fetchKahnsProducts(pageIndex);
    if (!page.ok) {
      requestFailed = true;
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
  if (!signals.length && !requestFailed) {
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
  const nextPositiveCount = signals.filter((signal) => signal.eventType === 'cityhive_store_inventory_result').length;
  if (!nextPositiveCount) return;
  const nextChains = indianaCityHivePositiveInventoryChains(signals);
  const previous = await readIndianaCityHiveCache();
  const previousPositiveCount = (previous?.signals || []).filter((signal) => signal.eventType === 'cityhive_store_inventory_result').length;
  const previousChains = indianaCityHivePositiveInventoryChains(previous?.signals || []);
  const nextCoverageFloor = Math.max(50, Math.floor(previousPositiveCount * 0.85));
  if (previousChains.size >= 3 && (nextChains.size < previousChains.size || nextPositiveCount < nextCoverageFloor)) {
    return;
  }
  const payload = {
    generatedAt: new Date().toISOString(),
    source: 'Indiana CityHive retailer inventory cache',
    cacheMaxAgeMs: IN_CITYHIVE_CACHE_MAX_AGE_MS,
    sourceChainCount: nextChains.size,
    sourceChains: [...nextChains].sort(),
    signalCount: signals.length,
    positiveInventorySignalCount: nextPositiveCount,
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
    observedAt: cache.generatedAt || signal.observedAt || observedAt,
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
    const signals = mergeTennesseeCityHiveCacheSignals({
      cachedSignals: Array.isArray(cache.signals) ? cache.signals : [],
      observedAt: new Date().toISOString(),
      maxAgeMs: TN_CITYHIVE_CACHE_MAX_AGE_MS,
      validate: isTennesseeRetailerInventory,
    });
    const roadblocks = Array.isArray(cache.roadblocks) ? cache.roadblocks : [];
    const sourceAttemptAt = cache.sourceAttemptAt && typeof cache.sourceAttemptAt === 'object' ? cache.sourceAttemptAt : {};
    const sourceRefreshAt = cache.sourceRefreshAt && typeof cache.sourceRefreshAt === 'object' ? cache.sourceRefreshAt : {};
    if (!signals.length && !Object.keys(sourceAttemptAt).length && !Object.keys(sourceRefreshAt).length) return null;
    return { ...cache, signals, roadblocks, sourceAttemptAt, sourceRefreshAt };
  } catch {
    return null;
  }
}

function tennesseeCityHivePositiveInventoryChains(signals = []) {
  return new Set(signals
    .filter((signal) => signal.eventType === 'cityhive_store_inventory_result')
    .map(tennesseeCityHiveSignalSourceId)
    .filter(Boolean));
}

async function writeTennesseeCityHiveArtifact(payload, signal) {
  await mkdir(path.dirname(TN_CITYHIVE_ARTIFACT_PATH), { recursive: true });
  signal?.throwIfAborted();
  const temporaryPath = `${TN_CITYHIVE_ARTIFACT_PATH}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, JSON.stringify(payload, null, 2), signal ? { signal } : undefined);
    signal?.throwIfAborted();
    renameSync(temporaryPath, TN_CITYHIVE_ARTIFACT_PATH);
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => {});
  }
}

async function writeTennesseeCityHiveAttemptLease(cache, selectedSourceIds, observedAt, signal) {
  const safeSignals = (cache?.signals || []).filter((signal) => isTennesseeRetailerInventory(signal));
  const chains = tennesseeCityHivePositiveInventoryChains(safeSignals);
  const payload = {
    ...(cache || {}),
    schemaVersion: 2,
    generatedAt: cache?.generatedAt || observedAt,
    source: 'Tennessee CityHive retailer inventory cache',
    cacheMaxAgeMs: TN_CITYHIVE_CACHE_MAX_AGE_MS,
    sourceAttemptAt: updateTennesseeCityHiveSourceAttemptAt(cache, selectedSourceIds, observedAt),
    sourceRefreshAt: updateTennesseeCityHiveSourceRefreshAt(cache, new Set(), observedAt),
    sourceChainCount: chains.size,
    sourceChains: [...chains].sort(),
    signalCount: safeSignals.length,
    positiveInventorySignalCount: safeSignals.length,
    storeLocationSignalCount: 0,
    signals: safeSignals,
    roadblocks: cache?.roadblocks || [],
  };
  await writeTennesseeCityHiveArtifact(payload, signal);
}

async function writeTennesseeCityHiveCache(signals, roadblocks, { previous, selectedSourceIds, completedSourceIds, observedAt, signal }) {
  const safeSignals = signals.filter((signal) => isTennesseeRetailerInventory(signal));
  const nextChains = tennesseeCityHivePositiveInventoryChains(safeSignals);
  const payload = {
    schemaVersion: 2,
    generatedAt: observedAt,
    source: 'Tennessee CityHive retailer inventory cache',
    cacheMaxAgeMs: TN_CITYHIVE_CACHE_MAX_AGE_MS,
    sourceAttemptAt: updateTennesseeCityHiveSourceAttemptAt(previous, selectedSourceIds, observedAt),
    sourceRefreshAt: updateTennesseeCityHiveSourceRefreshAt(previous, completedSourceIds, observedAt),
    sourceChainCount: nextChains.size,
    sourceChains: [...nextChains].sort(),
    signalCount: safeSignals.length,
    positiveInventorySignalCount: safeSignals.length,
    storeLocationSignalCount: 0,
    signals: safeSignals,
    roadblocks
  };
  await writeTennesseeCityHiveArtifact(payload, signal);
}

async function collectIndianaCityHive(config, bible, observedAt) {
  const signals = [];
  const roadblocks = [];
  const cache = await readIndianaCityHiveCache();
  const cacheAgeMs = cache?.generatedAt ? Date.now() - new Date(cache.generatedAt).getTime() : Infinity;
  if (process.env.BOURBON_SIGNAL_IN_FORCE_CITYHIVE_LIVE !== '1' && cache && Number.isFinite(cacheAgeMs) && cacheAgeMs >= 0 && cacheAgeMs < IN_CITYHIVE_LIVE_REFRESH_MIN_AGE_MS) {
    const cachedSignals = cachedIndianaCityHiveSignals(cache, observedAt);
    const reconciled = reconcileCityHiveRateLimitsWithCache({
      roadblocks: cache.roadblocks || [],
      sources: IN_CITYHIVE_SOURCES,
      retainedSignals: cachedSignals,
    });
    return {
      signals: cachedSignals,
      roadblocks: reconciled.roadblocks,
    };
  }
  const seenPageFirstProducts = new Set();
  const seenProductOptions = new Set();
  const seenStores = new Set();

  for (const source of IN_CITYHIVE_SOURCES) {
    let sourceBlocked = false;
    let sourceReachable = false;
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
          if (isTerminalProbeFailure(res.status)) sourceBlocked = true;
          break;
        }
        sourceReachable = true;
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
              const { reportedQuantity, binaryAvailability, quantity } = normalizeCityHiveReportedQuantity(option.quantity);
              const fullAddress = option.full_address || null;
              const city = fullAddress?.match(/,\s*([^,]+),\s*IN\s+\d{5}/i)?.[1] || null;
              const zip = fullAddress?.match(/\bIN\s+(\d{5}(?:-\d{4})?)\b/i)?.[1] || null;
              const size = option.option_params?.size ? `${option.option_params.size.quantity}${option.option_params.size.measure || ''}` : null;
              signals.push({
                id: stableId([config.id, 'cityhive-store-inventory', source.id, option.merchant_id, option.product_id, option.option_id]),
                state: config.id,
                sourceLabel: source.sourceLabel,
                sourceUrl: option.product_url || url,
                sourceChain: source.id,
                merchantId: option.merchant_id ? String(option.merchant_id) : null,
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
                availabilityStatus: quantity > 0 ? (binaryAvailability ? 'binary_retailer_in_stock' : 'in_stock') : 'out_of_stock',
                availabilityLabel: quantity > 0 ? 'In stock' : 'Out of stock',
                observedAt,
                canAlertAsInventory: quantity > 0,
                canAlertAsWatch: true,
                inventorySemantics: `${source.chainName} CityHive pages embed store-level product option availability and price for the selected branch. A reported value of 100 is treated as a binary availability sentinel, never an exact shelf count. Treat as retailer-published pickup/order availability and ask users to verify before driving.`,
                evidence: binaryAvailability
                  ? `${source.chainName} reports ${rawName} in stock${option.merchant_name ? ` at ${option.merchant_name}` : ''}${fullAddress ? ` (${fullAddress})` : ''}${option.price ? ` for $${Number(option.price).toFixed(2)}` : ''}; the retailer value ${reportedQuantity} is treated as binary availability, not an exact shelf count.`
                  : `${source.chainName} CityHive reports ${quantity} ${size || 'unit'}${quantity === 1 ? '' : 's'} of ${rawName}${option.merchant_name ? ` at ${option.merchant_name}` : ''}${fullAddress ? ` (${fullAddress})` : ''}${option.price ? ` for $${Number(option.price).toFixed(2)}` : ''}.`,
                raw: { chain: source.id, reportedQuantity, binaryAvailability, product: { id: product.id, name: product.name, basic_category: product.basic_category }, option, matchGuard: unsafeReason }
              });
            }
          }
        }
        await sleep(IN_CITYHIVE_PAGE_DELAY_MS);
      }
    }
    if (sourceReachable && !signals.some((signal) => signal.raw?.chain === source.id && signal.eventType === 'cityhive_store_inventory_result')) {
      roadblocks.push({
        state: config.id,
        source: source.sourceLabel,
        url: source.urls[0],
        status: 'reachable_no_safe_inventory_rows',
        error: `${source.chainName} returned no positive, safely matched bourbon inventory rows in the current bounded crawl.`,
        nextRoute: 'Retry at the next low-cadence refresh; do not promote catalog-only, out-of-stock, or unsafe bottle matches.'
      });
    }
    await sleep(IN_CITYHIVE_SOURCE_DELAY_MS);
  }

  const liveInventoryProduced = signals.some((signal) => signal.eventType === 'cityhive_store_inventory_result');
  const liveSignals = [...signals];
  const liveRoadblocks = [...roadblocks];
  if (liveInventoryProduced) {
    mergeMissingIndianaCityHiveCacheChains(signals, cache, observedAt);
  }

  if (!signals.some((signal) => signal.eventType === 'cityhive_store_inventory_result')) {
    if (cache) {
      signals.push(...cachedIndianaCityHiveSignals(cache, observedAt));
    } else if (!roadblocks.length) {
      roadblocks.push({
        state: config.id,
        source: 'Indiana CityHive retailer inventory pages',
        url: IN_CITYHIVE_SOURCES.map((source) => source.baseUrl).join(', '),
        status: 'reachable_no_inventory_rows',
        error: 'CityHive pages were reachable but no positive bourbon/whiskey store inventory rows were parsed.',
        nextRoute: 'Inspect embedded CityHive product JSON and pagination parameters; selected stores may simply be out of relevant products.'
      });
    }
  }
  if (liveInventoryProduced) await writeIndianaCityHiveCache(liveSignals, liveRoadblocks);
  const reconciled = reconcileCityHiveRateLimitsWithCache({
    roadblocks,
    sources: IN_CITYHIVE_SOURCES,
    retainedSignals: signals,
  });
  return { signals, roadblocks: reconciled.roadblocks };
}

async function readIndianaTargetCache() {
  try {
    const cache = JSON.parse(await readFile(IN_TARGET_ARTIFACT_PATH, 'utf8'));
    const generatedMs = Date.parse(cache.generatedAt || '');
    const nowMs = Date.now();
    if (!Number.isFinite(generatedMs) || nowMs - generatedMs > IN_TARGET_CACHE_MAX_AGE_MS) return null;
    const signals = filterFreshIndianaTargetSignals(cache.signals, nowMs, IN_TARGET_CACHE_MAX_AGE_MS);
    if (!signals.some((signal) => signal.eventType === 'retailer_store_inventory_result')) return null;
    return { ...cache, signals, roadblocks: Array.isArray(cache.roadblocks) ? cache.roadblocks : [] };
  } catch {
    return null;
  }
}

async function writeIndianaTargetCache(signals, roadblocks) {
  const payload = {
    generatedAt: new Date().toISOString(),
    source: 'Target Indiana RedSky store fulfillment cache',
    cacheMaxAgeMs: IN_TARGET_CACHE_MAX_AGE_MS,
    signalCount: signals.length,
    storeIds: [...new Set(signals.map((signal) => signal.merchantId).filter(Boolean))].sort(),
    signals,
    roadblocks,
  };
  await mkdir(path.dirname(IN_TARGET_ARTIFACT_PATH), { recursive: true });
  await writeFile(IN_TARGET_ARTIFACT_PATH, JSON.stringify(payload, null, 2));
}

function cachedIndianaTargetSignals(cache) {
  return (cache?.signals || []).map((signal) => ({
    ...signal,
    raw: { ...(signal.raw || {}), cacheFallback: true, cacheGeneratedAt: cache.generatedAt, artifactPath: IN_TARGET_ARTIFACT_PATH },
  }));
}

async function collectIndianaTarget(config, bible, observedAt) {
  const locationSignals = buildIndianaTargetStoreLocationSignals(observedAt);
  const signals = [];
  const roadblocks = [];
  const cache = await readIndianaTargetCache();
  const allStores = [...INDIANA_TARGET_STORES.entries()];
  const selectedStores = process.env.BOURBON_SIGNAL_IN_TARGET_FORCE_ALL_STORES === '1'
    ? allStores
    : rotatingSourceCohort(allStores, observedAt, IN_TARGET_COHORT_SIZE, IN_TARGET_ROTATION_MS);
  const [seedStoreId, seedStore] = selectedStores[0] || allStores[0];
  if (!IN_TARGET_KEY) {
    if (cache) signals.push(...cachedIndianaTargetSignals(cache));
    roadblocks.push({
      state: config.id,
      source: 'Target Indiana RedSky store fulfillment',
      url: seedStore?.officialUrl || 'https://www.target.com/c/bourbon-liquor-wine-beer-grocery/-/N-xxj34',
      status: 'missing_runtime_configuration',
      error: 'Target RedSky collection requires BOURBON_SIGNAL_TARGET_REDSKY_KEY at runtime.',
      nextRoute: 'Configure the public Target frontend key in the protected runner environment; never hardcode it or treat category presence as inventory.',
    });
    return { signals: [...locationSignals, ...signals], roadblocks };
  }
  const visitorId = randomUUID();
  const searchParams = new URLSearchParams({
    key: IN_TARGET_KEY,
    channel: 'WEB',
    count: '24',
    default_purchasability_filter: 'true',
    keyword: 'bourbon',
    offset: '0',
    page: '/s/bourbon',
    pricing_store_id: seedStoreId,
    store_ids: seedStoreId,
    visitor_id: visitorId,
  });
  const searchUrl = `https://redsky.target.com/redsky_aggregations/v1/web/plp_search_v2?${searchParams}`;
  const search = await textFetch(searchUrl, { headers: { accept: 'application/json', 'user-agent': 'Mozilla/5.0' }, timeoutMs: 25_000 });
  if (!search.ok) {
    if (cache) signals.push(...cachedIndianaTargetSignals(cache));
    roadblocks.push({
      state: config.id,
      source: 'Target Indiana RedSky store fulfillment',
      url: seedStore?.officialUrl || 'https://www.target.com/c/bourbon-liquor-wine-beer-grocery/-/N-xxj34',
      status: search.status || 0,
      error: search.error || `HTTP ${search.status}`,
      nextRoute: 'Refresh the public Target frontend key and retry the public RedSky search at low cadence; never promote category presence as inventory.',
    });
    return { signals: [...locationSignals, ...signals], roadblocks };
  }

  const products = parseIndianaTargetSearchProducts(search.text);
  if (!products.length) {
    if (cache) signals.push(...cachedIndianaTargetSignals(cache));
    roadblocks.push({
      state: config.id,
      source: 'Target Indiana RedSky store fulfillment',
      url: seedStore?.officialUrl || 'https://www.target.com/c/bourbon-liquor-wine-beer-grocery/-/N-xxj34',
      status: 'reachable_no_valid_product_rows',
      error: 'Target search returned no valid product array for the bounded bourbon query.',
      nextRoute: 'Inspect the public Target RedSky search response shape without weakening store or product identity guards.',
    });
    return { signals: [...locationSignals, ...signals], roadblocks };
  }

  const seen = new Set();
  const completedStoreIds = new Set();
  for (const [primaryStoreId, primaryStore] of selectedStores) {
    let attemptedRequests = 0;
    let storeComplete = true;
    for (const product of products.slice(0, IN_TARGET_PRODUCT_LIMIT)) {
      const rawName = htmlToText(product?.item?.product_description?.title || '');
      const { match, record, unsafeReason } = cityHiveSafeBottleMatch(rawName, bible);
      if (!record || !product?.tcin || product?.item?.is_alcoholic_beverage !== true) continue;
      attemptedRequests += 1;
      const params = new URLSearchParams({
        key: IN_TARGET_KEY,
        channel: 'WEB',
        tcin: String(product.tcin),
        store_id: primaryStoreId,
        store_positions_store_id: primaryStoreId,
        scheduled_delivery_store_id: primaryStoreId,
        zip: primaryStore.zip,
        visitor_id: visitorId,
      });
      const requestUrl = `https://redsky.target.com/redsky_aggregations/v1/web/product_fulfillment_v1?${params}`;
      const res = await textFetch(requestUrl, { headers: { accept: 'application/json', 'user-agent': 'Mozilla/5.0' }, timeoutMs: 20_000 });
      if (!res.ok) {
        storeComplete = false;
        roadblocks.push({
          state: config.id,
          source: 'Target Indiana RedSky store fulfillment',
          url: primaryStore.officialUrl,
          status: res.status || 0,
          error: res.error || `HTTP ${res.status}`,
          nextRoute: 'Retry the public Target fulfillment endpoint at low cadence; retain only still-fresh cache rows for unaffected stores.',
        });
        await sleep(IN_TARGET_REQUEST_DELAY_MS);
        continue;
      }
      let fulfillmentJson = null;
      try { fulfillmentJson = JSON.parse(res.text); } catch {}
      if (!Array.isArray(fulfillmentJson?.data?.product?.fulfillment?.store_options)) {
        storeComplete = false;
        roadblocks.push({
          state: config.id,
          source: 'Target Indiana RedSky store fulfillment',
          url: primaryStore.officialUrl,
          status: 'reachable_invalid_fulfillment_shape',
          error: `Target returned an invalid fulfillment response for store ${primaryStoreId}.`,
          nextRoute: 'Retain still-fresh cache for this store and inspect the public response shape without weakening identity guards.',
        });
        await sleep(IN_TARGET_REQUEST_DELAY_MS);
        continue;
      }
      for (const row of parseIndianaTargetFulfillment(fulfillmentJson)) {
        if (row.locationId !== primaryStoreId) continue;
        const key = `${row.locationId}|${product.tcin}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const sourceUrl = product?.item?.enrichment?.buy_url || `https://www.target.com/p/-/A-${product.tcin}`;
        const price = primaryStoreId === seedStoreId
          ? Number(product?.price?.current_retail || product?.price?.formatted_current_price?.replace(/[^0-9.]/g, '')) || null
          : null;
        signals.push({
          id: stableId([config.id, 'target-redsky', row.locationId, product.tcin]),
          state: config.id,
          sourceLabel: 'Target Indiana RedSky store fulfillment',
          sourceUrl,
          sourceChain: 'target',
          merchantId: row.locationId,
          rawName,
          canonicalBottleId: record.id,
          canonicalName: record.canonical,
          tier: record.tier,
          confidence: Math.max(0.8, match?.confidence || 0.5),
          eventType: 'retailer_store_inventory_result',
          locationPrecision: 'store_level',
          locationName: row.store.name,
          storeName: row.store.name,
          storeId: `target:${row.locationId}`,
          storeAddress: row.store.address,
          city: row.store.city,
          stateCode: 'IN',
          postalCode: row.store.zip,
          zip: row.store.zip,
          quantity: 0,
          price,
          availabilityStatus: 'in_stock',
          availabilityLabel: row.availabilityMode === 'order_pickup' ? 'Target reports order pickup available' : 'Target reports in-store availability',
          sourceAvailabilityVerified: true,
          observedAt,
          canAlertAsInventory: true,
          canAlertAsWatch: true,
          inventorySemantics: 'Target RedSky reports store-specific pickup or in-store orderability. Available-to-promise is retained as supporting evidence but is not represented as an exact shelf count.',
          evidence: `Target reports ${rawName} ${row.availabilityMode === 'order_pickup' ? 'orderable for pickup' : 'available in store'} at ${row.store.name}, ${row.store.address}. Exact shelf quantity is not published; verify before driving.`,
          raw: {
            chain: 'target',
            merchantId: row.locationId,
            tcin: String(product.tcin),
            selectedStoreId: primaryStoreId,
            availableToPromise: row.availableToPromise,
            availabilityMode: row.availabilityMode,
            orderPickup: row.orderPickup,
            inStoreOnly: row.inStoreOnly,
            matchGuard: unsafeReason,
          },
        });
      }
      await sleep(IN_TARGET_REQUEST_DELAY_MS);
    }
    if (attemptedRequests > 0 && storeComplete) completedStoreIds.add(primaryStoreId);
  }

  const liveSignalCount = signals.length;
  if (cache) {
    const merged = mergeIndianaTargetCacheSignals(signals, cachedIndianaTargetSignals(cache), { completedStoreIds });
    signals.splice(0, signals.length, ...merged);
  }
  if (shouldWriteIndianaTargetCache(liveSignalCount, completedStoreIds)) await writeIndianaTargetCache(signals, roadblocks);
  if (!signals.length) {
    roadblocks.push({
      state: config.id,
      source: 'Target Indiana RedSky store fulfillment',
      url: seedStore?.officialUrl || 'https://www.target.com/c/bourbon-liquor-wine-beer-grocery/-/N-xxj34',
      status: 'reachable_no_safe_inventory_rows',
      error: 'Target returned no safely matched store-orderable bourbon rows for the current Indiana cohort.',
      nextRoute: 'Retain official store discovery and retry fulfillment without treating catalog/search presence as inventory.',
    });
  }
  return { signals: [...locationSignals, ...signals], roadblocks };
}

function exactTennesseeAddress(value, expected) {
  const normalize = (input) => String(input || '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/\busa\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return normalize(value) === normalize(expected);
}

function tennesseeCityHiveSeedUrls(source) {
  const stores = tennesseeStoresForSource(source.id);
  if (!stores.length) return source.urls;
  return source.urls.flatMap((seedUrl) => stores.map((store) => {
    const url = new URL(seedUrl);
    url.searchParams.set('merchant-id', store.merchantId);
    return url.toString();
  }));
}

async function collectTennesseeCityHive(config, bible, observedAt, options = {}) {
  const signals = [];
  const roadblocks = [];
  const cache = await readTennesseeCityHiveCache();

  const seenProductOptions = new Set();
  const seenPageFirstProducts = new Set();
  const failedSourceIds = new Set();
  const completedSourceIds = new Set();
  const rejectedMerchants = new Set();
  const rejectedAddresses = new Set();
  const requestedSourceIds = new Set(String(process.env.BOURBON_SIGNAL_TN_CITYHIVE_SOURCE_IDS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean));
  const forceAllSources = process.env.BOURBON_SIGNAL_TN_CITYHIVE_FORCE_ALL_SOURCES === '1';
  const selectedSources = selectTennesseeCityHiveSourceCohort(TN_CITYHIVE_SOURCES, {
    cache,
    cohortSize: TN_CITYHIVE_SOURCE_COHORT_SIZE,
    forceAll: forceAllSources,
    requestedSourceIds,
  });
  if (requestedSourceIds.size && !selectedSources.length) {
    roadblocks.push({
      state: config.id,
      source: 'Tennessee CityHive exact-store source selection',
      url: '',
      status: 'no_configured_source_ids_selected',
      error: `None of the requested Tennessee CityHive source IDs are configured: ${[...requestedSourceIds].join(', ')}.`,
      nextRoute: 'Use only reviewed source IDs from TN_CITYHIVE_SOURCES; do not substitute an unregistered host.'
    });
  }

  const selectedSourceIds = new Set(selectedSources.map((source) => source.id));
  if (selectedSourceIds.size) {
    options.signal?.throwIfAborted();
    await writeTennesseeCityHiveAttemptLease(cache, selectedSourceIds, observedAt, options.signal);
  }

  for (const source of selectedSources) {
    options.signal?.throwIfAborted();
    let sourceBlocked = false;
    let sourceReachable = false;
    let sourcePayloadRecognized = false;
    let reportedUnrecognizedPayload = false;
    for (const seedUrl of tennesseeCityHiveSeedUrls(source)) {
      if (sourceBlocked) break;
      for (const url of cityHivePageUrls(seedUrl, TN_CITYHIVE_MAX_PAGES)) {
        const res = await textFetch(url, { headers: { accept: 'text/html,*/*' }, timeoutMs: 24_000, signal: options.signal });
        if (!res.ok) {
          failedSourceIds.add(source.id);
          roadblocks.push({
            state: config.id,
            source: source.sourceLabel,
            url,
            status: res.status || 0,
            error: res.error || `HTTP ${res.status}`,
            nextRoute: 'Retry the first-party CityHive page; never substitute search snippets or unregistered merchant rows.'
          });
          if (res.status === 429) {
            sourceBlocked = true;
          }
          break;
        }
        sourceReachable = true;

        const blobs = cityHiveJsonBlobs(res.text);
        const products = cityHiveProducts(blobs);
        const payloadMerchantIds = [
          ...cityHiveMerchantConfigs(blobs).map((config) => (config?.merchant || config)?.id),
          ...products.flatMap((product) => (product?.merchants || []).flatMap((merchant) => (merchant?.product_options || []).map((option) => option?.merchant_id))),
        ].filter(Boolean);
        const reviewedMerchantIds = tennesseeStoresForSource(source.id).map((store) => store.merchantId);
        if (!hasReviewedTennesseeCityHivePayload(reviewedMerchantIds, payloadMerchantIds, cityHiveHasProductPayload(blobs))) {
          failedSourceIds.add(source.id);
          if (!reportedUnrecognizedPayload) {
            reportedUnrecognizedPayload = true;
            roadblocks.push({
              state: config.id,
              source: source.sourceLabel,
              url,
              status: 'unrecognized_cityhive_payload',
              error: 'The first-party page returned HTTP 200 without a reviewed merchant-bound CityHive payload.',
              nextRoute: 'Retain fresh cache and inspect the current CityHive schema or bot response before treating an empty parse as authoritative inventory.',
            });
          }
          break;
        }
        sourcePayloadRecognized = true;
        const firstKey = products.slice(0, 3).map((p) => p?.id || p?.name).join('|');
        const repeatKey = `${source.id}|${seedUrl}|${firstKey}`;
        if (!products.length || seenPageFirstProducts.has(repeatKey)) continue;
        seenPageFirstProducts.add(repeatKey);

        for (const cfg of cityHiveMerchantConfigs(blobs)) {
          const merchant = cfg?.merchant || cfg;
          if (!merchant?.id) continue;
          const store = registeredTennesseeStore(source.id, merchant.id);
          if (store) continue;
          const rejectKey = `${source.id}:${merchant.id}`;
          if (rejectedMerchants.has(rejectKey)) continue;
          rejectedMerchants.add(rejectKey);
          roadblocks.push({
            state: config.id,
            source: source.sourceLabel,
            url,
            status: 'unregistered_exact_store_identity',
            error: `CityHive returned merchant ${merchant.id}, but it is not in the reviewed Tennessee exact-store registry.`,
            nextRoute: 'Verify the first-party merchant name and street address before adding a stable identity; do not emit inventory meanwhile.'
          });
        }

        for (const product of products) {
          for (const merchant of product.merchants || []) {
            for (const option of merchant.product_options || []) {
              if (!isBourbonRelevantProduct(product, option)) continue;
              const store = registeredTennesseeStore(source.id, option.merchant_id);
              if (!store) continue;
              const key = `${source.id}|${option.merchant_id}|${option.product_id}|${option.option_id}`;
              if (seenProductOptions.has(key)) continue;
              seenProductOptions.add(key);
              const fullAddress = option.full_address || '';
              if (!exactTennesseeAddress(fullAddress, store.address)) {
                const rejectKey = `${source.id}:${option.merchant_id}:${fullAddress}`;
                if (!rejectedAddresses.has(rejectKey)) {
                  rejectedAddresses.add(rejectKey);
                  roadblocks.push({
                    state: config.id,
                    source: source.sourceLabel,
                    url,
                    status: 'exact_store_address_mismatch',
                    error: `Merchant ${option.merchant_id} returned address "${fullAddress || 'missing'}"; expected "${store.address}".`,
                    nextRoute: 'Re-verify the first-party merchant/address binding before updating the registry; this row remains nonalertable.'
                  });
                }
                continue;
              }
              const rawName = option.option_display_data?.name || product.name;
              if (!isAllowedTennesseeBottleFormat(rawName)) continue;
              const { match, record, unsafeReason } = cityHiveSafeBottleMatch(rawName, bible);
              if (!record) continue;
              const normalizedQuantity = normalizeTennesseeCityHiveQuantity(option.quantity);
              if (normalizedQuantity.reportedQuantity <= 0) continue;
              const sourceUrl = option.product_url || '';
              const price = Number(option.price || 0) || null;
              const draft = {
                id: stableId([config.id, 'cityhive-store-inventory', source.id, store.merchantId, option.product_id, option.option_id]),
                state: config.id,
                stateCode: 'TN',
                sourceLabel: store.sourceLabel,
                sourceUrl,
                sourceChain: store.sourceId,
                merchantId: store.merchantId,
                productId: String(option.product_id || product.id || ''),
                variantId: String(option.option_id || ''),
                rawName,
                canonicalBottleId: record.id,
                canonicalName: record.canonical,
                confidence: Math.max(0.8, match?.confidence || 0.5),
                eventType: 'cityhive_store_inventory_result',
                locationPrecision: 'store_level',
                locationName: store.name,
                storeName: store.name,
                storeId: store.storeId,
                storeAddress: store.address,
                city: store.city,
                postalCode: store.zip,
                zip: store.zip,
                lat: Number(option.coordinates?.[1]) || null,
                lng: Number(option.coordinates?.[0]) || null,
                quantity: normalizedQuantity.quantity,
                quantityIsExact: normalizedQuantity.quantityIsExact,
                reportedQuantity: normalizedQuantity.reportedQuantity,
                price,
                availabilityStatus: normalizedQuantity.binaryAvailability ? 'binary_retailer_in_stock' : 'in_stock',
                availabilityLabel: 'In stock',
                observedAt,
                sourceAvailabilityVerified: true,
                canAlertAsInventory: false,
                canAlertAsWatch: false,
                inventorySemantics: normalizedQuantity.binaryAvailability
                  ? 'binary_retailer_orderable_no_exact_count'
                  : 'exact_retailer_reported_quantity',
                evidence: normalizedQuantity.binaryAvailability
                  ? `${store.name} currently reports ${rawName} orderable at ${store.address}; source value ${normalizedQuantity.reportedQuantity} is a binary sentinel, not a bottle count.`
                  : `${store.name} currently reports ${normalizedQuantity.quantity} ${rawName} at ${store.address}${price ? ` for $${price.toFixed(2)}` : ''}.`,
                raw: {
                  chain: store.sourceId,
                  merchantId: store.merchantId,
                  sourceAvailabilityVerified: true,
                  reportedQuantity: normalizedQuantity.reportedQuantity,
                  binaryAvailability: normalizedQuantity.binaryAvailability,
                  product: { id: product.id, name: product.name, basic_category: product.basic_category },
                  option,
                  matchGuard: unsafeReason
                }
              };
              if (!isTennesseeRetailerInventory(draft)) {
                roadblocks.push({
                  state: config.id,
                  source: source.sourceLabel,
                  url: sourceUrl || url,
                  status: 'retailer_identity_policy_denied',
                  error: `A ${store.name} option failed exact host, merchant, address, product, format, or availability binding.`,
                  nextRoute: 'Inspect the first-party product URL and embedded option identity; keep the row nonalertable until every binding passes.'
                });
                continue;
              }
              draft.canAlertAsInventory = true;
              draft.canAlertAsWatch = true;
              signals.push(draft);
            }
          }
        }
        await sleepWithSignal(TN_CITYHIVE_PAGE_DELAY_MS, options.signal);
      }
    }
    if (sourcePayloadRecognized && !failedSourceIds.has(source.id)) completedSourceIds.add(source.id);
    if (sourcePayloadRecognized && sourceReachable && !signals.some((signal) => signal.sourceChain === source.id)) {
      roadblocks.push({
        state: config.id,
        source: source.sourceLabel,
        url: source.urls[0],
        status: 'reachable_no_exact_store_orderability',
        error: `${source.chainName} returned no current bourbon row that passed exact host, merchant, address, bottle, size, and orderability binding.`,
        nextRoute: 'Retry the bounded first-party crawl; do not treat a catalog or configured location as inventory.'
      });
    }
    await sleepWithSignal(TN_CITYHIVE_SOURCE_DELAY_MS, options.signal);
  }

  const liveKeys = new Set(signals.map((signal) => signal.id));
  const merged = mergeTennesseeCityHiveCacheSignals({
    liveSignals: signals,
    cachedSignals: cache?.signals || [],
    selectedSourceIds,
    failedSourceIds,
    observedAt,
    maxAgeMs: TN_CITYHIVE_CACHE_MAX_AGE_MS,
    validate: isTennesseeRetailerInventory,
  }).map((signal) => liveKeys.has(signal.id) ? signal : ({
    ...signal,
    raw: {
      ...(signal.raw || {}),
      cacheFallback: true,
      cacheGeneratedAt: cache?.generatedAt,
      artifactPath: TN_CITYHIVE_ARTIFACT_PATH,
    },
  }));
  signals.splice(0, signals.length, ...merged);
  if (cache) {
    const retainedFallback = signals.filter((signal) => signal?.raw?.cacheFallback === true);
    const reconciled = reconcileCityHiveRateLimitsWithCache({
      roadblocks,
      sources: selectedSources,
      retainedSignals: retainedFallback,
    });
    roadblocks.splice(0, roadblocks.length, ...reconciled.roadblocks);
  }

  if (selectedSources.length) {
    options.signal?.throwIfAborted();
    await writeTennesseeCityHiveCache(signals, roadblocks, {
      previous: cache,
      selectedSourceIds,
      completedSourceIds,
      observedAt,
      signal: options.signal,
    });
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

async function fetchCoolSpringsProducts(pageNumber, options = {}) {
  const body = JSON.stringify({ pn: pageNumber, ps: TN_COOL_SPRINGS_PAGE_SIZE, q: 'bourbon' });
  const res = await textFetch(new URL('api/b/', TN_COOL_SPRINGS_BASE_URL).toString(), {
    method: 'POST',
    body,
    headers: { accept: 'application/json,*/*', 'content-type': 'application/json' },
    timeoutMs: 24_000,
    signal: options.signal,
  });
  if (!res.ok) return { ok: false, status: res.status, error: res.error || `HTTP ${res.status}`, items: [], totalCount: 0 };
  try {
    const json = JSON.parse(res.text);
    return { ok: true, status: res.status, items: Array.isArray(json.items) ? json.items : [], totalCount: Number(json.totalCount || 0) || 0 };
  } catch (error) {
    return { ok: false, status: res.status, error: error instanceof Error ? error.message : String(error), items: [], totalCount: 0 };
  }
}


function isTennesseeShopifyBourbonCandidate(product) {
  const text = normalizedBottleText(`${product?.title || ''} ${product?.product_type || ''} ${(product?.tags || []).join(' ')}`);
  if (!text) return false;
  if (/\b(vodka|gin|rum|tequila|liqueur|cordial|wine|beer|seltzer|cocktail|ready to drink|margarita|brandy|cognac|mezcal|champagne|cabernet|pinot|chardonnay)\b/i.test(text) && !/\b(bourbon|whiskey|whisky|rye)\b/i.test(text)) return false;
  return /\b(bourbon|american whiskey|american whisky|rye whiskey|rye whisky|blanton|eagle rare|weller|stagg|taylor|buffalo trace|michter|willett|old fitz|1792|booker|baker|four roses|woodford|wild turkey|elijah craig|old forester|green river|bardstown|knob creek|bulleit|maker'?s mark|benchmark|belle meade|chattanooga whiskey|hard truth|pursuit united)\b/i.test(text);
}

async function fetchTennesseeShopifyProducts(source, options = {}) {
  const res = await textFetch(source.collectionUrl, { headers: { accept: 'application/json,*/*' }, timeoutMs: 24_000, signal: options.signal });
  if (!res.ok) return { ok: false, status: res.status, error: res.error || `HTTP ${res.status}`, products: [] };
  try {
    const json = JSON.parse(res.text);
    return { ok: true, status: res.status, products: Array.isArray(json.products) ? json.products : [] };
  } catch (error) {
    return { ok: false, status: res.status, error: error instanceof Error ? error.message : String(error), products: [] };
  }
}

async function collectTennesseeShopify(config, bible, observedAt, options = {}) {
  const signals = [];
  const roadblocks = [];
  for (const source of TN_SHOPIFY_SOURCES) {
    options.signal?.throwIfAborted();
    const store = registeredTennesseeStore(source.id, source.id);
    if (!store) {
      roadblocks.push({
        state: config.id,
        source: source.sourceLabel,
        url: source.collectionUrl,
        status: 'unregistered_exact_store_identity',
        error: `${source.chainName} has no reviewed exact-store registry binding.`,
        nextRoute: 'Verify the first-party host, store name, and street address before collecting inventory.'
      });
      continue;
    }
    const page = await fetchTennesseeShopifyProducts(source, options);
    if (!page.ok) {
      roadblocks.push({
        state: config.id,
        source: source.sourceLabel,
        url: source.collectionUrl,
        status: page.status || 0,
        error: page.error || 'Shopify collection did not return parseable product JSON.',
        nextRoute: 'Retry Shopify public collection JSON or inspect storefront collection handles.'
      });
      continue;
    }
    const seen = new Set();
    for (const product of page.products.slice(0, TN_SHOPIFY_MAX_PRODUCTS)) {
      if (!isTennesseeShopifyBourbonCandidate(product)) continue;
      for (const variant of product.variants || []) {
        if (!variant?.available) continue;
        const rawName = [product.title, variant.title && variant.title !== 'Default Title' ? variant.title : null].filter(Boolean).join(' ');
        if (!isAllowedTennesseeBottleFormat(rawName)) continue;
        const { match, record, unsafeReason } = cityHiveSafeBottleMatch(rawName, bible);
        if (!record) continue;
        const key = `${source.id}|${product.id}|${variant.id}|${record.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const price = Number(variant.price || 0) || null;
        const draft = {
          id: stableId([config.id, 'shopify-store-inventory', source.id, product.id, variant.id, record.id, price]),
          state: config.id,
          stateCode: 'TN',
          sourceLabel: store.sourceLabel,
          sourceUrl: `${source.baseUrl}/products/${product.handle || product.id}`,
          sourceChain: store.sourceId,
          merchantId: store.merchantId,
          productId: String(product.id || ''),
          variantId: String(variant.id || ''),
          rawName,
          canonicalBottleId: record.id,
          canonicalName: record.canonical,
          confidence: Math.max(0.8, match?.confidence || 0.5),
          eventType: 'retailer_store_inventory_result',
          locationPrecision: 'store_level',
          locationName: store.name,
          storeName: store.name,
          storeId: store.storeId,
          storeAddress: store.address,
          city: store.city,
          postalCode: store.zip,
          zip: store.zip,
          lat: source.lat,
          lng: source.lng,
          quantity: 0,
          quantityIsExact: false,
          reportedQuantity: 1,
          price,
          availabilityStatus: 'shopify_available',
          availabilityLabel: 'Available online',
          observedAt,
          sourceAvailabilityVerified: true,
          canAlertAsInventory: false,
          canAlertAsWatch: false,
          inventorySemantics: 'binary_retailer_orderable_no_exact_count',
          evidence: `${store.name} Shopify collection currently lists ${rawName}${price ? ` for $${price.toFixed(2)}` : ''} with variant.available=true; exact on-hand count is not exposed.`,
          raw: {
            chain: store.sourceId,
            merchantId: store.merchantId,
            sourceAvailabilityVerified: true,
            reportedQuantity: 1,
            source: 'tn_shopify_products_json',
            product: { id: product.id, title: product.title, handle: product.handle, product_type: product.product_type, tags: product.tags },
            variant,
            matchGuard: unsafeReason
          }
        };
        if (!isTennesseeRetailerInventory(draft)) continue;
        draft.canAlertAsInventory = true;
        draft.canAlertAsWatch = true;
        signals.push(draft);
      }
    }
    if (!signals.some((signal) => signal.sourceLabel === source.sourceLabel && signal.eventType === 'retailer_store_inventory_result')) {
      roadblocks.push({
        state: config.id,
        source: source.sourceLabel,
        url: source.collectionUrl,
        status: 'reachable_no_safe_bourbon_inventory',
        error: `Read ${page.products.length} Shopify product(s), but none survived availability + bottle-bible guards.`,
        nextRoute: 'Inspect Shopify collection handles and add bottle aliases only for unambiguous products.'
      });
    }
  }
  return { signals, roadblocks };
}

async function collectTennesseeCoolSprings(config, bible, observedAt, options = {}) {
  const signals = [];
  const roadblocks = [];
  const store = registeredTennesseeStore('cool-springs-wine-spirits', TN_COOL_SPRINGS_STORE.id);
  if (!store) {
    return {
      signals,
      roadblocks: [{
        state: config.id,
        source: 'Cool Springs Wine & Spirits public catalog API',
        url: TN_COOL_SPRINGS_BASE_URL,
        status: 'unregistered_exact_store_identity',
        error: 'Cool Springs has no reviewed exact-store registry binding.',
        nextRoute: 'Verify the first-party store ID and street address before collecting inventory.'
      }]
    };
  }
  const seenItems = new Set();
  let totalCount = 0;
  for (let pageNumber = 1; pageNumber <= TN_COOL_SPRINGS_MAX_PAGES; pageNumber++) {
    options.signal?.throwIfAborted();
    const page = await fetchCoolSpringsProducts(pageNumber, options);
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
      if (!isAllowedTennesseeBottleFormat(rawName)) continue;
      const { match, record, unsafeReason } = cityHiveSafeBottleMatch(rawName, bible);
      if (!record) continue;
      const price = Number(item.actualPrice ?? item.suggestedPrice ?? 0) || null;
      const draft = {
        id: stableId([config.id, 'cool-springs-store-inventory', item.id, quantity, price]),
        state: config.id,
        stateCode: 'TN',
        sourceLabel: store.sourceLabel,
        sourceUrl: coolSpringsProductUrl(item),
        sourceChain: store.sourceId,
        merchantId: store.merchantId,
        productId: String(item.id),
        rawName,
        canonicalBottleId: record.id,
        canonicalName: record.canonical,
        confidence: Math.max(0.8, match?.confidence || 0.5),
        eventType: 'retailer_store_inventory_result',
        locationPrecision: 'store_level',
        locationName: store.name,
        storeName: store.name,
        storeId: store.storeId,
        storeAddress: store.address,
        city: store.city,
        postalCode: store.zip,
        zip: store.zip,
        lat: TN_COOL_SPRINGS_STORE.lat,
        lng: TN_COOL_SPRINGS_STORE.lng,
        quantity,
        quantityIsExact: true,
        reportedQuantity: quantity,
        price,
        availabilityStatus: 'in_stock',
        availabilityLabel: 'In stock',
        observedAt,
        sourceAvailabilityVerified: true,
        canAlertAsInventory: false,
        canAlertAsWatch: false,
        inventorySemantics: 'exact_retailer_reported_quantity',
        evidence: `${store.name} public catalog currently reports ${quantity} available ${rawName}${price ? ` at $${price.toFixed(2)}` : ''} for ${store.address}.`,
        raw: {
          chain: store.sourceId,
          merchantId: store.merchantId,
          sourceAvailabilityVerified: true,
          reportedQuantity: quantity,
          item,
          matchGuard: unsafeReason
        }
      };
      if (!isTennesseeRetailerInventory(draft)) continue;
      draft.canAlertAsInventory = true;
      draft.canAlertAsWatch = true;
      signals.push(draft);
    }
    if (!page.items.length || pageNumber * TN_COOL_SPRINGS_PAGE_SIZE >= totalCount) break;
    await sleepWithSignal(500, options.signal);
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

function isGrabblBourbonRelevantProduct(item) {
  const text = `${item?.productName || ''} ${item?.brand || ''} ${item?.productSubCategory || ''} ${item?.productDescription || ''}`;
  if (/vodka|gin|rum|tequila|liqueur|cordial|wine|beer|seltzer|cocktail|ready to drink|cream|coffee|bitters|margarita|brandy|cognac|mezcal/i.test(text)
    && !/bourbon|whiskey|whisky|rye|blanton|eagle rare|weller|stagg|taylor|van winkle|buffalo trace|michter|willett|old fitz|1792|booker|baker|four roses|woodford|wild turkey|elijah craig|old forester|green river|bardstown|knob creek|bulleit|maker/i.test(text)) return false;
  if (/honey|vanilla|apple|peach|cinnamon|peanut butter|chocolate|salted caramel|flavored/i.test(text)
    && !/single barrel|full proof|barrel proof|bottled.?in.?bond|store pick|private barrel|allocated|limited|blanton|eagle rare|weller|stagg|taylor|buffalo trace|michter|willett|old fitz/i.test(text)) return false;
  return /bourbon|american whiskey|american whisky|rye whiskey|rye whisky|blanton|eagle rare|weller|stagg|taylor|van winkle|buffalo trace|michter|willett|old fitz|1792|booker|baker|woodford|four roses|wild turkey|elijah craig|old forester|green river|bardstown|knob creek|bulleit|maker'?s mark|benchmark/i.test(text);
}

function grabblProductUrl(product, storeProduct) {
  const id = storeProduct?.storeProductId || product?.productId || '';
  return id ? `https://gatewaywineandspirit.com/products/${encodeURIComponent(id)}` : 'https://gatewaywineandspirit.com/';
}

export function grabblHasCurrentOrderability(storeProduct) {
  const statusText = [
    storeProduct?.availabilityStatus,
    storeProduct?.availabilityLabel,
    storeProduct?.status,
  ]
    .filter((value) => typeof value === 'string')
    .join(' ')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (/\b(?:not\s+(?:currently\s+)?(?:available|orderable|in\s+stock)|currently\s+not\s+in\s+stock|no\s+longer\s+available|unavailable|out\s+of\s+stock|sold\s+out)\b/i.test(statusText)) return false;
  if (/\b(?:status\s+unknown|unknown|unclear|pending|maybe|possibly|not\s+sure|cannot\s+confirm|can't\s+confirm)\b/i.test(statusText)) return false;

  const values = [
    storeProduct?.availableQuantity,
    storeProduct?.available_quantity,
    storeProduct?.inventoryQuantity,
    storeProduct?.inventory_quantity,
    storeProduct?.onHand,
    storeProduct?.quantity,
    storeProduct?.stock,
  ];
  if (values.some((value) => Number.isFinite(Number(value)) && Number(value) > 0)) return true;
  if ([storeProduct?.available, storeProduct?.isAvailable, storeProduct?.inStock, storeProduct?.isInStock, storeProduct?.pickupAvailable, storeProduct?.isPickupAvailable].some((value) => value === true)) return true;
  return /\b(?:in\s+stock|available(?:\s+now)?(?:\s+for\s+(?:pickup|order))?|currently\s+available|orderable(?:\s+for\s+pickup)?|pickup\s+available)\b/i.test(statusText);
}

async function fetchGatewayGrabblProducts(search, options = {}) {
  const url = new URL(`/product-web/store/${TN_GRABBL_GATEWAY_STORE.id}/search`, TN_GRABBL_BASE_URL);
  url.searchParams.set('page', '1');
  url.searchParams.set('limit', String(TN_GRABBL_SEARCH_LIMIT));
  url.searchParams.set('search', search);
  const res = await textFetch(url.toString(), {
    headers: { accept: 'application/json,*/*', 'x-store-id': TN_GRABBL_GATEWAY_STORE.id },
    timeoutMs: 24_000,
    signal: options.signal,
  });
  if (!res.ok) return { ok: false, status: res.status || 0, error: res.error || `HTTP ${res.status}`, products: [], count: 0, url: url.toString() };
  try {
    const json = JSON.parse(res.text);
    const data = json?.data || {};
    return { ok: true, status: res.status, products: Array.isArray(data.data) ? data.data : [], count: Number(data.count || 0) || 0, url: url.toString() };
  } catch (error) {
    return { ok: false, status: res.status || 0, error: error instanceof Error ? error.message : String(error), products: [], count: 0, url: url.toString() };
  }
}

async function collectTennesseeGatewayGrabbl(config, bible, observedAt, options = {}) {
  const signals = [];
  const roadblocks = [];
  const seen = new Set();
  const store = registeredTennesseeStore('gateway-grabbl', TN_GRABBL_GATEWAY_STORE.id);
  if (!store) {
    return {
      signals,
      roadblocks: [{
        state: config.id,
        source: 'Gateway Wine & Spirits Grabbl public store API',
        url: 'https://gatewaywineandspirit.com/',
        status: 'unregistered_exact_store_identity',
        error: 'Gateway has no reviewed exact-store registry binding.',
        nextRoute: 'Verify the first-party store ID and street address before collecting inventory.'
      }]
    };
  }

  let returnedRows = 0;
  for (const term of TN_GRABBL_GATEWAY_SEARCH_TERMS.slice(0, TN_GRABBL_MAX_TERMS)) {
    options.signal?.throwIfAborted();
    const page = await fetchGatewayGrabblProducts(term, options);
    if (!page.ok) {
      roadblocks.push({
        state: config.id,
        source: 'Gateway Wine & Spirits Grabbl public store API',
        url: page.url,
        status: page.status || 0,
        error: page.error || 'Gateway Grabbl search API did not return parseable JSON.',
        nextRoute: 'Retry the public Grabbl white-label product search or inspect the current web app bundle for endpoint changes.'
      });
      continue;
    }
    returnedRows += page.products.length;
    for (const product of page.products) {
      if (!product?.productId || !isGrabblBourbonRelevantProduct(product)) continue;
      const storeProducts = Array.isArray(product.storeProduct) ? product.storeProduct : [];
      for (const storeProduct of storeProducts) {
        if (storeProduct?.storeId && storeProduct.storeId !== TN_GRABBL_GATEWAY_STORE.id) continue;
        const rawName = [product.productName, product.size].filter(Boolean).join(' ');
        if (!isAllowedTennesseeBottleFormat(rawName) || !grabblHasCurrentOrderability(storeProduct)) continue;
        const { match, record, unsafeReason } = cityHiveSafeBottleMatch(rawName, bible);
        if (!record) continue;
        const key = `${product.productId}|${storeProduct.storeProductId || ''}|${rawName}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const price = Number(storeProduct.productPrice || 0) || null;
        const draft = {
          id: stableId([config.id, 'gateway-grabbl-store-listing', product.productId, storeProduct.storeProductId || '', price]),
          state: config.id,
          stateCode: 'TN',
          sourceLabel: store.sourceLabel,
          sourceUrl: grabblProductUrl(product, storeProduct),
          sourceChain: store.sourceId,
          merchantId: store.merchantId,
          productId: String(product.productId || ''),
          variantId: String(storeProduct.storeProductId || ''),
          rawName,
          canonicalBottleId: record.id,
          canonicalName: record.canonical,
          confidence: Math.max(0.8, match?.confidence || 0.5),
          eventType: 'retailer_store_inventory_result',
          locationPrecision: 'store_level',
          locationName: store.name,
          storeName: store.name,
          storeId: store.storeId,
          storeAddress: store.address,
          city: store.city,
          postalCode: store.zip,
          zip: store.zip,
          lat: Number(storeProduct.latitude || TN_GRABBL_GATEWAY_STORE.lat) || TN_GRABBL_GATEWAY_STORE.lat,
          lng: Number(storeProduct.longitude || TN_GRABBL_GATEWAY_STORE.lng) || TN_GRABBL_GATEWAY_STORE.lng,
          quantity: 0,
          quantityIsExact: false,
          reportedQuantity: 1,
          price,
          availabilityStatus: 'listed_for_pickup',
          availabilityLabel: 'Available for pickup',
          observedAt,
          sourceAvailabilityVerified: true,
          canAlertAsInventory: false,
          canAlertAsWatch: false,
          inventorySemantics: 'binary_retailer_orderable_no_exact_count',
          evidence: `${store.name} Grabbl store response currently marks ${rawName}${price ? ` at $${price.toFixed(2)}` : ''} available for ${store.address}; exact count is not exposed.`,
          raw: {
            chain: store.sourceId,
            merchantId: store.merchantId,
            sourceAvailabilityVerified: true,
            reportedQuantity: 1,
            term,
            product,
            storeProduct,
            matchGuard: unsafeReason
          }
        };
        if (!isTennesseeRetailerInventory(draft)) continue;
        draft.canAlertAsInventory = true;
        draft.canAlertAsWatch = true;
        signals.push(draft);
      }
    }
    await sleepWithSignal(250, options.signal);
  }
  if (!signals.some((signal) => signal.eventType === 'retailer_store_inventory_result')) {
    roadblocks.push({
      state: config.id,
      source: 'Gateway Wine & Spirits Grabbl public store API',
      url: 'https://gatewaywineandspirit.com/',
      status: 'reachable_no_current_orderability_evidence',
      error: `Gateway Grabbl product search returned ${returnedRows} product rows but none supplied current positive pickup/orderability evidence plus exact bottle and store identity.`,
      nextRoute: 'Treat the response as catalog-only until the exact store payload exposes positive current availability; keep every listing nonalertable.'
    });
  }
  return { signals, roadblocks };
}

function isSouthCarolinaRetailerCandidate(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text || !SC_RETAILER_WATCH_RE.test(text)) return false;
  if (SC_RETAILER_EXCLUDE_RE.test(text)) return false;
  return true;
}

function southCarolinaStoreLocationSignal(config, sourceLabel, sourceUrl, store, observedAt, chain) {
  return {
    id: stableId([config.id, 'retailer-store-location', chain, store.id]),
    state: config.id,
    sourceLabel,
    sourceUrl,
    rawName: store.name,
    canonicalBottleId: null,
    canonicalName: null,
    confidence: 0.72,
    eventType: 'retailer_store_location',
    locationPrecision: 'store_level',
    locationName: store.name,
    storeName: store.name,
    storeId: configuredStoreId(chain, store),
    storeAddress: store.address,
    city: store.city,
    stateCode: 'SC',
    postalCode: store.zip,
    zip: store.zip,
    lat: store.lat || null,
    lng: store.lng || null,
    quantity: 0,
    observedAt,
    canAlertAsInventory: false,
    canAlertAsWatch: false,
    inventorySemantics: `${store.name} location metadata identifies a public South Carolina retailer source. Store-location rows are not bottle inventory by themselves.`,
    evidence: `${sourceLabel} identifies ${store.name} at ${store.address}.`,
    raw: { chain, store }
  };
}

async function readSouthCarolinaCityHiveCache() {
  try {
    const cache = JSON.parse(await readFile(SC_CITYHIVE_ARTIFACT_PATH, 'utf8'));
    if (!isFreshSouthCarolinaCityHiveCacheTimestamp(cache.generatedAt)) return null;
    const signals = Array.isArray(cache.signals) ? cache.signals : [];
    const roadblocks = Array.isArray(cache.roadblocks) ? cache.roadblocks : [];
    if (!signals.some((signal) => signal.eventType === 'cityhive_store_inventory_result')) return null;
    if (!cachedSouthCarolinaCityHiveSignals({ ...cache, signals }, cache.generatedAt)
      .some((signal) => signal.eventType === 'cityhive_store_inventory_result')) return null;
    return { ...cache, signals, roadblocks };
  } catch {
    return null;
  }
}

export function isFreshSouthCarolinaCityHiveCacheTimestamp(generatedAt, nowMs = Date.now()) {
  const generatedMs = Date.parse(String(generatedAt || ''));
  const ageMs = nowMs - generatedMs;
  return Number.isFinite(generatedMs) && ageMs >= -5 * 60_000 && ageMs <= SC_CITYHIVE_CACHE_MAX_AGE_MS;
}

function southCarolinaCityHiveSignalMerchantId(signal) {
  return String(signal?.raw?.merchant?.id || signal?.raw?.option?.merchant_id || signal?.storeId?.split(':').at(-1) || '');
}

export function cachedSouthCarolinaCityHiveSignals(cache, observedAt, { sourceStale = false } = {}) {
  return (cache?.signals || [])
    .filter((signal) => {
      const merchantId = southCarolinaCityHiveSignalMerchantId(signal);
      if (signal?.eventType === 'retailer_store_location') {
        return SC_CITYHIVE_INVENTORY_MERCHANT_IDS.has(merchantId)
          && signal?.raw?.chain
          && String(signal?.raw?.merchant?.id || '') === merchantId
          && signal?.storeId === `${signal.raw.chain}:${merchantId}`;
      }
      return SC_CITYHIVE_INVENTORY_MERCHANT_IDS.has(merchantId)
        && Boolean(signal?.productId)
        && Boolean(signal?.optionId)
        && signal?.sourceAvailabilityVerified === true
        && typeof signal?.quantityIsExact === 'boolean'
        && Boolean(signal?.raw?.chain)
        && String(signal?.raw?.option?.merchant_id || '') === merchantId
        && String(signal?.raw?.option?.product_id || '') === String(signal.productId)
        && String(signal?.raw?.option?.option_id || '') === String(signal.optionId);
    })
    .map((signal) => ({
      ...signal,
      observedAt: cache.generatedAt || signal.observedAt || observedAt,
      ...(sourceStale ? { stale: true, sourceStale: true, canAlertAsInventory: false, canAlertAsWatch: false } : {}),
      raw: { ...(signal.raw || {}), cacheFallback: true, cacheGeneratedAt: cache.generatedAt, artifactPath: SC_CITYHIVE_ARTIFACT_PATH }
    }));
}

function southCarolinaCityHiveSignalChain(signal) {
  if (signal?.raw?.chain) return signal.raw.chain;
  const label = String(signal?.sourceLabel || signal?.source || '');
  const source = SC_CITYHIVE_SOURCES.find((item) => label.includes(item.chainName) || label.includes(item.sourceLabel));
  return source?.id || null;
}

function southCarolinaCityHivePositiveInventoryChains(signals = []) {
  return new Set(signals
    .filter((signal) => signal.eventType === 'cityhive_store_inventory_result')
    .map(southCarolinaCityHiveSignalChain)
    .filter(Boolean));
}

async function writeSouthCarolinaCityHiveCache(signals, roadblocks) {
  const nextPositiveCount = signals.filter((signal) => signal.eventType === 'cityhive_store_inventory_result').length;
  if (!nextPositiveCount) return;
  const nextChains = southCarolinaCityHivePositiveInventoryChains(signals);
  const previous = await readSouthCarolinaCityHiveCache();
  const previousPositiveCount = (previous?.signals || []).filter((signal) => signal.eventType === 'cityhive_store_inventory_result').length;
  const previousChains = southCarolinaCityHivePositiveInventoryChains(previous?.signals || []);
  const nextCoverageFloor = Math.max(25, Math.floor(previousPositiveCount * 0.85));
  if (previousChains.size >= 2 && (nextChains.size < previousChains.size || nextPositiveCount < nextCoverageFloor)) return;
  const payload = {
    generatedAt: new Date().toISOString(),
    source: 'South Carolina CityHive retailer inventory cache',
    cacheMaxAgeMs: SC_CITYHIVE_CACHE_MAX_AGE_MS,
    sourceChainCount: nextChains.size,
    sourceChains: [...nextChains].sort(),
    signalCount: signals.length,
    positiveInventorySignalCount: nextPositiveCount,
    storeLocationSignalCount: signals.filter((signal) => signal.eventType === 'retailer_store_location').length,
    signals,
    roadblocks
  };
  await mkdir(path.dirname(SC_CITYHIVE_ARTIFACT_PATH), { recursive: true });
  await writeFile(SC_CITYHIVE_ARTIFACT_PATH, JSON.stringify(payload, null, 2));
}

async function collectArizonaWooCommerceRetailer(config, bible, observedAt, retailer, options = {}) {
  const signals = [];
  const roadblocks = [];
  const seen = new Set();
  for (const term of AZ_MESA_LIQUOR_TERMS) {
    options.signal?.throwIfAborted();
    const url = `${retailer.baseUrl}/wp-json/wc/store/v1/products?search=${encodeURIComponent(term)}&per_page=100&page=1`;
    const res = await textFetch(url, { headers: { accept: 'application/json,*/*' }, timeoutMs: 20_000, signal: options.signal });
    if (!res.ok) {
      roadblocks.push({ state: config.id, source: retailer.sourceLabel, url, status: res.status || 0, error: res.error || `HTTP ${res.status}`, nextRoute: 'Retry the public WooCommerce Store API at low cadence.' });
      await sleep(AZ_MESA_LIQUOR_DELAY_MS);
      continue;
    }
    let products = [];
    try { products = JSON.parse(res.text); } catch (error) {
      roadblocks.push({ state: config.id, source: retailer.sourceLabel, url, status: res.status || 0, error: error instanceof Error ? error.message : String(error), nextRoute: 'Inspect the WooCommerce Store API response shape.' });
      continue;
    }
    if (!Array.isArray(products)) continue;
    for (const product of products) {
      const rawName = htmlToText(product?.name || '');
      const sizeMatch = rawName.match(/\b(\d+(?:\.\d+)?)\s*(ml|l)\b/i);
      const sizeMl = sizeMatch ? Number(sizeMatch[1]) * (sizeMatch[2].toLowerCase() === 'l' ? 1000 : 1) : null;
      const productKey = `${rawName.toLowerCase().replace(/\s+/g, ' ').trim()}|${wcStoreApiPrice(product?.prices) || ''}`;
      if (!rawName || (sizeMl != null && sizeMl < 375) || seen.has(productKey) || product?.is_in_stock !== true || product?.is_purchasable === false || product?.is_on_backorder === true) continue;
      seen.add(productKey);
      const { match, record } = cityHiveSafeBottleMatch(rawName, bible);
      if (!record) continue;
      const price = wcStoreApiPrice(product?.prices);
      signals.push({
        id: stableId([config.id, 'woocommerce-store-inventory', retailer.chain, product.id]), state: config.id,
        sourceLabel: retailer.sourceLabel, sourceUrl: product?.permalink || url, sourceChain: retailer.chain, merchantId: retailer.merchantId,
        rawName, canonicalBottleId: record.id, canonicalName: record.canonical, tier: record.tier,
        confidence: Math.max(0.8, match?.confidence || 0.5), eventType: 'retailer_store_inventory_result', locationPrecision: 'store_level',
        locationName: retailer.store.name, storeName: retailer.store.name, storeId: retailer.store.id,
        storeAddress: retailer.store.address, city: retailer.store.city, stateCode: 'AZ', postalCode: retailer.store.zip, zip: retailer.store.zip,
        quantity: 0, price, availabilityStatus: 'in_stock', availabilityLabel: 'Retailer reports in stock', sourceAvailabilityVerified: true, observedAt,
        canAlertAsInventory: true, canAlertAsWatch: true,
        inventorySemantics: `${retailer.store.name}’s public WooCommerce Store API reports this bottle in stock and purchasable. It does not expose exact on-hand quantity; verify directly before driving.`,
        evidence: `${retailer.store.name} WooCommerce reports ${rawName} in stock${price ? ` at $${price.toFixed(2)}` : ''} for its ${retailer.store.city} store. Exact quantity is not published.`,
        raw: { chain: retailer.chain, merchantId: retailer.merchantId, product: { id: product.id, sku: product.sku, is_in_stock: product.is_in_stock, is_purchasable: product.is_purchasable, is_on_backorder: product.is_on_backorder, low_stock_remaining: product.low_stock_remaining, prices: product.prices } }
      });
    }
    await sleep(AZ_MESA_LIQUOR_DELAY_MS);
  }
  if (!signals.length) roadblocks.push({ state: config.id, source: retailer.sourceLabel, url: `${retailer.baseUrl}/wp-json/wc/store/v1/products`, status: 'reachable_no_safe_inventory_rows', error: 'Public WooCommerce searches produced no safely matched in-stock bourbon rows.', nextRoute: 'Inspect product names and Store API stock flags without weakening bottle or availability guards.' });
  return { signals, roadblocks };
}

async function collectArizonaFlagstaffLiquor(config, bible, observedAt, options = {}) {
  const signals = [];
  const roadblocks = [];
  const res = await textFetch(AZ_FLAGSTAFF_LIQUOR_URL, { headers: { accept: 'application/json,*/*' }, timeoutMs: 20_000, signal: options.signal });
  if (!res.ok) return { signals, roadblocks: [{ state: config.id, source: AZ_FLAGSTAFF_LIQUOR_SOURCE_LABEL, url: AZ_FLAGSTAFF_LIQUOR_URL, status: res.status || 0, error: res.error || `HTTP ${res.status}`, nextRoute: 'Retry the public Shopify products feed at low cadence.' }] };
  let products = [];
  try { products = JSON.parse(res.text)?.products || []; } catch (error) {
    return { signals, roadblocks: [{ state: config.id, source: AZ_FLAGSTAFF_LIQUOR_SOURCE_LABEL, url: AZ_FLAGSTAFF_LIQUOR_URL, status: res.status || 0, error: error instanceof Error ? error.message : String(error), nextRoute: 'Inspect the Shopify products feed response shape.' }] };
  }
  for (const product of products) {
    const rawName = htmlToText(product?.title || '');
    if (!/bourbon|blanton|weller|eagle rare|buffalo trace|stagg|e\.?\s*h\.?\s*taylor/i.test(rawName)) continue;
    const sizeMatch = rawName.match(/\b(\d+(?:\.\d+)?)\s*(ml|l)\b/i);
    const sizeMl = sizeMatch ? Number(sizeMatch[1]) * (sizeMatch[2].toLowerCase() === 'l' ? 1000 : 1) : null;
    if (sizeMl != null && sizeMl < 375) continue;
    const { match, record } = cityHiveSafeBottleMatch(rawName, bible);
    if (!record) continue;
    for (const variant of product?.variants || []) {
      if (variant?.available !== true) continue;
      const price = Number(variant?.price || 0) || null;
      signals.push({
        id: stableId([config.id, 'shopify-store-inventory', 'flagstaff-liquor', variant.id]), state: config.id,
        sourceLabel: AZ_FLAGSTAFF_LIQUOR_SOURCE_LABEL, sourceUrl: `https://flagstaffliquor.com/products/${product.handle}`, sourceChain: 'flagstaff-liquor', merchantId: 'flagstaff-liquor-shopify',
        rawName, canonicalBottleId: record.id, canonicalName: record.canonical, tier: record.tier,
        confidence: Math.max(0.8, match?.confidence || 0.5), eventType: 'retailer_store_inventory_result', locationPrecision: 'store_level',
        locationName: AZ_FLAGSTAFF_LIQUOR_STORE.name, storeName: AZ_FLAGSTAFF_LIQUOR_STORE.name, storeId: AZ_FLAGSTAFF_LIQUOR_STORE.id,
        storeAddress: AZ_FLAGSTAFF_LIQUOR_STORE.address, city: AZ_FLAGSTAFF_LIQUOR_STORE.city, stateCode: 'AZ', postalCode: AZ_FLAGSTAFF_LIQUOR_STORE.zip, zip: AZ_FLAGSTAFF_LIQUOR_STORE.zip,
        quantity: 0, price, availabilityStatus: 'in_stock', availabilityLabel: 'Retailer reports available', sourceAvailabilityVerified: true, observedAt,
        canAlertAsInventory: true, canAlertAsWatch: true,
        inventorySemantics: 'Flagstaff Liquor’s public Shopify feed marks this sellable variant available. Exact on-hand quantity is not published; verify directly before driving.',
        evidence: `Flagstaff Liquor Shopify reports ${rawName} available${price ? ` at $${price.toFixed(2)}` : ''}. Exact quantity is not published.`,
        raw: { chain: 'flagstaff-liquor', merchantId: 'flagstaff-liquor-shopify', product: { id: product.id, handle: product.handle }, variant: { id: variant.id, sku: variant.sku, available: variant.available, price: variant.price } }
      });
    }
  }
  if (!signals.length) roadblocks.push({ state: config.id, source: AZ_FLAGSTAFF_LIQUOR_SOURCE_LABEL, url: AZ_FLAGSTAFF_LIQUOR_URL, status: 'reachable_no_safe_inventory_rows', error: 'Shopify feed produced no safely matched available bourbon rows.', nextRoute: 'Inspect product titles and variant availability without weakening guards.' });
  return { signals, roadblocks };
}

async function collectArizonaAlbertsons(config, bible, observedAt, options = {}) {
  const signals = [];
  const roadblocks = [];
  const stores = new Map();
  for (const zip of AZ_ALBERTSONS_ZIPS) {
    options.signal?.throwIfAborted();
    const url = `https://www.safeway.com/abs/pub/xapi/storeresolver/v2/all?zipcode=${encodeURIComponent(zip)}&radius=50&size=100`;
    const res = await textFetch(url, { headers: { accept: 'application/json', 'ocp-apim-subscription-key': AZ_ALBERTSONS_STORE_KEY }, timeoutMs: 20_000, signal: options.signal });
    if (!res.ok && res.status !== 206) { roadblocks.push({ state: config.id, source: 'Albertsons/Safeway Arizona store resolver', url, status: res.status || 0, error: res.error || `HTTP ${res.status}`, nextRoute: 'Refresh the public storefront subscription key and retry.' }); continue; }
    try {
      const payload = JSON.parse(res.text);
      for (const lane of ['instore', 'pickup', 'delivery']) {
        let rows = payload?.[lane]?.stores || [];
        if (!Array.isArray(rows)) rows = rows ? [rows] : [];
        for (const store of rows) {
          if (String(store?.address?.state || '').toUpperCase() !== 'AZ' || !store?.locationId) continue;
          const previous = stores.get(String(store.locationId));
          stores.set(String(store.locationId), { ...(previous || store), ...store, lanes: new Set([...(previous?.lanes || []), lane]) });
        }
      }
    } catch (error) { roadblocks.push({ state: config.id, source: 'Albertsons/Safeway Arizona store resolver', url, status: res.status || 0, error: error instanceof Error ? error.message : String(error), nextRoute: 'Inspect the public resolver response shape.' }); }
    await sleep(AZ_ALBERTSONS_DELAY_MS);
  }
  const selected = [...stores.values()].sort((a, b) => Number(a.distance || 999) - Number(b.distance || 999)).slice(0, AZ_ALBERTSONS_MAX_STORES);
  const seenStoreProducts = new Set();
  const rareTerms = AZ_ALBERTSONS_TERMS.filter((term) => term !== 'bourbon');
  const dayBucket = Math.floor(Date.now() / 86_400_000);
  for (const [storeIndex, store] of selected.entries()) {
    options.signal?.throwIfAborted();
    const banner = String(store.polarisBannerName || store.domainName || 'safeway').toLowerCase().includes('albertsons') ? 'albertsons' : 'safeway';
    const host = `https://www.${banner}.com`;
    const termsForStore = ['bourbon'];
    if (rareTerms.length) termsForStore.push(rareTerms[(dayBucket + storeIndex) % rareTerms.length]);
    for (const term of termsForStore) {
      options.signal?.throwIfAborted();
      const params = new URLSearchParams({ 'request-id': String(Date.now()), url: host, pageurl: host, pagename: 'search', rows: '100', start: '0', 'search-type': 'keyword', storeid: String(store.locationId), featured: 'true', 'search-uid': '', q: term, channel: 'instore', banner });
      const url = `${host}/abs/pub/xapi/search/substitute?${params}`;
      const res = await textFetch(url, { headers: { accept: 'application/json', 'ocp-apim-subscription-key': AZ_ALBERTSONS_SEARCH_KEY }, timeoutMs: 25_000, signal: options.signal });
      if (!res.ok) { roadblocks.push({ state: config.id, source: `${store.domainName || banner} Arizona XAPI inventory`, url, status: res.status || 0, error: res.error || `HTTP ${res.status}`, nextRoute: 'Refresh the public storefront search key and retry at low cadence.' }); await sleep(AZ_ALBERTSONS_DELAY_MS); continue; }
      let docs = [];
      try { docs = JSON.parse(res.text)?.response?.docs || []; } catch (error) { roadblocks.push({ state: config.id, source: `${store.domainName || banner} Arizona XAPI inventory`, url, status: res.status || 0, error: error instanceof Error ? error.message : String(error), nextRoute: 'Inspect the XAPI search response shape.' }); }
      for (const product of docs) {
        const productKey = `${store.locationId}|${product.id || product.pid || product.upc}`;
        if (seenStoreProducts.has(productKey)) continue;
        const rawName = htmlToText(product?.name || '');
        if (!/bourbon|blanton|weller|eagle rare|buffalo trace|stagg|e\.?\s*h\.?\s*taylor|booker'?s/i.test(rawName)) continue;
        const { match, record } = cityHiveSafeBottleMatch(rawName, bible);
        if (!record || String(product?.restrictedValue || '').toLowerCase() === 'true' && product?.containsAlcohol === false) continue;
        const inventory = product?.channelInventory || {};
        const positive = String(inventory.instore ?? inventory.inStore ?? '') === '1';
        if (!positive) continue;
        const exactQty = Number(inventory.instoreItemQty ?? inventory.inStoreItemQty);
        const quantity = Number.isFinite(exactQty) && exactQty > 0 ? exactQty : 0;
        const address = store.address || {};
        const sourceLabel = `${banner === 'albertsons' ? 'Albertsons' : 'Safeway'} Arizona XAPI store inventory`;
        seenStoreProducts.add(productKey);
        signals.push({
          id: stableId([config.id, 'albertsons-xapi', store.locationId, product.id || product.pid || product.upc]), state: config.id,
          sourceLabel, sourceUrl: `${host}/shop/product-details.${product.pid || product.id || product.upc}.html`, sourceChain: banner, merchantId: String(store.locationId),
          rawName, canonicalBottleId: record.id, canonicalName: record.canonical, tier: record.tier,
          confidence: quantity > 0 ? 0.86 : Math.max(0.8, match?.confidence || 0.5), eventType: 'retailer_store_inventory_result', locationPrecision: 'store_level',
          locationName: `${store.domainName || banner} #${store.locationId}`, storeName: `${store.domainName || banner} #${store.locationId}`, storeId: `${banner}:${store.locationId}`,
          storeAddress: `${address.line1}, ${address.city}, AZ ${address.zipcode}`, city: address.city, stateCode: 'AZ', postalCode: address.zipcode, zip: address.zipcode,
          lat: Number(store.latitude ?? store.lat) || null, lng: Number(store.longitude ?? store.lng) || null,
          quantity, price: Number(product.price) || null, availabilityStatus: 'in_stock', availabilityLabel: quantity > 0 ? `Retailer reports ${quantity} available` : 'Retailer reports in-store inventory', sourceAvailabilityVerified: true, observedAt,
          canAlertAsInventory: true, canAlertAsWatch: true,
          inventorySemantics: quantity > 0 ? 'Albertsons Companies XAPI reports positive store/channel inventory and an item quantity.' : 'Albertsons Companies XAPI reports positive in-store inventory but no exact item quantity; verify before driving.',
          evidence: `${sourceLabel} reports ${rawName} available at ${address.line1}, ${address.city}${quantity > 0 ? ` with quantity ${quantity}` : ''}.`,
          raw: { chain: banner, merchantId: String(store.locationId), queryTerm: term, product: { id: product.id, pid: product.pid, upc: product.upc, inventoryAvailable: product.inventoryAvailable }, channelInventory: inventory, channelEligibility: product.channelEligibility }
        });
      }
      await sleep(AZ_ALBERTSONS_DELAY_MS);
    }
  }
  if (!signals.length) roadblocks.push({ state: config.id, source: 'Albertsons/Safeway Arizona XAPI inventory', status: 'reachable_no_safe_inventory_rows', error: 'No safely matched positive in-store bourbon rows were returned.', nextRoute: 'Refresh public keys and inspect channelInventory without treating catalog presence as stock.' });
  return { signals, roadblocks };
}

async function collectArizonaTarget(config, bible, observedAt, options = {}) {
  const signals = [];
  const roadblocks = [];
  const visitorId = crypto.randomUUID();
  const storeEntries = [...AZ_TARGET_STORES.entries()];
  const cohortCount = Math.ceil(storeEntries.length / AZ_TARGET_COHORT_SIZE);
  const cohortIndex = Math.floor(Date.now() / 86_400_000) % cohortCount;
  const cohort = storeEntries.slice(cohortIndex * AZ_TARGET_COHORT_SIZE, (cohortIndex + 1) * AZ_TARGET_COHORT_SIZE);
  const [seedStoreId, seedStore] = cohort[0] || storeEntries[0];
  const searchParams = new URLSearchParams({ key: AZ_TARGET_KEY, channel: 'WEB', count: '24', default_purchasability_filter: 'true', keyword: 'bourbon', offset: '0', page: '/s/bourbon', pricing_store_id: seedStoreId, store_ids: seedStoreId, visitor_id: visitorId });
  const searchUrl = `https://redsky.target.com/redsky_aggregations/v1/web/plp_search_v2?${searchParams}`;
  const search = await textFetch(searchUrl, { headers: { accept: 'application/json', 'user-agent': 'Mozilla/5.0' }, timeoutMs: 25_000, signal: options.signal });
  if (!search.ok) return { signals, roadblocks: [{ state: config.id, source: 'Target Arizona RedSky fulfillment', url: searchUrl, status: search.status || 0, error: search.error || `HTTP ${search.status}`, nextRoute: 'Refresh the public Target frontend key and retry without bypassing retailer protection.' }] };
  let products = [];
  try { products = JSON.parse(search.text)?.data?.search?.products || []; } catch (error) { return { signals, roadblocks: [{ state: config.id, source: 'Target Arizona RedSky fulfillment', url: searchUrl, status: search.status || 0, error: error instanceof Error ? error.message : String(error), nextRoute: 'Inspect the RedSky search response shape.' }] }; }
  const seenTargetSignals = new Set();
  for (const [primaryStoreId, primaryStore] of cohort) {
    options.signal?.throwIfAborted();
    for (const product of products.slice(0, 10)) {
      options.signal?.throwIfAborted();
      const rawName = htmlToText(product?.item?.product_description?.title || '');
      const { match, record } = cityHiveSafeBottleMatch(rawName, bible);
      if (!record || !product?.tcin || product?.item?.is_alcoholic_beverage !== true) continue;
      const fulfillParams = new URLSearchParams({ key: AZ_TARGET_KEY, channel: 'WEB', tcin: String(product.tcin), store_id: primaryStoreId, store_positions_store_id: primaryStoreId, scheduled_delivery_store_id: primaryStoreId, zip: primaryStore.zip, visitor_id: visitorId });
      const url = `https://redsky.target.com/redsky_aggregations/v1/web/product_fulfillment_v1?${fulfillParams}`;
      const res = await textFetch(url, { headers: { accept: 'application/json', 'user-agent': 'Mozilla/5.0' }, timeoutMs: 20_000, signal: options.signal });
      if (!res.ok) { roadblocks.push({ state: config.id, source: 'Target Arizona RedSky fulfillment', url, status: res.status || 0, error: res.error || `HTTP ${res.status}`, nextRoute: 'Retry the public RedSky fulfillment endpoint at low cadence.' }); continue; }
      let fulfillment = null;
      try { fulfillment = JSON.parse(res.text)?.data?.product?.fulfillment || null; } catch {}
      for (const option of fulfillment?.store_options || []) {
        const locationId = String(option?.location_id || '');
        const store = AZ_TARGET_STORES.get(locationId);
        const inStock = option?.order_pickup?.availability_status === 'IN_STOCK' || option?.in_store_only?.availability_status === 'IN_STOCK';
        const signalKey = `${locationId}|${product.tcin}`;
        if (!store || !inStock || seenTargetSignals.has(signalKey)) continue;
        seenTargetSignals.add(signalKey);
        const price = locationId === primaryStoreId ? Number(product?.price?.current_retail || product?.price?.formatted_current_price?.replace(/[^0-9.]/g, '')) || null : null;
        signals.push({
          id: stableId([config.id, 'target-redsky', locationId, product.tcin]), state: config.id,
          sourceLabel: 'Target Arizona RedSky store fulfillment', sourceUrl: product?.item?.enrichment?.buy_url || `https://www.target.com/p/-/A-${product.tcin}`, sourceChain: 'target', merchantId: locationId,
          rawName, canonicalBottleId: record.id, canonicalName: record.canonical, tier: record.tier,
          confidence: Math.max(0.8, match?.confidence || 0.5), eventType: 'retailer_store_inventory_result', locationPrecision: 'store_level',
          locationName: store.name, storeName: store.name, storeId: `target:${locationId}`,
          storeAddress: store.address, city: store.city, stateCode: 'AZ', postalCode: store.zip, zip: store.zip,
          quantity: 0, price, availabilityStatus: 'in_stock', availabilityLabel: 'Target reports pickup or in-store availability', sourceAvailabilityVerified: true, observedAt,
          canAlertAsInventory: true, canAlertAsWatch: true,
          inventorySemantics: 'Target RedSky reports store-specific pickup or in-store orderability. Available-to-promise quantity is retained as evidence but is not represented as exact shelf quantity.',
          evidence: `Target RedSky reports ${rawName} orderable at ${store.name}. Exact shelf quantity is not published.`,
          raw: { chain: 'target', merchantId: locationId, tcin: String(product.tcin), cohortIndex, primaryStoreId, availableToPromise: Number(option.location_available_to_promise_quantity) || 0, orderPickup: option.order_pickup, inStoreOnly: option.in_store_only }
        });
      }
      await sleep(400);
    }
  }
  if (!signals.length) roadblocks.push({ state: config.id, source: 'Target Arizona RedSky fulfillment', status: 'reachable_no_safe_inventory_rows', error: 'Target returned no safely matched store-orderable bourbon rows.', nextRoute: 'Retain catalog/store discovery and retry fulfillment without treating search presence as inventory.' });
  return { signals, roadblocks };
}

async function collectFloridaMdp(config, bible, observedAt, options = {}) {
  const signals = [];
  const roadblocks = [];
  const seenVariants = new Set();
  let returnedProducts = 0;
  for (let page = 1; page <= FL_MDP_MAX_PAGES; page++) {
    options.signal?.throwIfAborted?.();
    const url = `${FL_MDP_PRODUCTS_BASE_URL}&page=${page}`;
    const res = await textFetch(url, { headers: { accept: 'application/json,*/*' }, timeoutMs: 25_000, signal: options.signal });
    if (!res.ok) {
      roadblocks.push({ state: config.id, source: 'MDP Liquor Kissimmee Shopify store inventory', url, status: res.status || 0, error: res.error || `HTTP ${res.status}`, nextRoute: 'Retry the public Shopify products feed at low cadence.' });
      break;
    }
    let products = [];
    try { products = JSON.parse(res.text)?.products || []; } catch (error) {
      roadblocks.push({ state: config.id, source: 'MDP Liquor Kissimmee Shopify store inventory', url, status: res.status || 0, error: error instanceof Error ? error.message : String(error), nextRoute: 'Inspect the Shopify products feed response shape.' });
      break;
    }
    if (!products.length) break;
    returnedProducts += products.length;
    for (const product of products) {
      const rawName = htmlToText(product?.title || '');
      if (!/bourbon|blanton|weller|eagle rare|buffalo trace|stagg|e\.?\s*h\.?\s*taylor|booker'?s|old fitz|michter'?s|four roses/i.test(rawName)) continue;
      if (!isUsefulBourbonSize(rawName)) continue;
      const { match, record } = cityHiveSafeBottleMatch(rawName, bible);
      if (!record) continue;
      for (const variant of product?.variants || []) {
        if (variant?.available !== true || seenVariants.has(String(variant.id))) continue;
        if (!isUsefulBourbonSize([variant?.title, variant?.option1, variant?.option2, variant?.option3].filter(Boolean).join(' '))) continue;
        seenVariants.add(String(variant.id));
        const price = Number(variant?.price || 0) || null;
        signals.push({
          id: stableId([config.id, 'shopify-store-inventory', 'mdp-liquor-kissimmee', variant.id]), state: config.id,
          sourceLabel: 'MDP Liquor Kissimmee Shopify store inventory', sourceUrl: `https://mdpliquorfl.com/products/${product.handle}`, sourceChain: 'mdp-liquor-kissimmee', merchantId: 'mdp-liquor-kissimmee-shopify',
          rawName, canonicalBottleId: record.id, canonicalName: record.canonical, tier: record.tier,
          confidence: Math.max(0.8, match?.confidence || 0.5), eventType: 'retailer_store_inventory_result', locationPrecision: 'store_level',
          locationName: FL_MDP_STORE.name, storeName: FL_MDP_STORE.name, storeId: FL_MDP_STORE.id,
          storeAddress: FL_MDP_STORE.address, city: FL_MDP_STORE.city, stateCode: 'FL', postalCode: FL_MDP_STORE.zip, zip: FL_MDP_STORE.zip,
          quantity: 0, price, availabilityStatus: 'in_stock', availabilityLabel: 'Retailer reports available', sourceAvailabilityVerified: true, observedAt,
          canAlertAsInventory: true, canAlertAsWatch: true,
          inventorySemantics: 'MDP Liquor’s public Shopify feed marks this variant available for its Kissimmee storefront. Exact on-hand quantity is not published; verify directly before driving.',
          evidence: `MDP Liquor Shopify reports ${rawName} available${price ? ` at $${price.toFixed(2)}` : ''} for its Kissimmee store. Exact quantity is not published.`,
          raw: { chain: 'mdp-liquor-kissimmee', merchantId: 'mdp-liquor-kissimmee-shopify', product: { id: product.id, handle: product.handle }, variant: { id: variant.id, sku: variant.sku, available: variant.available, price: variant.price } }
        });
        break;
      }
    }
    await sleepWithSignal(FL_MDP_DELAY_MS, options.signal);
  }
  if (!signals.length && returnedProducts > 0) roadblocks.push({ state: config.id, source: 'MDP Liquor Kissimmee Shopify store inventory', url: FL_MDP_PRODUCTS_BASE_URL, status: 'reachable_no_safe_inventory_rows', error: `Shopify returned ${returnedProducts} products but no safely matched available bourbon rows.`, nextRoute: 'Inspect product titles and variant availability without weakening bottle or geography guards.' });
  return { signals, roadblocks };
}

async function collectFloridaTarget(config, bible, observedAt, existingSignals = [], options = {}) {
  const signals = [];
  const roadblocks = [];
  const visitorId = crypto.randomUUID();
  const storeEntries = [...FL_TARGET_STORES.entries()];
  const cohort = oldestSourceEvidenceCohort(
    storeEntries,
    existingSignals.filter((signal) => signal?.sourceChain === 'target'),
    FL_TARGET_COHORT_SIZE,
  );
  const [seedStoreId] = cohort[0] || storeEntries[0];
  const searchParams = new URLSearchParams({ key: FL_TARGET_KEY, channel: 'WEB', count: '24', default_purchasability_filter: 'true', keyword: 'bourbon', offset: '0', page: '/s/bourbon', pricing_store_id: seedStoreId, store_ids: seedStoreId, visitor_id: visitorId });
  const searchUrl = `https://redsky.target.com/redsky_aggregations/v1/web/plp_search_v2?${searchParams}`;
  const search = await textFetch(searchUrl, { headers: { accept: 'application/json', 'user-agent': 'Mozilla/5.0' }, timeoutMs: 25_000, signal: options.signal });
  if (!search.ok) return { signals, roadblocks: [{ state: config.id, source: 'Target Florida RedSky store fulfillment', url: searchUrl, status: search.status || 0, error: search.error || `HTTP ${search.status}`, nextRoute: 'Refresh the public Target frontend key and retry without bypassing retailer protection.' }] };
  let products = [];
  try { products = JSON.parse(search.text)?.data?.search?.products || []; } catch (error) { return { signals, roadblocks: [{ state: config.id, source: 'Target Florida RedSky store fulfillment', url: searchUrl, status: search.status || 0, error: error instanceof Error ? error.message : String(error), nextRoute: 'Inspect the RedSky search response shape.' }] }; }
  const seen = new Set();
  for (const [primaryStoreId, primaryStore] of cohort) {
    options.signal?.throwIfAborted?.();
    signals.push({
      id: stableId([config.id, 'target-store-probe', primaryStoreId]),
      state: config.id,
      sourceLabel: 'Target Florida RedSky store fulfillment',
      sourceUrl: `https://www.target.com/sl/${primaryStoreId}`,
      sourceChain: 'target',
      merchantId: primaryStoreId,
      eventType: 'retailer_store_probe_status',
      locationPrecision: 'store_level',
      locationName: primaryStore.name,
      storeName: primaryStore.name,
      storeId: `target:${primaryStoreId}`,
      storeAddress: primaryStore.address,
      city: primaryStore.city,
      stateCode: 'FL',
      postalCode: primaryStore.zip,
      zip: primaryStore.zip,
      availabilityStatus: 'attempted',
      sourceAvailabilityVerified: false,
      observedAt,
      canAlertAsInventory: false,
      canAlertAsWatch: false,
      evidence: 'Target store fulfillment probe attempted; this status row is scheduling evidence only and is never inventory.',
      raw: { chain: 'target', merchantId: primaryStoreId, sourceKey: primaryStoreId, lastAttemptAt: observedAt },
    });
    for (const product of products.slice(0, 12)) {
      const rawName = htmlToText(product?.item?.product_description?.title || '');
      const { match, record } = cityHiveSafeBottleMatch(rawName, bible);
      if (!record || !product?.tcin || product?.item?.is_alcoholic_beverage !== true) continue;
      const params = new URLSearchParams({ key: FL_TARGET_KEY, channel: 'WEB', tcin: String(product.tcin), store_id: primaryStoreId, store_positions_store_id: primaryStoreId, scheduled_delivery_store_id: primaryStoreId, zip: primaryStore.zip, visitor_id: visitorId });
      const url = `https://redsky.target.com/redsky_aggregations/v1/web/product_fulfillment_v1?${params}`;
      const res = await textFetch(url, { headers: { accept: 'application/json', 'user-agent': 'Mozilla/5.0' }, timeoutMs: 20_000, signal: options.signal });
      if (!res.ok) { roadblocks.push({ state: config.id, source: 'Target Florida RedSky store fulfillment', url, status: res.status || 0, error: res.error || `HTTP ${res.status}`, nextRoute: 'Retry the public RedSky fulfillment endpoint at low cadence.' }); await sleepWithSignal(400, options.signal); continue; }
      let fulfillment = null;
      try { fulfillment = JSON.parse(res.text)?.data?.product?.fulfillment || null; } catch {}
      for (const option of fulfillment?.store_options || []) {
        const locationId = String(option?.location_id || '');
        const store = FL_TARGET_STORES.get(locationId);
        const inStock = option?.order_pickup?.availability_status === 'IN_STOCK' || option?.in_store_only?.availability_status === 'IN_STOCK';
        const key = `${locationId}|${product.tcin}`;
        if (!store || !inStock || seen.has(key)) continue;
        seen.add(key);
        const price = locationId === primaryStoreId ? Number(product?.price?.current_retail || product?.price?.formatted_current_price?.replace(/[^0-9.]/g, '')) || null : null;
        signals.push({
          id: stableId([config.id, 'target-redsky', locationId, product.tcin]), state: config.id,
          sourceLabel: 'Target Florida RedSky store fulfillment', sourceUrl: product?.item?.enrichment?.buy_url || `https://www.target.com/p/-/A-${product.tcin}`, sourceChain: 'target', merchantId: locationId,
          rawName, canonicalBottleId: record.id, canonicalName: record.canonical, tier: record.tier,
          confidence: Math.max(0.8, match?.confidence || 0.5), eventType: 'retailer_store_inventory_result', locationPrecision: 'store_level',
          locationName: store.name, storeName: store.name, storeId: `target:${locationId}`,
          storeAddress: store.address, city: store.city, stateCode: 'FL', postalCode: store.zip, zip: store.zip,
          quantity: 0, price, availabilityStatus: 'in_stock', availabilityLabel: 'Target reports pickup or in-store availability', sourceAvailabilityVerified: true, observedAt,
          canAlertAsInventory: true, canAlertAsWatch: true,
          inventorySemantics: 'Target RedSky reports store-specific pickup or in-store orderability. Available-to-promise quantity is retained as evidence but is not represented as exact shelf quantity.',
          evidence: `Target RedSky reports ${rawName} orderable at ${store.name}. Exact shelf quantity is not published.`,
          raw: { chain: 'target', merchantId: locationId, sourceKey: locationId, tcin: String(product.tcin), primaryStoreId, sourceAttemptedAt: observedAt, lastAttemptAt: observedAt, lastSuccessfulRefreshAt: observedAt, availableToPromise: Number(option.location_available_to_promise_quantity) || 0, orderPickup: option.order_pickup, inStoreOnly: option.in_store_only }
        });
      }
      await sleepWithSignal(400, options.signal);
    }
  }
  if (!signals.some((signal) => signal.eventType === 'retailer_store_inventory_result')) roadblocks.push({ state: config.id, source: 'Target Florida RedSky store fulfillment', status: 'reachable_no_safe_inventory_rows', error: 'Target returned no safely matched store-orderable bourbon rows for the current Florida cohort.', nextRoute: 'Retain store discovery and retry fulfillment without treating search presence as inventory.' });
  return { signals, roadblocks };
}

function floridaRetailerWatch(config, record, match, details) {
  return {
    id: stableId([config.id, details.chain, details.rawName, details.variantId || details.sku || 'catalog']), state: config.id,
    sourceLabel: details.label, sourceUrl: details.url, sourceChain: details.chain, merchantId: details.merchantId,
    rawName: details.rawName, canonicalBottleId: record.id, canonicalName: record.canonical, tier: record.tier,
    confidence: Math.max(0.66, Math.min(0.79, match?.confidence || 0.66)), eventType: 'retailer_catalog_availability',
    locationPrecision: 'statewide_catalog', locationName: `${details.retailer} Florida availability watch`,
    quantity: 0, price: details.price || null, availabilityStatus: 'retailer_available',
    availabilityLabel: 'Retailer reports available; exact Florida store not established', sourceAvailabilityVerified: true,
    observedAt: details.observedAt, canAlertAsInventory: false, canAlertAsWatch: true,
    inventorySemantics: 'Retailer-published online availability. Exact Florida pickup store is not established, so this is a watch lead and never a store-inventory alert.',
    evidence: `${details.retailer} reports ${details.rawName} available online${details.price ? ` at $${details.price.toFixed(2)}` : ''}. Verify fulfillment and location directly.`,
    raw: { chain: details.chain, merchantId: details.merchantId, variantId: details.variantId || null, sku: details.sku || null, provenanceGuard: 'online availability only; no inferred store' }
  };
}

async function collectFloridaShopifyRetailers(config, bible, observedAt, options = {}) {
  const signals = [];
  const roadblocks = [];
  for (const retailer of FL_SHOPIFY_RETAILERS) {
    let productCount = 0;
    for (let page = 1; page <= retailer.maxPages; page++) {
      options.signal?.throwIfAborted?.();
      const url = `${retailer.productsUrl}&page=${page}`;
      const res = await textFetch(url, { headers: { accept: 'application/json,*/*' }, timeoutMs: 25_000, signal: options.signal });
      if (!res.ok) { roadblocks.push({ state: 'FL', source: retailer.label, url, status: res.status || 0, error: res.error || `HTTP ${res.status}`, nextRoute: 'Retry the public Shopify feed at low cadence.' }); break; }
      let products = [];
      try { products = JSON.parse(res.text)?.products || []; } catch { break; }
      if (!products.length) break;
      productCount += products.length;
      for (const product of products) {
        const rawName = htmlToText(product?.title || '');
        if (!isUsefulBourbonSize(rawName)) continue;
        if (!/bourbon|blanton|weller|eagle rare|buffalo trace|stagg|e\.?\s*h\.?\s*taylor|booker'?s|old fitz|michter|willett|1792|elijah craig/i.test(rawName)) continue;
        const { match, record } = cityHiveSafeBottleMatch(rawName, bible);
        if (!record) continue;
        const variant = (product.variants || []).find((row) => row?.available === true && isUsefulBourbonSize([row?.title, row?.option1, row?.option2, row?.option3].filter(Boolean).join(' ')));
        if (!variant) continue;
        const sourceUrl = `https://${retailer.host}/products/${product.handle}`;
        const price = Number(variant.price || 0) || null;
        if (retailer.pickupStores) {
          const pickupUrl = `https://${retailer.host}/variants/${variant.id}/?section_id=pickup-availability`;
          const pickup = await textFetch(pickupUrl, { headers: { accept: 'text/html,*/*', 'user-agent': 'Mozilla/5.0' }, timeoutMs: 20_000, signal: options.signal });
          if (!pickup.ok) {
            roadblocks.push({ state: 'FL', source: retailer.label, url: pickupUrl, status: pickup.status || 0, error: pickup.error || `HTTP ${pickup.status}`, nextRoute: 'Retry the public Shopify pickup-availability section at low cadence.' });
            continue;
          }
          for (const store of parseLuekensPickupAvailability(pickup.text)) {
            signals.push({
              id: stableId(['FL', retailer.id, store.id, variant.id]), state: 'FL', sourceLabel: retailer.label, sourceUrl,
              sourceChain: retailer.chain, merchantId: 'luekens-shopify', rawName, canonicalBottleId: record.id, canonicalName: record.canonical, tier: record.tier,
              confidence: Math.max(0.82, match?.confidence || 0.5), eventType: 'retailer_store_inventory_result', locationPrecision: 'store_level',
              locationName: store.name, storeName: store.name, storeId: store.id, storeAddress: store.address,
              city: store.city, stateCode: 'FL', postalCode: store.zip, zip: store.zip,
              quantity: 0, price, availabilityStatus: 'in_stock', availabilityLabel: 'Shopify reports pickup available', sourceAvailabilityVerified: true,
              observedAt, canAlertAsInventory: true, canAlertAsWatch: true,
              inventorySemantics: 'Luekens public Shopify pickup response reports this bottle available at the named store. Exact on-hand quantity is not published; verify before driving.',
              evidence: `${retailer.label} reports pickup available for ${rawName} at ${store.address}.`,
              raw: { chain: retailer.chain, merchantId: 'luekens-shopify', productId: product.id, variant: { id: variant.id, sku: variant.sku, available: true }, pickupVerified: true, pickupAddress: store.observedAddress }
            });
          }
          await sleepWithSignal(500, options.signal);
          continue;
        }
        if (!retailer.store) {
          signals.push(floridaRetailerWatch(config, record, match, { label: retailer.label, url: sourceUrl, chain: retailer.chain, merchantId: `${retailer.id}-shopify`, retailer: 'Luekens Wine & Spirits', rawName, price, variantId: variant.id, sku: variant.sku, observedAt }));
          continue;
        }
        const pickupUrl = `https://${retailer.host}/variants/${variant.id}/?section_id=pickup-availability`;
        const pickup = await textFetch(pickupUrl, { headers: { accept: 'text/html,*/*', 'user-agent': 'Mozilla/5.0' }, timeoutMs: 20_000, signal: options.signal });
        const pickupText = htmlToText(pickup.text || '');
        if (!pickup.ok || !/pickup available/i.test(pickupText) || !/1646\s+(?:southwest|sw)\s+27th/i.test(pickupText)) continue;
        signals.push({
          id: stableId(['FL', retailer.id, retailer.store.id, variant.id]), state: 'FL', sourceLabel: retailer.label, sourceUrl,
          sourceChain: retailer.chain, merchantId: `${retailer.id}-shopify`, rawName, canonicalBottleId: record.id, canonicalName: record.canonical, tier: record.tier,
          confidence: Math.max(0.8, match?.confidence || 0.5), eventType: 'retailer_store_inventory_result', locationPrecision: 'store_level',
          locationName: retailer.store.name, storeName: retailer.store.name, storeId: retailer.store.id, storeAddress: retailer.store.address,
          city: retailer.store.city, stateCode: 'FL', postalCode: retailer.store.zip, zip: retailer.store.zip,
          quantity: 0, price, availabilityStatus: 'in_stock', availabilityLabel: 'Shopify reports pickup available', sourceAvailabilityVerified: true,
          observedAt, canAlertAsInventory: true, canAlertAsWatch: true,
          inventorySemantics: 'The retailer public Shopify pickup response reports this bottle available at the named Miami store. Exact on-hand quantity is not published; verify before driving.',
          evidence: `${retailer.label} reports pickup available for ${rawName} at ${retailer.store.address}.`,
          raw: { chain: retailer.chain, merchantId: `${retailer.id}-shopify`, productId: product.id, variant: { id: variant.id, sku: variant.sku, available: true }, pickupVerified: true }
        });
      }
      await sleepWithSignal(500, options.signal);
    }
    if (!productCount) roadblocks.push({ state: 'FL', source: retailer.label, url: retailer.productsUrl, status: 'reachable_no_products', error: 'No Shopify products returned.', nextRoute: 'Inspect public catalog response shape.' });
  }
  return { signals, roadblocks };
}

async function collectFloridaAbc(config, bible, observedAt, options = {}) {
  const signals = [];
  const res = await textFetch(FL_ABC_SEARCHSPRING_URL, { headers: { accept: 'application/json,*/*' }, timeoutMs: 25_000, signal: options.signal });
  if (!res.ok) return { signals, roadblocks: [{ state: 'FL', source: 'ABC Fine Wine & Spirits Searchspring bourbon catalog', url: FL_ABC_SEARCHSPRING_URL, status: res.status || 0, error: res.error || `HTTP ${res.status}`, nextRoute: 'Retry the public retailer search endpoint.' }] };
  let rows = [];
  try { rows = JSON.parse(res.text)?.results || []; } catch {}
  for (const row of rows) {
    if (!/^(?:1|true)$/i.test(String(row.ss_in_stock || ''))) continue;
    const rawName = htmlToText(row.name || '');
    const { match, record } = cityHiveSafeBottleMatch(rawName, bible);
    if (!record) continue;
    const price = Number(row.custom_zone_5_sale_price || row.custom_zone_5_list_price || row.price || 0) || null;
    signals.push(floridaRetailerWatch(config, record, match, { label: 'ABC Fine Wine & Spirits Searchspring bourbon availability', url: row.url ? new URL(row.url, 'https://abcfws.com').href : 'https://abcfws.com/spirits/shop-by-type/bourbon/', chain: 'abc-fine-wine-spirits', merchantId: 'abc-searchspring-p16j4k', retailer: 'ABC Fine Wine & Spirits', rawName, price, sku: row.sku, observedAt }));
  }
  return { signals, roadblocks: signals.length ? [] : [{ state: 'FL', source: 'ABC Fine Wine & Spirits Searchspring bourbon catalog', url: FL_ABC_SEARCHSPRING_URL, status: 'reachable_no_safe_inventory_rows', error: 'No safely matched in-stock allocated bourbon rows.', nextRoute: 'Keep catalog discovery active; require exact-store fulfillment before inventory alerting.' }] };
}

function floridaFirstPartyProductUrl(value, source) {
  try {
    if (!value) return null;
    const url = new URL(value, source.baseUrl);
    return url.protocol === 'https:'
      && url.hostname.toLowerCase() === new URL(source.baseUrl).hostname.toLowerCase()
      && /\/(?:shop\/)?product\//i.test(url.pathname)
      ? url.href
      : null;
  } catch {
    return null;
  }
}

async function collectFloridaCityHive(config, bible, observedAt, options = {}) {
  const signals = [];
  const roadblocks = [];
  const seenProductOptions = new Set();
  for (const source of FL_CITYHIVE_SOURCES) {
    let sourceInventoryCount = 0;
    let reachableStores = 0;
    let blocked = false;
    for (const store of source.merchants.values()) {
      options.signal?.throwIfAborted();
      if (blocked) break;
      const url = new URL(source.categoryUrl);
      url.searchParams.set('merchant-id', store.id);
      const res = await textFetch(url.href, {
        headers: { accept: 'text/html,*/*', 'user-agent': 'Mozilla/5.0' },
        timeoutMs: 24_000,
        signal: options.signal,
      });
      if (!res.ok) {
        roadblocks.push({
          state: config.id,
          source: source.sourceLabel,
          url: url.href,
          status: res.status || 0,
          error: res.error || `HTTP ${res.status}`,
          nextRoute: res.status === 429
            ? 'Stop this first-party CityHive source for the run and retry at the next bounded cadence; do not bypass retailer controls.'
            : 'Retry the exact configured CityHive merchant page at low cadence; do not use marketplace or bypass routes.',
        });
        if (res.status === 429) blocked = true;
        await sleepWithSignal(FL_CITYHIVE_PAGE_DELAY_MS, options.signal);
        continue;
      }
      const blobs = cityHiveJsonBlobs(res.text);
      if (!cityHiveHasProductPayload(blobs)) {
        roadblocks.push({
          state: config.id,
          source: source.sourceLabel,
          url: url.href,
          status: 'unrecognized_cityhive_payload',
          error: `The response for configured merchant ${store.id} did not contain a recognized CityHive products array.`,
          nextRoute: 'Inspect the first-party payload shape; do not mark the source empty or refreshed from an unrecognized response.',
        });
        await sleepWithSignal(FL_CITYHIVE_PAGE_DELAY_MS, options.signal);
        continue;
      }
      reachableStores += 1;
      for (const product of cityHiveProducts(blobs)) {
        for (const merchant of product?.merchants || []) {
          for (const option of merchant?.product_options || []) {
            if (!isBourbonRelevantProduct(product, option)) continue;
            const merchantId = String(option?.merchant_id || '');
            const configuredStore = registeredFloridaStore(source.id, merchantId);
            if (!configuredStore || merchantId !== store.id) continue;
            if (String(option?.full_address || '') !== configuredStore.address) continue;
            const productUrl = floridaFirstPartyProductUrl(option?.product_url, source);
            if (!productUrl) continue;
            const size = option?.option_params?.size;
            const sizeQuantity = Number(size?.quantity || 0) || 0;
            const sizeMeasure = String(size?.measure || '').toLowerCase();
            const sizeMl = sizeMeasure === 'l' ? sizeQuantity * 1000 : sizeMeasure === 'ml' ? sizeQuantity : null;
            if (sizeMl != null && sizeMl <= 375) continue;
            const rawName = htmlToText(option?.option_display_data?.name || product?.name || '');
            const { match, record, unsafeReason } = cityHiveSafeBottleMatch(rawName, bible);
            if (!record) continue;
            const normalized = normalizeCityHiveReportedQuantity(option?.quantity);
            if (normalized.reportedQuantity <= 0) continue;
            const productIdentity = floridaCityHiveProductIdentity(option, product);
            if (!productIdentity) continue;
            const optionKey = `${source.id}|${merchantId}|${productIdentity.productId}|${productIdentity.variantId}`;
            if (seenProductOptions.has(optionKey)) continue;
            seenProductOptions.add(optionKey);
            sourceInventoryCount += 1;
            const priceValue = Number(option?.price);
            const price = Number.isFinite(priceValue) && priceValue > 0 ? priceValue : null;
            signals.push({
              id: stableId(floridaCityHiveSignalIdentityParts({
                sourceId: source.id,
                merchantId,
                productId: productIdentity.productId,
                variantId: productIdentity.variantId,
              })),
              state: config.id,
              sourceLabel: source.sourceLabel,
              sourceUrl: productUrl,
              sourceChain: source.id,
              merchantId,
              productId: productIdentity.productId,
              variantId: productIdentity.variantId,
              rawName,
              canonicalBottleId: record.id,
              canonicalName: record.canonical,
              tier: record.tier,
              confidence: Math.max(0.82, match?.confidence || 0.5),
              eventType: 'cityhive_store_inventory_result',
              locationPrecision: 'store_level',
              locationName: configuredStore.name,
              storeName: configuredStore.name,
              storeId: `${source.id}:${merchantId}`,
              storeAddress: configuredStore.address,
              city: configuredStore.city,
              stateCode: 'FL',
              postalCode: configuredStore.zip,
              zip: configuredStore.zip,
              quantity: normalized.quantity,
              quantityIsExact: !normalized.binaryAvailability,
              reportedQuantity: normalized.reportedQuantity,
              price,
              availabilityStatus: 'in_stock',
              availabilityLabel: normalized.binaryAvailability ? 'Retailer reports available; exact count not published' : `Retailer reports ${normalized.quantity} available`,
              sourceAvailabilityVerified: true,
              observedAt,
              canAlertAsInventory: true,
              canAlertAsWatch: true,
              inventorySemantics: normalized.binaryAvailability ? 'binary_retailer_orderable_no_exact_count' : 'exact_retailer_reported_quantity',
              evidence: normalized.binaryAvailability
                ? `${source.chainName} reports ${rawName} available at ${configuredStore.address}; the high source sentinel is binary orderability, not an exact shelf count. Verify before driving.`
                : `${source.chainName} reports ${normalized.quantity} of ${rawName} at ${configuredStore.address}. Verify before driving.`,
              raw: {
                chain: source.id,
                merchantId,
                sourceAvailabilityVerified: true,
                configuredStoreIdentity: true,
                reportedQuantity: normalized.reportedQuantity,
                product: { id: product?.id, name: product?.name },
                option,
                matchGuard: unsafeReason,
              },
            });
          }
        }
      }
      await sleepWithSignal(FL_CITYHIVE_PAGE_DELAY_MS, options.signal);
    }
    if (!sourceInventoryCount) {
      roadblocks.push({
        state: config.id,
        source: source.sourceLabel,
        url: source.categoryUrl,
        status: reachableStores ? 'reachable_no_safe_inventory_rows' : 'no_recognized_store_payloads',
        error: reachableStores
          ? `Read ${reachableStores} exact configured merchant pages but no safely matched positive bourbon rows survived.`
          : 'No exact configured merchant page returned a recognized CityHive product payload.',
        nextRoute: 'Retry the exact configured merchant pages at low cadence; keep locator rows non-alertable and do not weaken merchant, address, bottle, or format guards.',
      });
    }
    await sleepWithSignal(FL_CITYHIVE_SOURCE_DELAY_MS, options.signal);
  }
  return { signals, roadblocks };
}

function isPensacolaShopifyResponse(response) {
  try {
    const url = new URL(String(response?.url || ''));
    return response?.ok === true
      && url.protocol === 'https:'
      && url.hostname.toLowerCase() === PENSACOLA_SHOPIFY_SOURCE.hostname;
  } catch {
    return false;
  }
}

export async function collectFloridaPensacolaShopify(config, bible, observedAt, options = {}) {
  const signals = [];
  const roadblocks = [];
  const productUrls = [];
  const seenProductUrls = new Set();
  for (let page = 1; page <= FL_PENSACOLA_MAX_COLLECTION_PAGES; page += 1) {
    options.signal?.throwIfAborted?.();
    const url = new URL(PENSACOLA_SHOPIFY_SOURCE.collectionUrl);
    if (page > 1) url.searchParams.set('page', String(page));
    const response = await curlTextFetch(url.href, {
      headers: { accept: 'text/html,*/*', 'user-agent': 'Mozilla/5.0 (compatible; BourbonSignal/1.0; retailer inventory verification)' },
      followRedirects: false,
      timeoutMs: 24_000,
      signal: options.signal,
    });
    if (!isPensacolaShopifyResponse(response)) {
      roadblocks.push({
        state: config.id,
        source: PENSACOLA_SHOPIFY_SOURCE.sourceLabel,
        url: url.href,
        status: response.status || 0,
        error: response.error || `HTTP ${response.status || 'unknown'} or an unapproved redirect`,
        nextRoute: response.status === 429
          ? 'Stop the first-party Shopify lane for this run and retry at the next bounded cadence; do not bypass retailer controls.'
          : 'Retry the exact first-party bourbon collection at low cadence and preserve prior rows only as centrally denied stale context.',
      });
      break;
    }
    const pageLinks = parsePensacolaShopifyCollectionLinks(response.text);
    if (!pageLinks.length) break;
    for (const productUrl of pageLinks) {
      if (seenProductUrls.has(productUrl)) continue;
      seenProductUrls.add(productUrl);
      productUrls.push(productUrl);
      if (productUrls.length >= FL_PENSACOLA_MAX_PRODUCT_PAGES) break;
    }
    if (productUrls.length >= FL_PENSACOLA_MAX_PRODUCT_PAGES) break;
    await sleepWithSignal(FL_PENSACOLA_PAGE_DELAY_MS, options.signal);
  }

  let matchedProducts = 0;
  for (const productUrl of productUrls.slice(0, FL_PENSACOLA_MAX_PRODUCT_PAGES)) {
    options.signal?.throwIfAborted?.();
    const response = await curlTextFetch(productUrl, {
      headers: { accept: 'text/html,*/*', 'user-agent': 'Mozilla/5.0 (compatible; BourbonSignal/1.0; retailer inventory verification)' },
      followRedirects: false,
      timeoutMs: 24_000,
      signal: options.signal,
    });
    if (!isPensacolaShopifyResponse(response)) {
      roadblocks.push({
        state: config.id,
        source: PENSACOLA_SHOPIFY_SOURCE.sourceLabel,
        url: productUrl,
        status: response.status || 0,
        error: response.error || `HTTP ${response.status || 'unknown'} or an unapproved redirect`,
        nextRoute: response.status === 429
          ? 'Stop product-page requests for this source until the next bounded cadence.'
          : 'Retry this exact first-party product page; do not infer availability from collection placement.',
      });
      if (response.status === 429) break;
      await sleepWithSignal(FL_PENSACOLA_PAGE_DELAY_MS, options.signal);
      continue;
    }
    const product = parsePensacolaShopifyProductPage(response.text, productUrl);
    if (!product || !isUsefulPensacolaShopifyFormat(product.rawName)) {
      await sleepWithSignal(FL_PENSACOLA_PAGE_DELAY_MS, options.signal);
      continue;
    }
    const { match, record, unsafeReason } = cityHiveSafeBottleMatch(product.rawName, bible);
    if (!record) {
      await sleepWithSignal(FL_PENSACOLA_PAGE_DELAY_MS, options.signal);
      continue;
    }
    const pickupUrl = pensacolaVariantPickupUrl(product.variantId);
    const pickupResponse = await curlTextFetch(pickupUrl, {
      headers: { accept: 'text/html,*/*' },
      userAgent: 'Mozilla/5.0 (compatible; BourbonSignal/1.0; retailer inventory verification)',
      followRedirects: false,
      timeoutMs: 24_000,
      signal: options.signal,
    });
    if (!isPensacolaShopifyResponse(pickupResponse)) {
      roadblocks.push({
        state: config.id,
        source: PENSACOLA_SHOPIFY_SOURCE.sourceLabel,
        url: pickupUrl,
        status: pickupResponse.status || 0,
        error: pickupResponse.error || `HTTP ${pickupResponse.status || 'unknown'} or an unapproved redirect`,
        nextRoute: 'Retry the exact public Shopify variant pickup section; do not infer store availability from static product-page location copy.',
      });
      if (pickupResponse.status === 429) break;
      await sleepWithSignal(FL_PENSACOLA_PAGE_DELAY_MS, options.signal);
      continue;
    }
    const storesForProduct = parsePensacolaShopifyVariantPickup(pickupResponse.text, pickupUrl, product.variantId);
    if (!storesForProduct.length) {
      await sleepWithSignal(FL_PENSACOLA_PAGE_DELAY_MS, options.signal);
      continue;
    }
    matchedProducts += 1;
    for (const store of storesForProduct) {
      signals.push({
        id: stableId(['FL', PENSACOLA_SHOPIFY_SOURCE.id, store.id, product.productId, product.variantId]),
        state: config.id,
        sourceLabel: PENSACOLA_SHOPIFY_SOURCE.sourceLabel,
        sourceUrl: productUrl,
        sourceChain: PENSACOLA_SHOPIFY_SOURCE.id,
        merchantId: store.id,
        productId: product.productId,
        variantId: product.variantId,
        sourceProductBinding: pickupUrl,
        rawName: product.rawName,
        canonicalBottleId: record.id,
        canonicalName: record.canonical,
        tier: record.tier,
        confidence: Math.max(0.84, match?.confidence || 0.5),
        eventType: 'retailer_store_inventory_result',
        locationPrecision: 'store_level',
        locationName: store.name,
        storeName: store.name,
        storeId: store.id,
        storeAddress: store.address,
        city: store.city,
        stateCode: 'FL',
        postalCode: store.zip,
        zip: store.zip,
        quantity: 0,
        quantityIsExact: false,
        price: product.price,
        availabilityStatus: 'in_stock',
        availabilityLabel: 'Retailer reports pickup available; exact count not published',
        sourceAvailabilityVerified: true,
        pickupOfferVerified: true,
        premisesVerified: true,
        observedAt,
        canAlertAsInventory: true,
        canAlertAsWatch: true,
        inventorySemantics: 'binary_retailer_orderable_no_exact_count',
        evidence: `${PENSACOLA_SHOPIFY_SOURCE.chainName} reports ${product.rawName} available for pickup at ${store.address}; exact shelf count is not published. Verify before driving.`,
        raw: {
          chain: PENSACOLA_SHOPIFY_SOURCE.id,
          merchantId: store.id,
          productId: product.productId,
          variantId: product.variantId,
          pickupVerified: true,
          variantPickupVerified: true,
          variantPickupUrl: pickupUrl,
          configuredStoreIdentity: true,
          sourceAvailabilityVerified: true,
          matchGuard: unsafeReason,
        },
      });
    }
    await sleepWithSignal(FL_PENSACOLA_PAGE_DELAY_MS, options.signal);
    if (matchedProducts >= FL_PENSACOLA_MATCH_TARGET) break;
  }
  if (!signals.length) {
    roadblocks.push({
      state: config.id,
      source: PENSACOLA_SHOPIFY_SOURCE.sourceLabel,
      url: PENSACOLA_SHOPIFY_SOURCE.collectionUrl,
      status: productUrls.length ? 'reachable_no_safe_inventory_rows' : 'no_first_party_product_links',
      error: productUrls.length
        ? `Read ${productUrls.length} bounded first-party product pages with ${matchedProducts} safe bottle matches but no exact reviewed pickup rows survived.`
        : 'The first-party bourbon collection returned no same-origin product links.',
      nextRoute: 'Retry at the next bounded cadence and keep configured store rows non-alertable; do not weaken product, pickup, store, or address identity.',
    });
  }
  return { signals, roadblocks };
}

async function collectFloridaGaspars(config, bible, observedAt, options = {}) {
  const signals = [];
  const roadblocks = [];
  const seenProducts = new Set();
  let catalogRows = 0;
  for (let page = 1; page <= FL_GASPARS_MAX_PAGES; page += 1) {
    options.signal?.throwIfAborted?.();
    const url = page === 1 ? FL_GASPARS_BOURBON_URL : `${FL_GASPARS_BOURBON_URL}page${page}.html`;
    const res = await textFetch(url, { headers: { accept: 'text/html,*/*', 'user-agent': 'Mozilla/5.0' }, timeoutMs: 25_000, signal: options.signal });
    if (!res.ok) {
      if (page === 1) roadblocks.push({ state: 'FL', source: "Gaspar's Liquor Shoppe Lightspeed store inventory", url, status: res.status || 0, error: res.error || `HTTP ${res.status}`, nextRoute: 'Retry the public Lightspeed bourbon catalog at low cadence.' });
      break;
    }
    const entries = parseLightspeedCatalogEntries(res.text);
    if (!entries.length) break;
    catalogRows += entries.length;
    for (const entry of entries) {
      if (seenProducts.has(entry.jsonUrl)) continue;
      seenProducts.add(entry.jsonUrl);
      const initial = cityHiveSafeBottleMatch(entry.title, bible);
      if (!initial.record) continue;
      if (!isAllowedHttpsHost(entry.jsonUrl, 'gasparsliquorshoppe.com')) {
        roadblocks.push({ state: 'FL', source: "Gaspar's Liquor Shoppe Lightspeed store inventory", url: FL_GASPARS_BOURBON_URL, status: 'rejected_off_domain_product_url', error: `Rejected product JSON outside the first-party Gaspar's hostname.`, nextRoute: 'Inspect the first-party catalog markup without following the off-domain URL.' });
        continue;
      }
      const detail = await textFetch(entry.jsonUrl, { redirect: 'manual', headers: { accept: 'application/json,*/*', 'user-agent': 'Mozilla/5.0' }, timeoutMs: 20_000, signal: options.signal });
      if (!detail.ok || !isAllowedHttpsHost(detail.url, 'gasparsliquorshoppe.com')) {
        roadblocks.push({ state: 'FL', source: "Gaspar's Liquor Shoppe Lightspeed store inventory", url: entry.jsonUrl, status: detail.status || 0, error: detail.error || `HTTP ${detail.status}`, nextRoute: 'Retry the public product JSON at low cadence.' });
        continue;
      }
      let inventory = null;
      try { inventory = parseLightspeedProductInventory(JSON.parse(detail.text)); } catch {}
      if (!inventory || !isUsefulBourbonSize(inventory.rawName)) continue;
      const { match, record } = cityHiveSafeBottleMatch(inventory.rawName || entry.title, bible);
      if (!record) continue;
      const sourceUrl = new URL(inventory.path || entry.jsonUrl.replace(/\?format=json$/i, ''), FL_GASPARS_BOURBON_URL).href;
      signals.push({
        id: stableId(['FL', 'gaspars-lightspeed', FL_GASPARS_STORE.id, inventory.productId]), state: 'FL',
        sourceLabel: "Gaspar's Liquor Shoppe Lightspeed store inventory", sourceUrl, sourceChain: 'gaspars-liquor-shoppe', merchantId: 'lightspeed:640576',
        rawName: inventory.rawName, canonicalBottleId: record.id, canonicalName: record.canonical, tier: record.tier,
        confidence: Math.max(0.84, match?.confidence || 0.5), eventType: 'retailer_store_inventory_result', locationPrecision: 'store_level',
        locationName: FL_GASPARS_STORE.name, storeName: FL_GASPARS_STORE.name, storeId: FL_GASPARS_STORE.id,
        storeAddress: FL_GASPARS_STORE.address, city: FL_GASPARS_STORE.city, stateCode: 'FL', postalCode: FL_GASPARS_STORE.zip, zip: FL_GASPARS_STORE.zip,
        quantity: inventory.quantity, price: inventory.price, availabilityStatus: 'in_stock', availabilityLabel: `Retailer reports ${inventory.quantity} in stock`,
        sourceAvailabilityVerified: true, observedAt, canAlertAsInventory: true, canAlertAsWatch: true,
        inventorySemantics: 'Gaspar\'s public Lightspeed product JSON publishes an exact positive stock level for its single Tampa storefront. Verify before driving.',
        evidence: `Gaspar's Lightspeed storefront reports ${inventory.rawName} with ${inventory.quantity} in stock${inventory.price ? ` at $${inventory.price.toFixed(2)}` : ''}.`,
        raw: { chain: 'gaspars-liquor-shoppe', merchantId: 'lightspeed:640576', productId: inventory.productId, sku: inventory.sku, reportedQuantity: inventory.quantity }
      });
      await sleepWithSignal(350, options.signal);
    }
    await sleepWithSignal(FL_GASPARS_DELAY_MS, options.signal);
  }
  if (!catalogRows) roadblocks.push({ state: 'FL', source: "Gaspar's Liquor Shoppe Lightspeed store inventory", url: FL_GASPARS_BOURBON_URL, status: 'reachable_no_products', error: 'No Lightspeed bourbon product cards were parsed.', nextRoute: 'Inspect the public category response shape without weakening identity guards.' });
  return { signals, roadblocks };
}

async function collectFloridaLiquorDepot(config, bible, observedAt, options = {}) {
  const res = await textFetch(FL_LIQUOR_DEPOT_URL, { headers: { accept: 'text/html,*/*', 'user-agent': 'Mozilla/5.0' }, timeoutMs: 25_000, signal: options.signal });
  if (!res.ok) return { signals: [], roadblocks: [{ state: 'FL', source: 'Liquor Depot Tampa online quantity watch', url: FL_LIQUOR_DEPOT_URL, status: res.status || 0, error: res.error || `HTTP ${res.status}`, nextRoute: 'Retry the public Squarespace shop-picks page at low cadence.' }] };
  const signals = [];
  for (const item of parseSquarespaceInventoryItems(res.text)) {
    if (!isUsefulBourbonSize(item.title)) continue;
    const { match, record } = cityHiveSafeBottleMatch(item.title, bible);
    if (!record) continue;
    const signal = floridaRetailerWatch(config, record, match, {
      label: 'Liquor Depot Tampa online quantity watch', url: new URL(item.path || FL_LIQUOR_DEPOT_URL, FL_LIQUOR_DEPOT_URL).href,
      chain: 'liquor-depot-tampa', merchantId: 'squarespace:63cf346e2314cb29f072d816', retailer: 'Liquor Depot Tampa',
      rawName: item.title, price: item.price, variantId: item.variantId, sku: item.sku, reportedQuantity: item.quantity, observedAt,
    });
    signal.locationPrecision = 'store_aggregate';
    signal.locationName = 'Liquor Depot Tampa online inventory (six stores)';
    signal.availabilityLabel = `Online inventory reports ${item.quantity} available; physical store not established`;
    signal.inventorySemantics = 'Liquor Depot publishes a positive Squarespace commerce quantity for its shared online inventory. The response does not identify which of six Tampa stores holds it, so this is watch-only and never an exact-store alert.';
    signal.evidence = `Liquor Depot Tampa reports ${item.title} with an online quantity of ${item.quantity}${item.price ? ` at $${item.price.toFixed(2)}` : ''}; verify the pickup location directly.`;
    signal.raw.reportedQuantity = item.quantity;
    signals.push(signal);
  }
  return { signals, roadblocks: signals.length ? [] : [{ state: 'FL', source: 'Liquor Depot Tampa online quantity watch', url: FL_LIQUOR_DEPOT_URL, status: 'reachable_no_safe_inventory_rows', error: 'No safely matched positive online quantity rows.', nextRoute: 'Retain the page as catalog evidence and retry without mapping chain inventory to a physical store.' }] };
}

export function buildFloridaStandaloneStoreLocationSignals(observedAt) {
  const stores = [
    {
      ...FL_MDP_STORE,
      sourceLabel: 'MDP Liquor Kissimmee Shopify store inventory',
      sourceUrl: FL_MDP_PRODUCTS_BASE_URL,
      chain: 'mdp-liquor-kissimmee',
      merchantId: 'mdp-liquor-kissimmee-shopify',
    },
    ...FLORIDA_LUEKENS_STORES.map((store) => ({
      ...store,
      sourceLabel: FL_SHOPIFY_RETAILERS[0].label,
      sourceUrl: FL_SHOPIFY_RETAILERS[0].productsUrl,
      chain: FL_SHOPIFY_RETAILERS[0].chain,
      merchantId: store.id,
    })),
    {
      ...FL_SHOPIFY_RETAILERS[1].store,
      sourceLabel: FL_SHOPIFY_RETAILERS[1].label,
      sourceUrl: FL_SHOPIFY_RETAILERS[1].productsUrl,
      chain: FL_SHOPIFY_RETAILERS[1].chain,
      merchantId: FL_SHOPIFY_RETAILERS[1].store.id,
    },
  ];
  return stores.map((store) => ({
    id: stableId(['FL', 'configured-store-location', store.chain, store.id]),
    state: 'FL',
    sourceLabel: `${store.sourceLabel} registry`,
    sourceUrl: store.sourceUrl,
    sourceChain: store.chain,
    merchantId: store.merchantId,
    rawName: store.name,
    canonicalBottleId: null,
    canonicalName: null,
    confidence: 0.82,
    eventType: 'retailer_store_location',
    locationPrecision: 'store_level',
    locationName: store.name,
    storeName: store.name,
    storeId: store.id,
    storeAddress: store.address,
    city: store.city,
    stateCode: 'FL',
    postalCode: store.zip,
    zip: store.zip,
    quantity: 0,
    observedAt,
    canAlertAsInventory: false,
    canAlertAsWatch: false,
    inventorySemantics: 'Reviewed first-party Florida retailer identity only; this stable directory row is not bottle inventory.',
    evidence: `${store.name} is registered at ${store.address} for this first-party retailer source.`,
    raw: { chain: store.chain, merchantId: store.merchantId, configuredStoreIdentity: true },
  }));
}

async function collectFlorida(config, bible, existingSignals = [], options = {}) {
  const observedAt = new Date().toISOString();
  const configuredLocations = [
    ...buildFloridaConfiguredStoreLocationSignals(observedAt),
    ...buildFloridaStandaloneStoreLocationSignals(observedAt),
    ...buildPensacolaShopifyStoreLocationSignals(observedAt),
  ];
  const laneRun = await runBoundedSourceLanes([
    { name: 'mdp', domain: 'mdp-florida', run: ({ signal }) => collectFloridaMdp(config, bible, observedAt, { ...options, signal }) },
    { name: 'target', domain: 'target.com', run: ({ signal }) => collectFloridaTarget(config, bible, observedAt, existingSignals, { ...options, signal }) },
    { name: 'shopify', domain: 'florida-shopify-group', run: ({ signal }) => collectFloridaShopifyRetailers(config, bible, observedAt, { ...options, signal }) },
    { name: 'abc', domain: 'abcfws.com', run: ({ signal }) => collectFloridaAbc(config, bible, observedAt, { ...options, signal }) },
    { name: 'cityhive', domain: 'florida-cityhive-group', run: ({ signal }) => collectFloridaCityHive(config, bible, observedAt, { ...options, signal }) },
    { name: 'pensacola-shopify', domain: 'pensacolaliquors.com', run: ({ signal }) => collectFloridaPensacolaShopify(config, bible, observedAt, { ...options, signal }) },
    { name: 'gaspars', domain: 'gasparsliquorshoppe.com', run: ({ signal }) => collectFloridaGaspars(config, bible, observedAt, { ...options, signal }) },
    { name: 'liquor-depot', domain: 'liquordepottampa.com', run: ({ signal }) => collectFloridaLiquorDepot(config, bible, observedAt, { ...options, signal }) },
  ], {
    concurrency: options.sourceConcurrency ?? FL_SOURCE_CONCURRENCY,
    signal: options.signal,
  });
  const lanes = new Map(laneRun.results.map((result) => [result.name, result.value]));
  const mdp = lanes.get('mdp');
  const target = lanes.get('target');
  const targetSignals = mergeFloridaTargetProbeHistory(existingSignals, target.signals);
  const shopify = lanes.get('shopify');
  const abc = lanes.get('abc');
  const cityHive = lanes.get('cityhive');
  const pensacolaShopify = lanes.get('pensacola-shopify');
  const liveCityHiveIds = new Set(cityHive.signals.map((signal) => signal.id));
  const retainedCityHive = freshCityHivePositiveSignals(
    existingSignals,
    FL_CITYHIVE_SOURCES.map((source) => source.id),
    observedAt,
    FL_CITYHIVE_FALLBACK_MAX_AGE_MS,
  ).filter((signal) => !liveCityHiveIds.has(signal.id))
    .map(markFloridaCityHiveFallbackNonAlertable);
  cityHive.signals.push(...retainedCityHive);
  const reconciledCityHive = reconcileCityHiveRateLimitsWithCache({
    roadblocks: cityHive.roadblocks,
    sources: FL_CITYHIVE_SOURCES,
    retainedSignals: retainedCityHive,
  });
  cityHive.roadblocks.splice(0, cityHive.roadblocks.length, ...reconciledCityHive.roadblocks);
  const gaspars = lanes.get('gaspars');
  const liquorDepot = lanes.get('liquor-depot');
  return {
    signals: [...configuredLocations, ...mdp.signals, ...targetSignals, ...shopify.signals, ...abc.signals, ...cityHive.signals, ...pensacolaShopify.signals, ...gaspars.signals, ...liquorDepot.signals],
    roadblocks: [...mdp.roadblocks, ...target.roadblocks, ...shopify.roadblocks, ...abc.roadblocks, ...cityHive.roadblocks, ...pensacolaShopify.roadblocks, ...gaspars.roadblocks, ...liquorDepot.roadblocks],
    metadata: {
      sourceConcurrency: laneRun.concurrency,
      sourceTimings: laneRun.timings,
    },
  };
}

function georgiaStoreLocator(config, source, store, observedAt) {
  return {
    id: stableId([config.id, 'cityhive-store-location', source.id, store.id]),
    state: config.id,
    sourceLabel: `${source.chainName} CityHive store locator`,
    sourceUrl: source.baseUrl,
    sourceChain: source.id,
    merchantId: store.id,
    rawName: store.name,
    canonicalBottleId: null,
    canonicalName: null,
    confidence: 0.78,
    eventType: 'retailer_store_location',
    locationPrecision: 'store_level',
    locationName: store.name,
    storeName: store.name,
    storeId: `${source.id}:${store.id}`,
    storeAddress: store.address,
    city: store.city,
    stateCode: 'GA',
    postalCode: store.zip,
    zip: store.zip,
    quantity: 0,
    observedAt,
    canAlertAsInventory: false,
    canAlertAsWatch: false,
    inventorySemantics: `${source.chainName} CityHive configuration identifies an exact Georgia retailer location. The locator row is not bottle inventory.`,
    evidence: `${source.chainName} identifies ${store.name} at ${store.address}.`,
    raw: { chain: source.id, merchantId: store.id, configuredStoreIdentity: true },
  };
}

function georgiaFirstPartyProductUrl(value, source) {
  try {
    if (!value) return null;
    const url = new URL(value, source.baseUrl);
    return url.protocol === 'https:'
      && url.hostname.toLowerCase() === new URL(source.baseUrl).hostname.toLowerCase()
      && /\/shop\/product\//i.test(url.pathname)
      ? url.href
      : null;
  } catch {
    return null;
  }
}

async function collectGeorgiaCityHive(config, bible, observedAt, options = {}) {
  const signals = [];
  const roadblocks = [];
  const seenOptions = new Set();
  for (const source of GEORGIA_CITYHIVE_SOURCES) {
    options.signal?.throwIfAborted();
    let sourceInventoryCount = 0;
    let reachableCount = 0;
    for (const store of source.merchants.values()) {
      options.signal?.throwIfAborted();
      const url = new URL(source.categoryUrl);
      url.searchParams.set('merchant-id', store.id);
      const res = await textFetch(url.href, { headers: { accept: 'text/html,*/*' }, timeoutMs: 24_000, signal: options.signal });
      if (!res.ok) {
        roadblocks.push({
          state: config.id,
          source: source.sourceLabel,
          url: url.href,
          status: res.status || 0,
          error: res.error || `HTTP ${res.status}`,
          nextRoute: res.status === 429
            ? 'Stop this first-party CityHive source for the run and retry at the next bounded cadence; do not bypass retailer controls.'
            : 'Retry the exact first-party CityHive merchant page at low cadence; do not use marketplace or bypass routes.',
        });
        if (res.status === 429) break;
        continue;
      }
      reachableCount += 1;
      signals.push(georgiaStoreLocator(config, source, store, observedAt));
      const blobs = cityHiveJsonBlobs(res.text);
      for (const product of cityHiveProducts(blobs)) {
        for (const productMerchant of product?.merchants || []) {
          for (const option of productMerchant?.product_options || []) {
            if (!isBourbonRelevantProduct(product, option)) continue;
            const merchantId = String(option?.merchant_id || '');
            if (merchantId !== store.id || !source.merchants.has(merchantId)) continue;
            if (String(option?.full_address || '') !== store.address) continue;
            const rawName = htmlToText(option?.option_display_data?.name || product?.name || '');
            const size = option?.option_params?.size;
            const formatText = [
              rawName,
              size?.quantity && size?.measure ? `${size.quantity}${size.measure}` : '',
              JSON.stringify(option?.option_params || {}),
              JSON.stringify(option?.option_display_data || {}),
            ].filter(Boolean).join(' ');
            if (!rawName || !isAllowedGeorgiaBottleFormat(formatText)) continue;
            const { match, record, unsafeReason } = cityHiveSafeBottleMatch(rawName, bible);
            if (!record || !isAllowedGeorgiaBourbonIdentity(rawName, record.canonical)) continue;
            const normalized = normalizeGeorgiaCityHiveQuantity(option?.quantity);
            if (normalized.reportedQuantity <= 0) continue;
            const productUrl = georgiaFirstPartyProductUrl(option?.product_url, source);
            if (!productUrl) continue;
            const optionKey = `${source.id}|${merchantId}|${option?.product_id || product?.id || ''}|${option?.option_id || ''}`;
            if (seenOptions.has(optionKey)) continue;
            seenOptions.add(optionKey);
            sourceInventoryCount += 1;
            const binary = normalized.binaryAvailability;
            const priceValue = Number(option?.price);
            const price = Number.isFinite(priceValue) && priceValue > 0 ? priceValue : null;
            signals.push({
              id: stableId([config.id, 'cityhive-store-inventory', source.id, merchantId, option?.option_id, normalized.reportedQuantity, option?.price]),
              state: config.id,
              sourceLabel: source.sourceLabel,
              sourceUrl: productUrl,
              sourceChain: source.id,
              merchantId,
              productId: String(option?.product_id || product?.id || ''),
              variantId: String(option?.option_id || ''),
              rawName,
              canonicalBottleId: record.id,
              canonicalName: record.canonical,
              tier: record.tier,
              confidence: Math.max(0.82, match?.confidence || 0.5),
              eventType: 'cityhive_store_inventory_result',
              locationPrecision: 'store_level',
              locationName: store.name,
              storeName: store.name,
              storeId: `${source.id}:${merchantId}`,
              storeAddress: store.address,
              city: store.city,
              stateCode: 'GA',
              postalCode: store.zip,
              zip: store.zip,
              quantity: normalized.quantity,
              quantityIsExact: normalized.quantityIsExact,
              reportedQuantity: normalized.reportedQuantity,
              price,
              availabilityStatus: 'in_stock',
              availabilityLabel: binary ? 'Retailer reports available; exact count not published' : `Retailer reports ${normalized.quantity} available`,
              sourceAvailabilityVerified: true,
              observedAt,
              canAlertAsInventory: true,
              canAlertAsWatch: true,
              inventorySemantics: binary ? 'binary_retailer_orderable_no_exact_count' : 'exact_retailer_reported_quantity',
              evidence: binary
                ? `${source.chainName} reports ${rawName} available at ${store.address}; the high source sentinel is binary orderability, not an exact shelf count. Verify before driving.`
                : `${source.chainName} reports ${normalized.quantity} of ${rawName} at ${store.address}. Verify before driving.`,
              raw: {
                chain: source.id,
                merchantId,
                sourceAvailabilityVerified: true,
                reportedQuantity: normalized.reportedQuantity,
                binaryAvailability: binary,
                product: { id: product?.id || option?.product_id || null, name: product?.name || rawName },
                option,
                matchGuard: unsafeReason,
              },
            });
          }
        }
      }
      await sleepWithSignal(GA_CITYHIVE_PAGE_DELAY_MS, options.signal);
    }
    if (reachableCount > 0 && sourceInventoryCount === 0) {
      roadblocks.push({
        state: config.id,
        source: source.sourceLabel,
        url: source.categoryUrl,
        status: source.id === 'fairington-wine-spirits' ? 'locator_only_no_products' : 'reachable_no_safe_inventory_rows',
        error: source.id === 'fairington-wine-spirits'
          ? 'The exact Fairington CityHive premises was reachable, but no product options were published; retaining locator-only evidence.'
          : 'The first-party CityHive pages were reachable, but no exact-store, safely matched Georgia bourbon inventory survived.',
        nextRoute: 'Retry the exact configured merchant pages at low cadence and keep locator/catalog rows non-alertable; do not weaken bottle, format, or geography guards.',
      });
    }
    await sleepWithSignal(GA_CITYHIVE_SOURCE_DELAY_MS, options.signal);
  }
  return { signals, roadblocks };
}

function georgiaBinaryRetailerSignal(config, store, product, bible, observedAt, sourceIdentity) {
  const { match, record, unsafeReason } = cityHiveSafeBottleMatch(product.rawName, bible);
  if (!record || !isAllowedGeorgiaBottleFormat(product.rawName) || !isAllowedGeorgiaBourbonIdentity(product.rawName, record.canonical)) return null;
  return {
    id: stableId([config.id, store.chain, store.id, product.productId, record.id]),
    state: config.id,
    sourceLabel: store.sourceLabel,
    sourceUrl: product.productUrl,
    sourceChain: store.chain,
    merchantId: store.merchantId,
    productId: product.productId,
    rawName: product.rawName,
    canonicalBottleId: record.id,
    canonicalName: record.canonical,
    tier: record.tier,
    confidence: Math.max(0.82, match?.confidence || 0.5),
    eventType: 'retailer_store_inventory_result',
    locationPrecision: 'store_level',
    locationName: store.name,
    storeName: store.name,
    storeId: store.storeId,
    storeAddress: store.address,
    city: store.city,
    stateCode: 'GA',
    postalCode: store.zip,
    zip: store.zip,
    quantity: 0,
    quantityIsExact: false,
    price: product.price,
    availabilityStatus: 'in_stock',
    availabilityLabel: 'Add to Cart available; exact count not published',
    sourceAvailabilityVerified: true,
    observedAt,
    canAlertAsInventory: true,
    canAlertAsWatch: true,
    inventorySemantics: 'binary_retailer_orderable_no_exact_count',
    evidence: `${store.name} publishes a visible Add to Cart control for ${product.rawName} at ${store.address}; exact count is not exposed. Verify before driving.`,
    raw: {
      source: sourceIdentity,
      chain: store.chain,
      merchantId: store.merchantId,
      productId: product.productId,
      quantitySemantics: 'binary_retailer_orderable_no_exact_count',
      sourceAvailabilityVerified: true,
      matchGuard: unsafeReason,
    },
  };
}

async function collectGeorgiaGoToLiquorStore(config, bible, observedAt, options = {}) {
  const signals = [];
  const roadblocks = [];
  const platformFailures = [];
  for (const store of GEORGIA_GOTOLIQUOR_STORES) {
    options.signal?.throwIfAborted();
    const res = await curlTextFetch(store.categoryUrl, { timeoutMs: 30_000, signal: options.signal });
    if (!res.ok) {
      const failure = {
        state: config.id,
        source: store.sourceLabel,
        url: store.categoryUrl,
        status: res.status || 0,
        error: res.error || `HTTP ${res.status}`,
        nextRoute: res.status === 403
          ? 'The exact first-party category page is protected. Retry at the next cadence or inspect with an ordinary browser; do not bypass anti-bot controls or use marketplace data.'
          : 'Retry the exact first-party server-rendered category page at low cadence; do not use search, pagination, cart, or store-switch routes.',
      };
      if (Number(res.status) === 403) {
        platformFailures.push(failure);
        if (platformFailures.length >= 2) break;
      } else roadblocks.push(failure);
      await sleepWithSignal(GA_GOTOLIQUOR_SOURCE_DELAY_MS, options.signal);
      continue;
    }
    const products = parseGeorgiaGoToLiquorStoreProducts(res.text, store);
    for (const product of products) {
      const signal = georgiaBinaryRetailerSignal(config, store, product, bible, observedAt, 'gotoliquorstore_server_rendered_add_to_cart');
      if (signal) signals.push(signal);
    }
    if (!products.length) roadblocks.push({
      state: config.id,
      source: store.sourceLabel,
      url: store.categoryUrl,
      status: 'reachable_no_store_bound_add_to_cart_rows',
      error: 'No server-rendered product-item block had a visible Add to Cart/GaAddtoCart control tied to the configured singleton store ID.',
      nextRoute: 'Inspect the exact first-party category response at low cadence; keep catalog-only rows non-alertable and do not use alternate query/cart/store-switch routes.',
    });
    await sleepWithSignal(GA_GOTOLIQUOR_SOURCE_DELAY_MS, options.signal);
  }
  roadblocks.push(...summarizeRepeatedPlatformFailures(platformFailures, {
    state: config.id,
    source: 'Georgia GoToLiquorStore exact-store inventory platform',
    configuredProbeCount: GEORGIA_GOTOLIQUOR_STORES.length,
    nextRoute: 'Retry two representative configured first-party store pages at the next cadence; do not bypass anti-bot controls or substitute marketplace/search evidence.',
  }));
  return { signals, roadblocks };
}

async function collectGeorgiaLightspeed(config, bible, observedAt, options = {}) {
  const signals = [];
  const roadblocks = [];
  for (const source of GEORGIA_LIGHTSPEED_STORES) {
    options.signal?.throwIfAborted();
    const res = await curlTextFetch(source.categoryUrl, { timeoutMs: 30_000, signal: options.signal });
    if (!res.ok) {
      roadblocks.push({
        state: config.id,
        source: source.sourceLabel,
        url: source.categoryUrl,
        status: res.status || 0,
        error: res.error || `HTTP ${res.status}`,
        nextRoute: 'Retry the first-party Lightspeed category page at the bounded two-second source cadence; do not use third-party marketplace data or bypass protections.',
      });
    } else {
      const products = parseGeorgiaLightspeedProducts(res.text, source);
      for (const product of products) {
        const signal = georgiaBinaryRetailerSignal(config, source, product, bible, observedAt, 'lightspeed_category_visible_add_to_cart');
        if (signal) signals.push(signal);
      }
      if (!products.length) roadblocks.push({
        state: config.id,
        source: source.sourceLabel,
        url: source.categoryUrl,
        status: 'reachable_no_visible_add_to_cart_cards',
        error: 'The first-party Lightspeed category page exposed no product cards with a visible same-host Add to cart link.',
        nextRoute: 'Inspect the public category markup without following cart routes or weakening same-host, bottle, or format guards.',
      });
    }
    await sleepWithSignal(source.delayMs, options.signal);
  }
  return { signals, roadblocks };
}

async function collectGeorgia(config, bible, options = {}) {
  const observedAt = new Date().toISOString();
  const configuredLocations = buildGeorgiaConfiguredStoreLocationSignals(observedAt);
  const laneRun = await runBoundedSourceLanes([
    { name: 'cityhive', domain: 'georgia-cityhive-group', run: ({ signal }) => collectGeorgiaCityHive(config, bible, observedAt, { ...options, signal }) },
    { name: 'lightspeed', domain: 'georgia-lightspeed-group', run: ({ signal }) => collectGeorgiaLightspeed(config, bible, observedAt, { ...options, signal }) },
    { name: 'gotoliquorstore', domain: 'georgia-gotoliquorstore-group', run: ({ signal }) => collectGeorgiaGoToLiquorStore(config, bible, observedAt, { ...options, signal }) },
  ], {
    concurrency: options.sourceConcurrency ?? GA_SOURCE_CONCURRENCY,
    signal: options.signal,
  });
  const lanes = new Map(laneRun.results.map((result) => [result.name, result.value]));
  const cityHive = lanes.get('cityhive');
  const lightspeed = lanes.get('lightspeed');
  const goToLiquorStore = lanes.get('gotoliquorstore');
  return {
    signals: [...configuredLocations, ...cityHive.signals, ...lightspeed.signals, ...goToLiquorStore.signals],
    roadblocks: [...cityHive.roadblocks, ...lightspeed.roadblocks, ...goToLiquorStore.roadblocks],
    metadata: {
      sourceConcurrency: laneRun.concurrency,
      sourceTimings: laneRun.timings,
    },
  };
}

async function collectArizona(config, bible, options = {}) {
  const observedAt = new Date().toISOString();
  const signals = [];
  const roadblocks = [];
  const seenProductOptions = new Set();
  const seenStores = new Set();
  const detailChecksBySource = new Map();

  for (const source of AZ_CITYHIVE_SOURCES) {
    const sourceMerchantIds = new Set(source.merchantIds || []);
    for (const seedUrl of source.urls) {
      for (const merchantId of source.merchantIds || []) {
        for (const url of cityHiveMerchantPageUrls(seedUrl, merchantId, AZ_CITYHIVE_MAX_PAGES)) {
          options.signal?.throwIfAborted();
          const res = await curlTextFetch(url, { headers: { accept: 'text/html,*/*' }, timeoutMs: 36_000, maxBuffer: 8 * 1024 * 1024, signal: options.signal });
          if (!res.ok) {
            roadblocks.push({
              state: config.id,
              source: source.sourceLabel,
              url,
              status: res.status || 0,
              error: res.error || `HTTP ${res.status}`,
              nextRoute: 'Retry the selected Arizona CityHive merchant page at low cadence; do not bypass retailer protection.'
            });
            await sleep(AZ_CITYHIVE_PAGE_DELAY_MS);
            continue;
          }
          const blobs = cityHiveJsonBlobs(res.text);
          const products = cityHiveProducts(blobs);
          for (const cfg of cityHiveMerchantConfigs(blobs)) {
            const merchant = cfg?.merchant || cfg;
            if (!merchant?.id || !sourceMerchantIds.has(String(merchant.id)) || seenStores.has(`${source.id}|${merchant.id}`)) continue;
            const a = cityHiveAddressParts(merchant.address || {});
            if ((a.state || '').toUpperCase() !== 'AZ' && !/,\s*AZ\s+\d{5}/i.test(a.fullAddress || '')) continue;
            seenStores.add(`${source.id}|${merchant.id}`);
            signals.push({
              id: stableId([config.id, 'cityhive-store-location', source.id, merchant.id]),
              state: config.id,
              sourceLabel: `${source.chainName} CityHive store locator`,
              sourceUrl: source.baseUrl,
              rawName: merchant.display_name || merchant.name || source.chainName,
              canonicalBottleId: null,
              canonicalName: null,
              confidence: 0.78,
              eventType: 'retailer_store_location',
              locationPrecision: 'store_level',
              locationName: merchant.display_name || merchant.name || source.chainName,
              storeName: merchant.display_name || merchant.name || source.chainName,
              storeId: `${source.id}:${merchant.id}`,
              storeAddress: a.fullAddress || [a.street, a.city, 'AZ', a.zip].filter(Boolean).join(', '),
              city: a.city || null,
              county: a.county,
              stateCode: 'AZ',
              postalCode: a.zip,
              zip: a.zip,
              lat: a.lat,
              lng: a.lng,
              quantity: 0,
              observedAt,
              canAlertAsInventory: false,
              canAlertAsWatch: false,
              inventorySemantics: `${source.chainName} CityHive configuration identifies an Arizona order-capable store. A store-location row is not bottle inventory.`,
              evidence: `${source.chainName} CityHive configuration lists ${merchant.display_name || merchant.name || source.chainName}${a.fullAddress ? ` at ${a.fullAddress}` : ''}.`,
              raw: { chain: source.id, merchant }
            });
          }

          for (const product of products) {
            for (const merchant of product.merchants || []) {
              for (const option of merchant.product_options || []) {
                const optionMerchantId = String(option.merchant_id || '');
                if (!sourceMerchantIds.has(optionMerchantId)) continue;
                const fullAddress = option.full_address || '';
                if (!/,\s*AZ\s+\d{5}/i.test(fullAddress)) continue;
                if (!isBourbonRelevantProduct(product, option)) continue;
                const reportedQuantity = Number(option.quantity || 0) || 0;
                if (reportedQuantity <= 0) continue;
                const sizeQuantity = Number(option.option_params?.size?.quantity || 0) || 0;
                const sizeMeasure = String(option.option_params?.size?.measure || '').toLowerCase();
                const sizeMl = sizeMeasure === 'l' ? sizeQuantity * 1000 : sizeMeasure === 'ml' ? sizeQuantity : null;
                if (sizeMl != null && sizeMl < 375) continue;
                // CityHive commonly uses 100 as an availability sentinel rather than a trustworthy
                // stock count. Preserve it as non-inventory watch evidence only.
                const exactQuantityKnown = reportedQuantity < 100;
                const quantity = exactQuantityKnown ? reportedQuantity : 0;
                const key = `${source.id}|${optionMerchantId}|${option.product_id}|${option.option_id}`;
                if (seenProductOptions.has(key)) continue;
                seenProductOptions.add(key);
                const rawName = option.option_display_data?.name || product.name || '';
                const { match, record, unsafeReason } = cityHiveSafeBottleMatch(rawName, bible);
                if (!record) continue;
                let detailAvailabilityVerified = false;
                let detailEvidence = null;
                const detailEligible = reportedQuantity >= 100 && ['paradise-liquor-phoenix', 'liquor-express-tempe'].includes(source.id);
                const checksUsed = detailChecksBySource.get(source.id) || 0;
                if (detailEligible && checksUsed < 4 && option.product_url && option.option_id) {
                  detailChecksBySource.set(source.id, checksUsed + 1);
                  let detailUrl = null;
                  try { detailUrl = new URL(String(option.product_url), source.baseUrl); detailUrl.searchParams.set('option-id', String(option.option_id)); } catch {}
                  if (detailUrl) {
                    const detail = await curlTextFetch(detailUrl.toString(), { headers: { accept: 'text/html,*/*' }, timeoutMs: 30_000, maxBuffer: 4 * 1024 * 1024, signal: options.signal });
                    if (detail.ok) {
                      const scripts = [...detail.text.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
                      for (const script of scripts) {
                        let parsed = null;
                        try { parsed = JSON.parse(script[1]); } catch { continue; }
                        const candidates = Array.isArray(parsed) ? parsed : [parsed];
                        const productLd = candidates.find((item) => String(item?.['@type'] || '').toLowerCase() === 'product');
                        const offer = Array.isArray(productLd?.offers) ? productLd.offers[0] : productLd?.offers;
                        let offerHost = '';
                        try { offerHost = new URL(String(offer?.seller?.url || '')).hostname.replace(/^www\./i, ''); } catch {}
                        const expectedHost = new URL(source.baseUrl).hostname.replace(/^www\./i, '');
                        const identityMatches = String(productLd?.productID || '') === String(option.option_id)
                          && String(offer?.url || '').includes(String(option.option_id))
                          && offerHost === expectedHost;
                        if (identityMatches && String(offer?.availability || '') === 'http://schema.org/InStock') {
                          detailAvailabilityVerified = true;
                          detailEvidence = { url: detailUrl.toString(), productID: productLd.productID, availability: offer.availability };
                        }
                        break;
                      }
                    }
                  }
                }
                const city = fullAddress.match(/,\s*([^,]+),\s*AZ\s+\d{5}/i)?.[1] || null;
                const zip = fullAddress.match(/\bAZ\s+(\d{5}(?:-\d{4})?)\b/i)?.[1] || null;
                const size = option.option_params?.size ? `${option.option_params.size.quantity}${option.option_params.size.measure || ''}` : null;
                const price = Number(option.price || 0) || null;
                const inventoryVerified = exactQuantityKnown || detailAvailabilityVerified;
                signals.push({
                  id: stableId([config.id, 'cityhive-store-inventory', source.id, optionMerchantId, option.option_id]),
                  state: config.id,
                  sourceLabel: source.sourceLabel,
                  sourceUrl: url,
                  sourceChain: source.id,
                  merchantId: optionMerchantId,
                  rawName,
                  canonicalBottleId: record.id,
                  canonicalName: record.canonical,
                  tier: record.tier,
                  confidence: Math.max(0.82, match?.confidence || 0.5),
                  eventType: inventoryVerified ? 'cityhive_store_inventory_result' : 'cityhive_store_catalog_watch',
                  locationPrecision: 'store_level',
                  locationName: option.merchant_name || source.chainName,
                  storeName: option.merchant_name || source.chainName,
                  storeId: `${source.id}:${optionMerchantId}`,
                  storeAddress: fullAddress,
                  city,
                  stateCode: 'AZ',
                  postalCode: zip,
                  zip,
                  lat: Number(option.coordinates?.[1]) || null,
                  lng: Number(option.coordinates?.[0]) || null,
                  quantity,
                  price,
                  availabilityStatus: inventoryVerified ? 'in_stock' : 'catalog_listed',
                  availabilityLabel: exactQuantityKnown ? 'In stock' : detailAvailabilityVerified ? 'In stock — verified product option' : 'Retailer listing — availability unverified',
                  sourceAvailabilityVerified: detailAvailabilityVerified,
                  observedAt,
                  canAlertAsInventory: inventoryVerified,
                  canAlertAsWatch: true,
                  inventorySemantics: `${source.chainName} CityHive pages embed store-level product rows and price. Finite positive quantities qualify as retailer-published inventory; for the common value 100, only an identity-matched product-detail JSON-LD InStock offer qualifies as binary availability. The sentinel is never exported as exact quantity.`,
                  evidence: exactQuantityKnown
                    ? `${source.chainName} CityHive reports ${quantity} ${size || 'unit'}${quantity === 1 ? '' : 's'} of ${rawName} at ${fullAddress}${price ? ` for $${price.toFixed(2)}` : ''}.`
                    : detailAvailabilityVerified
                      ? `${source.chainName} product-detail JSON-LD verifies the selected option for ${rawName} is InStock at ${fullAddress}${price ? ` for $${price.toFixed(2)}` : ''}; exact quantity is not published.`
                      : `${source.chainName} CityHive lists ${rawName}${size ? ` (${size})` : ''} at ${fullAddress}${price ? ` for $${price.toFixed(2)}` : ''}; the sentinel value does not prove current availability.`,
                  raw: { chain: source.id, product: { id: product.id, name: product.name, basic_category: product.basic_category }, option, reportedQuantity, detailEvidence, quantitySemantics: exactQuantityKnown ? 'exact_retailer_quantity' : detailAvailabilityVerified ? 'binary_detail_availability' : 'catalog_sentinel_unverified', matchGuard: unsafeReason }
                });
              }
            }
          }
          await sleep(AZ_CITYHIVE_PAGE_DELAY_MS);
        }
      }
    }
  }

  if (!signals.some((signal) => signal.eventType === 'cityhive_store_inventory_result')) {
    roadblocks.push({
      state: config.id,
      source: 'Arizona CityHive retailer inventory pages',
      url: AZ_CITYHIVE_SOURCES.map((source) => source.baseUrl).join(', '),
      status: 'reachable_no_safe_inventory_rows',
      error: 'Selected Arizona CityHive pages produced no positive, safely matched bourbon inventory rows.',
      nextRoute: 'Inspect embedded CityHive product JSON and exact bottle aliases; do not weaken identity or in-stock guards.'
    });
  }
  options.signal?.throwIfAborted();
  const mesaLiquor = await collectArizonaWooCommerceRetailer(config, bible, observedAt, { baseUrl: AZ_MESA_LIQUOR_BASE_URL, sourceLabel: AZ_MESA_LIQUOR_SOURCE_LABEL, chain: 'mesa-liquor', merchantId: 'mesa-liquor-woocommerce', store: AZ_MESA_LIQUOR_STORE }, options);
  const bestLiquor = await collectArizonaWooCommerceRetailer(config, bible, observedAt, { baseUrl: AZ_BEST_LIQUOR_BASE_URL, sourceLabel: AZ_BEST_LIQUOR_SOURCE_LABEL, chain: 'best-liquor-tempe', merchantId: 'best-liquor-tempe-woocommerce', store: AZ_BEST_LIQUOR_STORE }, options);
  const flagstaffLiquor = await collectArizonaFlagstaffLiquor(config, bible, observedAt, options);
  const albertsons = await collectArizonaAlbertsons(config, bible, observedAt, options);
  const target = await collectArizonaTarget(config, bible, observedAt, options);
  return {
    signals: [...signals, ...mesaLiquor.signals, ...bestLiquor.signals, ...flagstaffLiquor.signals, ...albertsons.signals, ...target.signals],
    roadblocks: [...roadblocks, ...mesaLiquor.roadblocks, ...bestLiquor.roadblocks, ...flagstaffLiquor.roadblocks, ...albertsons.roadblocks, ...target.roadblocks]
  };
}

async function collectSouthCarolinaCityHive(config, bible, observedAt) {
  const signals = [];
  const roadblocks = [];
  const cache = await readSouthCarolinaCityHiveCache();
  const cacheAgeMs = cache?.generatedAt ? Date.now() - new Date(cache.generatedAt).getTime() : Infinity;
  if (process.env.BOURBON_SIGNAL_SC_FORCE_CITYHIVE_LIVE !== '1' && cache && Number.isFinite(cacheAgeMs) && cacheAgeMs >= 0 && cacheAgeMs <= SC_CITYHIVE_CACHE_MAX_AGE_MS) {
    const cachedSignals = cachedSouthCarolinaCityHiveSignals(cache, observedAt);
    const reconciled = reconcileCityHiveRateLimitsWithCache({
      roadblocks: cache.roadblocks || [],
      sources: SC_CITYHIVE_SOURCES,
      retainedSignals: cachedSignals,
    });
    const sourceLabels = new Set(SC_CITYHIVE_SOURCES.map((source) => source.sourceLabel));
    const platformFailures = reconciled.roadblocks.filter((roadblock) =>
      sourceLabels.has(roadblock?.source) && isTerminalProbeFailure(roadblock?.status));
    const otherRoadblocks = reconciled.roadblocks.filter((roadblock) =>
      !platformFailures.includes(roadblock)
      && !(platformFailures.length && roadblock?.source === 'South Carolina CityHive retailer inventory pages'));
    return {
      signals: cachedSignals,
      roadblocks: [
        ...otherRoadblocks,
        ...summarizeRepeatedPlatformFailures(platformFailures, {
          state: config.id,
          source: 'South Carolina CityHive exact-store inventory platform',
          configuredProbeCount: SC_CITYHIVE_INVENTORY_MERCHANT_IDS.size,
          nextRoute: 'Retry two representative configured first-party merchant pages at the next live cadence; do not bypass platform controls or broaden to marketplace/search evidence.',
        }),
      ],
    };
  }

  const seenProductOptions = new Set();
  const seenStores = new Set();
  const platformFailures = [];
  const configuredProbeCount = SC_CITYHIVE_INVENTORY_MERCHANT_IDS.size;
  let reachablePageCount = 0;
  let globallyBlocked = false;
  for (const source of SC_CITYHIVE_SOURCES) {
    if (globallyBlocked) break;
    let sourceBlocked = false;
    const sourceMerchantIds = new Set((source.merchantIds || []).filter((id) => SC_CITYHIVE_INVENTORY_MERCHANT_IDS.has(id)));
    // The bourbon page already carries the high-value watch terms. Keep the default
    // request matrix to one category per merchant; broad whiskey pagination caused
    // avoidable CityHive 429s without adding proportional alert-grade coverage.
    for (const seedUrl of source.urls.slice(0, 1)) {
      for (const merchantId of sourceMerchantIds) {
        if (sourceBlocked) break;
        for (const url of cityHiveMerchantPageUrls(seedUrl, merchantId, SC_CITYHIVE_MAX_PAGES)) {
          const res = await curlTextFetch(url, { headers: { accept: 'text/html,*/*' }, timeoutMs: 36_000, maxBuffer: 8 * 1024 * 1024 });
          if (!res.ok) {
            const failure = {
              state: config.id,
              source: source.sourceLabel,
              url,
              status: res.status || 0,
              error: res.error || `HTTP ${res.status}`,
              nextRoute: 'Retry the selected South Carolina CityHive merchant-id page or inspect rendered/network calls for current product JSON shape.'
            };
            if (isTerminalProbeFailure(res.status)) {
              platformFailures.push(failure);
              sourceBlocked = true;
              globallyBlocked = platformFailures.length >= 2;
            } else roadblocks.push(failure);
            break;
          }
          reachablePageCount += 1;
          const blobs = cityHiveJsonBlobs(res.text);
          const products = cityHiveProducts(blobs);
          for (const cfg of cityHiveMerchantConfigs(blobs)) {
            const merchant = cfg?.merchant || cfg;
            if (!merchant?.id || !sourceMerchantIds.has(String(merchant.id)) || seenStores.has(`${source.id}|${merchant.id}`)) continue;
            const a = cityHiveAddressParts(merchant.address || {});
            if ((a.state || '').toUpperCase() !== 'SC' && !/,\s*SC\s+\d{5}/i.test(a.fullAddress || '')) continue;
            seenStores.add(`${source.id}|${merchant.id}`);
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
              storeAddress: a.fullAddress || [a.street, a.city, 'SC', a.zip].filter(Boolean).join(', '),
              city: a.city,
              county: a.county,
              stateCode: 'SC',
              postalCode: a.zip,
              zip: a.zip,
              lat: a.lat,
              lng: a.lng,
              quantity: 0,
              observedAt,
              canAlertAsInventory: false,
              canAlertAsWatch: false,
              inventorySemantics: `${source.chainName} CityHive store rows identify South Carolina retailer locations/order-capable branches. Store rows are not bottle inventory by themselves.`,
              evidence: `${source.chainName} CityHive configuration lists ${merchant.display_name || merchant.name}${a.fullAddress ? ` at ${a.fullAddress}` : ''}.`,
              raw: { chain: source.id, merchant }
            });
          }

          for (const product of products) {
            for (const merchant of product.merchants || []) {
              for (const option of merchant.product_options || []) {
                const optionMerchantId = String(option.merchant_id || '');
                const productId = String(option.product_id || product.id || '').trim();
                const optionId = String(option.option_id || '').trim();
                if (!sourceMerchantIds.has(optionMerchantId) || !productId || !optionId) continue;
                const fullAddress = option.full_address || '';
                if (!/,\s*SC\s+\d{5}/i.test(fullAddress)) continue;
                const rawName = option.option_display_data?.name || product.name || '';
                const candidateText = JSON.stringify({ name: rawName, productName: product.name, category: product.basic_category, tags: option.product_tags, storeTags: option.store_specific_tags, props: option.additional_properties });
                if (!isSouthCarolinaRetailerCandidate(candidateText)) continue;
                const { reportedQuantity, binaryAvailability, quantity } = normalizeCityHiveReportedQuantity(option.quantity);
                if (quantity <= 0) continue;
                const key = `${source.id}|${optionMerchantId}|${productId}|${optionId}`;
                if (seenProductOptions.has(key)) continue;
                seenProductOptions.add(key);
                const { match, record, unsafeReason } = cityHiveSafeBottleMatch(rawName, bible);
                if (!record) continue;
                const city = fullAddress.match(/,\s*([^,]+),\s*SC\s+\d{5}/i)?.[1] || null;
                const zip = fullAddress.match(/\bSC\s+(\d{5}(?:-\d{4})?)\b/i)?.[1] || null;
                const size = option.option_params?.size ? `${option.option_params.size.quantity}${option.option_params.size.measure || ''}` : null;
                const price = Number(option.price || 0) || null;
                signals.push({
                  id: stableId([config.id, 'cityhive-store-inventory', source.id, optionMerchantId, productId, optionId]),
                  state: config.id,
                  sourceLabel: source.sourceLabel,
                  sourceUrl: option.product_url || url,
                  sourceChain: source.id,
                  merchantId: optionMerchantId,
                  productId,
                  optionId,
                  variantId: optionId,
                  sourceProductProofId: productId,
                  rawName,
                  canonicalBottleId: record.id,
                  canonicalName: record.canonical,
                  confidence: Math.max(0.8, match?.confidence || 0.5),
                  eventType: 'cityhive_store_inventory_result',
                  locationPrecision: 'store_level',
                  locationName: option.merchant_name || source.chainName,
                  storeName: option.merchant_name || source.chainName,
                  storeId: `${source.id}:${optionMerchantId}`,
                  storeAddress: fullAddress,
                  city,
                  stateCode: 'SC',
                  postalCode: zip,
                  zip,
                  lat: Number(option.coordinates?.[1]) || null,
                  lng: Number(option.coordinates?.[0]) || null,
                  quantity: binaryAvailability ? 0 : quantity,
                  quantityIsExact: !binaryAvailability,
                  price,
                  availabilityStatus: binaryAvailability ? 'binary_retailer_in_stock' : 'in_stock',
                  availabilityLabel: 'In stock',
                  sourceAvailabilityVerified: true,
                  observedAt,
                  canAlertAsInventory: true,
                  canAlertAsWatch: true,
                  inventorySemantics: `${source.chainName} CityHive pages embed store-level product option availability and price for the selected South Carolina branch. A reported value of 100 is treated as a binary availability sentinel, never an exact shelf count. Treat as retailer-published pickup/order availability and ask users to verify before driving.`,
                  evidence: binaryAvailability
                    ? `${source.chainName} reports ${rawName} in stock${option.merchant_name ? ` at ${option.merchant_name}` : ''} (${fullAddress})${price ? ` for $${price.toFixed(2)}` : ''}; the retailer value ${reportedQuantity} is treated as binary availability, not an exact shelf count.`
                    : `${source.chainName} CityHive reports ${quantity} ${size || 'unit'}${quantity === 1 ? '' : 's'} of ${rawName}${option.merchant_name ? ` at ${option.merchant_name}` : ''} (${fullAddress})${price ? ` for $${price.toFixed(2)}` : ''}.`,
                  raw: { chain: source.id, reportedQuantity, binaryAvailability, product: { id: product.id, name: product.name, basic_category: product.basic_category }, option, matchGuard: unsafeReason }
                });
              }
            }
          }
          await sleep(SC_CITYHIVE_PAGE_DELAY_MS);
        }
      }
    }
  }

  roadblocks.push(...summarizeRepeatedPlatformFailures(platformFailures, {
    state: config.id,
    source: 'South Carolina CityHive exact-store inventory platform',
    configuredProbeCount,
    nextRoute: 'Retry two representative configured first-party merchant pages at the next live cadence; do not bypass platform controls or broaden to marketplace/search evidence.',
  }));
  const liveInventoryProduced = signals.some((signal) => signal.eventType === 'cityhive_store_inventory_result');
  const liveSignals = [...signals];
  const liveRoadblocks = [...roadblocks];
  if (!liveInventoryProduced) {
    if (cache) {
      signals.push(...cachedSouthCarolinaCityHiveSignals(cache, observedAt, { sourceStale: true }));
    } else if (reachablePageCount > 0) {
      roadblocks.push({
        state: config.id,
        source: 'South Carolina CityHive retailer inventory pages',
        url: SC_CITYHIVE_SOURCES.map((source) => source.baseUrl).join(', '),
        status: 'reachable_no_inventory_rows',
        error: 'Selected SC CityHive pages were reachable but no positive bourbon/whiskey store inventory rows were parsed.',
        nextRoute: 'Inspect embedded CityHive product JSON, merchant-id selection, and product_options quantity fields.'
      });
    }
  }
  if (liveInventoryProduced) await writeSouthCarolinaCityHiveCache(liveSignals, liveRoadblocks);
  const reconciled = reconcileCityHiveRateLimitsWithCache({
    roadblocks,
    sources: SC_CITYHIVE_SOURCES,
    retainedSignals: signals,
  });
  return { signals, roadblocks: reconciled.roadblocks };
}

async function fetchDaBrownBagSearch(term) {
  const url = `${SC_DA_BROWN_BAG_BASE_URL}/wp-json/moo-clover/v1/search/${encodeURIComponent(term)}`;
  const res = await textFetch(url, { headers: { accept: 'application/json,*/*' }, timeoutMs: 24_000 });
  if (!res.ok) return { ok: false, status: res.status || 0, error: res.error || `HTTP ${res.status}`, url, items: [] };
  try {
    const json = JSON.parse(res.text);
    return { ok: true, status: res.status, url, items: Array.isArray(json.items) ? json.items : [] };
  } catch (error) {
    return { ok: false, status: res.status || 0, error: error instanceof Error ? error.message : String(error), url, items: [] };
  }
}

async function collectSouthCarolinaDaBrownBag(config, bible, observedAt) {
  const signals = [southCarolinaStoreLocationSignal(config, 'Da Brown Bag Clover public inventory API', SC_DA_BROWN_BAG_BASE_URL, SC_DA_BROWN_BAG_STORE, observedAt, 'da-brown-bag')];
  const roadblocks = [];
  const seenItems = new Set();
  const failures = [];
  let successfulSearches = 0;
  let returnedRows = 0;
  for (const term of SC_DA_BROWN_BAG_SEARCH_TERMS) {
    const page = await fetchDaBrownBagSearch(term);
    if (!page.ok) {
      failures.push(page);
      continue;
    }
    successfulSearches += 1;
    returnedRows += page.items.length;
    for (const item of page.items) {
      if (!item?.uuid || seenItems.has(item.uuid)) continue;
      const rawName = item.name || item.alternate_name || '';
      if (!isSouthCarolinaRetailerCandidate(rawName)) continue;
      const quantity = Number(item.stockCount || 0) || 0;
      if (quantity <= 0 || item.forcedOutOfStock) continue;
      const { match, record, unsafeReason } = cityHiveSafeBottleMatch(rawName, bible);
      if (!record) continue;
      seenItems.add(item.uuid);
      const price = Number(item.price || 0) / 100 || null;
      signals.push({
        id: stableId([config.id, 'clover-store-inventory', SC_DA_BROWN_BAG_STORE.id, item.uuid, quantity, item.price || null]),
        state: config.id,
        sourceLabel: 'Da Brown Bag Clover public inventory API',
        sourceUrl: page.url,
        rawName,
        canonicalBottleId: record.id,
        canonicalName: record.canonical,
        confidence: Math.max(0.8, match?.confidence || 0.5),
        eventType: 'retailer_store_inventory_result',
        locationPrecision: 'store_level',
        locationName: SC_DA_BROWN_BAG_STORE.name,
        storeName: SC_DA_BROWN_BAG_STORE.name,
        storeId: `da-brown-bag:${SC_DA_BROWN_BAG_STORE.id}`,
        storeAddress: SC_DA_BROWN_BAG_STORE.address,
        city: SC_DA_BROWN_BAG_STORE.city,
        stateCode: 'SC',
        postalCode: SC_DA_BROWN_BAG_STORE.zip,
        zip: SC_DA_BROWN_BAG_STORE.zip,
        quantity,
        price,
        availabilityStatus: 'in_stock',
        availabilityLabel: 'In stock',
        observedAt,
        canAlertAsInventory: true,
        canAlertAsWatch: true,
        inventorySemantics: 'Da Brown Bag public WordPress/Clover online-order API reports per-item stockCount and price for its North Charleston store. Treat as retailer-published pickup/order availability and verify before driving.',
        evidence: `Da Brown Bag Clover API reports ${quantity} available ${rawName}${price ? ` at $${price.toFixed(2)}` : ''} at ${SC_DA_BROWN_BAG_STORE.address}.`,
        raw: { chain: 'da-brown-bag', term, item, matchGuard: unsafeReason }
      });
    }
    await sleep(250);
  }
  if (failures.length) {
    roadblocks.push({
      state: config.id,
      source: 'Da Brown Bag Clover public inventory API',
      url: failures[0].url,
      status: failures[0].status || 0,
      error: `Da Brown Bag searches failed for ${failures.length}/${SC_DA_BROWN_BAG_SEARCH_TERMS.length} terms; representative failure: ${failures[0].error || 'unparseable response'}.`,
      nextRoute: 'Retry one representative public moo-clover search endpoint or inspect the WordPress route index for endpoint changes.'
    });
  }
  if (successfulSearches > 0 && !signals.some((signal) => signal.eventType === 'retailer_store_inventory_result')) {
    roadblocks.push({
      state: config.id,
      source: 'Da Brown Bag Clover public inventory API',
      url: `${SC_DA_BROWN_BAG_BASE_URL}/wp-json/moo-clover/v1/search/bourbon`,
      status: 'reachable_no_safe_bourbon_inventory',
      error: `Da Brown Bag Clover searches returned ${returnedRows} rows but no positive safe Bourbon Signal matches survived filtering.`,
      nextRoute: 'Inspect Clover search names and add exact aliases only when identities are unambiguous.'
    });
  }
  return { signals, roadblocks };
}

function southernSpiritsProductText(product, variant) {
  return `${product?.title || ''} ${product?.product_type || ''} ${variant?.title || ''}`;
}

function southernSpiritsProductUrl(product) {
  return product?.handle ? `https://southernspirits.com/products/${product.handle}` : 'https://southernspirits.com/products';
}

export function buildSouthCarolinaSouthernSpiritsSignal(product, bible, observedAt) {
  if (!product?.id || !Array.isArray(product.variants)) return null;
  const availableVariant = product.variants.find((variant) => variant?.available === true);
  if (!availableVariant) return null;
  const candidateText = southernSpiritsProductText(product, availableVariant);
  if (!isSouthCarolinaRetailerCandidate(candidateText)) return null;
  const rawName = [product.title, availableVariant.title && !/^default title$/i.test(availableVariant.title) ? availableVariant.title : null].filter(Boolean).join(' ');
  const { match, record, unsafeReason } = cityHiveSafeBottleMatch(rawName, bible);
  if (!record) return null;
  const price = Number(availableVariant.price || 0) || null;
  return {
    id: stableId(['SC', 'shopify-store-inventory', SC_SOUTHERN_SPIRITS_STORE.id, product.id, availableVariant.id || '', price]),
    state: 'SC',
    sourceLabel: 'Southern Spirits Shopify products feed',
    sourceUrl: southernSpiritsProductUrl(product),
    sourceChain: 'southern-spirits',
    rawName,
    canonicalBottleId: record.id,
    canonicalName: record.canonical,
    productId: product.id,
    productHandle: product.handle,
    variantId: availableVariant.id,
    variantAvailable: true,
    confidence: Math.max(0.78, match?.confidence || 0.5),
    eventType: 'retailer_store_inventory_result',
    locationPrecision: 'store_level',
    locationName: SC_SOUTHERN_SPIRITS_STORE.name,
    storeName: SC_SOUTHERN_SPIRITS_STORE.name,
    storeId: `southern-spirits:${SC_SOUTHERN_SPIRITS_STORE.id}`,
    storeAddress: SC_SOUTHERN_SPIRITS_STORE.address,
    city: SC_SOUTHERN_SPIRITS_STORE.city,
    stateCode: 'SC',
    postalCode: SC_SOUTHERN_SPIRITS_STORE.zip,
    zip: SC_SOUTHERN_SPIRITS_STORE.zip,
    quantity: 0,
    storeQty: 0,
    quantityIsExact: false,
    quantitySemantics: 'binary_retailer_in_stock',
    price,
    availabilityStatus: 'in_stock',
    availabilityLabel: 'Retailer reports availability — exact quantity unavailable',
    sourceAvailabilityVerified: true,
    observedAt,
    canAlertAsInventory: true,
    canAlertAsWatch: true,
    inventorySemantics: 'Southern Spirits Shopify products feed exposes public online availability for one verified South Carolina premises, but not an exact bottle count. This is binary retailer availability; verify before driving or ordering.',
    evidence: `Southern Spirits Shopify feed reports ${rawName}${price ? ` at $${price.toFixed(2)}` : ''} available for ${SC_SOUTHERN_SPIRITS_STORE.address}; exact count is not exposed.`,
    raw: { chain: 'southern-spirits', product: { id: product.id, handle: product.handle, product_type: product.product_type, tags: product.tags }, variant: availableVariant, quantitySemantics: 'binary_retailer_in_stock', matchGuard: unsafeReason }
  };
}

async function collectSouthCarolinaSouthernSpirits(config, bible, observedAt) {
  const signals = [southCarolinaStoreLocationSignal(config, 'Southern Spirits Shopify products feed', 'https://southernspirits.com/', SC_SOUTHERN_SPIRITS_STORE, observedAt, 'southern-spirits')];
  const roadblocks = [];
  const seenProducts = new Set();
  let returnedRows = 0;
  for (let pageNumber = 1; pageNumber <= SC_SOUTHERN_SPIRITS_MAX_PAGES; pageNumber++) {
    const url = `${SC_SOUTHERN_SPIRITS_PRODUCTS_URL}&page=${pageNumber}`;
    const res = await textFetch(url, { headers: { accept: 'application/json,*/*' }, timeoutMs: 30_000 });
    if (!res.ok) {
      roadblocks.push({
        state: config.id,
        source: 'Southern Spirits Shopify products feed',
        url,
        status: res.status || 0,
        error: res.error || `HTTP ${res.status}`,
        nextRoute: 'Retry Shopify products.json or inspect storefront product JSON paths.'
      });
      break;
    }
    let products = [];
    try { products = JSON.parse(res.text)?.products || []; } catch (error) {
      roadblocks.push({ state: config.id, source: 'Southern Spirits Shopify products feed', url, status: res.status || 0, error: error instanceof Error ? error.message : String(error), nextRoute: 'Inspect Shopify products.json response shape.' });
      break;
    }
    if (!products.length) break;
    returnedRows += products.length;
    for (const product of products) {
      if (!product?.id || seenProducts.has(product.id)) continue;
      const signal = buildSouthCarolinaSouthernSpiritsSignal(product, bible, observedAt);
      if (!signal) continue;
      seenProducts.add(product.id);
      signals.push({ ...signal, state: config.id, stateCode: config.id });
    }
    await sleep(250);
  }
  if (!signals.some((signal) => signal.eventType === 'retailer_store_inventory_result')) {
    roadblocks.push({
      state: config.id,
      source: 'Southern Spirits Shopify products feed',
      url: SC_SOUTHERN_SPIRITS_PRODUCTS_URL,
      status: 'reachable_no_safe_bourbon_inventory',
      error: `Southern Spirits Shopify feed returned ${returnedRows} product rows but no available safe Bourbon Signal matches survived filtering.`,
      nextRoute: 'Inspect product titles/tags and avoid bundles, gift cards, beer, wine, and other non-bottle rows.'
    });
  }
  return { signals, roadblocks };
}

async function readSouthCarolinaPhase1Cache() {
  try {
    const cache = JSON.parse(await readFile(SC_PHASE1_ARTIFACT_PATH, 'utf8'));
    const generatedMs = new Date(cache.generatedAt || 0).getTime();
    const fresh = Number.isFinite(generatedMs) && Date.now() - generatedMs <= SC_PHASE1_CACHE_MAX_AGE_MS;
    return fresh ? { ...cache, signals: cache.signals || [], roadblocks: cache.roadblocks || [] } : null;
  } catch {
    return null;
  }
}

async function writeSouthCarolinaPhase1Cache(signals, roadblocks) {
  await mkdir(path.dirname(SC_PHASE1_ARTIFACT_PATH), { recursive: true });
  await writeFile(SC_PHASE1_ARTIFACT_PATH, JSON.stringify({
    generatedAt: new Date().toISOString(),
    source: 'South Carolina Phase 1 Myrtle Beach watch-source cache',
    cacheMaxAgeMs: SC_PHASE1_CACHE_MAX_AGE_MS,
    signalCount: signals.length,
    roadblockCount: roadblocks.length,
    signals,
    roadblocks
  }, null, 2));
}

async function readCooldown(file) {
  try {
    const payload = JSON.parse(await readFile(file, 'utf8'));
    const until = Date.parse(payload?.cooldownUntil || '');
    return Number.isFinite(until) && until > Date.now() ? payload : null;
  } catch {
    return null;
  }
}

async function writeCooldown(file, reason, backoffMs, sample = {}) {
  const now = new Date();
  const payload = {
    generatedAt: now.toISOString(),
    cooldownUntil: new Date(now.getTime() + backoffMs).toISOString(),
    reason: String(reason || 'source blocked or anti-bot challenge detected').slice(0, 500),
    sample
  };
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(payload, null, 2));
  return payload;
}

function antiBotText(text = '') {
  return /datadome|captcha|cloudflare|access denied|forbidden|rate limit|bot protection|please verify|error 1015/i.test(String(text));
}

function htmlToText(value = '') {
  return decodeHtml(String(value).replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' '));
}

function southCarolinaDunesText(value = '') {
  return htmlToText(value).replace(/\*+/g, ' ').replace(/\s+/g, ' ').trim();
}

function southCarolinaDunesIdentityText(value = '') {
  return southCarolinaDunesText(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function southCarolinaDunesNumeric(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : Number.NaN;
  if (typeof value !== 'string' || !/^\s*\d+(?:\.\d+)?\s*$/.test(value)) return Number.NaN;
  return Number(value.trim());
}

export function isSouthCarolinaDunesStoreMetadata(payload) {
  if (payload?.StatusVal !== true) return false;
  const store = payload?.Data?.StoreInfo;
  if (!store) return false;
  const address = southCarolinaDunesIdentityText([store.ADDRESS1, store.ADDRESS2, store.ADDRESS3, store.ADDRESS4].filter(Boolean).join(' '));
  const phone = String(store.PHONE || '').replace(/\D/g, '');
  return address.includes('980 cipriana drive unit a5')
    && address.includes('unit b')
    && address.includes('myrtle beach sc 29572')
    && phone === '8438080092';
}

export function isSouthCarolinaDunesStorefrontHtml(html = '') {
  const source = String(html || '');
  return /id=["']lblIsIntegratedCart["'][^>]*>\s*1\s*</i.test(source)
    && /Store_6178\/ItemImage\//i.test(source)
    && /id=["']LoadItemDescription["'][^>]+value=["']\/ListManage\/LoadItemDescription["']/i.test(source)
    && /id=["']ItemAddToCart["'][^>]+value=["']\/Item\/ItemAddToCart["']/i.test(source);
}

export function parseSouthCarolinaDunesItemDetail(payload, { searchRow } = {}) {
  if (payload?.StatusVal !== true || !searchRow) return null;
  const item = payload?.Data?.objItem;
  if (!item) return null;
  const sku = String(item.SKU ?? '').trim();
  if (!sku || sku !== String(searchRow.ID ?? '').trim()) return null;
  const itemName = southCarolinaDunesText(item.ITEMNAME);
  const searchIdentity = southCarolinaDunesIdentityText(searchRow.label || searchRow.value);
  const itemIdentity = southCarolinaDunesIdentityText(itemName);
  if (!itemIdentity || !searchIdentity.includes(itemIdentity)) return null;
  const department = southCarolinaDunesText(item.DEPNAME);
  const category = southCarolinaDunesText(item.CATNAME);
  if (department.toLowerCase() !== 'spirits' || !/^(bourbon|whiskey)$/i.test(category)) return null;
  if (/\b(cream|liqueur|cordial|cocktail|ready to drink|vodka|gin|rum|tequila|mezcal|brandy|cognac|wine|beer|stout|bundle|gift card|syrup|mix(?:er|ters)?|nips?|mini(?:ature)?s?)\b|\b\d+\s*(?:pk|pack)\b/i.test(itemName)) return null;
  const quantity = southCarolinaDunesNumeric(item.INSTOREQTY);
  const price = southCarolinaDunesNumeric(item.PRICEPERUNIT);
  if (!Number.isSafeInteger(quantity) || quantity <= 0 || item.IsOutOfStock !== false || !Number.isFinite(price) || price <= 0) return null;
  const size = southCarolinaDunesText(item.SIZEPACK);
  const sizeMatch = size.match(/^(\d+(?:\.\d+)?)\s*(ml|l|oz)(?:\s*\|\s*single)?$/i);
  if (!sizeMatch) return null;
  const sizeAmount = Number(sizeMatch[1]);
  const sizeUnit = sizeMatch[2].toLowerCase();
  const sizeMl = sizeUnit === 'l' ? sizeAmount * 1_000 : sizeUnit === 'oz' ? sizeAmount * 29.5735 : sizeAmount;
  if (!Number.isFinite(sizeMl) || sizeMl < 375 || sizeMl > 1_750) return null;
  const normalizedSize = size.replace(/\s*\|\s*single$/i, '').replace(/\s+/g, '');
  return {
    sku,
    rawName: `${itemName} ${normalizedSize}`,
    quantity,
    price,
    size: normalizedSize,
    department,
    category,
    itemUrl: `${SC_DUNES_BASE_URL}/ListManage/ItemDescriptionPage?ItemID=${encodeURIComponent(sku)}`,
    quantitySemantics: 'exact_retailer_in_store_quantity',
    sourceAvailabilityVerified: true,
    premisesVerified: true,
    pickupOfferVerified: true,
    orderabilityOfferVerified: true,
  };
}

export function buildSouthCarolinaDunesSignal(config, row, { observedAt, record, match } = {}) {
  if (!row || !record?.id || !record?.canonical || !observedAt) return null;
  const id = stableId([config?.id || 'SC', SC_DUNES_RUNTIME_ID, row.sku]);
  return {
    id,
    key: id,
    state: config?.id || 'SC',
    displayState: config?.id || 'SC',
    sourceUrl: row.itemUrl,
    sourceLabel: SC_DUNES_SOURCE_LABEL,
    sourceRuntimeId: SC_DUNES_RUNTIME_ID,
    eventType: 'retailer_store_inventory_result',
    rawName: row.rawName,
    canonicalBottleId: record.id,
    bottleId: record.id,
    canonicalName: record.canonical,
    tier: record.tier,
    confidence: Math.min(0.98, Math.max(0.86, match?.confidence || 0.86)),
    sourceMatchStatus: 'bottle_bible_match',
    quantity: row.quantity,
    storeQty: row.quantity,
    quantityIsExact: true,
    quantitySemantics: row.quantitySemantics,
    price: row.price,
    availabilityStatus: 'in_stock',
    availabilityLabel: `Retailer reports ${row.quantity} in store`,
    sourceAvailabilityVerified: row.sourceAvailabilityVerified,
    premisesVerified: row.premisesVerified,
    pickupOfferVerified: row.pickupOfferVerified,
    orderabilityOfferVerified: row.orderabilityOfferVerified,
    deliveryOfferVerified: false,
    fulfillmentGuaranteed: false,
    locationPrecision: 'store_level',
    locationName: SC_DUNES_STORE.name,
    storeName: SC_DUNES_STORE.name,
    storeId: `dunes-liquor:${SC_DUNES_STORE.id}`,
    storeAddress: SC_DUNES_STORE.address,
    city: SC_DUNES_STORE.city,
    stateCode: config?.id || 'SC',
    postalCode: SC_DUNES_STORE.zip,
    zip: SC_DUNES_STORE.zip,
    observedAt,
    fetchedAt: observedAt,
    canAlertAsInventory: true,
    canAlertAsWatch: true,
    dataLane: 'inventory',
    inventorySemantics: 'Dunes Liquor public integrated-cart storefront reports an exact positive in-store quantity and price for its identity-bound Myrtle Beach premises. Treat as retailer-published pickup/order availability and verify before driving; delivery and fulfillment are not guaranteed.',
    evidence: `Dunes Liquor item detail reports exact in-store quantity ${row.quantity} of ${row.rawName} at ${SC_DUNES_STORE.address} for $${row.price.toFixed(2)}; the response is bound to runtime store 6178 and its public integrated cart.`,
    raw: {
      chain: 'dunes-liquor',
      leafSourceRuntimeId: SC_DUNES_RUNTIME_ID,
      runtimeStoreId: SC_DUNES_RUNTIME_STORE_ID,
      sku: row.sku,
      category: row.category,
      department: row.department,
      size: row.size,
      quantitySemantics: row.quantitySemantics,
      integratedCartVerified: true,
      deliveryOfferVerified: false,
      fulfillmentGuaranteed: false,
    },
  };
}

function wcStoreApiPrice(prices) {
  const raw = Number(prices?.price || 0);
  const minor = Number(prices?.currency_minor_unit ?? 2);
  if (!raw) return null;
  return raw / Math.pow(10, Number.isFinite(minor) ? minor : 2);
}

function phase1CatalogSignal(config, sourceLabel, sourceUrl, store, rawName, bible, observedAt, extra = {}) {
  const { match, record, unsafeReason } = cityHiveSafeBottleMatch(rawName, bible);
  const sourceMatchStatus = record ? 'bottle_bible_match' : unsafeReason ? `source_name_kept:${unsafeReason}` : 'source_name_kept:no_safe_bible_match';
  return {
    id: stableId([config.id, extra.eventType || 'retailer-product-catalog', sourceUrl, rawName]),
    state: config.id,
    sourceLabel,
    sourceUrl,
    rawName,
    canonicalBottleId: record?.id || null,
    canonicalName: record?.canonical || titleCase(rawName),
    confidence: record ? Math.max(0.58, match?.confidence || 0.45) : 0.35,
    eventType: extra.eventType || 'retailer_product_catalog_signal',
    locationPrecision: 'store_level',
    locationName: store.name,
    storeName: store.name,
    storeId: configuredStoreId(extra.raw?.chain, store),
    storeAddress: store.address,
    city: store.city,
    stateCode: 'SC',
    postalCode: store.zip,
    zip: store.zip,
    quantity: 0,
    observedAt,
    canAlertAsInventory: false,
    canAlertAsWatch: Boolean(extra.canAlertAsWatch),
    inventorySemantics: extra.inventorySemantics || 'Retailer public catalog/watch page only. This is not live shelf inventory and should not trigger inventory alerts without a verified stock/count source.',
    evidence: extra.evidence || `${sourceLabel} publicly lists ${rawName}. Treat as Myrtle Beach retailer watch/catalog intelligence, not verified store inventory.`,
    raw: { sourceMatchStatus, unsafeReason: unsafeReason || null, ...(extra.raw || {}) }
  };
}

async function collectSouthCarolinaLiquorStoreNearMe(config, bible, observedAt) {
  const signals = [southCarolinaStoreLocationSignal(config, 'Liquor Store Near Me Myrtle Beach WooCommerce catalog', SC_LIQUOR_STORE_NEAR_ME_BASE_URL, SC_LIQUOR_STORE_NEAR_ME_STORE, observedAt, 'liquor-store-near-me-myrtle-beach')];
  const roadblocks = [];
  const seen = new Set();
  let returnedRows = 0;
  for (const term of SC_LIQUOR_STORE_NEAR_ME_TERMS) {
    const url = `${SC_LIQUOR_STORE_NEAR_ME_BASE_URL}/wp-json/wc/store/products?search=${encodeURIComponent(term)}&per_page=20`;
    const res = await textFetch(url, { headers: { accept: 'application/json,*/*' }, timeoutMs: 18_000 });
    if (!res.ok) {
      roadblocks.push({ state: config.id, source: 'Liquor Store Near Me Myrtle Beach WooCommerce catalog', url, status: res.status || 0, error: res.error || `HTTP ${res.status}`, nextRoute: 'Retry the public WooCommerce Store API slowly; do not promote to inventory alerts without stock/price validation.' });
      await sleep(SC_PHASE1_DELAY_MS);
      continue;
    }
    let products = [];
    try { products = JSON.parse(res.text); } catch (error) {
      roadblocks.push({ state: config.id, source: 'Liquor Store Near Me Myrtle Beach WooCommerce catalog', url, status: res.status || 0, error: error instanceof Error ? error.message : String(error), nextRoute: 'Inspect WooCommerce Store API response shape.' });
      continue;
    }
    if (!Array.isArray(products)) continue;
    returnedRows += products.length;
    for (const product of products) {
      const rawName = htmlToText(product?.name || '');
      if (!rawName || seen.has(product.id || rawName)) continue;
      if (!isSouthCarolinaRetailerCandidate(rawName)) continue;
      seen.add(product.id || rawName);
      const price = wcStoreApiPrice(product?.prices);
      signals.push(phase1CatalogSignal(config, 'Liquor Store Near Me Myrtle Beach WooCommerce catalog', product?.permalink || url, SC_LIQUOR_STORE_NEAR_ME_STORE, rawName, bible, observedAt, {
        evidence: `Liquor Store Near Me Myrtle Beach WooCommerce Store API lists ${rawName}${product?.is_in_stock ? ' with an in-stock catalog flag' : ''}${price ? ` at $${price.toFixed(2)}` : ''}. Price/count are not reliable enough for inventory alerts yet.`,
        raw: { chain: 'liquor-store-near-me-myrtle-beach', term, product: { id: product?.id, is_in_stock: product?.is_in_stock, low_stock_remaining: product?.low_stock_remaining, prices: product?.prices, add_to_cart: product?.add_to_cart } }
      }));
    }
    await sleep(SC_PHASE1_DELAY_MS);
  }
  if (signals.length <= 1) roadblocks.push({ state: config.id, source: 'Liquor Store Near Me Myrtle Beach WooCommerce catalog', url: `${SC_LIQUOR_STORE_NEAR_ME_BASE_URL}/wp-json/wc/store/products`, status: 'reachable_no_safe_catalog_rows', error: `WooCommerce product searches returned ${returnedRows} rows but no safe Bourbon Signal catalog matches.`, nextRoute: 'Inspect product names and keep this source watch-only until inventory semantics are verified.' });
  return { signals, roadblocks };
}

async function collectSouthCarolinaBurntBarrel(config, bible, observedAt) {
  const signals = [southCarolinaStoreLocationSignal(config, 'Burnt Barrel Wine & Spirits event/watch pages', SC_BURNT_BARREL_BASE_URL, SC_BURNT_BARREL_STORE, observedAt, 'burnt-barrel-wine-and-spirits')];
  const roadblocks = [];
  const urls = [
    `${SC_BURNT_BARREL_BASE_URL}/wp-json/tribe/events/v1/events?search=bourbon&per_page=5`,
    `${SC_BURNT_BARREL_BASE_URL}/wp-json/wp/v2/posts?search=bourbon&per_page=5`
  ];
  for (const url of urls) {
    const res = await textFetch(url, { headers: { accept: 'application/json,text/html,*/*' }, timeoutMs: 18_000 });
    if (!res.ok || antiBotText(res.text)) {
      roadblocks.push({ state: config.id, source: 'Burnt Barrel Wine & Spirits event/watch pages', url, status: res.status || 0, error: antiBotText(res.text) ? 'Anti-bot/challenge or non-JSON response; source kept in low-cadence watch mode.' : (res.error || `HTTP ${res.status}`), nextRoute: 'Retry public WordPress/Event Calendar endpoints slowly; browser discovery only during maintenance window.' });
      await sleep(SC_PHASE1_DELAY_MS);
      continue;
    }
    let payload = null;
    try { payload = JSON.parse(res.text); } catch (error) {
      roadblocks.push({ state: config.id, source: 'Burnt Barrel Wine & Spirits event/watch pages', url, status: res.status || 0, error: error instanceof Error ? error.message : String(error), nextRoute: 'Inspect endpoint response; keep source watch-only.' });
      continue;
    }
    const rows = Array.isArray(payload) ? payload : Array.isArray(payload?.events) ? payload.events : [];
    for (const row of rows) {
      const title = htmlToText(row?.title?.rendered || row?.title || row?.name || '');
      const text = htmlToText(`${title} ${row?.description || row?.excerpt?.rendered || ''}`);
      if (!/bourbon|whiskey|tasting|barrel|allocated|release/i.test(text)) continue;
      const matches = bible.scanText(text);
      signals.push(phase1CatalogSignal(config, 'Burnt Barrel Wine & Spirits event/watch pages', row?.url || row?.link || url, SC_BURNT_BARREL_STORE, title || 'Burnt Barrel bourbon event', bible, observedAt, {
        eventType: 'retailer_event_watch_signal',
        canAlertAsWatch: matches.length > 0 || /bourbon|tasting|barrel|allocated|release/i.test(text),
        inventorySemantics: 'Retailer event/post watch signal only. This is not store inventory and should not trigger inventory alerts.',
        evidence: `Burnt Barrel public ${url.includes('/events/') ? 'event' : 'post'} endpoint mentions ${title || 'a bourbon/whiskey event or watch item'}.`,
        raw: { chain: 'burnt-barrel-wine-and-spirits', matchedBottles: matches.slice(0, 10).map((m) => ({ id: m.id, name: m.canonical, tier: m.tier })), row: { id: row?.id, title, start_date: row?.start_date, link: row?.url || row?.link } }
      }));
    }
    await sleep(SC_PHASE1_DELAY_MS);
  }
  return { signals, roadblocks };
}

async function collectSouthCarolinaOwensTether(config, bible, observedAt) {
  const signals = [southCarolinaStoreLocationSignal(config, 'Owens Liquors guarded CityHive discovery', SC_OWENS_BASE_URL, SC_OWENS_STORE, observedAt, 'owens-liquors')];
  const roadblocks = [];
  const cooldown = await readCooldown(SC_OWENS_COOLDOWN_FILE);
  if (cooldown && process.env.BOURBON_SIGNAL_SC_FORCE_OWENS_LIVE !== '1') {
    roadblocks.push({ state: config.id, source: 'Owens Liquors guarded CityHive discovery', url: SC_OWENS_COOLDOWN_FILE, status: 'cooldown_previous_state_reused', error: `Owens appears protected; cooldown active until ${cooldown.cooldownUntil}.`, nextRoute: 'Use browser/CDP or maintenance-window discovery only after cooldown; do not repeatedly fetch DataDome-protected pages.' });
    return { signals, roadblocks };
  }
  const url = SC_OWENS_SEED_URLS[0];
  const res = await curlTextFetch(url, { timeoutMs: 12_000, maxBuffer: 1024 * 1024 });
  if (!res.ok || antiBotText(res.text)) {
    const reason = antiBotText(res.text) ? 'Owens returned DataDome/CAPTCHA/anti-bot challenge' : (res.error || `HTTP ${res.status}`);
    const nextCooldown = await writeCooldown(SC_OWENS_COOLDOWN_FILE, reason, SC_OWENS_BLOCKED_BACKOFF_MS, { url, status: res.status });
    roadblocks.push({ state: config.id, source: 'Owens Liquors guarded CityHive discovery', url, status: res.status || 0, error: `${reason}; cooldown until ${nextCooldown.cooldownUntil}.`, nextRoute: 'Do not hammer Owens. Use a single browser/CDP discovery pass in a maintenance window to extract CityHive merchant IDs, then rely on cached low-cadence inventory.' });
    return { signals, roadblocks };
  }
  const blobs = cityHiveJsonBlobs(res.text);
  const products = cityHiveProducts(blobs);
  let parsed = 0;
  for (const product of products.slice(0, 20)) {
    const rawName = product.name || '';
    if (!isSouthCarolinaRetailerCandidate(rawName)) continue;
    parsed += 1;
    signals.push(phase1CatalogSignal(config, 'Owens Liquors guarded CityHive discovery', product.url || url, SC_OWENS_STORE, rawName, bible, observedAt, { raw: { chain: 'owens-liquors', product: { id: product.id, name: product.name } } }));
  }
  if (!parsed) roadblocks.push({ state: config.id, source: 'Owens Liquors guarded CityHive discovery', url, status: res.status || 200, error: 'Owens seed page was reachable but did not expose parseable CityHive product inventory in the expected shape.', nextRoute: 'Inspect rendered/browser network once, then add merchant IDs only if public CityHive JSON is stable.' });
  return { signals, roadblocks };
}

async function collectSouthCarolinaPhase1Myrtle(config, bible, observedAt) {
  const cache = await readSouthCarolinaPhase1Cache();
  if (cache && process.env.BOURBON_SIGNAL_SC_FORCE_PHASE1_LIVE !== '1') {
    const configuredStores = new Map([
      ['liquor-store-near-me-myrtle-beach', SC_LIQUOR_STORE_NEAR_ME_STORE],
      ['burnt-barrel-wine-and-spirits', SC_BURNT_BARREL_STORE],
      ['owens-liquors', SC_OWENS_STORE],
    ]);
    return {
      signals: cache.signals.map((signal) => {
        const cachedSignal = {
          ...signal,
          observedAt: cache.generatedAt || signal.observedAt || observedAt,
          raw: { ...(signal.raw || {}), cacheFallback: true, cacheGeneratedAt: cache.generatedAt, artifactPath: SC_PHASE1_ARTIFACT_PATH },
        };
        const chain = cachedSignal.raw?.chain;
        const store = configuredStores.get(chain);
        return store ? attachConfiguredStoreIdentity(cachedSignal, chain, store, 'SC') : cachedSignal;
      }),
      roadblocks: cache.roadblocks || [],
    };
  }
  const liquorStoreNearMe = await collectSouthCarolinaLiquorStoreNearMe(config, bible, observedAt);
  const burntBarrel = await collectSouthCarolinaBurntBarrel(config, bible, observedAt);
  const owens = await collectSouthCarolinaOwensTether(config, bible, observedAt);
  const signals = [...liquorStoreNearMe.signals, ...burntBarrel.signals, ...owens.signals];
  const roadblocks = [...liquorStoreNearMe.roadblocks, ...burntBarrel.roadblocks, ...owens.roadblocks];
  await writeSouthCarolinaPhase1Cache(signals, roadblocks);
  return { signals, roadblocks };
}

export async function readBoundedSouthCarolinaDunesResponse(response, {
  url = 'unknown',
  maxBytes = SC_DUNES_JSON_MAX_BYTES,
} = {}) {
  const declaredBytes = Number(response.headers?.get?.('content-length'));
  if (Number.isFinite(declaredBytes) && declaredBytes > maxBytes) {
    await response.body?.cancel?.().catch(() => {});
    throw new Error(`Dunes response from ${url} declared ${declaredBytes} bytes; maximum is ${maxBytes}`);
  }
  if (!response.body?.getReader) {
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > maxBytes) throw new Error(`Dunes response from ${url} exceeded ${maxBytes} bytes`);
    return text;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new Error(`Dunes response from ${url} exceeded ${maxBytes} bytes`);
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return text;
  } finally {
    reader.releaseLock?.();
  }
}

async function southCarolinaDunesTextFetch(url, options = {}) {
  const timeoutMs = Number(options.timeoutMs || 24_000);
  const controller = new AbortController();
  const timeout = timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null;
  const signals = [controller.signal, options.signal].filter(Boolean);
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      headers: {
        'user-agent': 'Mozilla/5.0 (BourbonSignal source-health)',
        accept: 'text/html,application/json,*/*',
        ...(options.headers || {}),
      },
      method: options.method || 'GET',
      body: options.body,
      signal: signals.length > 1 ? AbortSignal.any(signals) : controller.signal,
    });
    const text = await readBoundedSouthCarolinaDunesResponse(response, {
      url: response.url || url,
      maxBytes: options.maxBytes || SC_DUNES_JSON_MAX_BYTES,
    });
    return { ok: response.ok, status: response.status, url: response.url || url, contentType: response.headers.get('content-type') || '', text, error: null };
  } catch (error) {
    if (options.signal?.aborted) throw error;
    return { ok: false, status: 0, url, contentType: '', text: '', error: error instanceof Error ? error.message : String(error) };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function southCarolinaDunesJson(fetcher, pathName, body, timeoutMs = 24_000) {
  const url = `${SC_DUNES_BASE_URL}${pathName}`;
  const res = await fetcher(url, {
    method: 'POST',
    headers: { accept: 'application/json,*/*', 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
    timeoutMs,
    maxBytes: SC_DUNES_JSON_MAX_BYTES,
  });
  if (!res.ok) return { ok: false, status: res.status || 0, url, error: res.error || `HTTP ${res.status}`, payload: null };
  if (Buffer.byteLength(String(res.text || ''), 'utf8') > SC_DUNES_JSON_MAX_BYTES) {
    return { ok: false, status: res.status || 0, url, error: `Dunes JSON response exceeded the ${SC_DUNES_JSON_MAX_BYTES}-byte maximum body.`, payload: null };
  }
  try {
    return { ok: true, status: res.status, url, error: null, payload: JSON.parse(res.text) };
  } catch (error) {
    return { ok: false, status: res.status || 0, url, error: error instanceof Error ? error.message : String(error), payload: null };
  }
}

export function isFreshSouthCarolinaDunesCacheTimestamp(generatedAt, nowMs = Date.now()) {
  const generatedMs = Date.parse(String(generatedAt || ''));
  const ageMs = nowMs - generatedMs;
  return Number.isFinite(generatedMs)
    && ageMs >= -5 * 60_000
    && ageMs <= SC_DUNES_CACHE_MAX_AGE_MS;
}

export function isReusableSouthCarolinaDunesCache(payload, nowMs = Date.now()) {
  if (!isFreshSouthCarolinaDunesCacheTimestamp(payload?.generatedAt, nowMs) || !Array.isArray(payload?.signals)) return false;
  const inventory = payload.signals.filter((signal) => signal?.eventType === 'retailer_store_inventory_result');
  return inventory.length > 0
    && inventory.every((signal) => signal?.raw?.leafSourceRuntimeId === SC_DUNES_RUNTIME_ID);
}

export async function collectSouthCarolinaDunes(config, bible, observedAt, options = {}) {
  const fetcher = options.fetcher || southCarolinaDunesTextFetch;
  const sleepFn = options.sleepFn || sleep;
  const useCache = options.useCache !== false && process.env.BOURBON_SIGNAL_SC_FORCE_DUNES_LIVE !== '1';
  const persistCache = options.persistCache !== false;
  const maxItems = Math.max(1, Math.min(SC_DUNES_MAX_ITEMS, Number(options.maxItems) || SC_DUNES_MAX_ITEMS));
  const detailConcurrency = Math.max(1, Math.min(SC_DUNES_DETAIL_CONCURRENCY, Number(options.detailConcurrency) || SC_DUNES_DETAIL_CONCURRENCY));
  const searchTerms = (options.searchTerms || SC_DUNES_SEARCH_TERMS).slice(0, SC_DUNES_SEARCH_TERMS.length);
  const matchBottle = options.matchBottle || ((rawName) => cityHiveSafeBottleMatch(rawName, bible));

  if (useCache) {
    try {
      const cached = JSON.parse(await readFile(SC_DUNES_ARTIFACT_PATH, 'utf8'));
      if (isReusableSouthCarolinaDunesCache(cached)) {
        return {
          signals: cached.signals.map((signal) => ({ ...signal, observedAt: cached.generatedAt, fetchedAt: observedAt, raw: { ...(signal.raw || {}), cacheFallback: true, cacheGeneratedAt: cached.generatedAt } })),
          roadblocks: cached.roadblocks || [],
        };
      }
    } catch {}
  }

  const roadblocks = [];
  const storefront = await fetcher(SC_DUNES_BASE_URL, { headers: { accept: 'text/html,*/*' }, timeoutMs: 24_000, maxBytes: SC_DUNES_STOREFRONT_MAX_BYTES });
  const storefrontTooLarge = Buffer.byteLength(String(storefront.text || ''), 'utf8') > SC_DUNES_STOREFRONT_MAX_BYTES;
  if (!storefront.ok || storefrontTooLarge || !isSouthCarolinaDunesStorefrontHtml(storefront.text)) {
    return {
      signals: [],
      roadblocks: [{ state: config.id, source: SC_DUNES_SOURCE_LABEL, url: SC_DUNES_BASE_URL, status: storefront.status || 'identity_mismatch', error: storefrontTooLarge ? `Dunes storefront exceeded the ${SC_DUNES_STOREFRONT_MAX_BYTES}-byte maximum body.` : storefront.error || 'Dunes storefront did not preserve the integrated-cart and runtime-store-6178 identity markers.', nextRoute: 'Inspect the public storefront and item-control routes; do not emit inventory until both runtime and cart markers match.' }],
    };
  }

  const metadata = await southCarolinaDunesJson(fetcher, '/Home/LoadBasicData', {});
  if (!metadata.ok || !isSouthCarolinaDunesStoreMetadata(metadata.payload)) {
    return {
      signals: [],
      roadblocks: [{ state: config.id, source: SC_DUNES_SOURCE_LABEL, url: metadata.url, status: metadata.status || 'identity_mismatch', error: metadata.error || 'Dunes public store metadata did not match the reviewed Myrtle Beach address and phone.', nextRoute: 'Re-verify the exact premises from first-party store metadata before collecting bottle rows.' }],
    };
  }

  const signals = [southCarolinaStoreLocationSignal(config, SC_DUNES_SOURCE_LABEL, SC_DUNES_BASE_URL, SC_DUNES_STORE, observedAt, 'dunes-liquor')];
  const searchRows = new Map();
  let searchFailureCount = 0;
  for (const term of searchTerms) {
    const search = await southCarolinaDunesJson(fetcher, '/Home/GetSearchResult', { SearchTerm: term });
    if (!search.ok || search.payload?.StatusVal !== true || !Array.isArray(search.payload?.Data?.lstFilterResult)) {
      searchFailureCount += 1;
    } else {
      for (const row of search.payload.Data.lstFilterResult) {
        const sku = String(row?.ID ?? '').trim();
        if (sku && /^\d+$/.test(sku) && !searchRows.has(sku)) searchRows.set(sku, row);
      }
    }
    if (SC_DUNES_DELAY_MS > 0) await sleepFn(SC_DUNES_DELAY_MS);
  }
  if (searchFailureCount) {
    roadblocks.push({ state: config.id, source: SC_DUNES_SOURCE_LABEL, url: `${SC_DUNES_BASE_URL}/Home/GetSearchResult`, status: 'partial_search_failure', error: `${searchFailureCount} of ${searchTerms.length} bounded Dunes search requests failed or returned malformed data.`, nextRoute: 'Retry the same bounded public search cohort; do not broaden request volume.' });
  }

  const rows = [...searchRows.values()].slice(0, maxItems);
  let detailFailureCount = 0;
  for (let offset = 0; offset < rows.length; offset += detailConcurrency) {
    const chunk = rows.slice(offset, offset + detailConcurrency);
    const details = await Promise.all(chunk.map(async (searchRow) => ({
      searchRow,
      detail: await southCarolinaDunesJson(fetcher, '/ListManage/LoadItemDescription', { SKU: searchRow.ID, CUSTOMER_ID: null }),
    })));
    for (const { searchRow, detail } of details) {
      if (!detail.ok) {
        detailFailureCount += 1;
        continue;
      }
      const parsed = parseSouthCarolinaDunesItemDetail(detail.payload, { searchRow });
      if (!parsed || !isSouthCarolinaRetailerCandidate(parsed.rawName)) continue;
      const { match, record } = matchBottle(parsed.rawName) || {};
      if (!record) continue;
      const signal = buildSouthCarolinaDunesSignal(config, parsed, { observedAt, record, match });
      if (signal) signals.push(signal);
    }
    if (SC_DUNES_DELAY_MS > 0) await sleepFn(SC_DUNES_DELAY_MS);
  }
  if (detailFailureCount) {
    roadblocks.push({ state: config.id, source: SC_DUNES_SOURCE_LABEL, url: `${SC_DUNES_BASE_URL}/ListManage/LoadItemDescription`, status: 'partial_detail_failure', error: `${detailFailureCount} of ${rows.length} bounded Dunes item-detail requests failed.`, nextRoute: 'Retry only the reviewed SKU cohort at the next cadence.' });
  }
  if (!signals.some((signal) => signal.eventType === 'retailer_store_inventory_result')) {
    roadblocks.push({ state: config.id, source: SC_DUNES_SOURCE_LABEL, url: SC_DUNES_BASE_URL, status: 'reachable_no_safe_bourbon_inventory', error: `Dunes returned ${rows.length} reviewed search rows but no positive exact-stock Bible matches survived filtering.`, nextRoute: 'Inspect current names and stock controls; add aliases only for unambiguous bottle identities.' });
  }

  if (persistCache && signals.some((signal) => signal.eventType === 'retailer_store_inventory_result')) {
    await mkdir(path.dirname(SC_DUNES_ARTIFACT_PATH), { recursive: true });
    await writeFile(SC_DUNES_ARTIFACT_PATH, JSON.stringify({ generatedAt: observedAt, signals, roadblocks }, null, 2));
  }
  return { signals, roadblocks };
}

export function isSouthCarolinaAllAmericanCacheUsable(signals, generatedAt, nowMs = Date.now()) {
  const generatedMs = Date.parse(String(generatedAt || ''));
  const ageMs = nowMs - generatedMs;
  if (!Array.isArray(signals)
    || !Number.isFinite(generatedMs)
    || ageMs < -5 * 60_000
    || ageMs > SC_ALL_AMERICAN_CACHE_MAX_AGE_MS) return false;
  const sourceSignals = signals.filter((signal) => signal?.eventType === 'retailer_store_inventory_result');
  const exactLocation = (signal) => signal?.eventType === 'retailer_store_location'
    && signal?.state === 'SC'
    && signal?.sourceLabel === SC_ALL_AMERICAN_SOURCE_LABEL
    && signal?.sourceUrl === SC_ALL_AMERICAN_BASE_URL
    && signal?.storeId === `all-american-liquor:${SC_ALL_AMERICAN_STORE.id}`
    && signal?.storeName === SC_ALL_AMERICAN_STORE.name
    && signal?.storeAddress === SC_ALL_AMERICAN_STORE.address
    && signal?.city === SC_ALL_AMERICAN_STORE.city
    && String(signal?.postalCode || signal?.zip || '') === SC_ALL_AMERICAN_STORE.zip
    && signal?.raw?.chain === 'all-american-liquor';
  const exactInventory = (signal) => signal?.raw?.product != null
    && String(signal.raw.product.id ?? '') === String(signal?.productId ?? '')
    && String(signal.raw.product.sku ?? '') === String(signal?.sku ?? '')
    && signal.raw.product.is_in_stock === true
    && signal.raw.product.is_on_backorder === false
    && isSouthCarolinaAllAmericanInventory(signal, nowMs);
  return sourceSignals.length > 0
    && signals.every((signal) => exactLocation(signal) || exactInventory(signal));
}

function isUnsafeSouthCarolinaAllAmericanFormat(rawName) {
  const miniature = [...String(rawName || '').matchAll(/\b(\d{2,3})\s*ml\b/gi)]
    .some((match) => Number(match[1]) <= 375);
  const multipack = /\b(?:[2-9]\d?\s*(?:x|×)\s*\d{2,4}\s*ml|[2-9]\d?\s*-?\s*(?:pk|pack)|pack\s+of\s+[2-9]\d?|multi\s*-?\s*pack)\b/i.test(String(rawName || ''));
  return miniature || multipack;
}

export function buildSouthCarolinaAllAmericanSignal(config, product, bible, observedAt) {
  const rawName = htmlToText(product?.name || '')
    .replace(/[’‘]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  const productId = product?.id;
  const sku = String(product?.sku || '').trim();
  if (!rawName
    || productId == null
    || !String(productId).trim()
    || !sku
    || product?.is_in_stock !== true
    || product?.is_on_backorder !== false
    || isUnsafeSouthCarolinaAllAmericanFormat(rawName)
    || !isSouthCarolinaRetailerCandidate(rawName)) return null;
  let sourceUrl;
  try {
    const parsed = new URL(String(product?.permalink || ''));
    if (parsed.protocol !== 'https:'
      || parsed.hostname !== 'www.aalmauldin.com'
      || !/^\/product\/[a-z0-9-]+\/$/.test(parsed.pathname)
      || parsed.search
      || parsed.hash) return null;
    sourceUrl = parsed.href;
  } catch {
    return null;
  }
  const { match, record } = cityHiveSafeBottleMatch(rawName, bible);
  if (!record) return null;
  const price = wcStoreApiPrice(product?.prices);
  return {
    id: stableId([config.id, 'all-american-liquor', productId]),
    key: stableId([config.id, 'all-american-liquor', productId]),
    state: config.id,
    displayState: config.id,
    sourceUrl,
    sourceLabel: SC_ALL_AMERICAN_SOURCE_LABEL,
    sourceChain: 'all-american-liquor',
    eventType: 'retailer_store_inventory_result',
    rawName,
    canonicalBottleId: record.id,
    bottleId: record.id,
    canonicalName: record.canonical,
    tier: record.tier,
    confidence: Math.min(0.86, Math.max(0.76, match?.confidence || 0.8)),
    sourceMatchStatus: 'bottle_bible_match',
    productId,
    sku,
    sourceProductProofId: String(productId),
    sourceProductProofSku: sku,
    quantity: 0,
    storeQty: 0,
    quantityIsExact: false,
    quantitySemantics: 'binary_retailer_in_stock',
    price,
    availabilityStatus: 'in_stock',
    availabilityLabel: 'Retailer reports in-store availability — exact quantity unavailable',
    sourceAvailabilityVerified: true,
    orderabilityOfferVerified: false,
    sourceProductInStock: true,
    sourceProductBackordered: false,
    locationPrecision: 'store_level',
    locationName: SC_ALL_AMERICAN_STORE.name,
    storeName: SC_ALL_AMERICAN_STORE.name,
    storeId: `all-american-liquor:${SC_ALL_AMERICAN_STORE.id}`,
    storeAddress: SC_ALL_AMERICAN_STORE.address,
    city: SC_ALL_AMERICAN_STORE.city,
    stateCode: config.id,
    postalCode: SC_ALL_AMERICAN_STORE.zip,
    zip: SC_ALL_AMERICAN_STORE.zip,
    observedAt,
    fetchedAt: observedAt,
    canAlertAsInventory: true,
    canAlertAsWatch: true,
    dataLane: 'inventory',
    inventorySemantics: 'All American Liquor publicly marks this SKU in stock for its Mauldin premises, while its shop states inventory is wholesale/in-store only and subject to change. This is binary in-store availability, not online purchasability or exact bottle quantity.',
    evidence: `All American Liquor WooCommerce Store API reports ${rawName} is_in_stock=true${price ? ` at $${price.toFixed(2)}` : ''} for the Mauldin store; exact quantity is not exposed.`,
    raw: {
      chain: 'all-american-liquor',
      product: {
        id: productId,
        sku,
        is_in_stock: product.is_in_stock,
        is_purchasable: product.is_purchasable,
        is_on_backorder: product.is_on_backorder,
        prices: product.prices,
        add_to_cart: product.add_to_cart,
      },
    },
  };
}

async function collectSouthCarolinaAllAmerican(config, bible, observedAt) {
  try {
    const cached = JSON.parse(await readFile(SC_ALL_AMERICAN_ARTIFACT_PATH, 'utf8'));
    if (process.env.BOURBON_SIGNAL_SC_FORCE_ALL_AMERICAN_LIVE !== '1'
      && isSouthCarolinaAllAmericanCacheUsable(cached.signals, cached.generatedAt)) {
      return { signals: cached.signals.map((signal) => ({ ...signal, observedAt: cached.generatedAt, fetchedAt: observedAt, raw: { ...(signal.raw || {}), cacheFallback: true, cacheGeneratedAt: cached.generatedAt } })), roadblocks: cached.roadblocks || [] };
    }
  } catch {}

  const signals = [southCarolinaStoreLocationSignal(config, SC_ALL_AMERICAN_SOURCE_LABEL, SC_ALL_AMERICAN_BASE_URL, SC_ALL_AMERICAN_STORE, observedAt, 'all-american-liquor')];
  const roadblocks = [];
  const seen = new Set();
  for (const term of SC_ALL_AMERICAN_TERMS) {
    const url = `${SC_ALL_AMERICAN_BASE_URL}/wp-json/wc/store/v1/products?search=${encodeURIComponent(term)}&per_page=20`;
    const res = await textFetch(url, { headers: { accept: 'application/json' }, timeoutMs: 18_000 });
    if (!res.ok) {
      roadblocks.push({ state: config.id, source: SC_ALL_AMERICAN_SOURCE_LABEL, url, status: res.status || 0, error: res.error || `HTTP ${res.status}`, nextRoute: 'Retry the public WooCommerce Store API at low cadence; retain recent cache for no more than two hours.' });
      await sleep(SC_ALL_AMERICAN_DELAY_MS);
      continue;
    }
    let products = [];
    try { products = JSON.parse(res.text); } catch (error) {
      roadblocks.push({ state: config.id, source: SC_ALL_AMERICAN_SOURCE_LABEL, url, status: res.status || 200, error: error instanceof Error ? error.message : String(error), nextRoute: 'Inspect the WooCommerce response shape before promoting additional rows.' });
      continue;
    }
    for (const product of Array.isArray(products) ? products : []) {
      if (seen.has(product?.id)) continue;
      const signal = buildSouthCarolinaAllAmericanSignal(config, product, bible, observedAt);
      if (!signal) continue;
      seen.add(product.id);
      signals.push(signal);
    }
    await sleep(SC_ALL_AMERICAN_DELAY_MS);
  }
  try {
    await mkdir(path.dirname(SC_ALL_AMERICAN_ARTIFACT_PATH), { recursive: true });
    await writeFile(SC_ALL_AMERICAN_ARTIFACT_PATH, JSON.stringify({ generatedAt: observedAt, signals, roadblocks }, null, 2));
  } catch (error) {
    roadblocks.push({
      state: config.id,
      source: SC_ALL_AMERICAN_SOURCE_LABEL,
      url: SC_ALL_AMERICAN_BASE_URL,
      status: 'cache_write_failed',
      error: error instanceof Error ? error.message : String(error),
      nextRoute: 'Serve this bounded live result without cache reuse and retry cache persistence on the next scheduled run.',
    });
  }
  return { signals, roadblocks };
}

export async function runIsolatedSouthCarolinaSourceLane({ name, source, run }, config) {
  try {
    return await run();
  } catch (error) {
    return {
      signals: [],
      roadblocks: [{
        state: config.id,
        source,
        url: null,
        status: 'source_exception',
        error: `${name} source lane failed without stopping the remaining South Carolina sources: ${error instanceof Error ? error.message : String(error)}`,
        nextRoute: `Retry only the ${name} source lane after inspecting its bounded failure.`,
      }],
    };
  }
}

async function collectSouthCarolina(config, bible) {
  const observedAt = new Date().toISOString();
  const laneRun = await runBoundedSourceLanes([
    { name: 'cityhive', domain: 'sc-cityhive-group', run: () => runIsolatedSouthCarolinaSourceLane({ name: 'cityhive', source: 'South Carolina CityHive exact-store inventory platform', run: () => collectSouthCarolinaCityHive(config, bible, observedAt) }, config) },
    { name: 'da-brown-bag', domain: 'dabrownbag.com', run: () => runIsolatedSouthCarolinaSourceLane({ name: 'da-brown-bag', source: 'Da Brown Bag Clover public inventory API', run: () => collectSouthCarolinaDaBrownBag(config, bible, observedAt) }, config) },
    { name: 'southern-spirits', domain: 'southernspirits.com', run: () => runIsolatedSouthCarolinaSourceLane({ name: 'southern-spirits', source: 'Southern Spirits Shopify products feed', run: () => collectSouthCarolinaSouthernSpirits(config, bible, observedAt) }, config) },
    { name: 'dunes', domain: 'dunesliquor.com', run: () => runIsolatedSouthCarolinaSourceLane({ name: 'dunes', source: SC_DUNES_SOURCE_LABEL, run: () => collectSouthCarolinaDunes(config, bible, observedAt) }, config) },
    { name: 'all-american', domain: 'aalmauldin.com', run: () => runIsolatedSouthCarolinaSourceLane({ name: 'all-american', source: SC_ALL_AMERICAN_SOURCE_LABEL, run: () => collectSouthCarolinaAllAmerican(config, bible, observedAt) }, config) },
    { name: 'phase1-myrtle', domain: 'sc-myrtle-watch-group', run: () => runIsolatedSouthCarolinaSourceLane({ name: 'phase1-myrtle', source: 'South Carolina phase-one Myrtle Beach sources', run: () => collectSouthCarolinaPhase1Myrtle(config, bible, observedAt) }, config) },
  ], { concurrency: 3 });
  return {
    signals: laneRun.results.flatMap((result) => result.value.signals || []),
    roadblocks: laneRun.results.flatMap((result) => result.value.roadblocks || []),
    sourceTimings: laneRun.timings,
    sourceConcurrency: laneRun.concurrency,
  };
}

async function collectTennessee(config, bible, options = {}) {
  const observedAt = new Date().toISOString();
  const configuredStores = buildTennesseeConfiguredStoreLocationSignals(observedAt);
  const cityHive = await collectTennesseeCityHive(config, bible, observedAt, options);
  options.signal?.throwIfAborted();
  const shopify = await collectTennesseeShopify(config, bible, observedAt, options);
  options.signal?.throwIfAborted();
  const coolSprings = await collectTennesseeCoolSprings(config, bible, observedAt, options);
  options.signal?.throwIfAborted();
  const gatewayGrabbl = await collectTennesseeGatewayGrabbl(config, bible, observedAt, options);
  return {
    signals: [...configuredStores, ...cityHive.signals, ...shopify.signals, ...coolSprings.signals, ...gatewayGrabbl.signals],
    roadblocks: [...cityHive.roadblocks, ...shopify.roadblocks, ...coolSprings.roadblocks, ...gatewayGrabbl.roadblocks]
  };
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

  sourceLoop: for (const source of TX_CITYHIVE_SOURCES) {
    const merchantCohort = TX_CITYHIVE_MERCHANT_COHORTS[source.id];
    const sourceSeedUrls = merchantCohort?.length
      ? merchantCohort.map((merchantId) => `${source.baseUrl}/shop/?subtype=bourbon&merchant-id=${merchantId}`)
      : source.urls;
    for (const seedUrl of sourceSeedUrls) {
      for (const url of cityHivePageUrls(seedUrl, TX_CITYHIVE_MAX_PAGES)) {
        const res = await textFetch(url, { headers: { accept: 'text/html,*/*' }, timeoutMs: 24_000 });
        if (!res.ok) {
          roadblocks.push({
            state: config.id,
            source: source.sourceLabel,
            url,
            status: res.status,
            error: res.error || `HTTP ${res.status}`,
            nextRoute: isTerminalProbeFailure(res.status)
              ? 'Source stopped after the terminal response; retry the configured first-party page on a later scheduled run.'
              : 'Retry the Texas CityHive page or inspect rendered/network calls for current product JSON shape.'
          });
          if (isTerminalProbeFailure(res.status)) continue sourceLoop;
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
              const reportedQuantity = Number(option.quantity || 0) || 0;
              if (reportedQuantity <= 0) continue;
              const quantityIsSentinel = reportedQuantity === 100;
              const quantity = quantityIsSentinel ? 0 : reportedQuantity;
              const fullAddress = option.full_address || null;
              if (!/,\s*TX\s+\d{5}/i.test(String(fullAddress || ''))) continue;
              const city = fullAddress?.match(/,\s*([^,]+),\s*TX\s+\d{5}/i)?.[1] || null;
              const zip = fullAddress?.match(/\bTX\s+(\d{5}(?:-\d{4})?)\b/i)?.[1] || null;
              const price = Number(option.price || 0) || null;
              const merchantId = String(option.merchant_id || '');
              const productId = String(product.id || product._id || product.product_id || '');
              const optionId = String(option.option_id || option.id || '');
              if (!/^[0-9a-f]{24}$/i.test(merchantId) || !productId || !optionId) continue;
              const sourceUrl = new URL(String(option.product_url || url), source.baseUrl).toString();
              signals.push({
                id: stableId([config.id, 'cityhive-store-inventory', source.id, merchantId, record.id, productId, optionId]),
                key: stableId([config.id, 'cityhive-store-inventory', source.id, merchantId, record.id, productId, optionId]),
                state: config.id,
                stateCode: 'TX',
                sourceLabel: source.sourceLabel,
                sourceUrl,
                sourceChain: source.id,
                merchantId,
                productId,
                optionId,
                rawName,
                canonicalBottleId: record.id,
                canonicalName: record.canonical,
                confidence: Math.max(0.78, match?.confidence || 0.5),
                eventType: 'cityhive_store_inventory_result',
                locationPrecision: 'store_level',
                locationName: option.merchant_name || source.chainName,
                storeName: option.merchant_name || source.chainName,
                storeId: `${source.id}:${merchantId}`,
                storeAddress: fullAddress,
                city,
                stateCode: 'TX',
                postalCode: zip,
                zip,
                lat: Number(option.coordinates?.[1]) || null,
                lng: Number(option.coordinates?.[0]) || null,
                quantity,
                storeQty: quantity,
                quantitySemantics: quantityIsSentinel ? 'binary_retailer_in_stock' : 'retailer_reported_quantity',
                price,
                availabilityStatus: 'in_stock',
                availabilityLabel: quantityIsSentinel ? 'Retailer reports available — exact quantity unavailable' : 'In stock',
                sourceAvailabilityVerified: true,
                observedAt,
                fetchedAt: observedAt,
                canAlertAsInventory: true,
                canAlertAsWatch: true,
                dataLane: 'inventory',
                inventorySemantics: quantityIsSentinel
                  ? `${source.chainName} reports store-level availability; the repeated quantity 100 is treated as a sentinel, not an exact shelf count. Verify before driving.`
                  : `${source.chainName} CityHive reports store-level quantity and price. Treat as retailer-published pickup/order availability and verify before driving.`,
                evidence: quantityIsSentinel
                  ? `${source.chainName} reports ${rawName} available${option.merchant_name ? ` at ${option.merchant_name}` : ''}; exact quantity is not exposed.`
                  : `${source.chainName} reports ${quantity} unit${quantity === 1 ? '' : 's'} of ${rawName}${option.merchant_name ? ` at ${option.merchant_name}` : ''}${price ? ` for $${price.toFixed(2)}` : ''}.`,
                raw: { chain: source.id, merchantId, productId, optionId, reportedQuantity, quantityIsSentinel, product, option, matchGuard: unsafeReason, sourceAvailabilityVerified: true }
              });
            }
          }
        }
        await sleep(600);
      }
    }
  }

  const release = await textFetch(TX_SPECS_RELEASE_URL, { timeoutMs: 24_000 });
  const specsTerminalBlocked = !release.ok && isTerminalProbeFailure(release.status);
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

  for (const url of specsTerminalBlocked ? [] : TX_SPECS_PRODUCT_URLS) {
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

  const liveInventory = signals.filter((signal) => signal.eventType === 'cityhive_store_inventory_result');
  if (liveInventory.length >= 75) {
    await mkdir(path.dirname(TX_INVENTORY_CACHE_PATH), { recursive: true });
    await writeFile(TX_INVENTORY_CACHE_PATH, JSON.stringify({ generatedAt: observedAt, signals: liveInventory }, null, 2));
  } else {
    const cached = await readFile(TX_INVENTORY_CACHE_PATH, 'utf8').then(JSON.parse).catch(() => null);
    const cacheAgeMs = cached?.generatedAt ? Date.now() - new Date(cached.generatedAt).getTime() : Infinity;
    if (Array.isArray(cached?.signals) && cached.signals.length >= 75 && cacheAgeMs <= TX_INVENTORY_CACHE_MAX_AGE_MS) {
      for (let index = signals.length - 1; index >= 0; index -= 1) {
        if (signals[index].eventType === 'cityhive_store_inventory_result') signals.splice(index, 1);
      }
      signals.push(...cached.signals.map((signal) => ({
        ...signal,
        fallback: true,
        fallbackReason: 'Texas CityHive live run was blocked or incomplete; using the last complete inventory artifact within the six-hour TTL.',
        raw: {
          ...(signal.raw || {}),
          cacheFallback: true,
          cacheGeneratedAt: cached.generatedAt,
          artifactPath: TX_INVENTORY_CACHE_PATH,
        },
      })));
    }
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
    stores.push({
      storeNumber: String(Number(storeNumber)),
      name,
      city: a.City || null,
      county: a.FIPSname || null,
      address: a.Address || null,
      zip: a.Zip || null,
      phone: a.Phone && a.Phone !== '-' ? String(a.Phone) : null,
      lat: Number(a.Y ?? 0) || null,
      lng: Number(a.X ?? 0) || null
    });
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
  const { match, record, unsafeReason } = cityHiveSafeBottleMatch(rawName, bible);
  const sourceMatchStatus = record ? 'bottle_bible_match' : unsafeReason ? `source_name_kept:${unsafeReason}` : 'source_name_kept:no_safe_bible_match';
  return { match, record, base: {
    state,
    sourceLabel,
    sourceUrl,
    rawName,
    canonicalBottleId: record?.id || null,
    canonicalName: record?.canonical || titleCase(rawName),
    confidence: record ? Math.max(0.68, match?.confidence || 0.35) : 0.35,
    sourceMatchStatus,
    raw: { sourceMatchStatus, unsafeReason: unsafeReason || null },
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

const KY_BUFFALO_TRACE_AVAILABILITY_URL = 'https://www.buffalotracedistillery.com/visit-us/product-availability/';
const KY_BUFFALO_TRACE_DISTILLERY = {
  id: 'buffalo-trace-distillery-gift-shop',
  name: 'Buffalo Trace Distillery Gift Shop',
  address: '113 Great Buffalo Trace, Frankfort, KY 40601',
  city: 'Frankfort',
  county: 'Franklin',
  zip: '40601',
  lat: 38.2195,
  lng: -84.8687
};
const KY_DISTILLERY_RELEASE_WATCH_PAGES = [
  {
    label: 'Old Forester Birthday Bourbon official release FAQ',
    url: 'https://www.oldforester.com/birthday-bourbon-faqs/',
    bottle: 'Old Forester Birthday Bourbon',
    distillery: 'Old Forester Distillery',
    expectedText: ['Birthday Bourbon', 'Old Forester']
  },
  {
    label: 'Four Roses Limited Edition official release page',
    url: 'https://www.fourrosesbourbon.com/bourbon/2025-limited-edition-small-batch',
    bottle: 'Four Roses Limited Edition Small Batch',
    distillery: 'Four Roses Distillery',
    expectedText: ['Limited Edition Small Batch', 'Four Roses']
  },
  {
    label: 'Heaven Hill Heritage Collection official release page',
    url: 'https://heavenhilldistillery.com/heavenhill-heritage-collection.php',
    bottle: 'Heaven Hill Heritage Collection 22-Year-Old Kentucky Straight Bourbon',
    canonicalName: 'Heaven Hill Heritage Collection 22-Year-Old Kentucky Straight Bourbon',
    distillery: 'Heaven Hill Distillery',
    expectedText: ['Heaven Hill Heritage Collection', 'Kentucky Straight Bourbon']
  },
  {
    label: "Maker's Mark Greats of the Gate official release page",
    url: 'https://www.makersmark.com/bourbons/greats-of-the-gate',
    bottle: "Maker's Mark Greats of the Gate 2026",
    canonicalName: "Maker's Mark Greats of the Gate 2026",
    distillery: "Maker's Mark Distillery",
    expectedText: ['Greats of the Gate', 'Maker']
  },
  {
    label: "Maker's Mark Cellar Aged official limited-release page",
    url: 'https://www.makersmark.com/bourbons/makers-mark-cellar-aged',
    bottle: "Maker's Mark Cellar Aged",
    canonicalName: "Maker's Mark Cellar Aged",
    distillery: "Maker's Mark Distillery",
    expectedText: ['Cellar Aged', 'Maker']
  },
  {
    label: "Maker's Mark Wood Finishing Series official limited-release page",
    url: 'https://www.makersmark.com/bourbons/makers-mark-wood-finishing-series-collection',
    bottle: "Maker's Mark Wood Finishing Series",
    canonicalName: "Maker's Mark Wood Finishing Series",
    distillery: "Maker's Mark Distillery",
    expectedText: ['Wood Finishing Series', 'Maker']
  },
  {
    label: "Wild Turkey Master's Keep Beacon official release page",
    url: 'https://www.wildturkeybourbon.com/en-us/products/masters-keep-beacon/',
    bottle: "Wild Turkey Master's Keep Beacon",
    canonicalName: "Wild Turkey Master's Keep Beacon",
    distillery: 'Wild Turkey Distilling Co.',
    expectedText: ["Master's Keep", 'Beacon', 'Wild Turkey']
  },
  {
    label: 'Wild Turkey Austin Nichols Archives official release page',
    url: 'https://www.wildturkeybourbon.com/en-us/products/austin-nichols-archives-bourbons/',
    bottle: 'Wild Turkey Austin Nichols Archives Gold Foil Edition',
    canonicalName: 'Wild Turkey Austin Nichols Archives Gold Foil Edition',
    distillery: 'Wild Turkey Distilling Co.',
    expectedText: ['Austin Nichols Archives', 'Gold Foil Edition', 'Wild Turkey']
  }
];

function kyDecodeEscapedText(value = '') {
  let text = String(value || '');
  for (let i = 0; i < 3; i += 1) {
    text = text
      .replace(/\\\\u003c/g, '<')
      .replace(/\\u003c/g, '<')
      .replace(/\\\\u003e/g, '>')
      .replace(/\\u003e/g, '>')
      .replace(/\\\\u0026/g, '&')
      .replace(/\\u0026/g, '&')
      .replace(/\\\\u0027/g, "'")
      .replace(/\\u0027/g, "'")
      .replace(/\\\\u0022/g, '"')
      .replace(/\\u0022/g, '"')
      .replace(/\\\\\//g, '/')
      .replace(/\\\//g, '/')
      .replace(/\\\\n/g, ' ')
      .replace(/\\n/g, ' ')
      .replace(/\\"/g, '"');
  }
  return decodeHtml(stripHtml(text)).replace(/\s+/g, ' ').trim();
}

function kyIsoFromDmy(dayDate) {
  const match = String(dayDate || '').match(/^(\d{1,2})\/(\d{1,2})\/(20\d{2})$/);
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  return `${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

function kyDateWithinDropWindow(isoDate) {
  if (!isoDate) return true;
  const ts = Date.parse(`${isoDate}T12:00:00-04:00`);
  if (!Number.isFinite(ts)) return true;
  const day = 24 * 60 * 60 * 1000;
  return ts >= Date.now() - day && ts <= Date.now() + 14 * day;
}

function kyNormalizeBuffaloTraceBottleName(rawName) {
  const name = decodeHtml(String(rawName || '').replace(/\\s+/g, ' ').trim());
  if (/^blanton'?s?\\s+375\\s*m?l?\\b/i.test(name)) return "Blanton's Single Barrel Bourbon 375mL";
  if (/^blanton'?s?\\b/i.test(name)) return "Blanton's Single Barrel Bourbon";
  if (/^weller\\s+c\\.?y\\.?p\\.?b\\.?$/i.test(name)) return 'Weller C.Y.P.B.';
  if (/^e\\.?\\s*h\\.?\\s*taylor.*small batch/i.test(name)) return 'E.H. Taylor Small Batch';
  if (/single oak.*rye/i.test(name)) return 'Buffalo Trace Single Oak Rye Bourbon';
  if (/single oak/i.test(name)) return 'Buffalo Trace Single Oak Rye Bourbon';
  return name;
}

function kyAvailabilityNameFromText(text) {
  const match = String(text || '').match(/^(.+?)\s+is\s+available\b/i);
  if (!match) return null;
  const raw = match[1]
    .replace(/^today[:,]?\s*/i, '')
    .replace(/\s+at\s+the\s+gift\s+shop$/i, '')
    .trim();
  if (!raw || /coffee|cocktail|engraving|sandwich|salad|flatbread/i.test(raw)) return null;
  return raw;
}

function kyNearestDayDateBefore(html, index) {
  const before = String(html || '').slice(Math.max(0, index - 5_000), index);
  const matches = [...before.matchAll(/\\"day_date\\":\\"([^\\"]+)\\"/g)];
  return matches.length ? matches[matches.length - 1][1] : null;
}

function kyExtractBuffaloTraceGiftShopRows(html) {
  const rows = [];
  const eventRe = /\{\\"time\\":\\"([^\\"]*)\\",\\"location\\":\\"([^\\"]*)\\",\\"description\\":\\"([\s\S]*?)\\",\\"sub_description\\":\\"([^\\"]*)\\"\}/g;
  for (const match of String(html || '').matchAll(eventRe)) {
    const [, time, location, description] = match;
    if (!/gift shop/i.test(location)) continue;
    const text = kyDecodeEscapedText(description);
    const rawName = kyAvailabilityNameFromText(text);
    if (!rawName) continue;
    const dayDate = kyNearestDayDateBefore(html, match.index || 0);
    const releaseDate = kyIsoFromDmy(dayDate);
    if (!kyDateWithinDropWindow(releaseDate)) continue;
    rows.push({
      rawName,
      matchName: kyNormalizeBuffaloTraceBottleName(rawName),
      time: kyDecodeEscapedText(time) || 'While supplies last',
      dayDate,
      releaseDate,
      text
    });
  }
  const seen = new Set();
  return rows.filter((row) => {
    const key = [row.rawName, row.releaseDate || row.dayDate || '', row.time].join('|').toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function kyReleaseDateFromText(text) {
  const named = String(text || '').match(/\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan\.?|Feb\.?|Mar\.?|Apr\.?|Jun\.?|Jul\.?|Aug\.?|Sep\.?|Sept\.?|Oct\.?|Nov\.?|Dec\.?)\s+\d{1,2}(?:st|nd|rd|th)?(?:,)?\s+20\d{2}\b/i);
  if (named) {
    const parsed = Date.parse(named[0].replace(/(\d{1,2})(st|nd|rd|th)/i, '$1'));
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString().slice(0, 10);
  }
  const numeric = String(text || '').match(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/);
  if (numeric) {
    const parsed = Date.parse(`${numeric[1]}/${numeric[2]}/${numeric[3]}`);
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString().slice(0, 10);
  }
  return null;
}

function kyPageContainsExpectedText(text, page) {
  const haystack = String(text || '').toLowerCase();
  const expected = page.expectedText?.length ? page.expectedText : [page.bottle];
  return expected.some((needle) => haystack.includes(String(needle || '').toLowerCase()));
}

async function collectKentuckyBuffaloTraceAvailability(config, bible, observedAt) {
  const signals = [];
  const roadblocks = [];
  const res = await curlTextFetch(KY_BUFFALO_TRACE_AVAILABILITY_URL, { timeoutMs: 30_000, maxBuffer: 5 * 1024 * 1024 });
  if (!res.ok) {
    roadblocks.push({
      state: config.id,
      source: 'Buffalo Trace Distillery product availability page',
      url: KY_BUFFALO_TRACE_AVAILABILITY_URL,
      status: res.status || 0,
      error: res.error || `HTTP ${res.status}`,
      nextRoute: 'Retry the official product-availability page or inspect the current Next.js RSC payload for gift-shop availability rows.'
    });
    return { signals, roadblocks };
  }

  const rows = kyExtractBuffaloTraceGiftShopRows(res.text);
  if (!rows.length) {
    roadblocks.push({
      state: config.id,
      source: 'Buffalo Trace Distillery product availability page',
      url: KY_BUFFALO_TRACE_AVAILABILITY_URL,
      status: res.status || 200,
      error: 'No dated Gift Shop availability rows parsed from the public page.',
      nextRoute: 'Inspect the page payload for changed day_date/events structure before surfacing distillery-drop alerts.'
    });
    return { signals, roadblocks };
  }

  for (const row of rows) {
    const { record, unsafeReason } = cityHiveSafeBottleMatch(row.matchName, bible);
    if (!record) {
      roadblocks.push({
        state: config.id,
        source: 'Buffalo Trace Distillery product availability page',
        url: KY_BUFFALO_TRACE_AVAILABILITY_URL,
        status: res.status || 200,
        error: `Could not safely match Buffalo Trace gift-shop bottle "${row.rawName}" (${unsafeReason || 'no_bottle_bible_match'}).`,
        nextRoute: 'Add/adjust bottle-bible alias only if the official distillery text clearly identifies the bottle.'
      });
      continue;
    }
    signals.push({
      id: stableId([config.id, 'buffalo-trace-distillery-gift-shop-availability', row.releaseDate || row.dayDate || observedAt.slice(0, 10), row.rawName]),
      state: config.id,
      sourceLabel: 'Buffalo Trace Distillery gift-shop product availability',
      sourceUrl: KY_BUFFALO_TRACE_AVAILABILITY_URL,
      rawName: row.rawName,
      canonicalBottleId: record.id,
      canonicalName: record.canonical,
      confidence: 0.84,
      eventType: 'distillery_gift_shop_availability',
      locationPrecision: 'distillery',
      locationName: KY_BUFFALO_TRACE_DISTILLERY.name,
      storeName: KY_BUFFALO_TRACE_DISTILLERY.name,
      storeId: KY_BUFFALO_TRACE_DISTILLERY.id,
      storeAddress: KY_BUFFALO_TRACE_DISTILLERY.address,
      city: KY_BUFFALO_TRACE_DISTILLERY.city,
      county: KY_BUFFALO_TRACE_DISTILLERY.county,
      zip: KY_BUFFALO_TRACE_DISTILLERY.zip,
      lat: KY_BUFFALO_TRACE_DISTILLERY.lat,
      lng: KY_BUFFALO_TRACE_DISTILLERY.lng,
      quantity: 1,
      availabilityStatus: 'limited_supply',
      availabilityLabel: [row.time, row.releaseDate].filter(Boolean).join(' · '),
      releaseDate: row.releaseDate,
      eventDate: row.releaseDate,
      observedAt,
      canAlertAsInventory: false,
      canAlertAsWatch: true,
      inventorySemantics: 'Official Buffalo Trace Distillery gift-shop product availability. This is a distillery drop/pickup lead, not retailer store inventory or a store shipment alert. Limits and same-day sellouts can apply.',
      evidence: `Buffalo Trace public product-availability page lists ${row.rawName} for the Gift Shop${row.releaseDate ? ` on ${row.releaseDate}` : ''}: ${row.text}`,
      raw: {
        sourceKind: 'official_distillery_product_availability',
        distilleryLane: true,
        dayDate: row.dayDate,
        releaseDate: row.releaseDate,
        time: row.time,
        rawAvailabilityText: row.text,
        precisionCaveat: 'distillery gift-shop availability; not retailer store inventory'
      }
    });
  }
  return { signals, roadblocks };
}

async function collectKentuckyReleaseWatchPages(config, bible, observedAt) {
  const signals = [];
  const roadblocks = [];
  for (const page of KY_DISTILLERY_RELEASE_WATCH_PAGES) {
    const res = await curlTextFetch(page.url, { timeoutMs: 25_000, maxBuffer: 2 * 1024 * 1024 });
    if (!res.ok) {
      roadblocks.push({
        state: config.id,
        source: page.label,
        url: page.url,
        status: res.status || 0,
        error: res.error || `HTTP ${res.status}`,
        nextRoute: 'Retry the official distillery release page; keep as watch-only until a current product/date is parseable.'
      });
      continue;
    }
    const text = kyDecodeEscapedText(res.text).slice(0, 7000);
    if (!kyPageContainsExpectedText(text, page)) {
      roadblocks.push({
        state: config.id,
        source: page.label,
        url: page.url,
        status: res.status || 200,
        error: `Official release-watch page did not contain expected release text for ${page.bottle}.`,
        nextRoute: 'Inspect the page copy before surfacing this distillery release-watch signal.'
      });
      continue;
    }
    const { record } = bottleMatch(page.bottle, bible);
    const releaseDate = kyReleaseDateFromText(text);
    signals.push({
      id: stableId([config.id, 'official-distillery-release-watch', page.url, page.bottle]),
      state: config.id,
      sourceLabel: page.label,
      sourceUrl: page.url,
      rawName: page.bottle,
      canonicalBottleId: record?.id || null,
      canonicalName: page.canonicalName || record?.canonical || page.bottle,
      confidence: 0.64,
      eventType: 'distillery_release_watch',
      locationPrecision: 'distillery',
      locationName: page.distillery ? `${page.distillery} release watch` : 'Kentucky distillery release watch',
      quantity: 0,
      availabilityStatus: 'release_watch',
      availabilityLabel: 'Official distillery release-watch page',
      releaseDate,
      eventDate: releaseDate,
      observedAt,
      canAlertAsInventory: false,
      canAlertAsWatch: true,
      inventorySemantics: 'Official Kentucky distillery release page. Release-watch intelligence only; not retailer store inventory or a store shipment alert.',
      evidence: `${page.label} is reachable and references ${page.bottle}. Treat as official distillery release-watch context unless/until the page publishes a current pickup/drop window.`,
      raw: { sourceKind: 'official_distillery_release_watch', distillery: page.distillery || null, expectedText: page.expectedText || [], title: htmlTitle(res.text), excerpt: text.slice(0, 900), precisionCaveat: 'official release-watch page; exact pickup inventory not exposed' }
    });
  }
  return { signals, roadblocks };
}

function metroRetailerArtifactPath(stateId) {
  return `out/browser/${String(stateId || '').toUpperCase()}-metro-retailer-inventory.json`;
}

function metroRetailerSources(stateId) {
  return METRO_RETAILER_SOURCES_BY_STATE[String(stateId || '').toUpperCase()] || [];
}

function configuredMetroSources(config) {
  const registeredLabels = new Set((config?.sources || []).map((source) => source.label || source.name).filter(Boolean));
  return metroRetailerSources(config?.id).filter((source) => registeredLabels.has(source.sourceLabel));
}

async function readMetroRetailerCache(stateId) {
  const artifactPath = metroRetailerArtifactPath(stateId);
  try {
    const cache = JSON.parse(await readFile(artifactPath, 'utf8'));
    if (cache?.state !== stateId || !Array.isArray(cache?.signals)) return null;
    const signals = filterFreshMetroSignals(cache.signals, Date.now(), METRO_RETAILER_CACHE_MAX_AGE_MS)
      .filter((signal) => isMetroRetailerInventory(signal));
    if (!signals.length) return null;
    return {
      ...cache,
      signals,
      roadblocks: Array.isArray(cache.roadblocks) ? cache.roadblocks : [],
      artifactPath,
    };
  } catch {
    return null;
  }
}

function cachedMetroRetailerSignals(cache) {
  return (cache?.signals || []).map((signal) => ({
    ...signal,
    raw: {
      ...(signal.raw || {}),
      cacheFallback: true,
      cacheGeneratedAt: cache.generatedAt,
      artifactPath: cache.artifactPath || metroRetailerArtifactPath(signal.state),
    },
  }));
}

async function writeMetroRetailerCache(stateId, signals, roadblocks) {
  const artifactPath = metroRetailerArtifactPath(stateId);
  const payload = {
    schemaVersion: 1,
    state: stateId,
    generatedAt: new Date().toISOString(),
    source: `${stateId} bounded metro first-party retailer inventory cache`,
    cacheMaxAgeMs: METRO_RETAILER_CACHE_MAX_AGE_MS,
    signalCount: signals.length,
    sourceChains: [...new Set(signals.map((signal) => signal.sourceChain).filter(Boolean))].sort(),
    signals,
    roadblocks,
  };
  await mkdir(path.dirname(artifactPath), { recursive: true });
  await writeFile(artifactPath, JSON.stringify(payload, null, 2));
}

function failedMetroResponse(result, label) {
  const message = result?.error || `HTTP ${result?.status || 0}`;
  if (!result || Number(result.status || 0) === 0) return new TransientSourceError(`${label}: ${message}`, { status: result?.status ?? 0 });
  return sourceErrorForHttp(result.status, `${label}: ${message}`);
}

async function fetchMetroShopifyProducts(source, signal) {
  const products = [];
  const maxPages = Math.max(1, Math.min(6, Number(source.maxPages) || 1));
  for (let page = 1; page <= maxPages; page += 1) {
    const separator = source.productsUrl.includes('?') ? '&' : '?';
    const url = `${source.productsUrl}${separator}page=${page}`;
    const response = await textFetch(url, {
      headers: { accept: 'application/json,*/*' },
      timeoutMs: 30_000,
      signal,
    });
    if (!response.ok) throw failedMetroResponse(response, `${source.sourceLabel} bounded Shopify page ${page}`);
    let payload;
    try { payload = JSON.parse(response.text); } catch (error) {
      throw new MalformedSourceError(`${source.sourceLabel} returned malformed Shopify JSON`, {
        cause: error,
        status: response.status || 0,
      });
    }
    if (!Array.isArray(payload?.products)) {
      throw new MalformedSourceError(`${source.sourceLabel} Shopify response did not contain a products array`, {
        status: response.status || 0,
      });
    }
    products.push(...payload.products);
    if (payload.products.length < 250) break;
    await sleep(METRO_RETAILER_SOURCE_DELAY_MS);
  }
  return products;
}

async function fetchMetroRetailerRows(source, signal) {
  if (source.platform === 'cityhive') {
    const rows = [];
    const seen = new Set();
    for (const store of source.stores) {
      const pageUrl = new URL(source.productsUrl);
      pageUrl.searchParams.set('merchant-id', store.merchantId);
      const response = await textFetch(pageUrl.toString(), {
        headers: { accept: 'text/html,*/*' },
        timeoutMs: 30_000,
        signal,
      });
      if (!response.ok) throw failedMetroResponse(response, `${source.sourceLabel} CityHive merchant ${store.merchantId}`);
      for (const row of parseMetroCityHiveHtml(response.text, source)) {
        if (row.merchantId !== store.merchantId) continue;
        const key = `${row.merchantId}:${row.productId}:${row.variantId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push(row);
      }
      await sleep(METRO_RETAILER_SOURCE_DELAY_MS);
    }
    return {
      rows,
      fulfillmentPolicyVerified: true,
    };
  }

  const policyResponse = await textFetch(source.fulfillmentPolicyUrl, {
    headers: { accept: 'text/html,*/*' },
    timeoutMs: 30_000,
    signal,
  });
  if (!policyResponse.ok) throw failedMetroResponse(policyResponse, `${source.sourceLabel} pickup policy`);
  if (!verifyMetroShopifyFulfillmentPolicy(source, policyResponse.text)) {
    throw new MalformedSourceError(`${source.sourceLabel} first-party page no longer proves pickup at the exact allowlisted premises`, {
      status: policyResponse.status || 0,
      details: { fulfillmentPolicyUrl: source.fulfillmentPolicyUrl },
    });
  }
  const products = await fetchMetroShopifyProducts(source, signal);
  return {
    rows: parseMetroShopifyProducts({ products }, source),
    fulfillmentPolicyVerified: true,
  };
}

async function collectMetroRetailerSource(config, bible, source, observedAt, signal) {
  const fetched = await fetchMetroRetailerRows(source, signal);
  const signals = [];
  for (const row of fetched.rows) {
    const store = source.stores.find((candidate) => candidate.merchantId === row.merchantId);
    if (!store) continue;
    const { match, record, unsafeReason } = cityHiveSafeBottleMatch(row.title, bible);
    if (!record || !Number.isFinite(match?.confidence) || match.confidence < 0.72) continue;
    const metroSignal = {
      id: stableId([config.id, source.id, row.merchantId, row.productId, row.variantId]),
      state: config.id,
      stateCode: source.stateCode,
      sourceLabel: source.sourceLabel,
      sourceUrl: row.productUrl,
      sourceChain: source.id,
      sourceRuntimeId: `metro:${source.stateCode.toLowerCase()}:${source.id}`,
      merchantId: row.merchantId,
      productId: row.productId,
      productHandle: row.handle || null,
      variantId: row.variantId,
      variantAvailable: source.platform === 'shopify' ? true : null,
      rawName: row.title,
      canonicalBottleId: record.id,
      canonicalName: record.canonical,
      tier: record.tier,
      confidence: Math.min(0.92, match.confidence),
      eventType: 'retailer_store_inventory_result',
      locationPrecision: 'store_level',
      locationName: `${store.name} — ${store.address}`,
      storeId: store.id,
      storeName: store.name,
      storeAddress: store.address,
      address: store.address,
      city: store.city,
      area: source.area,
      postalCode: store.zip,
      zip: store.zip,
      quantity: row.quantity,
      quantityIsExact: row.quantityIsExact,
      reportedQuantity: row.reportedQuantity,
      price: row.price,
      availabilityStatus: 'in_stock',
      availabilityLabel: source.platform === 'shopify'
        ? 'Available to order with pickup published for this premises'
        : row.quantityIsExact
          ? `${row.quantity} retailer-reported at this pickup premises`
          : 'Retailer reports orderable availability; exact count is not published',
      sourceAvailabilityVerified: row.sourceAvailabilityVerified === true,
      fulfillmentPolicyVerified: source.platform === 'shopify' && fetched.fulfillmentPolicyVerified === true,
      pickupOfferVerified: source.platform === 'cityhive' && row.pickupOfferVerified === true,
      premisesVerified: row.premisesVerified === true,
      observedAt,
      canAlertAsInventory: true,
      canAlertAsWatch: true,
      inventorySemantics: row.inventorySemantics,
      evidence: source.platform === 'shopify'
        ? `${source.chainName} marks this exact variant available on its first-party product feed, while a separately fetched same-host page proves pickup at ${store.address}.`
        : `${source.chainName} embeds a positive CityHive option bound to merchant ${row.merchantId}, pickup, and ${store.address}.`,
      caveat: row.quantityIsExact
        ? 'Retailer-reported quantity can change quickly. Verify pickup before driving.'
        : 'Binary retailer orderability, not an exact shelf count. Verify pickup before driving.',
      raw: {
        chain: source.id,
        platform: source.platform,
        merchantId: row.merchantId,
        reportedQuantity: row.reportedQuantity,
        pickupOfferVerified: row.pickupOfferVerified === true,
        fulfillmentPolicyVerified: source.platform === 'shopify' && fetched.fulfillmentPolicyVerified === true,
        fulfillmentPolicyUrl: source.fulfillmentPolicyUrl,
        premisesVerified: row.premisesVerified === true,
        product: { id: row.productId, handle: row.handle || null },
        variant: { id: row.variantId, sku: row.sku || null, size: row.variantTitle || null, available: true },
        matchGuard: unsafeReason,
      },
    };
    if (isMetroRetailerInventory(metroSignal)) signals.push(metroSignal);
  }
  const roadblocks = [];
  if (!signals.length) {
    roadblocks.push({
      state: config.id,
      source: source.sourceLabel,
      sourceRuntimeId: `metro:${source.stateCode.toLowerCase()}:${source.id}`,
      url: source.productsUrl,
      status: 'reachable_no_safe_inventory_rows',
      error: `${source.platform} returned ${fetched.rows.length} candidate rows but no identity-bound, safely matched bourbon inventory rows survived the premises, format, pickup, and bottle guards.`,
      nextRoute: 'Inspect the current first-party source shape without weakening merchant, premises, format, pickup, or product identity requirements.',
    });
  }
  return { signals, roadblocks };
}

function previousMetroSourceResults(cache, sources) {
  return Object.fromEntries(sources.flatMap((source) => {
    const signals = (cache?.signals || []).filter((signal) => signal.sourceChain === source.id);
    if (!signals.length) return [];
    const observedTimes = signals.map((signal) => Date.parse(signal.observedAt || '')).filter(Number.isFinite);
    const lastGoodAt = observedTimes.length ? new Date(Math.max(...observedTimes)).toISOString() : null;
    if (!lastGoodAt) return [];
    const sourceId = `metro:${source.stateCode.toLowerCase()}:${source.id}`;
    return [[sourceId, {
      sourceId,
      sourceLabel: source.sourceLabel,
      sourceUrl: source.productsUrl,
      status: 'success',
      ok: true,
      stale: false,
      alertable: true,
      lastGoodAt,
      sourceMetadata: { stateId: source.stateCode, lane: 'metro_retailer' },
      value: { signals, roadblocks: [] },
    }]];
  }));
}

async function collectMetroRetailers(config, bible, options = {}) {
  const sources = configuredMetroSources(config).filter((source) => source.inventoryEligible === true);
  if (!sources.length) {
    return {
      signals: [],
      roadblocks: [{
        state: config.id,
        source: `${config.id} metro retailer registry`,
        status: 'missing_configured_source_registration',
        error: 'The precision collector was invoked without any matching allowlisted metro source registrations.',
        nextRoute: 'Restore the exact engine state-sources registrations; do not probe unregistered retailer URLs.',
      }],
    };
  }

  const observedAt = new Date().toISOString();
  const cache = await readMetroRetailerCache(config.id);
  const eligibleSourceIds = new Set(sources.map((source) => source.id));
  const eligibleCachedSignals = cachedMetroRetailerSignals(cache).filter((cachedSignal) => eligibleSourceIds.has(cachedSignal.sourceChain));
  const forceLive = process.env[`BOURBON_SIGNAL_${config.id}_FORCE_METRO_LIVE`] === '1';
  if (cache && !forceLive) {
    return {
      signals: eligibleCachedSignals,
      roadblocks: [
        ...(cache.roadblocks || []),
        {
          state: config.id,
          source: `${config.id} metro retailer cache reuse`,
          url: cache.artifactPath,
          status: 'fresh_cache_reuse',
          error: `Using ${eligibleCachedSignals.length} currently eligible identity-validated rows with their original observation timestamps from ${cache.generatedAt}.`,
          nextRoute: `Set BOURBON_SIGNAL_${config.id}_FORCE_METRO_LIVE=1 only for a bounded scheduled or maintenance refresh.`,
        },
      ],
      metadata: {
        lane: 'metro_retailer',
        cacheReused: true,
        cacheGeneratedAt: cache.generatedAt,
        sourceIds: sources.map((source) => `metro:${source.stateCode.toLowerCase()}:${source.id}`),
      },
    };
  }

  const adapters = sources.map((source) => createSourceAdapter({
    id: `metro:${source.stateCode.toLowerCase()}:${source.id}`,
    label: source.sourceLabel,
    url: source.productsUrl,
    metadata: { stateId: config.id, lane: 'metro_retailer', platform: source.platform },
    execute: (_context, { signal }) => collectMetroRetailerSource(config, bible, source, observedAt, signal),
    validate: (value) => Array.isArray(value?.signals) && Array.isArray(value?.roadblocks)
      ? true
      : `${source.sourceLabel} returned a malformed metro retailer result`,
    recordCount: (value) => value.signals.length,
  }));
  const isolated = await runSourceAdapters(adapters, {}, {
    ...options.sourceRunnerOptions,
    previousResults: previousMetroSourceResults(cache, sources),
    circuitBreaker: options.sourceCircuitBreaker,
    schedule: false,
    concurrency: Math.min(3, sources.length),
    perDomain: 1,
    timeoutMs: Number(process.env.BOURBON_SIGNAL_METRO_SOURCE_TIMEOUT_MS || 75_000),
    maxAttempts: Number(process.env.BOURBON_SIGNAL_METRO_SOURCE_ATTEMPTS || 2),
    retryDelayMs: METRO_RETAILER_SOURCE_DELAY_MS,
  });

  const liveSignals = [];
  const roadblocks = [];
  const completedSourceIds = new Set();
  for (const [index, result] of isolated.results.entries()) {
    const source = sources[index];
    if (result.ok) {
      completedSourceIds.add(source.id);
      liveSignals.push(...(result.value?.signals || []));
      roadblocks.push(...(result.value?.roadblocks || []));
      continue;
    }
    roadblocks.push({
      state: config.id,
      source: source.sourceLabel,
      sourceRuntimeId: result.sourceId,
      url: source.productsUrl,
      status: result.status,
      error: result.error?.message || 'Isolated metro retailer source failed.',
      nextRoute: 'Keep healthy sibling sources running and retain only still-fresh cached rows for this source; do not project source loss as out-of-stock.',
    });
  }

  const cachedSignals = eligibleCachedSignals;
  const signals = mergeMetroSourceCacheSignals(liveSignals, cachedSignals, completedSourceIds);
  const retainedSourceChains = new Set(signals
    .filter((signal) => !completedSourceIds.has(signal.sourceChain))
    .map((signal) => signal.sourceChain));
  if (retainedSourceChains.size) {
    roadblocks.push({
      state: config.id,
      source: `${config.id} metro retailer partial cache`,
      url: cache?.artifactPath || metroRetailerArtifactPath(config.id),
      status: 'partial_fresh_cache_merge',
      error: `Retained still-fresh rows for ${[...retainedSourceChains].sort().join(', ')} after isolated source loss; original observation timestamps were preserved.`,
      nextRoute: 'Retry only the failed retailer sources on the next bounded cadence and let their cache rows expire normally if no fresh proof returns.',
    });
  }
  if (completedSourceIds.size) await writeMetroRetailerCache(config.id, signals, roadblocks);
  if (!signals.length) {
    roadblocks.push({
      state: config.id,
      source: `${config.id} metro first-party retailer availability`,
      url: sources.map((source) => source.productsUrl).join(', '),
      status: 'reachable_no_inventory_rows',
      error: 'No fresh, identity-bound metro retailer rows survived the bounded collectors and cache freshness gate.',
      nextRoute: 'Keep the state fail-closed; do not substitute catalog, shipping, marketplace, stale, or unregistered retailer evidence.',
    });
  }
  return {
    signals,
    roadblocks,
    metadata: {
      lane: 'metro_retailer',
      cacheReused: false,
      completedSourceIds: [...completedSourceIds].sort(),
      sourceResults: isolated.results.map(summarizeSourceResult),
    },
  };
}

async function readCaliforniaSanDiegoShopifyCache() {
  try {
    const cache = JSON.parse(await readFile(CA_SAN_DIEGO_SHOPIFY_ARTIFACT_PATH, 'utf8'));
    const signals = filterFreshCaliforniaSignals(cache?.signals, Date.now(), CA_SAN_DIEGO_SHOPIFY_CACHE_MAX_AGE_MS)
      .filter((signal) => signal.eventType !== 'retailer_store_inventory_result' || signal.raw?.fulfillmentPolicyVerified === true);
    if (!signals.some((signal) => signal.eventType === 'retailer_store_inventory_result')) return null;
    return { ...cache, signals, roadblocks: Array.isArray(cache?.roadblocks) ? cache.roadblocks : [] };
  } catch {
    return null;
  }
}

async function writeCaliforniaSanDiegoShopifyCache(signals, roadblocks) {
  const payload = {
    generatedAt: new Date().toISOString(),
    source: 'California San Diego first-party Shopify cache',
    cacheMaxAgeMs: CA_SAN_DIEGO_SHOPIFY_CACHE_MAX_AGE_MS,
    signalCount: signals.length,
    inventorySignalCount: signals.filter((signal) => signal.eventType === 'retailer_store_inventory_result').length,
    sourceChains: [...new Set(signals.map((signal) => signal.sourceChain).filter(Boolean))].sort(),
    signals,
    roadblocks,
  };
  await mkdir(path.dirname(CA_SAN_DIEGO_SHOPIFY_ARTIFACT_PATH), { recursive: true });
  await writeFile(CA_SAN_DIEGO_SHOPIFY_ARTIFACT_PATH, JSON.stringify(payload, null, 2));
}

function cachedCaliforniaSignals(cache) {
  return (cache?.signals || []).map((signal) => ({
    ...signal,
    raw: {
      ...(signal.raw || {}),
      cacheFallback: true,
      cacheGeneratedAt: cache.generatedAt,
      artifactPath: CA_SAN_DIEGO_SHOPIFY_ARTIFACT_PATH,
    },
  }));
}

async function fetchCaliforniaShopifySource(source, signal) {
  const products = [];
  for (let page = 1; page <= source.maxPages; page++) {
    const separator = source.productsUrl.includes('?') ? '&' : '?';
    const url = `${source.productsUrl}${separator}page=${page}`;
    const res = await textFetch(url, { headers: { accept: 'application/json,*/*' }, timeoutMs: 30_000, signal });
    if (!res.ok) return { ...res, url };
    let payload;
    try { payload = JSON.parse(res.text); } catch (error) {
      throw new MalformedSourceError(`${source.sourceLabel} returned malformed Shopify JSON`, { cause: error, status: res.status || 0 });
    }
    if (!Array.isArray(payload?.products)) throw new MalformedSourceError(`${source.sourceLabel} Shopify response did not contain a products array`, { status: res.status || 0 });
    products.push(...payload.products);
    if (payload.products.length < 250) break;
    await sleep(CA_SAN_DIEGO_SHOPIFY_SOURCE_DELAY_MS);
  }
  return { ok: true, status: 200, text: JSON.stringify({ products }), error: null, url: source.productsUrl };
}

function failedCaliforniaResponse(result, label) {
  const message = result?.error || `HTTP ${result?.status || 0}`;
  if (!result || Number(result.status || 0) === 0) return new TransientSourceError(`${label}: ${message}`, { status: result?.status ?? 0 });
  return sourceErrorForHttp(result.status, `${label}: ${message}`);
}

async function collectCaliforniaSource(config, bible, source, observedAt, signal) {
  let fulfillmentPolicyVerified = false;
  if (source.inventoryEligible) {
    const policyRes = await textFetch(source.fulfillmentPolicyUrl, { headers: { accept: 'text/html,*/*' }, timeoutMs: 30_000, signal });
    if (!policyRes.ok) throw failedCaliforniaResponse(policyRes, `${source.sourceLabel} fulfillment policy`);
    fulfillmentPolicyVerified = verifyCaliforniaFulfillmentPolicy(source, policyRes.text);
    if (!fulfillmentPolicyVerified) {
      throw new MalformedSourceError(`${source.sourceLabel} first-party page no longer proves in-store pickup/collection for online orders`, {
        status: policyRes.status,
        details: { fulfillmentPolicyUrl: source.fulfillmentPolicyUrl },
      });
    }
  }
  const res = await fetchCaliforniaShopifySource(source, signal);
  if (!res.ok) throw failedCaliforniaResponse(res, `${source.sourceLabel} product feed`);
  const payload = JSON.parse(res.text);
  const sourceSignals = [];
  const sourceRoadblocks = [];
  const parsedRows = parseCaliforniaShopifyProducts(payload);
  for (const row of parsedRows) {
      const { match, record, unsafeReason } = cityHiveSafeBottleMatch(row.title, bible);
      if (!record) continue;
      const eventType = source.inventoryEligible ? 'retailer_store_inventory_result' : 'retailer_catalog_availability';
      const productUrl = row.handle ? `https://${source.host}/products/${encodeURIComponent(row.handle)}` : source.productsUrl;
      sourceSignals.push({
        id: stableId([config.id, 'san-diego-shopify', source.id, row.productId, row.variantId]),
        state: config.id,
        stateCode: 'CA',
        sourceLabel: source.sourceLabel,
        sourceUrl: productUrl,
        sourceChain: source.id,
        sourceRuntimeId: `ca:${source.id}`,
        merchantId: source.merchantId,
        productId: row.productId,
        variantId: row.variantId,
        rawName: row.title,
        canonicalBottleId: record.id,
        canonicalName: record.canonical,
        tier: record.tier,
        confidence: Math.max(source.inventoryEligible ? 0.82 : 0.7, Math.min(0.92, match?.confidence || 0.7)),
        eventType,
        locationPrecision: source.inventoryEligible ? 'store_level' : 'store_aggregate',
        locationName: source.store.name,
        storeName: source.store.name,
        storeId: source.store.id,
        storeAddress: source.store.address,
        city: source.store.city,
        stateCode: source.store.stateCode,
        postalCode: source.store.zip,
        zip: source.store.zip,
        quantity: 0,
        price: row.price,
        availabilityStatus: source.inventoryEligible ? 'in_stock' : 'retailer_online_available',
        availabilityLabel: source.inventoryEligible ? 'Available for retailer pickup/order' : 'Available online; local pickup not verified',
        sourceAvailabilityVerified: true,
        observedAt,
        canAlertAsInventory: source.inventoryEligible,
        canAlertAsWatch: true,
        inventorySemantics: row.inventorySemantics,
        evidence: source.inventoryEligible
          ? `${source.chainName} marks ${row.title} available on its first-party storefront and its separately fetched first-party policy publishes pickup/order fulfillment for the named San Diego premises. Exact quantity is not published.`
          : `${source.chainName} marks ${row.title} available online. Exact San Diego pickup availability is not established, so this remains watch-only.`,
        caveat: source.inventoryEligible
          ? 'Binary first-party retailer availability, not an exact shelf count. Verify pickup availability before driving.'
          : 'Online catalog availability only; local pickup is not verified.',
        raw: {
          chain: source.id,
          merchantId: source.merchantId,
          product: { id: row.productId, handle: row.handle, type: row.productType, tags: row.tags },
          variant: { id: row.variantId, sku: row.sku, size: row.size, available: true, price: row.price },
          fulfillmentPolicyUrl: source.fulfillmentPolicyUrl,
          fulfillmentPolicyVerified,
          matchGuard: unsafeReason,
        },
      });
  }
  if (!sourceSignals.length) {
    sourceRoadblocks.push({
      state: config.id,
      source: source.sourceLabel,
      sourceRuntimeId: `ca:${source.id}`,
      url: source.productsUrl,
      status: 'reachable_no_safe_inventory_rows',
      error: `Shopify returned ${payload.products.length} products but no safely matched available bourbon rows survived source, size, format, and bottle guards.`,
      nextRoute: 'Inspect product titles and variant availability without weakening bottle, format, or premises guards.',
    });
  }
  return { signals: sourceSignals, roadblocks: sourceRoadblocks };
}

function californiaLastGoodAt(signals, fallback) {
  const times = signals.map((signal) => Date.parse(signal.observedAt || '')).filter(Number.isFinite);
  return times.length ? new Date(Math.max(...times)).toISOString() : fallback || null;
}

function previousCaliforniaSourceResults(cache) {
  return Object.fromEntries(CALIFORNIA_SAN_DIEGO_SHOPIFY_SOURCES.map((source) => {
    const signals = (cache?.signals || []).filter((signal) => signal.sourceChain === source.id);
    const lastGoodAt = californiaLastGoodAt(signals, cache?.generatedAt);
    return [`ca:${source.id}`, {
      sourceId: `ca:${source.id}`,
      status: 'success',
      ok: true,
      stale: false,
      alertable: true,
      lastGoodAt,
      sourceMetadata: { stateId: 'CA', lane: 'california_retailer' },
      value: { signals, roadblocks: [] },
    }];
  }));
}

function cachedCaliforniaSourceResults(cache) {
  return Object.values(previousCaliforniaSourceResults(cache)).map((result) => summarizeSourceResult({
    contractVersion: 'bourbon-signal-source-result-v1',
    ...result,
    sourceLabel: CALIFORNIA_SAN_DIEGO_SHOPIFY_SOURCES.find((source) => `ca:${source.id}` === result.sourceId)?.sourceLabel || result.sourceId,
    sourceUrl: CALIFORNIA_SAN_DIEGO_SHOPIFY_SOURCES.find((source) => `ca:${source.id}` === result.sourceId)?.productsUrl || null,
    status: 'not_due',
    ok: false,
    attemptCount: 0,
    startedAt: null,
    finishedAt: result.lastGoodAt,
    checkedAt: result.lastGoodAt,
    quarantined: false,
    error: null,
    schedule: { sourceId: result.sourceId, decision: 'fresh_cache_reused' },
  }));
}

async function collectCalifornia(config, bible, options = {}) {
  const observedAt = new Date().toISOString();
  const cache = await readCaliforniaSanDiegoShopifyCache();
  if (process.env.BOURBON_SIGNAL_CA_FORCE_SHOPIFY_LIVE !== '1' && cache) {
    return {
      signals: cachedCaliforniaSignals(cache),
      roadblocks: cache.roadblocks || [],
      sourceResults: cachedCaliforniaSourceResults(cache),
    };
  }

  const californiaAdapters = CALIFORNIA_SAN_DIEGO_SHOPIFY_SOURCES.map((source) => createSourceAdapter({
    id: `ca:${source.id}`,
    label: source.sourceLabel,
    url: source.productsUrl,
    metadata: { stateId: config.id, lane: 'california_retailer' },
    execute: (_context, { signal }) => collectCaliforniaSource(config, bible, source, observedAt, signal),
    validate: (value) => Array.isArray(value?.signals) && Array.isArray(value?.roadblocks) ? true : 'California source result is malformed',
    recordCount: (value) => value.signals.length,
  }));
  const isolated = await runSourceAdapters(californiaAdapters, {}, {
    ...options.sourceRunnerOptions,
    previousResults: {
      ...(options.previousSourceResults || {}),
      ...Object.fromEntries(Object.entries(previousCaliforniaSourceResults(cache)).filter(([, result]) => result.lastGoodAt)),
    },
    circuitBreaker: options.sourceCircuitBreaker,
    concurrency: CALIFORNIA_SAN_DIEGO_SHOPIFY_SOURCES.length,
    perDomain: 1,
    timeoutMs: Number(process.env.BOURBON_SIGNAL_CA_SOURCE_TIMEOUT_MS || 75_000),
    maxAttempts: Number(process.env.BOURBON_SIGNAL_CA_SOURCE_ATTEMPTS || 2),
    retryDelayMs: CA_SAN_DIEGO_SHOPIFY_SOURCE_DELAY_MS,
  });
  const roadblocks = [];
  const signals = [];
  const completedSourceIds = new Set();
  for (const [index, result] of isolated.results.entries()) {
    const source = CALIFORNIA_SAN_DIEGO_SHOPIFY_SOURCES[index];
    signals.push(...(result.value?.signals || []));
    roadblocks.push(...(result.value?.roadblocks || []));
    if (result.ok) {
      completedSourceIds.add(source.id);
    } else {
      roadblocks.push({
        state: config.id,
        source: source.sourceLabel,
        sourceRuntimeId: result.sourceId,
        url: source.productsUrl,
        status: result.status,
        error: result.error?.message || 'Isolated California source failed',
        nextRoute: 'Inspect this isolated retailer source while sibling retailers continue; stale retained rows remain non-alertable.',
      });
    }
  }
  if (completedSourceIds.size > 0) {
    const artifactSignals = buildCaliforniaSourceCacheSignals(isolated.results, completedSourceIds);
    await writeCaliforniaSanDiegoShopifyCache(artifactSignals, roadblocks);
  }
  if (!signals.some((signal) => signal.eventType === 'retailer_store_inventory_result')) {
    roadblocks.push({
      state: config.id,
      source: 'California San Diego first-party retailer availability',
      url: CALIFORNIA_SAN_DIEGO_SHOPIFY_SOURCES.map((source) => source.productsUrl).join(', '),
      status: 'reachable_no_inventory_rows',
      error: 'No fresh, identity-bound San Diego pickup availability rows survived the guarded collector.',
      nextRoute: 'Keep California unpromoted until qualified first-party pickup rows are runner-reachable; do not substitute catalog or marketplace presence.',
    });
  }
  return { signals, roadblocks, sourceResults: isolated.results.map(summarizeSourceResult) };
}

async function readNevadaRetailerCache() {
  try {
    const cache = JSON.parse(await readFile(NEVADA_RETAILER_ARTIFACT_PATH, 'utf8'));
    const signals = filterFreshNevadaSignals(cache?.signals, Date.now(), NEVADA_RETAILER_CACHE_MAX_AGE_MS)
      .filter((signal) => signal?.raw?.fulfillmentPolicyVerified === true && signal?.sourceAvailabilityVerified === true);
    if (!signals.some((signal) => signal.eventType === 'retailer_store_inventory_result')) return null;
    return { ...cache, signals, roadblocks: Array.isArray(cache?.roadblocks) ? cache.roadblocks : [] };
  } catch {
    return null;
  }
}

async function writeNevadaRetailerCache(signals, roadblocks) {
  const payload = {
    generatedAt: new Date().toISOString(),
    source: 'Nevada first-party retailer inventory cache',
    cacheMaxAgeMs: NEVADA_RETAILER_CACHE_MAX_AGE_MS,
    signalCount: signals.length,
    inventorySignalCount: signals.filter((signal) => signal.eventType === 'retailer_store_inventory_result').length,
    sourceChains: [...new Set(signals.map((signal) => signal.sourceChain).filter(Boolean))].sort(),
    signals,
    roadblocks,
  };
  await mkdir(path.dirname(NEVADA_RETAILER_ARTIFACT_PATH), { recursive: true });
  await writeFile(NEVADA_RETAILER_ARTIFACT_PATH, JSON.stringify(payload, null, 2));
}

function cachedNevadaSignals(cache) {
  return (cache?.signals || []).map((signal) => ({
    ...signal,
    raw: { ...(signal.raw || {}), cacheFallback: true, cacheGeneratedAt: cache.generatedAt, artifactPath: NEVADA_RETAILER_ARTIFACT_PATH },
  }));
}

function exactHttpsHost(value, expectedHost) {
  try {
    const parsed = new URL(String(value || ''));
    return parsed.protocol === 'https:' && parsed.hostname.toLowerCase() === expectedHost;
  } catch {
    return false;
  }
}

function nevadaRetailerSignal(config, source, row, bible, observedAt, fulfillmentPolicyVerified) {
  const { record, unsafeReason } = cityHiveSafeBottleMatch(row.title, bible);
  if (!record) return null;
  const sourceUrl = source.platform === 'cityhive'
    ? row.handle
    : source.platform === 'albertsons-xapi'
      ? `https://${source.host}/shop/product-details.${encodeURIComponent(row.handle || '')}.html`
      : `https://${source.host}/collections/1000-plus-whiskey-varieties/${encodeURIComponent(row.handle || '')}`;
  if (!exactHttpsHost(sourceUrl, source.host)) return null;
  const variantId = String(row.variantId || row.optionId || '').trim();
  if (!variantId) return null;
  return {
    id: stableId([config.id, 'nevada-retailer', source.id, row.productId, variantId]),
    state: config.id,
    stateCode: 'NV',
    sourceLabel: source.sourceLabel,
    sourceUrl,
    sourceChain: source.id,
    merchantId: source.merchantId,
    productId: row.productId,
    variantId,
    optionId: row.optionId || null,
    rawName: row.title,
    canonicalBottleId: record.id,
    canonicalName: record.canonical,
    confidence: source.platform === 'cityhive' ? 0.84 : 0.82,
    eventType: 'retailer_store_inventory_result',
    locationPrecision: 'store_level',
    locationName: `${source.store.name} — ${source.store.address}`,
    storeId: source.store.id,
    storeName: source.store.name,
    storeAddress: source.store.address,
    address: source.store.address,
    city: source.store.city,
    area: source.store.area,
    postalCode: source.store.zip,
    zip: source.store.zip,
    quantity: row.quantity,
    price: row.price,
    availabilityStatus: 'in_stock',
    availabilityLabel: row.quantity > 0 ? `${row.quantity} reported available` : 'Available for retailer pickup/order',
    sourceAvailabilityVerified: true,
    observedAt,
    canAlertAsInventory: true,
    canAlertAsWatch: true,
    inventorySemantics: row.inventorySemantics,
    evidence: `${source.chainName} marks ${row.title} available on its first-party store surface bound to ${source.store.address}. ${row.quantity > 0 ? 'The retailer reports a positive quantity.' : 'Exact quantity is not published.'}`,
    caveat: 'First-party retailer availability may change quickly. Verify pickup availability before driving.',
    raw: {
      chain: source.id,
      platform: source.platform,
      merchantId: source.merchantId,
      product: { id: row.productId, handle: row.handle || null },
      variant: { id: variantId, optionId: row.optionId || null, size: row.size || null, available: true, price: row.price },
      reportedQuantity: row.reportedQuantity ?? null,
      fulfillmentPolicyUrl: source.fulfillmentPolicyUrl,
      fulfillmentPolicyVerified,
      matchGuard: unsafeReason,
    },
  };
}

async function collectNevada(config, bible) {
  const observedAt = new Date().toISOString();
  const cache = await readNevadaRetailerCache();
  if (process.env.BOURBON_SIGNAL_NV_FORCE_LIVE !== '1' && cache) {
    return {
      signals: cachedNevadaSignals(cache),
      roadblocks: [{ state: config.id, source: 'Nevada first-party retailer cache reuse', url: NEVADA_RETAILER_ARTIFACT_PATH, status: 200, error: `Using ${cache.signals.length} fresh cached Nevada retailer rows from ${cache.generatedAt}; set BOURBON_SIGNAL_NV_FORCE_LIVE=1 for a bounded live refresh.`, nextRoute: 'Keep retailer requests low-cadence and force live only for source verification or scheduled refresh windows.' }],
    };
  }

  const liveSignals = [];
  const roadblocks = [];
  const completedSourceIds = new Set();
  for (const source of NEVADA_RETAILER_SOURCES.filter((candidate) => candidate.inventoryEligible)) {
    let fulfillmentPolicyVerified = false;
    let rows = [];
    if (source.platform === 'cityhive') {
      const res = await textFetch(source.productsUrl, { headers: { accept: 'text/html,*/*' }, timeoutMs: 35_000 });
      if (!res.ok || !verifyNevadaCityHiveStorePage(source, res.text)) {
        roadblocks.push({ state: config.id, source: source.sourceLabel, url: source.productsUrl, status: res.status || (res.ok ? 'identity_or_store_schema_mismatch' : 0), error: res.ok ? 'First-party CityHive page no longer proves the exact merchant and Nevada premises identity.' : (res.error || `HTTP ${res.status}`), nextRoute: 'Fail closed; re-audit the exact merchant/store page without bypassing retailer controls.' });
        await sleep(NEVADA_RETAILER_SOURCE_DELAY_MS);
        continue;
      }
      fulfillmentPolicyVerified = true;
      rows = parseNevadaCityHiveHtml(res.text);
      completedSourceIds.add(source.id);
    } else if (source.platform === 'pos360') {
      const policyRes = await textFetch(source.fulfillmentPolicyUrl, { headers: { accept: 'text/html,*/*' }, timeoutMs: 35_000 });
      fulfillmentPolicyVerified = policyRes.ok && verifyNevadaFulfillmentPolicy(source, policyRes.text);
      if (!fulfillmentPolicyVerified) {
        roadblocks.push({ state: config.id, source: source.sourceLabel, url: source.fulfillmentPolicyUrl, status: policyRes.status || (policyRes.ok ? 'missing_fulfillment_evidence' : 0), error: policyRes.ok ? 'First-party page no longer proves in-store pickup at the exact Nevada premises.' : (policyRes.error || `HTTP ${policyRes.status}`), nextRoute: 'Fail closed and re-audit first-party pickup policy.' });
        await sleep(NEVADA_RETAILER_SOURCE_DELAY_MS);
        continue;
      }
      const seenRows = new Set();
      for (let page = 1; page <= source.maxPages; page++) {
        const url = page === 1 ? source.productsUrl : `${source.productsUrl}?page=${page}`;
        const res = await textFetch(url, { headers: { accept: 'text/html,*/*' }, timeoutMs: 35_000 });
        if (!res.ok) {
          roadblocks.push({ state: config.id, source: source.sourceLabel, url, status: res.status || 0, error: res.error || `HTTP ${res.status}`, nextRoute: 'Stop this bounded collection page sequence and retain only fresh prior-source cache rows.' });
          break;
        }
        const pageRows = parseNevadaPos360Html(res.text, { merchantId: source.merchantId });
        for (const row of pageRows) {
          const key = `${row.productId}:${row.variantId}`;
          if (!seenRows.has(key)) { seenRows.add(key); rows.push(row); }
        }
        await sleep(NEVADA_RETAILER_SOURCE_DELAY_MS);
      }
      if (rows.length > 0) completedSourceIds.add(source.id);
    } else if (source.platform === 'albertsons-xapi') {
      const host = `https://${source.host}`;
      const params = new URLSearchParams({
        'request-id': String(Date.now()), url: host, pageurl: host, pagename: 'search', rows: '100', start: '0',
        'search-type': 'keyword', storeid: source.merchantId, featured: 'true', 'search-uid': '', q: 'bourbon', channel: 'instore', banner: source.banner,
      });
      const url = `${source.productsUrl}?${params}`;
      const res = await textFetch(url, { headers: { accept: 'application/json', 'ocp-apim-subscription-key': AZ_ALBERTSONS_SEARCH_KEY }, timeoutMs: 30_000 });
      if (!res.ok) {
        roadblocks.push({ state: config.id, source: source.sourceLabel, url, status: res.status || 0, error: res.error || `HTTP ${res.status}`, nextRoute: 'Refresh the public storefront search key and retry the exact frozen Nevada store at low cadence.' });
        await sleep(NEVADA_RETAILER_SOURCE_DELAY_MS);
        continue;
      }
      let payload;
      try { payload = JSON.parse(res.text); } catch (error) {
        roadblocks.push({ state: config.id, source: source.sourceLabel, url, status: res.status || 0, error: error instanceof Error ? error.message : String(error), nextRoute: 'Inspect the reachable XAPI response shape; malformed data fails closed.' });
        await sleep(NEVADA_RETAILER_SOURCE_DELAY_MS);
        continue;
      }
      if (!Array.isArray(payload?.response?.docs)) {
        roadblocks.push({ state: config.id, source: source.sourceLabel, url, status: 'malformed_reachable_payload', error: 'XAPI response did not contain response.docs.', nextRoute: 'Inspect the public response without weakening store or in-store channel guards.' });
        await sleep(NEVADA_RETAILER_SOURCE_DELAY_MS);
        continue;
      }
      rows = parseNevadaAlbertsonsXapi(payload);
      fulfillmentPolicyVerified = true;
      completedSourceIds.add(source.id);
    }

    for (const row of rows) {
      const signal = nevadaRetailerSignal(config, source, row, bible, observedAt, fulfillmentPolicyVerified);
      if (signal) liveSignals.push(signal);
    }
    if (!liveSignals.some((signal) => signal.sourceChain === source.id)) {
      roadblocks.push({ state: config.id, source: source.sourceLabel, url: source.productsUrl, status: 'reachable_no_safe_inventory_rows', error: `${source.platform} returned ${rows.length} candidate rows but no safely matched available bourbon rows survived source, size, format, product, and premises guards.`, nextRoute: 'Inspect current first-party product identity without weakening safety or premises guards.' });
    }
    await sleep(NEVADA_RETAILER_SOURCE_DELAY_MS);
  }

  const signals = mergeNevadaSourceCacheSignals(liveSignals, cachedNevadaSignals(cache), completedSourceIds);
  if (completedSourceIds.size > 0 && signals.length > 0) await writeNevadaRetailerCache(signals, roadblocks);
  if (!signals.some((signal) => signal.eventType === 'retailer_store_inventory_result')) {
    roadblocks.push({ state: config.id, source: 'Nevada first-party retailer availability', url: NEVADA_RETAILER_SOURCES.filter((source) => source.inventoryEligible).map((source) => source.productsUrl).join(', '), status: 'reachable_no_inventory_rows', error: 'No fresh, identity-bound Nevada retailer pickup/orderability rows survived the guarded collector.', nextRoute: 'Keep Nevada unpromoted until qualified first-party rows are runner-reachable; do not substitute catalog, shipping, or marketplace presence.' });
  }
  return { signals, roadblocks };
}

async function collectKentucky(config, bible) {
  const observedAt = new Date().toISOString();
  const availability = await collectKentuckyBuffaloTraceAvailability(config, bible, observedAt);
  const releaseWatch = await collectKentuckyReleaseWatchPages(config, bible, observedAt);
  return {
    signals: [...availability.signals, ...releaseWatch.signals],
    roadblocks: [...availability.roadblocks, ...releaseWatch.roadblocks]
  };
}

const LEGACY_PRECISION_RUNTIME_STATES = new Set([
  'KY', 'OH', 'OR', 'IA', 'UT', 'ID', 'AL', 'NC', 'IL', 'IN', 'TN', 'AZ', 'NV', 'FL', 'GA', 'SC', 'TX', 'VA', 'PA', 'MD-MONTGOMERY', 'NY', 'CO',
]);

function precisionRuntimeUrl(config) {
  return (config.sources || []).find((source) => source.precisionOnly && source.url)?.url
    || config.sources?.[0]?.url
    || null;
}

async function collectPrecisionProbesDirect(config, bible, existingSignals = [], options = {}) {
  if (config.id === 'MS') return collectMississippiRetailers(config, {
    ...options,
    matchBottle: (rawName) => {
      const { match, record } = cityHiveSafeBottleMatch(rawName, bible);
      return record ? { ...record, confidence: match?.confidence || 0.8 } : null;
    },
  });
  if (config.id === 'KY') return collectKentucky(config, bible);
  if (config.id === 'OH') return collectOhio(config, bible);
  if (config.id === 'OR') return collectOregon(config, bible);
  if (config.id === 'IA') return collectIowa(config, bible, existingSignals);
  if (config.id === 'UT') return collectUtah(config, bible);
  if (config.id === 'ID') return collectIdaho(config, bible);
  if (config.id === 'AL') return collectAlabama(config, bible);
  if (config.id === 'NC') return collectNorthCarolinaIntelligence(config, bible, collectNcStoreInventory);
  if (config.id === 'IL') return collectIllinois(config, bible);
  if (config.id === 'IN') return collectIndiana(config, bible);
  if (config.id === 'TN') return collectTennessee(config, bible, options);
  if (config.id === 'AZ') return collectArizona(config, bible, options);
  if (config.id === 'CA') return collectCalifornia(config, bible, options);
  if (config.id === 'NV') return collectNevada(config, bible);
  if (config.id === 'FL') return collectFlorida(config, bible, existingSignals, options);
  if (config.id === 'GA') return collectGeorgia(config, bible, options);
  if (config.id === 'NY' || config.id === 'CO') return collectMetroRetailers(config, bible, options);
  if (config.id === 'SC') return collectSouthCarolina(config, bible);
  if (config.id === 'TX') return collectTexas(config, bible);
  if (config.id === 'VA') return collectVirginia(config, bible, options);
  if (config.id === 'PA') return collectPennsylvania(config, bible);
  if (config.id === 'MD-MONTGOMERY') return collectMontgomery(config, bible);
  return { signals: [], roadblocks: [] };
}

export function legacyPrecisionRuntimeOptions(stateId, sourceRunnerOptions = {}, env = process.env) {
  const stateKey = String(stateId || '').toUpperCase();
  const stateTimeout = env[`BOURBON_SIGNAL_${stateKey}_PRECISION_TIMEOUT_MS`];
  const stateAttempts = env[`BOURBON_SIGNAL_${stateKey}_PRECISION_ATTEMPTS`];
  const explicitlyTargeted = String(env.BOURBON_SIGNAL_RUN_STATES || '')
    .split(',')
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean)
    .includes(stateKey);
  const defaultTimeoutMs = stateKey === 'VA' ? 1_140_000 : ['TN', 'FL'].includes(stateKey) ? 600_000 : stateKey === 'SC' ? 420_000 : ['AZ', 'GA', 'TX'].includes(stateKey) ? 300_000 : ['NY', 'CO'].includes(stateKey) ? 240_000 : 120_000;
  const defaultMaxAttempts = ['VA', 'AZ', 'GA', 'NY', 'CO', 'TN', 'FL'].includes(stateKey) ? 1 : 2;
  return {
    ...sourceRunnerOptions,
    ...(stateKey === 'VA' || explicitlyTargeted ? { schedule: false } : {}),
    timeoutMs: sourceRunnerOptions.timeoutMs ?? Number(stateTimeout || env.BOURBON_SIGNAL_LEGACY_PRECISION_TIMEOUT_MS || defaultTimeoutMs),
    maxAttempts: sourceRunnerOptions.maxAttempts ?? Number(stateAttempts || env.BOURBON_SIGNAL_LEGACY_PRECISION_ATTEMPTS || defaultMaxAttempts),
  };
}

function eligibleMetroPreviousPrecisionResults(previousResults, stateId) {
  if (!['NY', 'CO'].includes(stateId) || !previousResults || typeof previousResults !== 'object') return previousResults;
  const eligible = new Set(configuredMetroSources({ id: stateId }).filter((source) => source.inventoryEligible === true).map((source) => source.id));
  return Object.fromEntries(Object.entries(previousResults).map(([key, result]) => {
    const previousSignals = Array.isArray(result?.value?.signals) ? result.value.signals : [];
    return [key, {
      ...result,
      value: {
        ...(result?.value || {}),
        signals: previousSignals.filter((signal) => eligible.has(signal.sourceChain)),
      },
    }];
  }));
}

export function precisionExistingSignalsForState(stateId, existingSignals = [], previousSourceResults = {}) {
  if (stateId !== 'FL') return existingSignals;
  const previousSignals = previousSourceResults?.[legacyPrecisionSourceId(stateId)]?.value?.signals;
  if (!Array.isArray(previousSignals)) return existingSignals;
  return [...new Map([...previousSignals, ...existingSignals].map((signal) => [signal.id, signal])).values()];
}

export async function collectPrecisionProbes(config, bible, existingSignals = [], options = {}) {
  if (config.id === 'CA') return collectCalifornia(config, bible, options);
  if (!LEGACY_PRECISION_RUNTIME_STATES.has(config.id)) {
    return collectPrecisionProbesDirect(config, bible, existingSignals, options);
  }
  const sourceRunnerOptions = options.sourceRunnerOptions || {};
  const precisionExistingSignals = precisionExistingSignalsForState(config.id, existingSignals, options.previousSourceResults);
  return runLegacyPrecisionSource({
    sourceId: legacyPrecisionSourceId(config.id),
    stateId: config.id,
    label: `${config.label} precision collector`,
    url: precisionRuntimeUrl(config),
    collect: ({ signal }) => collectPrecisionProbesDirect(config, bible, precisionExistingSignals, { ...options, signal }),
    previousResults: eligibleMetroPreviousPrecisionResults(options.previousSourceResults, config.id),
    circuitBreaker: options.sourceCircuitBreaker,
    sourceRunnerOptions: legacyPrecisionRuntimeOptions(config.id, sourceRunnerOptions),
  });
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
  const observedAt = new Date().toISOString();
  try {
    const artifact = await collectIndianaAtcPackageStores();
    const atcObservedAt = artifact.generatedAt || observedAt;

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
        observedAt: atcObservedAt,
        canAlertAsInventory: false,
        canAlertAsWatch: false,
        inventorySemantics: 'Indiana ATC permits identify active package-store license locations. This is store coverage infrastructure, not bottle inventory or allocation evidence.',
        evidence: `Indiana ATC public permit lookup lists ${store.name}${store.city ? ` in ${store.city}` : ''}${store.zip ? ` ${store.zip}` : ''} as Active ${store.licenseType || 'package store'} permit ${store.permitNumber}.`,
        raw: { permit: store, artifactPath: IN_ATC_ARTIFACT_PATH }
      });
    }
    const bourbonWorld = await textFetch(IN_BOURBON_WORLD_URL, { headers: { accept: 'text/html,*/*' } });
    if (bourbonWorld.ok) {
      const allocatedItems = parseIndianaBourbonWorldAllocated(bourbonWorld.text)
        .filter((item) => RARE_RE.test(item.rawName) || /van winkle|blanton|buffalo trace/i.test(item.rawName));
      for (const item of allocatedItems) {
        const matchName = indianaBourbonWorldBottleMatchName(item.rawName);
        const { match, record } = bottleMatch(matchName, bible);
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
          raw: { item, source: 'bourbonworld_current_rare_allocated_bottles', matchName }
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
        const matchName = indianaLiquorGroupBottleMatchName(event.rawName);
        const { match, record } = bottleMatch(matchName, bible);
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
          eventDate: event.eventDate || null,
          releaseDate: event.eventDate || null,
          eventTime: event.timeText || null,
          quantity: null,
          price: null,
          availabilityStatus: 'retailer_event_watch',
          canAlertAsInventory: false,
          canAlertAsWatch: true,
          inventorySemantics: 'Indiana Liquor Group publishes dated store tasting events. These are actionable retailer watch/event signals, not bottle inventory.',
          evidence: `${event.rawName} tasting/event listed by Indiana Liquor Group at ${event.locationText}, ${event.city}${event.dateText ? ` on ${event.dateText}` : ''}${event.timeText ? ` ${event.timeText}` : ''}. Verify with the retailer before driving.`,
          raw: { source: 'indiana_liquor_group_events', event, matchName }
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

    const penguin = await collectIndianaPenguinLiquor(config, bible, observedAt);
    signals.push(...penguin.signals);
    roadblocks.push(...penguin.roadblocks);

    const doorDashFrontier = await collectIndianaDoorDashFrontier(config, bible, observedAt);
    signals.push(...doorDashFrontier.signals);
    roadblocks.push(...doorDashFrontier.roadblocks);

    const cityHive = await collectIndianaCityHive(config, bible, observedAt);
    signals.push(...cityHive.signals);
    roadblocks.push(...cityHive.roadblocks);

    const target = await collectIndianaTarget(config, bible, observedAt);
    signals.push(...target.signals);
    roadblocks.push(...target.roadblocks);
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

function ohlqSafeBottleMatch(rawName, bible) {
  const safe = cityHiveSafeBottleMatch(rawName, bible);
  const raw = normalizedBottleText(rawName);
  const canonical = normalizedBottleText(safe.record?.canonical || '');
  if (/\b(cocktail|rtp|ready to pour|ready to drink|vodka|gin|rum|tequila|mezcal|wine|beer|seltzer|liqueur|cream)\b/.test(raw) && !/\b(cocktail|ready to drink|liqueur|cream)\b/.test(canonical)) return { ...safe, record: null, unsafeReason: 'non_bourbon_or_rtd_matched_core_bottle' };
  if (/yellowstone/.test(raw) && /\b(small batch|select|6yr|6 year)\b/.test(raw) && /limited edition/.test(canonical)) return { ...safe, record: null, unsafeReason: 'yellowstone_standard_not_limited_edition' };
  if (/bulleit/.test(raw) && /mesquite/.test(raw) && !/mesquite/.test(canonical)) return { ...safe, record: null, unsafeReason: 'bulleit_mesquite_not_core_bottle' };
  return safe;
}

function ohlqSignalBase(state, sourceLabel, sourceUrl, rawName, bible) {
  const { match, record, unsafeReason } = ohlqSafeBottleMatch(rawName, bible);
  return { match, record, unsafeReason, base: {
    state,
    sourceLabel,
    sourceUrl,
    rawName,
    canonicalBottleId: record?.id || null,
    canonicalName: record?.canonical || titleCase(rawName),
    confidence: record ? Math.max(0.78, match?.confidence || 0.35) : 0.45,
    sourceMatchStatus: record ? 'bottle_bible_match' : `source_name_kept:${unsafeReason || 'no_safe_bible_match'}`,
    fetchedAt: new Date().toISOString()
  }};
}

async function collectOhio(config, bible) {
  const signals = [], roadblocks = [];
  const browserOutPath = 'out/browser/ohlq-availability.json';
  const cooldownPath = 'out/browser/ohlq-cooldown.json';
  const discoveryPath = 'data/browser-discovery/ohlq-product-availability-discovery.json';
  const staleAfterMs = Number(process.env.BOURBON_SIGNAL_OHLQ_STALE_AFTER_MS || 12 * 60 * 60_000);
  let stale = false;
  let staleReason = null;
  let previousFinishedAt = null;
  try {
    const cooldown = JSON.parse(await readFile(cooldownPath, 'utf8'));
    const until = Date.parse(cooldown?.cooldownUntil || '');
    if (Number.isFinite(until) && until > Date.now()) {
      stale = true;
      staleReason = `OHLQ cooldown active until ${cooldown.cooldownUntil}`;
    }
  } catch {}
  try {
    const browserRun = JSON.parse(await readFile(browserOutPath, 'utf8'));
    previousFinishedAt = browserRun.generatedAt || null;
    const generatedAtMs = Date.parse(browserRun.generatedAt || '');
    if (Number.isFinite(generatedAtMs) && Date.now() - generatedAtMs > staleAfterMs) {
      stale = true;
      staleReason = staleReason || `OHLQ browser artifact older than ${Math.round(staleAfterMs / 3600000)}h`;
    }
    for (const product of browserRun.products || []) {
      if (!product.ok || !Array.isArray(product.inventories)) continue;
      const productSku = String(product.sku || '').toLowerCase();
      const variantRows = product.inventories.filter((store) => String(store.VariantCode || '').toLowerCase() === productSku);
      const hasVariantCodes = product.inventories.some((store) => Boolean(store.VariantCode));
      const matchingRows = variantRows.length ? variantRows : hasVariantCodes ? [] : product.inventories;
      const bucketCounts = matchingRows.reduce((counts, store) => {
        const availability = ohlqAvailability(store.I);
        counts[availability.status] = (counts[availability.status] || 0) + 1;
        return counts;
      }, {});
      const positiveRows = matchingRows.filter((store) => ohlqAvailability(store.I).positive);
      for (const store of positiveRows) {
        const availability = ohlqAvailability(store.I);
        const { base, unsafeReason } = ohlqSignalBase(config.id, 'OHLQ browser-assisted product availability API', product.pageUrl || product.endpoint, product.productName || product.sku, bible);
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
          raw: { product: { sku: product.sku, productName: product.productName, endpoint: product.endpoint, displayStatus: product.displayStatus, inventoryCount: product.inventoryCount, matchingVariantRowCount: matchingRows.length, positiveVariantRowCount: positiveRows.length, bucketCounts, generatedAt: browserRun.generatedAt }, availability: { ...availability, bucket: store.I || null }, store, sourceMatchStatus: base.sourceMatchStatus, unsafeReason: unsafeReason || null }
        });
      }
      if (!matchingRows.length && hasVariantCodes) {
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
      return { signals, roadblocks, stale, staleReason, previousFinishedAt };
    }
  } catch {
    // Fall through to static discovery evidence below; the browser collector is optional for normal raw-fetch runs.
  }
  try {
    const prior = JSON.parse(await readFile('out/current-snapshot.json', 'utf8'));
    const priorOhlq = (prior.signals || []).filter((s) => s.state === config.id && /^browser_assisted_store_inventory_/.test(String(s.eventType || '')) && ['limited_supply', 'in_stock'].includes(String(s.availabilityStatus || '')));
    const priorObservedTimes = priorOhlq.map((signal) => Date.parse(signal.observedAt || '')).filter(Number.isFinite);
    if (!previousFinishedAt && priorObservedTimes.length) previousFinishedAt = new Date(Math.max(...priorObservedTimes)).toISOString();
    if (!previousFinishedAt && Number.isFinite(Date.parse(prior.generatedAt || ''))) previousFinishedAt = new Date(Date.parse(prior.generatedAt)).toISOString();
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
      return { signals, roadblocks, stale: true, staleReason: staleReason || 'OHLQ browser artifact did not contain positive decoded rows; retained prior snapshot rows', previousFinishedAt };
    }
  } catch {
    // No prior operational OHLQ snapshot is available; fall through to the hydrated state report.
  }
  try {
    const priorStateReport = JSON.parse(await readFile('out/states/OH.json', 'utf8'));
    const seeded = seedOhioInventoryCacheSignals(priorStateReport);
    signals.push(...seeded.signals);
    if (signals.length) {
      previousFinishedAt = previousFinishedAt || seeded.generatedAt;
      roadblocks.push({ state: config.id, source: 'OHLQ scheduled browser refresh fallback', url: browserOutPath, status: 0, error: 'Current OHLQ browser artifact was unavailable; retained stale, non-alerting OHLQ rows from the hydrated Ohio state report.', nextRoute: 'Refresh OHLQ from an already-warmed interactive browser session while preserving the labeled state-report fallback.' });
      return { signals, roadblocks, stale: true, staleReason: staleReason || 'OHLQ browser artifact unavailable; retained hydrated state-report rows', previousFinishedAt };
    }
  } catch {
    // No hydrated Ohio report is available; fall through to static discovery evidence.
  }
  try {
    const seeded = await loadOhioInventoryRecoverySeed('data/ohlq-recovery-seed-2026-07-22.json.gz');
    signals.push(...seeded.signals);
    if (signals.length) {
      previousFinishedAt = previousFinishedAt || seeded.generatedAt;
      roadblocks.push({ state: config.id, source: 'OHLQ bounded recovery seed', url: browserOutPath, status: 0, error: 'No live, current-snapshot, or hydrated-state OHLQ inventory was available; restored the bounded July 22 capture as stale, non-alerting feed context.', nextRoute: 'Replace the recovery seed with a fresh warmed-browser collection; never use seeded rows for alerts.' });
      return { signals, roadblocks, stale: true, staleReason: staleReason || 'OHLQ bounded recovery seed retained as stale feed context', previousFinishedAt };
    }
  } catch {
    // No bounded recovery seed is available; fall through to static discovery evidence.
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
  return { signals, roadblocks, stale, staleReason, previousFinishedAt };
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

export function transformUtahAggregateRow(config, bible, row, { observedAt = null } = {}) {
  const { base, record, unsafeReason } = aggregateSignalBase(config.id, 'Utah DABS Product Locator DataTables API', 'https://webapps2.abc.utah.gov/ProdApps/ProductLocatorCore', row.name, bible);
  if (observedAt) base.fetchedAt = observedAt;
  const storeQty = Number(row.storeQty || 0) || 0;
  const warehouseQty = Number(row.warehouseQty || 0) || 0;
  return { id: stableId([config.id, row.sku, row.storeQty, row.warehouseQty, row.status]), ...base, tier: record?.tier || 'unknown', eventType: 'board_inventory_aggregate', locationPrecision: 'board_warehouse', locationName: 'Utah DABS statewide locator aggregate', storeQty, warehouseQty, quantity: null, onOrderQty: row.onOrderQty ?? null, price: Number(row.bottlePrice || row.currentPrice || 0) || null, availabilityStatus: storeQty > 0 ? 'STORE_AGGREGATE_POSITIVE' : warehouseQty > 0 ? 'WAREHOUSE_AGGREGATE_POSITIVE' : 'AGGREGATE_ZERO', availabilityLabel: storeQty > 0 ? `${storeQty} statewide store units reported` : warehouseQty > 0 ? `${warehouseQty} warehouse units reported` : 'No aggregate stock reported', observedAt: base.fetchedAt, canAlertAsInventory: false, canAlertAsWatch: false, inventorySemantics: 'Utah DABS Product Locator reports statewide storeQty and warehouseQty aggregates by SKU. This is board/warehouse intelligence, not exact store shelf inventory.', evidence: `Utah DABS API row for ${row.name}: storeQty=${row.storeQty}, warehouseQty=${row.warehouseQty}, status=${row.status}. This is statewide aggregate data, not a per-store shelf count.`, raw: { ...row, sourceCaveat: 'Statewide store/warehouse aggregate; exact store drilldown not extracted.', sourceMatchStatus: base.sourceMatchStatus, unsafeReason: unsafeReason || null } };
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
          signals.push(transformUtahAggregateRow(config, bible, row));
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

function virginiaStoreSignals(product, json, config, bible, url, supportedStoreIds = null, origin = null) {
  const signals = [];
  const originStoreId = String(origin?.storeNumber || '').trim();
  const rows = selectVirginiaOriginStoreRows(json, originStoreId, product.code);
  for (const store of rows) {
    const storeId = store.storeId ?? store.storeNumber ?? store.id;
    if (!storeId || (supportedStoreIds && !supportedStoreIds.has(String(storeId)))) continue;
    const quantity = Number(store.quantity ?? 0) || 0;
    const productUrl = `https://www.abc.virginia.gov/products/bourbon/${product.slug}`;
    const storeUrl = `https://www.abc.virginia.gov/stores/${storeId}`;
    const apiPhone = store.PhoneNumber?.FormattedPhoneNumber || null;
    const { base } = signalBase(config.id, 'Virginia ABC storeNearby inventory API', storeUrl, product.name, bible);
    signals.push({
      id: stableId([config.id, 'va-store-nearby', product.code, storeId]),
      ...base,
      eventType: quantity > 0 ? 'store_inventory_result' : 'store_inventory_out_of_stock',
      locationPrecision: 'store_level',
      locationName: `Virginia ABC Store ${storeId}`,
      storeName: `Virginia ABC Store ${storeId}`,
      storeId: String(storeId),
      storeAddress: store.address || [store.address1, store.address2, store.city, store.state, store.zip].filter(Boolean).join(', '),
      storeUrl: storeUrl,
      storePhone: apiPhone || origin?.phone || null,
      storeHours: store.hours || null,
      shoppingCenter: store.shoppingCenter || null,
      city: store.city || origin?.city || null,
      county: origin?.county || null,
      stateCode: store.state || 'VA',
      zip: store.zip || origin?.zip || null,
      postalCode: store.zip || origin?.zip || null,
      lat: Number(store.latitude ?? origin?.lat ?? 0) || null,
      lng: Number(store.longitude ?? origin?.lng ?? 0) || null,
      latitude: Number(store.latitude ?? origin?.lat ?? 0) || null,
      longitude: Number(store.longitude ?? origin?.lng ?? 0) || null,
      distance: Number(store.distance ?? 0) || null,
      quantity,
      reportedQuantity: quantity,
      quantityIsExact: true,
      availabilityStatus: quantity > 0 ? 'in_stock' : 'out_of_stock',
      availabilityLabel: quantity > 0 ? `${quantity} reported available` : 'Out of stock',
      sourceAvailabilityVerified: true,
      premisesVerified: true,
      observedAt: base.fetchedAt,
      canAlertAsInventory: quantity > 0,
      canAlertAsWatch: true,
      inventorySemantics: 'Virginia ABC public storeNearby API reports an exact source quantity for the selected official store at collection time. Inventory can move quickly and is not a reservation; verify before driving.',
      evidence: `Virginia ABC reports ${quantity} bottle(s) of ${product.name} at Store ${storeId}${store.city ? ` in ${store.city}` : ''}. ${product.limitedCaveat ? 'Limited-availability products may be intentionally hidden or randomized outside authorized release windows.' : 'This is a normal-product inventory reading.'} Verify before driving.`,
      raw: {
        product: { ...product, url: productUrl },
        store,
        originStoreId,
        inventoryEndpoint: url,
        storeUrl,
        productUrl,
        sourceQuantityReported: true,
        sourceAvailabilityVerified: true,
        premisesVerified: true,
        virginiaCacheSchemaVersion: 2
      }
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
    raw: { ...(signal.raw || {}), cacheGeneratedAt }
  };
}

function virginiaRetryAfterMs(response, fallbackMs) {
  const raw = response?.retryAfter;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.max(fallbackMs, seconds * 1_000);
  const at = Date.parse(String(raw || ''));
  return Number.isFinite(at) ? Math.max(fallbackMs, at - Date.now()) : fallbackMs;
}

async function fetchVirginiaInventoryOrigin(product, origin, signal, sharedRateLimitState) {
  const originStoreId = String(origin.storeNumber);
  const url = `https://www.abc.virginia.gov/webapi/inventory/storeNearby?storeNumber=${encodeURIComponent(originStoreId)}&productCode=${encodeURIComponent(product.code)}&mileRadius=999&storeCount=5&buffer=0`;
  const attempts = Math.max(1, Math.min(4, Number(process.env.BOURBON_SIGNAL_VA_SOURCE_ATTEMPTS || 3)));
  const retryDelayMs = Math.max(500, Number(process.env.BOURBON_SIGNAL_VA_RETRY_DELAY_MS || 2_000));
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    throwIfVirginiaAborted(signal);
    if (sharedRateLimitState?.tripped) {
      return { ok: false, origin, originStoreId, url, status: 429, error: `Virginia ABC shared rate-limit circuit is open until ${new Date(sharedRateLimitState.blockedUntil).toISOString()}.` };
    }
    const res = await textFetch(url, { signal, headers: { accept: 'application/json,*/*', referer: `https://www.abc.virginia.gov/products/bourbon/${product.slug}` } });
    throwIfVirginiaAborted(signal);
    if (res.ok) {
      try {
        return { ok: true, origin, originStoreId, url, json: JSON.parse(res.text) };
      } catch (error) {
        return { ok: false, origin, originStoreId, url, status: res.status, error: `Invalid Virginia ABC JSON: ${error.message}` };
      }
    }
    if (Number(res.status) === 429) {
      const blockedForMs = virginiaRetryAfterMs(res, retryDelayMs);
      if (sharedRateLimitState) {
        sharedRateLimitState.tripped = true;
        sharedRateLimitState.blockedUntil = Math.max(sharedRateLimitState.blockedUntil || 0, Date.now() + blockedForMs);
      }
      return { ok: false, origin, originStoreId, url, status: 429, error: `Virginia ABC rate limit opened the shared circuit for at least ${blockedForMs} ms.` };
    }
    const retryable = Number(res.status) >= 500 || Number(res.status) === 0;
    if (!retryable || attempt === attempts) return { ok: false, origin, originStoreId, url, status: res.status, error: res.text.slice(0, 300) };
    await virginiaAbortableDelay(retryDelayMs * attempt + Math.floor(Math.random() * 500), signal);
  }
  return { ok: false, origin, originStoreId, url, status: 0, error: 'Virginia ABC request attempts exhausted.' };
}

async function collectVirginia(config, bible, options = {}) {
  const roadblocks = [];
  const cached = await readCachedVirginiaSignals();
  const rawCachedSignals = cached.signals || [];
  const sanitizedCachedSignals = sanitizeVirginiaInventoryCacheSignals(rawCachedSignals);
  let stores = [{ storeNumber: '101', name: 'Virginia ABC Store 101' }];
  let storeUniverseVerified = false;
  try {
    stores = (await virginiaStoreNumbers()).filter((store) => !VIRGINIA_INVALID_ORIGIN_STORES.has(String(Number(store.storeNumber))));
    if (!stores.length) throw new Error('No Virginia ABC stores parsed from ArcGIS');
    storeUniverseVerified = true;
  } catch (error) {
    roadblocks.push({ state: config.id, source: 'Virginia ABC stores ArcGIS', url: VIRGINIA_STORES_ARCGIS_URL, status: 0, error: error.message, nextRoute: 'Use location bible official store export or Virginia ABC store locator as fallback.' });
  }

  const expectedStoreIds = new Set(stores.map((store) => String(store.storeNumber)));
  const retiredOriginStoreIds = new Set();
  const supportedCachedSignals = storeUniverseVerified
    ? sanitizedCachedSignals.filter((signal) => expectedStoreIds.has(String(signal.storeId || '')))
    : sanitizedCachedSignals;
  const cacheNeedsSanitization = supportedCachedSignals.length !== rawCachedSignals.length
    || supportedCachedSignals.some((signal) => signal.raw?.legacyVirginiaCache === true);
  const cachedSignals = supportedCachedSignals;
  const nowMs = Date.now();
  const cachedProductCodes = new Set(cachedSignals.map(virginiaProductCode).filter(Boolean));
  const missingCachedProductCodes = new Set(VIRGINIA_PRODUCTS.map((product) => product.code).filter((code) => !cachedProductCodes.has(code)));
  const staleCachedProductCodes = new Set(cachedSignals
    .filter((signal) => {
      const observedAt = Date.parse(String(signal.observedAt || ''));
      return !Number.isFinite(observedAt) || nowMs - observedAt > VIRGINIA_INVENTORY_MAX_AGE_MS;
    })
    .map(virginiaProductCode)
    .filter(Boolean));
  const recoveryBacklogProductCodes = new Set([...missingCachedProductCodes, ...staleCachedProductCodes]);
  const refreshProductLimit = !cachedSignals.length || recoveryBacklogProductCodes.size > VIRGINIA_PRODUCTS_PER_RUN
    ? VIRGINIA_COLD_START_PRODUCTS_PER_RUN
    : VIRGINIA_PRODUCTS_PER_RUN;
  const selectedProducts = selectVirginiaProductsForRefresh(storeUniverseVerified ? VIRGINIA_PRODUCTS : [], cachedSignals, nowMs, {
    maxProducts: refreshProductLimit,
    regularIntervalMs: VIRGINIA_REGULAR_REFRESH_MS,
    limitedIntervalMs: VIRGINIA_LIMITED_REFRESH_MS,
    force: process.env.BOURBON_SIGNAL_VA_FORCE_LIVE === '1'
  });
  const livePartitions = new Map();
  const completedProductCodes = new Set();
  const batchSize = Math.max(1, Math.min(8, Number(process.env.BOURBON_SIGNAL_VA_BATCH_SIZE || 4)));
  const batchDelayMs = Math.max(100, Number(process.env.BOURBON_SIGNAL_VA_BATCH_DELAY_MS || 500));
  const sharedRateLimitState = { tripped: false, blockedUntil: 0 };
  let stopForRateLimit = false;

  for (const product of selectedProducts) {
    const productSignals = [];
    const seenSignalIds = new Set();
    const productErrors = [];
    for (let i = 0; i < stores.length; i += batchSize) {
      throwIfVirginiaAborted(options.signal);
      if (sharedRateLimitState.tripped) {
        stopForRateLimit = true;
        break;
      }
      const batch = stores
        .slice(i, i + batchSize)
        .filter((origin) => !retiredOriginStoreIds.has(String(origin.storeNumber)));
      const results = await Promise.allSettled(batch.map((origin) => fetchVirginiaInventoryOrigin(product, origin, options.signal, sharedRateLimitState)));
      throwIfVirginiaAborted(options.signal);
      for (const result of results) {
        if (result.status === 'rejected') {
          productErrors.push({ status: 0, url: `https://www.abc.virginia.gov/products/bourbon/${product.slug}`, error: result.reason?.message || String(result.reason) });
          continue;
        }
        if (!result.value.ok) {
          if (isVirginiaRetiredOriginFailure(result.value)) {
            retiredOriginStoreIds.add(result.value.originStoreId);
            expectedStoreIds.delete(result.value.originStoreId);
            continue;
          }
          if (Number(result.value.status) === 429) stopForRateLimit = true;
          productErrors.push(result.value);
          continue;
        }
        const originSignals = virginiaStoreSignals(product, result.value.json, config, bible, result.value.url, expectedStoreIds, result.value.origin);
        if (!originSignals.length) {
          productErrors.push({
            status: 200,
            url: result.value.url,
            error: `Virginia ABC response did not contain the selected origin store ${result.value.originStoreId}.`
          });
          continue;
        }
        for (const signal of originSignals) {
          if (seenSignalIds.has(signal.id)) continue;
          seenSignalIds.add(signal.id);
          productSignals.push(signal);
        }
      }
      if (stopForRateLimit || sharedRateLimitState.tripped) break;
      if (i + batchSize < stores.length) await virginiaAbortableDelay(batchDelayMs, options.signal);
    }

    throwIfVirginiaAborted(options.signal);
    const coverage = evaluateVirginiaProductCoverage(productSignals, expectedStoreIds, { minimumExpectedStoreCount: 390 });
    if (coverage.complete && !stopForRateLimit) {
      livePartitions.set(product.code, productSignals);
      completedProductCodes.add(product.code);
    } else {
      const error = summarizeVirginiaProductErrors(productErrors);
      if (error) {
        roadblocks.push({
          state: config.id,
          source: 'Virginia ABC storeNearby inventory API',
          url: error.url || `https://www.abc.virginia.gov/products/bourbon/${product.slug}`,
          status: error.status || 0,
          error: error.error,
          nextRoute: 'Retry this bounded product partition after the source cools down; retain the last complete partition meanwhile.'
        });
      }
      roadblocks.push({
        state: config.id,
        source: 'Virginia ABC storeNearby inventory API partition guard',
        url: `https://www.abc.virginia.gov/products/bourbon/${product.slug}`,
        status: stopForRateLimit ? 429 : 0,
        error: `Retained the prior ${product.name} partition because the live pass covered ${coverage.coveredStoreCount} of ${coverage.expectedStoreCount} supported origin stores.`,
        nextRoute: 'Do not publish partial Virginia product coverage; rerun the bounded shard at the next cadence.'
      });
    }
    if (stopForRateLimit) break;
  }

  throwIfVirginiaAborted(options.signal);
  const mergedSignals = mergeVirginiaProductPartitions(cachedSignals, livePartitions, completedProductCodes)
    .filter((signal) => !storeUniverseVerified || expectedStoreIds.has(String(signal.storeId || '')));
  if (completedProductCodes.size || cacheNeedsSanitization || retiredOriginStoreIds.size) {
    throwIfVirginiaAborted(options.signal);
    await writeCachedVirginiaSignals(mergedSignals, options.signal);
  }
  const enrichedSignals = mergedSignals.map((signal) => enrichVirginiaCachedSignal(signal, cached.generatedAt));
  const signals = applyVirginiaInventoryFreshness(enrichedSignals, Date.now(), VIRGINIA_INVENTORY_MAX_AGE_MS);
  const staleProductCodes = new Set(signals
    .filter((signal) => isVirginiaRegularInventoryExpired(signal, Date.now(), VIRGINIA_INVENTORY_MAX_AGE_MS))
    .map((signal) => signal.raw?.product?.code)
    .filter(Boolean));
  const representedProductCodes = new Set(signals.map(virginiaProductCode).filter(Boolean));
  for (const product of VIRGINIA_PRODUCTS) {
    if (!representedProductCodes.has(product.code)) staleProductCodes.add(product.code);
  }
  if (staleProductCodes.size) {
    roadblocks.push({
      state: config.id,
      source: 'Virginia ABC rolling inventory freshness',
      url: VIRGINIA_CACHE_PATH,
      status: 'stale_partitions_retained',
      error: `${staleProductCodes.size} Virginia product partition(s) remain older than the live-inventory freshness window. They are visible only as stale context and cannot alert.`,
      nextRoute: 'Continue bounded Virginia shards until every monitored product partition is freshly confirmed.'
    });
  }
  return {
    signals,
    roadblocks,
    metadata: {
      virginia: {
        supportedOriginStoreIds: [...expectedStoreIds].sort((a, b) => Number(a) - Number(b)),
        supportedOriginStoreCount: expectedStoreIds.size,
        retiredOriginStoreIds: [...retiredOriginStoreIds].sort((a, b) => Number(a) - Number(b)),
        storeUniverseVerified,
        completedProductCodes: [...completedProductCodes],
        selectedProductCodes: selectedProducts.map((product) => product.code)
      }
    }
  };
}

const PA_SEARCH_TERMS = [
  'buffalo trace bourbon', 'weller bourbon', 'blanton bourbon', 'eagle rare bourbon', 'stagg bourbon',
  'old fitzgerald bourbon', 'old fitzgerald bottled in bond', 'willett bourbon', 'michter bourbon',
  'eh taylor bourbon', 'elmer t lee bourbon', 'bookers bourbon', 'bakers bourbon', 'elijah craig barrel proof',
  'larceny barrel proof', 'heaven hill bottled in bond', 'four roses limited edition bourbon',
  'four roses single barrel barrel strength', 'russells reserve bourbon', 'makers mark cellar aged',
  'makers mark wood finishing', 'old forester birthday bourbon', 'old forester single barrel barrel strength',
  'blood oath bourbon', 'old carter bourbon', 'rock hill farms bourbon', 'george t stagg bourbon',
  'william larue weller bourbon', 'thomas handy rye', 'parker heritage bourbon', 'little book whiskey',
  '1792 full proof bourbon', '1792 sweet wheat bourbon', 'knob creek 12 bourbon', 'knob creek 18 bourbon',
  'wild turkey masters keep bourbon', 'russells reserve 13 bourbon'
];

const PA_BOURBON_RE = /bourbon|straight rye|american whiskey|michter|willett|buffalo trace|eagle rare|weller|blanton|stagg|old fitz|fitzgerald|e\.?h\.?\s*taylor|elmer t|colonel\s*taylor|booker|baker|elijah craig|larceny|heaven hill|four roses|russell|maker'?s|old forester|blood oath|old carter|rock hill|george t|william larue|thomas handy|parker|little book|1792|knob creek|wild turkey/i;
const PA_EXCLUDE_RE = /cream|cocktail|wine|cabernet|chardonnay|sauvignon|cava|grenache|merlot|vodka|gin|rum|tequila|liqueur|ready to drink|flavored whiskey|black cherry/i;
const PA_LICENSEE_SERVICE_CENTER_RE = /LICENSEE SERVICE CENTER/i;

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
      const locationName = store.name || `Fine Wine & Good Spirits #${store.locationId}`;
      const isLicenseeServiceCenter = PA_LICENSEE_SERVICE_CENTER_RE.test(locationName);
      const { base } = signalBase(config.id, 'FWGS store pickup inventory API browser-assisted collector', product.route ? `https://www.finewineandgoodspirits.com${product.route}` : 'out/browser/fwgs-store-inventory.json', product.name, bible);
      signals.push({
        id: stableId([config.id, isLicenseeServiceCenter ? 'fwgs-licensee-service-center-inventory' : 'fwgs-store-pickup-inventory', product.sku, store.locationId]),
        ...base,
        confidence: Math.max(isLicenseeServiceCenter ? 0.58 : 0.78, base.confidence),
        eventType: isLicenseeServiceCenter ? 'licensee_service_center_inventory_observation' : 'store_inventory_result',
        locationPrecision: 'store_level',
        locationName,
        storeName: locationName,
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
        evidence: `FWGS pickup inventory API reported ${quantity} unit(s) of ${product.name} (${product.sku}) at ${store.name || `store ${store.locationId}`}${store.city ? ` in ${store.city}` : ''}${store.county ? `, ${store.county} County` : ''}. Source route: /ccstorex/custom/v1/b2b/get-inventory with method=pickup, location=${store.locationId}.${isLicenseeServiceCenter ? ' Licensee Service Center rows are kept for source diagnostics but are not treated as consumer retail pickup alerts.' : ''}`,
        raw: { product, store, quantity, generatedAt: browserRun.generatedAt, inventoryEndpoint: browserRun.inventoryEndpoint, browserAssisted: true, locationKind: isLicenseeServiceCenter ? 'licensee_service_center' : 'fwgs_retail_store', sampleOnly: isLicenseeServiceCenter }
      });
      seen.add(product.sku);
    }

  } catch (error) {
    roadblocks.push({
      state: config.id,
      source: 'FWGS browser pickup inventory artifact',
      url: 'out/browser/fwgs-store-inventory.json',
      status: 0,
      error: error instanceof Error ? error.message : String(error),
      nextRoute: 'Run the guarded FWGS browser preflight and publish only a complete validated statewide artifact.'
    });
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
