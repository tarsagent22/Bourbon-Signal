import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';

const REVIEW_DISPOSITIONS = JSON.parse(readFileSync(new URL('../../data/research-dispositions/MS.json', import.meta.url), 'utf8'));
const REVIEWED_STORE_UNIVERSE = JSON.parse(readFileSync(new URL('../../data/store-universe/MS.json', import.meta.url), 'utf8'));
const REVIEWED_STORE_BY_PERMIT = new Map(REVIEWED_STORE_UNIVERSE.stores.map((store) => [store.permitNumber, store]));

function reviewedDispositionLedger(universe) {
  if (REVIEW_DISPOSITIONS?.contractVersion !== 'bourbon-signal/ms-research-dispositions@1'
    || REVIEW_DISPOSITIONS?.state !== 'MS'
    || !Array.isArray(REVIEW_DISPOSITIONS?.entries)) {
    throw new Error('Mississippi source atlas requires the reviewed disposition ledger.');
  }
  const digest = createHash('sha256').update(JSON.stringify(REVIEW_DISPOSITIONS.entries)).digest('hex');
  if (digest !== REVIEW_DISPOSITIONS.entriesSha256) throw new Error('Mississippi reviewed disposition ledger digest mismatch.');
  const byPermit = new Map();
  for (const entry of REVIEW_DISPOSITIONS.entries) {
    if (!/^\d{6}$/u.test(String(entry?.permitNumber || '')) || byPermit.has(entry.permitNumber) || entry.reviewStatus !== 'reviewed') {
      throw new Error(`Invalid or duplicate Mississippi reviewed disposition ${entry?.permitNumber || '(missing)'}.`);
    }
    byPermit.set(entry.permitNumber, entry);
  }
  const universePermits = new Set(universe.stores.map((store) => store.permitNumber));
  if (byPermit.size !== universePermits.size) throw new Error('Mississippi reviewed disposition ledger does not cover the current permit universe exactly.');
  for (const permitNumber of universePermits) {
    if (!byPermit.has(permitNumber)) throw new Error(`Mississippi permit ${permitNumber} is missing an explicit reviewed disposition.`);
  }
  for (const permitNumber of byPermit.keys()) {
    if (!universePermits.has(permitNumber)) throw new Error(`Mississippi reviewed disposition ${permitNumber} is not in the current permit universe.`);
  }
  return byPermit;
}

const INVENTORY_SOURCES = Object.freeze([
  {
    permitNumber: '046478',
    disposition: 'blocked_by_source_policy',
    sourceLayer: 'storefront_probe',
    firstPartyDomains: ['www.aliquorwarehouse.com'],
    platform: 'gotoliquorstore',
    platformIds: { cartStoreId: '1031', merchantId: '955132' },
    evidenceUrls: ['https://www.aliquorwarehouse.com/c/spirits/whiskey/19'],
    ecommerce: true,
    pickup: true,
    inventoryAuthoritative: false,
    probeStatus: 'blocked_by_source_policy',
    roadblockCode: 'production_http_client_403',
  },
  {
    permitNumber: '040562',
    disposition: 'blocked_by_source_policy',
    sourceLayer: 'storefront_probe',
    firstPartyDomains: ['www.cabinfeverliquor.com'],
    platform: 'gotoliquorstore',
    platformIds: { cartStoreId: '1069', merchantId: '736142' },
    evidenceUrls: ['https://www.cabinfeverliquor.com/c/spirits/whiskey/19'],
    ecommerce: true,
    pickup: true,
    inventoryAuthoritative: false,
    probeStatus: 'blocked_by_source_policy',
    roadblockCode: 'production_http_client_403',
  },
  {
    permitNumber: '029254',
    disposition: 'live_inventory',
    sourceLayer: 'private_retailer_inventory',
    firstPartyDomains: ['www.desotoliquor.com'],
    platform: 'cityhive',
    platformIds: { merchantId: '68ba2980113a7a29c2076fc3' },
    evidenceUrls: ['https://www.desotoliquor.com/shop/?subtype=Bourbon'],
    ecommerce: true,
    pickup: true,
    inventoryAuthoritative: true,
    probeStatus: 'inventory_capable',
  },
  {
    permitNumber: '044692',
    disposition: 'live_inventory',
    sourceLayer: 'private_retailer_inventory',
    firstPartyDomains: ['thehernandowinespirits.com'],
    platform: 'cityhive',
    platformIds: { merchantId: '669150d28f28f1287440bdce' },
    evidenceUrls: ['https://thehernandowinespirits.com/shop/?subtype=Bourbon'],
    ecommerce: true,
    pickup: true,
    inventoryAuthoritative: true,
    probeStatus: 'inventory_capable_binary_capped',
  },
  {
    permitNumber: '044411',
    disposition: 'live_inventory',
    sourceLayer: 'private_retailer_inventory',
    firstPartyDomains: ['www.moonshinems.com'],
    platform: 'moonshine',
    platformIds: { sellerId: '323' },
    evidenceUrls: ['https://www.moonshinems.com/barleysbeerbarn', 'https://www.moonshinems.com/moonshine/homepage/sliders'],
    ecommerce: true,
    pickup: true,
    inventoryAuthoritative: true,
    probeStatus: 'inventory_capable_binary_orderability',
  },
  {
    permitNumber: '049222',
    disposition: 'live_inventory',
    sourceLayer: 'private_retailer_inventory',
    firstPartyDomains: ['www.moonshinems.com'],
    platform: 'moonshine',
    platformIds: { sellerId: '2118' },
    evidenceUrls: ['https://www.moonshinems.com/corkscrew', 'https://www.moonshinems.com/moonshine/homepage/sliders'],
    ecommerce: true,
    pickup: true,
    inventoryAuthoritative: true,
    probeStatus: 'inventory_capable_binary_orderability',
  },
  {
    permitNumber: '051851',
    disposition: 'live_inventory',
    sourceLayer: 'private_retailer_inventory',
    firstPartyDomains: ['www.moonshinems.com'],
    platform: 'moonshine',
    platformIds: { sellerId: '7' },
    evidenceUrls: ['https://www.moonshinems.com/madisoncellars', 'https://www.moonshinems.com/moonshine/homepage/sliders'],
    ecommerce: true,
    pickup: true,
    inventoryAuthoritative: true,
    probeStatus: 'inventory_capable_binary_orderability',
  },
  {
    permitNumber: '007481',
    disposition: 'live_inventory',
    sourceLayer: 'private_retailer_inventory',
    firstPartyDomains: ['www.moonshinems.com'],
    platform: 'moonshine',
    platformIds: { sellerId: '1882' },
    evidenceUrls: ['https://www.moonshinems.com/terranova', 'https://www.moonshinems.com/moonshine/homepage/sliders'],
    ecommerce: true,
    pickup: true,
    inventoryAuthoritative: true,
    probeStatus: 'inventory_capable_binary_orderability',
  },
]);

const BOTTLECAPPS_PROBES = Object.freeze([
  {
    permitNumber: '055298',
    firstPartyDomains: ['tupelowine.com'],
    platformIds: { siteId: '11112' },
    evidenceUrls: ['https://tupelowine.com/'],
    probeStatus: 'blocked_by_source_policy',
  },
  {
    permitNumber: '070026',
    firstPartyDomains: ['dwlms.com'],
    platformIds: { siteId: '11725' },
    evidenceUrls: ['https://dwlms.com/'],
    probeStatus: 'blocked_by_source_policy',
  },
  {
    permitNumber: '007609',
    firstPartyDomains: ['spiritsofnatchez.com'],
    platformIds: { siteId: '11268' },
    evidenceUrls: ['https://spiritsofnatchez.com/'],
    probeStatus: 'blocked_by_source_policy',
  },
  {
    permitNumber: '025525',
    firstPartyDomains: ['grapevineliquorandwine.com'],
    platformIds: { siteId: '11795' },
    evidenceUrls: ['https://grapevineliquorandwine.com/'],
    probeStatus: 'blocked_by_source_policy',
  },
  {
    permitNumber: '047419',
    firstPartyDomains: ['mabrysfinewineandspirits.com'],
    platformIds: {},
    evidenceUrls: ['https://mabrysfinewineandspirits.com/'],
    probeStatus: 'blocked_by_source_policy',
  },
  {
    permitNumber: '044130',
    firstPartyDomains: ['oxfordws.com'],
    platformIds: { siteId: '11179' },
    evidenceUrls: ['https://oxfordws.com/'],
    probeStatus: 'source_offline',
  },
  {
    permitNumber: '044841',
    firstPartyDomains: ['sipologywinespirits.com'],
    platformIds: {},
    evidenceUrls: ['https://sipologywinespirits.com/'],
    probeStatus: 'source_offline',
  },
  {
    permitNumber: '043336',
    firstPartyDomains: [],
    platformIds: { googlePlayApp: 'com.cta.shots_wine_spirits' },
    evidenceUrls: ['https://play.google.com/store/apps/details?id=com.cta.shots_wine_spirits'],
    disposition: 'platform_probe_only',
    probeStatus: 'app_only_no_public_inventory',
    appName: 'Shots Wine & Spirits',
  },
  {
    permitNumber: '024142',
    firstPartyDomains: [],
    platformIds: { googlePlayApp: 'com.cta.norms_discount_liquor' },
    evidenceUrls: ['https://play.google.com/store/apps/details?id=com.cta.norms_discount_liquor'],
    disposition: 'platform_probe_only',
    probeStatus: 'app_only_no_public_inventory',
    appName: 'Norms Discount Liquor & Wine',
  },
].map((entry) => ({
  ...entry,
  disposition: entry.disposition || entry.probeStatus,
  sourceLayer: 'storefront_probe',
  platform: 'bottlecapps',
  ecommerce: null,
  pickup: null,
  inventoryAuthoritative: false,
})));

const REVIEWED_SOURCE_BY_PERMIT = new Map(
  [...INVENTORY_SOURCES, ...BOTTLECAPPS_PROBES].map((entry) => [entry.permitNumber, entry]),
);

function canonicalMississippiAtlasStore(store, dispositionReview) {
  const reviewed = REVIEWED_SOURCE_BY_PERMIT.get(store.permitNumber);
  if (!reviewed) {
    if (dispositionReview.disposition !== 'directory_only') {
      throw new Error(`Mississippi permit ${store.permitNumber} has reviewed disposition ${dispositionReview.disposition} without matching reviewed source evidence.`);
    }
    return {
      id: store.id,
      permitNumber: store.permitNumber,
      officialIdentity: {
        dba: store.dba,
        address: store.address,
        city: store.city,
        county: store.county,
        zip: store.zip,
        regionId: store.regionId,
      },
      firstPartyDomains: [],
      platform: null,
      platformIds: {},
      evidenceUrls: [store.officialUrl],
      sourceLayer: 'directory',
      disposition: 'directory_only',
      probeStatus: 'statewide_method_no_verified_first_party_inventory_source',
      ecommerce: null,
      pickup: null,
      inventoryAuthoritative: false,
      healthVisible: false,
      alertable: false,
      reviewProvenance: {
        reviewBatchId: REVIEW_DISPOSITIONS.reviewBatchId,
        reviewedAt: REVIEW_DISPOSITIONS.reviewedAt,
        reviewStatus: dispositionReview.reviewStatus,
        evidenceClass: dispositionReview.evidenceClass,
      },
    };
  }
  if (dispositionReview.disposition !== reviewed.disposition) {
    throw new Error(`Mississippi permit ${store.permitNumber} source evidence does not match its reviewed disposition ledger.`);
  }
  return {
    id: store.id,
    permitNumber: store.permitNumber,
    officialIdentity: {
      dba: store.dba,
      address: store.address,
      city: store.city,
      county: store.county,
      zip: store.zip,
      regionId: store.regionId,
    },
    ...reviewed,
    healthVisible: true,
    alertable: false,
    reviewProvenance: {
      reviewBatchId: REVIEW_DISPOSITIONS.reviewBatchId,
      reviewedAt: REVIEW_DISPOSITIONS.reviewedAt,
      reviewStatus: dispositionReview.reviewStatus,
      evidenceClass: dispositionReview.evidenceClass,
    },
  };
}

export function buildMississippiSourceAtlas(universe) {
  if (universe?.state !== 'MS' || !Array.isArray(universe?.stores)) {
    throw new TypeError('Mississippi source atlas requires the reviewed MS store universe.');
  }
  const dispositionByPermit = reviewedDispositionLedger(universe);
  const stores = universe.stores.map((store) => canonicalMississippiAtlasStore(store, dispositionByPermit.get(store.permitNumber)));
  return {
    schemaVersion: 1,
    state: 'MS',
    generatedAt: universe.generatedAt,
    reviewedCurrentPermitCount: universe.reviewedCurrentPermitCount,
    researchMethod: {
      statewideDirectoryReviewed: true,
      officialDenominator: 'Mississippi DOR TAP Search ABC Permits filtered to current Package Retailer permits',
      webResearchScope: 'All 690 current premises received a final disposition after statewide exact-name, address, city, domain, and platform-cohort research.',
      directoryOnlyRule: 'directory_only is used only after the statewide method found no verified first-party inventory source; no per-store website is fabricated.',
      inventoryAuthorityRule: 'Only exact first-party host, permit, merchant/store ID, premises, pickup/orderability, product identity, and safe-format evidence may authorize inventory.',
      directoryCaptureRule: 'TAP robots policy is User-agent: * / Disallow: /. Autonomous TAP collection is source_policy_blocked and makes no request. The checked-in universe comes from a reviewed one-time operator-supplied capture; refresh requires an official permitted export or API.',
      blockedSourceRule: 'Two exact GoToLiquorStore storefronts are manually readable but return 403 to the production HTTP client, so they remain blocked_by_source_policy rather than using an alternate-client or anti-bot bypass. Five remaining BottleCapps first-party domains currently return DataDome 403; Oxford Wine & Spirits and Sipology fail DNS; two exact-permit Google Play discoveries are platform_probe_only/app_only_no_public_inventory. Madison Cellars\' BottleCapps surface remains blocked, but its separate public Moonshine seller route is authorized and inventory-capable. All blocked, offline, and app-only routes remain health-visible and nonalertable.',
      officialIntelligenceRule: 'DOR permits, SPA, pricing, bailment, and wholesale documents are directory or intelligence only and never bottle inventory.',
      dispositionLedger: {
        contractVersion: REVIEW_DISPOSITIONS.contractVersion,
        reviewBatchId: REVIEW_DISPOSITIONS.reviewBatchId,
        reviewedAt: REVIEW_DISPOSITIONS.reviewedAt,
        entriesSha256: REVIEW_DISPOSITIONS.entriesSha256,
      },
    },
    stores,
  };
}

export function validateMississippiSourceAtlas(atlas) {
  if (atlas?.state !== 'MS' || !Array.isArray(atlas?.stores)) throw new TypeError('Invalid Mississippi source atlas.');
  if (atlas.researchMethod?.dispositionLedger?.entriesSha256 !== REVIEW_DISPOSITIONS.entriesSha256
    || atlas.researchMethod?.dispositionLedger?.reviewBatchId !== REVIEW_DISPOSITIONS.reviewBatchId) {
    throw new Error('Mississippi source atlas is not bound to the current reviewed disposition ledger.');
  }
  const dispositionByPermit = reviewedDispositionLedger(REVIEWED_STORE_UNIVERSE);
  const ids = new Set();
  const permits = new Set();
  let unresearched = 0;
  let finalDispositions = 0;
  let inventoryCapable = 0;
  let blockedOrOfflineOrProbeOnly = 0;
  for (const store of atlas.stores) {
    if (!store.id || ids.has(store.id)) throw new Error(`Duplicate or missing Mississippi atlas ID ${store.id || '(missing)'}.`);
    ids.add(store.id);
    if (!store.permitNumber || permits.has(store.permitNumber)) throw new Error(`Duplicate or missing Mississippi atlas permit ${store.permitNumber || '(missing)'}.`);
    permits.add(store.permitNumber);
    const dispositionReview = dispositionByPermit.get(store.permitNumber);
    const officialStore = REVIEWED_STORE_BY_PERMIT.get(store.permitNumber);
    if (!dispositionReview || !officialStore || dispositionReview.disposition !== store.disposition) {
      throw new Error(`Mississippi atlas permit ${store.permitNumber} does not match its reviewed identity/disposition binding.`);
    }
    if (store.id !== officialStore.id) throw new Error(`Mississippi atlas permit ${store.permitNumber} has mismatched official ID.`);
    const canonicalStore = canonicalMississippiAtlasStore(officialStore, dispositionReview);
    if (!isDeepStrictEqual(store, canonicalStore)) {
      throw new Error(`Mississippi atlas permit ${store.permitNumber} does not match its complete canonical reviewed record.`);
    }
    for (const key of ['dba', 'address', 'city', 'county', 'zip', 'regionId']) {
      if (store.officialIdentity?.[key] !== officialStore[key]) throw new Error(`Mississippi atlas permit ${store.permitNumber} has mismatched official ${key}.`);
    }
    const reviewedSource = REVIEWED_SOURCE_BY_PERMIT.get(store.permitNumber);
    if (reviewedSource) {
      for (const key of ['platform', 'sourceLayer', 'disposition', 'inventoryAuthoritative']) {
        if (store[key] !== reviewedSource[key]) throw new Error(`Mississippi atlas permit ${store.permitNumber} has mismatched reviewed source ${key}.`);
      }
      for (const key of ['firstPartyDomains', 'platformIds', 'evidenceUrls']) {
        if (JSON.stringify(store[key]) !== JSON.stringify(reviewedSource[key])) throw new Error(`Mississippi atlas permit ${store.permitNumber} has mismatched reviewed source ${key}.`);
      }
    } else if (store.disposition !== 'directory_only' || store.platform !== null || (store.firstPartyDomains || []).length) {
      throw new Error(`Mississippi directory-only permit ${store.permitNumber} contains unreviewed source evidence.`);
    }
    if (!store.disposition || store.disposition === 'unresearched') unresearched += 1;
    else finalDispositions += 1;
    if (store.reviewProvenance?.reviewStatus !== 'reviewed' || !store.reviewProvenance?.reviewBatchId) {
      throw new Error(`Mississippi atlas store ${store.id} is missing explicit review provenance.`);
    }
    if (store.reviewProvenance.evidenceClass !== dispositionReview.evidenceClass) {
      throw new Error(`Mississippi atlas store ${store.id} has mismatched reviewed evidence provenance.`);
    }
    if (store.inventoryAuthoritative === true && store.disposition === 'live_inventory') inventoryCapable += 1;
    if (['blocked_by_source_policy', 'source_offline', 'platform_probe_only'].includes(store.disposition)) blockedOrOfflineOrProbeOnly += 1;
    if (store.disposition === 'directory_only' && (store.firstPartyDomains || []).length) {
      throw new Error(`Directory-only Mississippi store ${store.id} must not contain a fabricated first-party domain.`);
    }
  }
  if (permits.size !== REVIEWED_STORE_BY_PERMIT.size
    || [...REVIEWED_STORE_BY_PERMIT.keys()].some((permit) => !permits.has(permit))) {
    throw new Error('Mississippi source atlas permit coverage does not exactly match the reviewed store universe.');
  }
  if (unresearched !== 0 || finalDispositions !== atlas.stores.length) throw new Error('Mississippi source atlas contains unresearched stores.');
  return {
    currentStores: atlas.stores.length,
    unresearched,
    finalDispositions,
    inventoryCapable,
    blockedOrOfflineOrProbeOnly,
  };
}
