import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sharedBaseline = JSON.parse(readFileSync(new URL('../../data/source-evidence/metro-depth-20261022/shared-metadata-baseline.json', import.meta.url), 'utf8'));
const arizonaBaseline = JSON.parse(readFileSync(new URL('../../data/source-evidence/arizona-expansion-20261022/shared-metadata-baseline.json', import.meta.url), 'utf8'));
const nationwideBaseline = JSON.parse(readFileSync(new URL('../../data/source-evidence/nationwide-expansion-20261029/shared-metadata-baseline.json', import.meta.url), 'utf8'));
const westernGroceryBaseline = JSON.parse(readFileSync(new URL('../../data/source-evidence/western-grocery-production-20261029/shared-metadata-baseline.json', import.meta.url), 'utf8'));
const centralProductionBaseline = JSON.parse(readFileSync(new URL('../../data/source-evidence/central-cityhive-production-20261029/shared-metadata-baseline.json', import.meta.url), 'utf8'));
const njMiBaseline = JSON.parse(readFileSync(new URL('../../data/source-evidence/nj-mi-production-20261029/shared-metadata-baseline.json', import.meta.url), 'utf8'));
const measuredForecastBaseline = JSON.parse(readFileSync(new URL('../../data/source-evidence/refresh-capacity-20261029/forecast-metadata-ms-boundary.json', import.meta.url), 'utf8'));
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
    // Only the two expanded-area expectations differ from this pinned test.
    let text = replaceUnique(bytes.toString('utf8'),
      '  ["NY", ["Buffalo", "Hudson Valley", "Lake George", "Nassau County", "New York City", "Rochester Metro", "Suffolk County"]],\n',
      '  ["NY", ["Buffalo", "Nassau County", "New York City"]],\n', `${name}: NY areas`);
    text = replaceUnique(text,
      '  ["CO", ["Boulder County", "Colorado Springs", "Denver Metro"]],\n',
      '  ["CO", ["Denver Metro"]],\n', `${name}: CO areas`);
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
    text = replaceUnique(text, nationwide.reviewed, nationwide.original, `${name}: CA reviewed metadata`);
  }
  return Buffer.from(text);
}
