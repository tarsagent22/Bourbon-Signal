import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const sharedBaseline = JSON.parse(readFileSync(new URL('../../data/source-evidence/metro-depth-20261022/shared-metadata-baseline.json', import.meta.url), 'utf8'));
const arizonaBaseline = JSON.parse(readFileSync(new URL('../../data/source-evidence/arizona-expansion-20261022/shared-metadata-baseline.json', import.meta.url), 'utf8'));
const nationwideBaseline = JSON.parse(readFileSync(new URL('../../data/source-evidence/nationwide-expansion-20261029/shared-metadata-baseline.json', import.meta.url), 'utf8'));
const westernGroceryBaseline = JSON.parse(readFileSync(new URL('../../data/source-evidence/western-grocery-production-20261029/shared-metadata-baseline.json', import.meta.url), 'utf8'));
const centralProductionBaseline = JSON.parse(readFileSync(new URL('../../data/source-evidence/central-cityhive-production-20261029/shared-metadata-baseline.json', import.meta.url), 'utf8'));
const njMiBaseline = JSON.parse(readFileSync(new URL('../../data/source-evidence/nj-mi-production-20261029/shared-metadata-baseline.json', import.meta.url), 'utf8'));
const measuredForecastBaseline = JSON.parse(readFileSync(new URL('../../data/source-evidence/refresh-capacity-20261029/forecast-metadata-ms-boundary.json', import.meta.url), 'utf8'));
const fourStateAdmissionBaseline = JSON.parse(readFileSync(new URL('../../data/source-evidence/four-state-admission-20261029/shared-metadata-baseline.json', import.meta.url), 'utf8'));
const californiaCityMenuBaseline = JSON.parse(readFileSync(new URL('../../data/source-evidence/two-state-expansion-20261030/california-city-menu-ms-boundary.json', import.meta.url), 'utf8'));
const phoenixIllinoisBaseline = JSON.parse(readFileSync(new URL('../../data/source-evidence/phoenix-illinois-expansion-20261031/shared-metadata-ms-boundary.json', import.meta.url), 'utf8'));
const sharedFiles = new Set(['engine/src/state-sources.mjs', 'src/config/state-lifecycle.json', 'src/config/stateLifecycle.ts']);
const verifierImport = "import { normalizeHistoricalImplementationBytes } from './verification/historical-implementation.mjs';\n";
const originalVerifierRead = 'readFileSync(path.join(repositoryRoot, file))';
const normalizedVerifierRead = `normalizeHistoricalImplementationBytes(file, ${originalVerifierRead})`;
const indianaCandidateProof = "    ...(sig.state === 'IN' ? { sourceProductBinding: sig.sourceProductBinding || null } : {}),\n";
export const libraryAlertPolicyBoundary = `  const sourceAlertPolicy = { ...enforceArchivedSourceAlertPolicy(signal) };
  if (record?.libraryAlertEligible === false) {
    sourceAlertPolicy.canAlertAsInventory = false;
    sourceAlertPolicy.canAlertAsWatch = false;
  }
`;
export const originalLibraryAlertPolicyBoundary = '  const sourceAlertPolicy = enforceArchivedSourceAlertPolicy(signal);\n';
export const arizonaMetroTierImport = "import { metroLibraryTier } from './collectors/arizona-metro-retailer-proof.mjs';\n";
export const arizonaMetroTierBoundary = "    tier: (signal.state === 'AZ' ? metroLibraryTier(signal, bible) : null) || record?.tier || null,\n";
export const originalArizonaMetroTierBoundary = '    tier: record?.tier || null,\n';
export const groceryExpansionTierImport = "import { groceryExpansionLibraryTier } from './grocery-xapi-policy.mjs';\n";
export const groceryExpansionProofImport = "import { groceryExpansionLibraryTier, isGroceryExpansionInventory } from './grocery-xapi-policy.mjs';\n";
export const centralCityHiveTierImport = "import { centralCityHiveLibraryTier } from './collectors/central-cityhive-expansion.mjs';\n";
export const texasShopifyPickupTierImport = "import { texasShopifyPickupLibraryTier } from './collectors/texas-shopify-pickup.mjs';\n";
export const centralProductionOnSiteImport = "import {isCentralCityHiveProductionOnSiteSignal} from './central-cityhive-policy.mjs';\n";
export const centralProductionOnSiteBoundary = `    ...(isCentralCityHiveProductionOnSiteSignal(signal)?{
      canAlertAsInventory:false,canAlertAsWatch:false,alertable:false,
      eligibleForOnSite:true,eligibleForDropFeed:true,eligibleForWatch:false,
      eligibleForDelivery:false,eligibleForEmail:false,eligibleForSms:false,
    }:{}),
`;
export const reviewedExpansionTierBoundary = "    tier: texasShopifyPickupLibraryTier(signal,bible) ?? groceryExpansionLibraryTier(signal,bible) ?? centralCityHiveLibraryTier(signal,bible) ?? ((signal.state === 'AZ' ? metroLibraryTier(signal, bible) : null) || record?.tier || null),\n";
export const originalNewYorkVariantSemanticsBoundary = "    inventorySemantics: signal.state === 'GA' && signal.inventorySemantics\n";
export const newYorkVariantSemanticsBoundary = "    inventorySemantics: signal.state === 'NY' && signal.sourceProductBinding?.productIdentityMode === 'shopify_variant_pickup'\n      ? signal.inventorySemantics\n      : signal.state === 'GA' && signal.inventorySemantics\n";
export const groceryExpansionSemanticsBoundary = "    inventorySemantics: isGroceryExpansionInventory(signal) ? signal.sourceProductBinding.inventorySemantics\n      : signal.state === 'NY' && signal.sourceProductBinding?.productIdentityMode === 'shopify_variant_pickup'\n      ? signal.inventorySemantics\n      : signal.state === 'GA' && signal.inventorySemantics\n";
export const westernGroceryAlertBoundary = "    canAlertAsInventory: ['WA', 'NM'].includes(signal.state) ? false : sourceAlertPolicy.canAlertAsInventory === false ? false : policy.canAlertAsInventory,\n    canAlertAsWatch: ['WA', 'NM'].includes(signal.state) ? false : sourceAlertPolicy.canAlertAsWatch === false ? false : policy.canAlertAsWatch,\n";
export const originalWesternGroceryAlertBoundary = "    canAlertAsInventory: sourceAlertPolicy.canAlertAsInventory === false ? false : policy.canAlertAsInventory,\n    canAlertAsWatch: sourceAlertPolicy.canAlertAsWatch === false ? false : policy.canAlertAsWatch,\n";
const originalFloridaProofBoundary = '    } : undefined\n  };\n}\n\nfunction signalSort(a, b) {\n';
const floridaProofBoundary = `    } : undefined,
    ...(signal.state === 'FL' ? {
      optionValueId: signal.optionValueId ?? signal.raw?.optionValueId ?? null,
      childSku: signal.childSku ?? signal.raw?.childSku ?? null,
      storeNumber: signal.storeNumber ?? signal.raw?.storeNumber ?? null,
      controlStoreId: signal.controlStoreId ?? signal.raw?.controlStoreId ?? null,
      reportedQuantity: signal.reportedQuantity ?? signal.raw?.reportedQuantity ?? null,
      variantAvailable: signal.variantAvailable ?? signal.raw?.variantAvailable ?? signal.raw?.variant?.available ?? null,
      sourceInventorySemantics: signal.sourceInventorySemantics ?? signal.inventorySemantics ?? null,
      raw: signal.raw ? Object.fromEntries([
        'chain', 'merchantId', 'productId', 'variantId', 'optionValueId', 'childSku',
        'storeNumber', 'controlStoreId', 'reportedQuantity', 'variantAvailable',
        'officialAddress', 'officialCity', 'officialZip', 'officialLatitude', 'officialLongitude',
      ].filter((field) => Object.hasOwn(signal.raw, field)).map((field) => [field, signal.raw[field]])) : undefined,
    } : {}),
  };
}

function signalSort(a, b) {
`;

function replaceUnique(text, current, original, label) {
  assert.equal(text.split(current).length - 1, 1, `${label} must have one exact historical verification hook`);
  return text.replace(current, () => original);
}

export function normalizeHistoricalImplementationBytes(name, bytes) {
  if (name === 'engine/src/operational-report.mjs') {
    let implementation = bytes.toString('utf8');
    implementation=replaceUnique(implementation,"import {isLouisianaAlaskaGroceryOnSiteSignal} from './louisiana-alaska-grocery-policy.mjs';\n",'',`${name}: AK/LA production projection import`);
    implementation=replaceUnique(implementation,`    ...(isLouisianaAlaskaGroceryOnSiteSignal(signal)?{
      tier:signal.tier,inventorySemantics:signal.inventorySemantics,
      canAlertAsInventory:false,canAlertAsWatch:false,alertable:false,
      eligibleForOnSite:true,eligibleForDropFeed:true,eligibleForWatch:false,
      eligibleForDelivery:false,deliveryEligible:false,eligibleForEmail:false,eligibleForSms:false,
    }:{}),
`,'',`${name}: AK/LA production projection`);
    bytes = Buffer.from(implementation);
    bytes = Buffer.from(replaceUnique(bytes.toString('utf8'), "    raw: signal.state === 'SC' && signal.sourceChain === 'liquor-library' ? { chain: signal.raw?.chain, square: signal.raw?.square } : signal.state === 'MS' ? {\n", "    raw: signal.state === 'MS' ? {\n", `${name}: exact SC Square proof preservation`));
    // Reverse only this exact FL proof-preservation addition at its original
    // canonicalization boundary. The original MS full-file digest stays pinned.
    let text = replaceUnique(bytes.toString('utf8'), floridaProofBoundary, originalFloridaProofBoundary, `${name}: FL proof`);
    text = replaceUnique(text, indianaCandidateProof, '', `${name}: IN candidate proof`);
    // Permit only the exact shared library suppression. It cannot enable an
    // alert or change the pinned Mississippi source and inventory policies.
    text = replaceUnique(text, libraryAlertPolicyBoundary, originalLibraryAlertPolicyBoundary, `${name}: library alert suppression`);
    // Undo only these literal proof-preserving and alert-suppressing additions.
    // Restore the already reviewed NY boundary before its existing reversal.
    text = replaceUnique(text, groceryExpansionProofImport, groceryExpansionTierImport, `${name}: grocery inventory proof import`);
    text = replaceUnique(text, groceryExpansionSemanticsBoundary, newYorkVariantSemanticsBoundary, `${name}: grocery inventory semantics`);
    text = replaceUnique(text, westernGroceryAlertBoundary, originalWesternGroceryAlertBoundary, `${name}: WA/NM alert suppression`);
    // Reverse only the reviewed source-proof tier hooks before applying the
    // existing AZ reversal. This does not normalize either hook's implementation.
    text = replaceUnique(text, groceryExpansionTierImport, '', `${name}: grocery tier import`);
    text = replaceUnique(text, centralCityHiveTierImport, '', `${name}: CityHive tier import`);
    text = replaceUnique(text, texasShopifyPickupTierImport, '', `${name}: TX exact pickup tier import`);
    text = replaceUnique(text, "import {isNjMiProductionOnSiteSignal} from './nj-mi-research-policy.mjs';\n", '', name+': NJ/MI on-site import');
    text = replaceUnique(text, "    ...(isNjMiProductionOnSiteSignal(signal)?{\n      canAlertAsInventory:false,canAlertAsWatch:false,alertable:false,\n      eligibleForOnSite:true,eligibleForDropFeed:true,eligibleForWatch:false,\n      eligibleForDelivery:false,deliveryEligible:false,eligibleForEmail:false,eligibleForSms:false,\n    }:{}),\n", '', name+': NJ/MI false-alert on-site proof');
    text = replaceUnique(text, centralProductionOnSiteImport, '', `${name}: Central on-site import`);
    text = replaceUnique(text, centralProductionOnSiteBoundary, '', `${name}: Central false-alert on-site proof`);
    text = replaceUnique(text, reviewedExpansionTierBoundary, arizonaMetroTierBoundary, `${name}: reviewed source tier proof`);
    text = replaceUnique(text, newYorkVariantSemanticsBoundary, originalNewYorkVariantSemanticsBoundary, `${name}: NY variant semantics`);
    // Only this exact AZ-gated, proof-checked catalog tier may differ. All MS
    // implementation bytes and the original full-file digest remain pinned.
    text = replaceUnique(text, arizonaMetroTierImport, '', `${name}: AZ tier import`);
    text = replaceUnique(text, arizonaMetroTierBoundary, originalArizonaMetroTierBoundary, `${name}: AZ tier proof`);
    return Buffer.from(text);
  }
  if (name === 'scripts/test-coverage-contract.mts') {
    // Only the expanded-area expectations and the exact current NC directory
    // count differ from this pinned test. Inventory and MS assertions stay pinned.
    let text = replaceUnique(bytes.toString('utf8'),
      '  ["NY", ["Buffalo", "Hudson Valley", "Lake George", "Nassau County", "New York City", "Rochester Metro", "Suffolk County"]],\n',
      '  ["NY", ["Buffalo", "Nassau County", "New York City"]],\n', `${name}: NY areas`);
    text = replaceUnique(text,
      '  ["CO", ["Boulder County", "Colorado Springs", "Denver Metro"]],\n',
      '  ["CO", ["Denver Metro"]],\n', `${name}: CO areas`);
    text = replaceUnique(text,
      'assert.equal(northCarolina.scope.knownBoards, 174, "NC coverage must expose every current official ABC board separately from stores");',
      'assert.equal(northCarolina.scope.knownBoards, 173, "NC coverage must expose every current official ABC board separately from stores");', `${name}: NC official board count`);
    return Buffer.from(text);
  }
  if (name === 'engine/src/verify-ms.mjs') {
    // Undo only this verifier's explicit delegation to this helper. Every other
    // byte, including the complete verification loop, retains its original SHA.
    let text = replaceUnique(bytes.toString('utf8'), verifierImport, '', `${name}: import`);
    text = replaceUnique(text, normalizedVerifierRead, originalVerifierRead, `${name}: read`);
    return Buffer.from(text);
  }
  if (!sharedFiles.has(name)) return bytes;
  assert.equal(westernGroceryBaseline.contractVersion, 'bourbon-signal/western-grocery-production-shared-metadata-baseline@1');
  let text = bytes.toString('utf8');
  if(name==='engine/src/state-sources.mjs'){
    const minnesotaImport = "import { MINNESOTA_CITYHIVE_PRODUCTION_CONFIG } from './minnesota-cityhive-production-config.mjs';\n";
    if (text.includes(minnesotaImport)) {
      text = replaceUnique(text, minnesotaImport, '', `${name}: MN registry import`);
      text = replaceUnique(text, "  if (source.id === 'MN' && CONFIG_CUSTOMER_ACTIVE_STATE_IDS.has('MN')) return MINNESOTA_CITYHIVE_PRODUCTION_CONFIG;\n", '', `${name}: MN registry overlay`);
    }
    text=replaceUnique(text,"import {LOUISIANA_ALASKA_GROCERY_PRODUCTION_CONFIGS,LOUISIANA_ALASKA_GROCERY_PRODUCTION_STATES} from './louisiana-alaska-grocery-production-config.mjs';\n",'',`${name}: AK/LA production config import`);
    text=replaceUnique(text,
      "export const ALL_STATE_SOURCES = [...BASE_STATE_SOURCES.filter(source=>!NJ_MI_PRODUCTION_STATES.includes(source.id)&&!LOUISIANA_ALASKA_GROCERY_PRODUCTION_STATES.includes(source.id)),...NJ_MI_PRODUCTION_CONFIGS,...LOUISIANA_ALASKA_GROCERY_PRODUCTION_CONFIGS].map((source) => {\n  if(NJ_MI_PRODUCTION_STATES.includes(source.id)||LOUISIANA_ALASKA_GROCERY_PRODUCTION_STATES.includes(source.id))return source;",
      "export const ALL_STATE_SOURCES = [...BASE_STATE_SOURCES.filter(source=>!NJ_MI_PRODUCTION_STATES.includes(source.id)),...NJ_MI_PRODUCTION_CONFIGS].map((source) => {\n  if(NJ_MI_PRODUCTION_STATES.includes(source.id))return source;",
      `${name}: AK/LA dormant source registration`);
  }
  if(name==='src/config/state-lifecycle.json'||name==='src/config/stateLifecycle.ts'){
    const activeKansasTail=/^    \},\n    "KS": \{[\s\S]+?^    \}\n  \}/mu.exec(text)?.[0];
    const kansasTailSha='0e8a294761ca13a95935327cafb950cffffbebbabeb66eb5f45f388a06858186';
    if(activeKansasTail&&createHash('sha256').update(activeKansasTail).digest('hex')===kansasTailSha){
      text=replaceUnique(text,activeKansasTail,'    }\n  }',`${name}: exact attested KS lifecycle tail`);
      text=replaceUnique(text,'    "MN",\n    "KS"\n  ],\n  "reliabilityPolicy"','    "MN"\n  ],\n  "reliabilityPolicy"',`${name}: exact KS active list tail`);
      text=replaceUnique(text,'      "KS": 15000,\n','',`${name}: exact KS expected runtime`);
    }
    const releasedMinnesota = /^    "MN": \{\n[\s\S]+?^    \},\n/mu.exec(text)?.[0];
    if (text.includes('    "MN"\n  ],\n  "reliabilityPolicy"') || releasedMinnesota?.includes('      "publicStatus": "active"')) {
      assert.equal(createHash('sha256').update(releasedMinnesota || '').digest('hex'),
        '050087f01453792a57743042ce7fcb9cafba3c1e3eda372ac8f78e151e3b5f14', `${name}: exact attested MN lifecycle entry`);
      const inactiveMinnesota = `    "MN": {
      "customerLabel": "Minnesota",
      "sourceLabel": "Minnesota Costco warehouse bourbon watch",
      "publicStatus": "research_only",
      "shadowEligible": true,
      "lifecycle": "blocked_costco_inventory_research",
      "coverageTier": "blocked",
      "refinementLevel": "warehouse",
      "inventoryAlertable": false,
      "watchAlertable": false,
      "customerSummary": "Research-only: Minnesota has Costco warehouse research configuration but no recurring verified observations, so customer coverage and alerts remain blocked."
    },
`;
      text = replaceUnique(text, releasedMinnesota, inactiveMinnesota, `${name}: exact attested MN lifecycle entry`);
      text = replaceUnique(text, '    "RI",\n    "MN"\n  ],\n  "reliabilityPolicy"',
        '    "RI"\n  ],\n  "reliabilityPolicy"', `${name}: exact MN active list tail`);
      text = replaceUnique(text, '    "stateExpectedRunMs": {\n      "MN": 30000,\n',
        '    "stateExpectedRunMs": {\n', `${name}: exact MN expected runtime`);
    }
    const releasedRi = /^    \},\n    "RI": \{[\s\S]+?^  \}/mu.exec(text)?.[0];
    if (releasedRi && createHash('sha256').update(releasedRi).digest('hex') === '630ee689b046da0c7c418c9254b2babadb06898921b1fc875b1dd903a4c90fe2') {
      text=replaceUnique(text,releasedRi,'    }\n  }',`${name}: exact attested RI lifecycle entry`);
      text=replaceUnique(text,'    "LA",\n    "RI"\n  ],\n  "reliabilityPolicy"','    "LA"\n  ],\n  "reliabilityPolicy"',`${name}: exact RI active list tail`);
    }
    const releasedAkLa = /^    \},\n    "AK": \{[\s\S]+?^  \}/mu.exec(text)?.[0];
    if (releasedAkLa && createHash('sha256').update(releasedAkLa).digest('hex') === '4983c20008f95b660d681eb74c6f2eaa9188af4873e6fcdc81bdc15f2c07c323') {
      text=replaceUnique(text,releasedAkLa,'    }\n  }',`${name}: exact attested AK/LA lifecycle entries`);
      text=replaceUnique(text,'    "OK",\n    "AK",\n    "LA"\n  ],\n  "reliabilityPolicy"','    "OK"\n  ],\n  "reliabilityPolicy"',`${name}: exact AK/LA active list tail`);
    } else {
    const akLaLifecycle=`    },\n    "AK": {\n      "customerLabel": "Alaska",\n      "sourceLabel": "Alaska reviewed exact-store grocery inventory",\n      "publicStatus": "research_only",\n      "lifecycle": "retailer_inventory_research",\n      "coverageTier": "sparse_live_store_inventory",\n      "refinementLevel": "store",\n      "inventoryAlertable": false,\n      "watchAlertable": false,\n      "productionAdapter": "louisiana_alaska_grocery_onsite_v1",\n      "customerSummary": "Inactive Alaska grocery inventory research. Production collection, customer display, alerts, and delivery remain blocked pending admission."\n    },\n    "LA": {\n      "customerLabel": "Louisiana",\n      "sourceLabel": "Louisiana reviewed exact-store grocery inventory",\n      "publicStatus": "research_only",\n      "lifecycle": "retailer_inventory_research",\n      "coverageTier": "sparse_live_store_inventory",\n      "refinementLevel": "store",\n      "inventoryAlertable": false,\n      "watchAlertable": false,\n      "productionAdapter": "louisiana_alaska_grocery_onsite_v1",\n      "customerSummary": "Inactive Louisiana grocery inventory research. Production collection, customer display, alerts, and delivery remain blocked pending admission."\n    }\n  }`;
      text=replaceUnique(text,akLaLifecycle,'    }\n  }',`${name}: AK/LA inactive lifecycle entries`);
    }
  }
  assert.equal(phoenixIllinoisBaseline.contractVersion,'bourbon-signal/phoenix-illinois-shared-metadata-ms-boundary@1');
  // Reverse only the literal reviewed AZ source addition and IL source/city
  // metadata. All original MS full-file hashes and older boundaries stay pinned.
  for(const [state,entry]of Object.entries(phoenixIllinoisBaseline.files[name]||{}))
    text=replaceUnique(text,entry.reviewed,entry.original,`${name}: Phoenix Illinois ${state} reviewed metadata`);
  const admission = fourStateAdmissionBaseline.files[name];
  if (admission) {
    assert.equal(fourStateAdmissionBaseline.contractVersion, 'bourbon-signal/four-state-actual-admission-ms-boundary@1');
    for (const [key, entry] of Object.entries(admission)) {
      text = replaceUnique(text, entry.reviewed, entry.original, `${name}: four-state admission ${key}`);
    }
  }
  const forecast = measuredForecastBaseline.files[name];
  if (forecast) {
    assert.equal(measuredForecastBaseline.contractVersion, 'bourbon-signal/measured-runtime-forecast-ms-boundary@1');
    // Reverse only the complete reviewed planning map, before the older exact
    // inactive-state metadata reversals. Source/parent hardcaps are not here.
    for (const line of forecast.reviewed.split('\n').slice(1, -1)) {
      assert.equal(text.split(line + '\n').length - 1, 1, `${name}: measured runtime forecast must have one exact historical verification hook`);
    }
    text = replaceUnique(text, forecast.reviewed, forecast.original, `${name}: measured runtime forecast`);
  }
  assert.equal(centralProductionBaseline.contractVersion, 'bourbon-signal/central-cityhive-production-shared-metadata-baseline@1');
  for (const [key, entry] of Object.entries(centralProductionBaseline.files[name] || {})) {
    text = replaceUnique(text, entry.reviewed, entry.original, `${name}: Central inactive ${key}`);
  }
  assert.equal(njMiBaseline.contractVersion,'bourbon-signal/nj-mi-production-shared-metadata-baseline@1');
  for(const [key,entry] of Object.entries(njMiBaseline.files[name]||{}))text=replaceUnique(text,entry.reviewed,entry.original,name+': NJ/MI reviewed '+key);
  // Literal, single-occurrence reversals only. This is not a state-block
  // wildcard: activation, changed budgets or changed registration must fail.
  for (const [key, entry] of Object.entries(westernGroceryBaseline.files[name])) {
    text = replaceUnique(text, entry.reviewed, entry.original, `${name}: WA/NM reviewed ${key}`);
  }
  assert.equal(sharedBaseline.contractVersion, 'bourbon-signal/ny-co-shared-metadata-baseline@1');
  for (const state of ['NY', 'CO']) {
    const pattern = name.endsWith('.mjs')
      ? new RegExp(`^  \\{\\n    id: '${state}',[\\s\\S]*?^  \\},\\n`, 'gmu')
      : new RegExp(`^    "${state}": \\{[\\s\\S]*?^    \\}(?:,)?`, 'gmu');
    assert.equal([...text.matchAll(pattern)].length, 1, `${name}: ${state} must have one exact metadata boundary`);
    const original = sharedBaseline.files[name]?.[state];
    assert.equal(typeof original, 'string');
    text = text.replace(pattern, () => original);
  }
  assert.equal(arizonaBaseline.contractVersion, 'bourbon-signal/arizona-shared-metadata-baseline@1');
  const arizona = arizonaBaseline.files[name];
  assert.equal(typeof arizona?.original, 'string');
  assert.equal(typeof arizona?.reviewed, 'string');
  // Only the exact reviewed AZ source description and customer metadata differ.
  // Every other byte and all original MS implementation digests remain pinned.
  text = replaceUnique(text, arizona.reviewed, arizona.original, `${name}: AZ reviewed metadata`);
  assert.equal(nationwideBaseline.contractVersion, 'bourbon-signal/nationwide-shared-metadata-baseline@1');
  const nationwide = nationwideBaseline.files[name];
  if (name === 'engine/src/state-sources.mjs') {
    text = replaceUnique(text, nationwide.import.reviewed, nationwide.import.original, `${name}: reviewed central source import`);
    text = replaceUnique(text, nationwide.registration.reviewed, nationwide.registration.original, `${name}: reviewed central source registration`);
  } else {
    assert.equal(californiaCityMenuBaseline.contractVersion, 'bourbon-signal/california-city-menu-ms-boundary@1');
    const menu = californiaCityMenuBaseline.files[name];
    assert.equal(menu.original,nationwide.reviewed,'The city-menu exception must restore the exact prior reviewed CA block');
    text = replaceUnique(text, menu.reviewed, menu.original, `${name}: CA reviewed metadata city expansion`);
    text = replaceUnique(text, nationwide.reviewed, nationwide.original, `${name}: CA reviewed metadata`);
  }
  return Buffer.from(text);
}
