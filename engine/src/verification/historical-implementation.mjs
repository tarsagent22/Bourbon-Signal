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
const originalVerifierSha256 = "  return createHash('sha256').update(readFileSync(new URL(relative, import.meta.url))).digest('hex');";
const normalizedVerifierSha256 = "  const source = readFileSync(new URL(relative, import.meta.url)).toString('utf8').replace(/\\r\\n/gu, '\\n');\n  return createHash('sha256').update(source).digest('hex');";
const originalVerifierCanaryInput = `  const inputBytes = readFileSync(inputPath);
  assert.equal(createHash('sha256').update(inputBytes).digest('hex'), evidence.candidateInputSha256);
  const input = JSON.parse(inputBytes.toString('utf8'));`;
const normalizedVerifierCanaryInput = `  const inputBytes = readFileSync(inputPath).toString('utf8').replace(/\\r\\n/gu, '\\n');
  assert.equal(createHash('sha256').update(inputBytes).digest('hex'), evidence.candidateInputSha256);
  const input = JSON.parse(inputBytes);`;
const reviewedOregonStateSource = `  {
    id: 'OR', label: 'Oregon OLCC Daily Store Inventory', tier: 'A', strategy: 'inventory_locator', cadence: 'daily-report-conditional-check',
    active: false,
    disabledReason: 'Official daily store inventory is prepared behind the lifecycle and immutable-promotion gate; production stays inactive until a distinct current Pacific-date report passes shadow, canary, and first-publication checks.',
    value: 'Official OLCC daily store-reported exact quantities with original inventory dates; not a restock event or shelf guarantee, and all customer alert delivery remains disabled.',
    sources: [
      { kind: 'csv', url: 'https://www.olcc.state.or.us/pdfs/DailyStoreInventory.csv', label: 'Official OLCC daily store inventory' },
      { kind: 'html', url: 'https://www.oregonliquorsearch.com/', label: 'Oregon Liquor Search' },
      { kind: 'html', url: 'https://www.oregon.gov/olcc/liquorstores/pages/current_month_productandpricing.aspx', label: 'Current month product/pricing' },
      { kind: 'html', url: 'https://www.oregon.gov/olcc/LIQUORSTORES/pages/special_orders.aspx', label: 'Special orders / locator guidance' }
    ],
    // Legacy search-page/API probes are research-only; the dedicated daily CSV
    // collector is independently promotion-gated and never raises alerts.
    apiCandidates: []
  },
`;
const originalOregonStateSource = `  {
    id: 'OR', label: 'Oregon OLCC / Oregon Liquor Search', tier: 'A', strategy: 'inventory_locator', cadence: 'paused',
    active: false,
    disabledReason: 'Paused for production: Oregon Liquor Search/API currently times out and exports zero user-facing drops; keep as research-only until store-level rows are reliable again.',
    value: 'Research-only for now. State liquor search and monthly product/price list exist, but current refresh does not produce useful user-facing drops.',
    sources: [
      { kind: 'html', url: 'https://www.oregonliquorsearch.com/', label: 'Oregon Liquor Search' },
      { kind: 'html', url: 'https://www.oregon.gov/olcc/liquorstores/pages/current_month_productandpricing.aspx', label: 'Current month product/pricing' },
      { kind: 'html', url: 'https://www.oregon.gov/olcc/LIQUORSTORES/pages/special_orders.aspx', label: 'Special orders / locator guidance' }
    ],
    // Guessed API routes were removed after repeated 404/500 results. The
    // browser/session collector is the only proven current generation path.
    apiCandidates: []
  },
`;
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
const oregonProductionProofImport = "import { isOregonDailyProductionEvidence } from './oregon-daily-production-policy.mjs';\n";
const oregonProductionProofBoundary = `    ...(isOregonDailyProductionEvidence(signal)?{
      canAlertAsInventory:false,canAlertAsWatch:false,alertable:false,
      eligibleForOnSite:true,eligibleForDropFeed:true,eligibleForWatch:false,
      eligibleForDelivery:false,deliveryEligible:false,eligibleForEmail:false,eligibleForSms:false,
    }:{}),
`;
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
  // Evidence digests are over Git's LF text blobs, including on CRLF checkouts.
  if (/\.(?:mjs|js|ts|tsx|mts|json|html|yml|yaml)$/u.test(name)) {
    const text = bytes.toString('utf8'), normalized = text.replace(/\r\n/gu, '\n');
    if (normalized !== text) bytes = Buffer.from(normalized);
  }
  if (name === 'engine/src/operational-report.mjs') {
    // Normalize checkout line endings before exact historical proof reversals;
    // Git-hosted baseline bytes are LF even when a Windows checkout is CRLF.
    let oregonText = replaceUnique(bytes.toString('utf8').replace(/\r\n/gu, '\n'), oregonProductionProofImport, '', `${name}: Oregon proof import`);
    oregonText = replaceUnique(oregonText, oregonProductionProofBoundary, '', `${name}: Oregon on-site proof`);
    let implementation = oregonText;
    const delawareImport = "import {isDelawareEcwidProductionOnSiteSignal} from './delaware-ecwid-production-policy.mjs';\n";
    if (implementation.includes(delawareImport)) {
      implementation = replaceUnique(implementation, delawareImport, '', `${name}: Delaware Ecwid import`);
      implementation = replaceUnique(implementation, `    ...(isDelawareEcwidProductionOnSiteSignal(signal)?{
      tier:signal.tier,inventorySemantics:signal.inventorySemantics,
      canAlertAsInventory:false,canAlertAsWatch:false,alertable:false,
      eligibleForOnSite:true,eligibleForDropFeed:true,eligibleForWatch:false,
      eligibleForDelivery:false,deliveryEligible:false,eligibleForEmail:false,eligibleForSms:false,
    }:{}),
`, '', `${name}: Delaware Ecwid on-site projection`);
    }
    const wyomingImport = "import { isWyomingGroceryProductionInventory } from './wyoming-grocery-policy.mjs';\n";
    if (implementation.includes(wyomingImport)) {
      implementation = replaceUnique(implementation, wyomingImport, '', `${name}: Wyoming proof import`);
      implementation = replaceUnique(implementation,`    ...(isWyomingGroceryProductionInventory(signal)?{
      tier:signal.tier,inventorySemantics:signal.inventorySemantics,
      canAlertAsInventory:false,canAlertAsWatch:false,alertable:false,
      eligibleForOnSite:true,eligibleForDropFeed:true,eligibleForWatch:false,
      eligibleForDelivery:false,deliveryEligible:false,eligibleForEmail:false,eligibleForSms:false,
    }:{}),
`,'',`${name}: Wyoming production projection`);
    }
    const northDakotaImport = "import { isNorthDakotaProductionOnSiteInventory } from './north-dakota-public-policy.mjs';\n";
    const northDakotaBoundary = `    ...(isNorthDakotaProductionOnSiteInventory(signal)?{
      tier:signal.tier,inventorySemantics:signal.inventorySemantics,
      canAlertAsInventory:false,canAlertAsWatch:false,alertable:false,
      eligibleForOnSite:true,eligibleForDropFeed:true,eligibleForWatch:false,
      eligibleForDelivery:false,deliveryEligible:false,eligibleForEmail:false,eligibleForSms:false,
    }:{}),
`;
    if (implementation.includes(northDakotaImport) || implementation.includes(northDakotaBoundary)) {
      implementation = replaceUnique(implementation, northDakotaImport, '', `${name}: North Dakota on-site proof import`);
      implementation = replaceUnique(implementation, northDakotaBoundary, '', `${name}: North Dakota on-site projection`);
    }
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
    let text = bytes.toString('utf8');
    const tennesseeProofImport = "import { tennesseeOperationalInventoryProof } from './tennessee-retailer-policy.mjs';\n";
    const tennesseeProofProjection = '    ...tennesseeOperationalInventoryProof(signal),\n';
    if (text.includes(tennesseeProofImport) || text.includes(tennesseeProofProjection)) {
      text = replaceUnique(text, tennesseeProofImport, '', `${name}: Tennessee proof import`);
      text = replaceUnique(text, tennesseeProofProjection, '', `${name}: Tennessee exact-store proof projection`);
      bytes = Buffer.from(text);
    }
    const southDakotaImport = "import {isSouthDakotaProductionOnSiteSignal} from './south-dakota-pickup-policy.mjs';\n";
    if (text.includes(southDakotaImport)) {
      text = replaceUnique(text, southDakotaImport, '', `${name}: South Dakota proof import`);
      text = replaceUnique(text, "  // Keep the reviewed binary pickup proof intact through the backend snapshot\n  // transform. The predicate is deliberately evaluated against the original\n  // collector row before projecting only the proof marker needed downstream.\n  const isSouthDakotaProductionPickup = isSouthDakotaProductionOnSiteSignal(signal);\n", '', `${name}: South Dakota proof gate`);
      text = replaceUnique(text, `    ...(isSouthDakotaProductionPickup ? {\n      // The reviewed adapter tier is derived from the exact scoped library\n      // identity; generic Bible tier fallback can otherwise discard it.\n      tier: signal.tier,\n      canAlertAsInventory: false,\n      canAlertAsWatch: false,\n      alertable: false,\n      eligibleForOnSite: true,\n      eligibleForDropFeed: true,\n      eligibleForWatch: false,\n      eligibleForDelivery: false,\n      eligibleForEmail: false,\n      eligibleForSms: false,\n      deliveryEligible: false,\n    } : {}),\n`, '', `${name}: South Dakota proof projection`);
      text = replaceUnique(text, "    ...(isSouthDakotaProductionPickup ? {raw: {productionOnSiteOnly: true}} : {}),\n", '', `${name}: South Dakota proof marker`);
      bytes = Buffer.from(text);
    }
    // Reverse only this exact FL proof-preservation addition at its original
    // canonicalization boundary. The original MS full-file digest stays pinned.
    text = replaceUnique(bytes.toString('utf8'), floridaProofBoundary, originalFloridaProofBoundary, `${name}: FL proof`);
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
    text = replaceUnique(text, normalizedVerifierSha256, originalVerifierSha256, `${name}: evidence hash`);
    text = replaceUnique(text, normalizedVerifierCanaryInput, originalVerifierCanaryInput, `${name}: canary JSON hash`);
    return Buffer.from(text);
  }
  if (!sharedFiles.has(name)) return bytes;
  assert.equal(westernGroceryBaseline.contractVersion, 'bourbon-signal/western-grocery-production-shared-metadata-baseline@1');
  let text = bytes.toString('utf8');
  if(name==='src/config/state-lifecycle.json'||name==='src/config/stateLifecycle.ts'){
    const activeOregon = /^    "OR": \{\n[\s\S]+?^    \},\n/mu.exec(text)?.[0];
    if (activeOregon?.includes('      "publicStatus": "active"')) {
      assert.equal(createHash('sha256').update(activeOregon).digest('hex'), '2a7b68ea463770a405e9619e28fac2edafd3bc1ccbf700b751f32643ceee90dc', name + ': exact attested Oregon lifecycle entry');
      text = replaceUnique(text, activeOregon, "    \"OR\": {\n      \"customerLabel\": \"Oregon\",\n      \"sourceLabel\": \"Oregon OLCC / Oregon Liquor Search\",\n      \"publicStatus\": \"research_only\",\n      \"shadowEligible\": true,\n      \"lifecycle\": \"blocked_store_inventory_research\",\n      \"coverageTier\": \"blocked\",\n      \"refinementLevel\": \"store\",\n      \"customerSummary\": \"Research-only while the official daily store inventory source, immutable promotion evidence, and first publication remain behind the activation gate.\"\n    },\n", name + ': Oregon lifecycle entry');
      text = replaceUnique(text, ',\n    "OR"\n  ],\n  "reliabilityPolicy"', '\n  ],\n  "reliabilityPolicy"', name + ': Oregon active list entry');
      text = replaceUnique(text, '      "OR": 60000,\n', '', name + ': Oregon runtime forecast');
    }
    const activeStates=/"activeStates": \[([\s\S]*?)\]/u.exec(text)?.[1]||'';
    if(/^\s*"OR",?\s*$/mu.test(activeStates)) throw new Error(`${name}: Oregon active list entry has no exact historical verification hook`);
    const runtimeBudgets=/"stateExpectedRunMs": \{([\s\S]*?)\}/u.exec(text)?.[1]||'';
    if(/^\s*"OR": 60000,?\s*$/mu.test(runtimeBudgets)) throw new Error(`${name}: Oregon runtime forecast has no exact historical verification hook`);
    const southDakotaEntry=/^    "SD": \{\n[\s\S]+?^    \},\n/mu.exec(text)?.[0];
    if(southDakotaEntry){
      const exactEntry=southDakotaEntry.replace(/,?\n$/,'');
      assert.equal(createHash('sha256').update(exactEntry).digest('hex'),'58fb4467d293e6e8720e69231dddd5825ed1c37cc85f03f7344b41bbdb1c99a0',`${name}: exact South Dakota lifecycle entry`);
      text=replaceUnique(text,southDakotaEntry,'',`${name}: exact South Dakota lifecycle entry`);
      text=replaceUnique(text,'    "ND",\n    "SD"\n  ],\n  "reliabilityPolicy"','    "ND"\n  ],\n  "reliabilityPolicy"',`${name}: exact South Dakota active list entry`);
      text=replaceUnique(text,'      "ND": 30000,\n      "SD": 60000\n','      "ND": 30000\n',`${name}: exact South Dakota expected runtime entry`);
    }
    const northDakotaEntry=/^    "ND": \{\n[\s\S]+?^    \},?\n/mu.exec(text)?.[0];
    if(northDakotaEntry){
      const exactEntry=northDakotaEntry.replace(/,?\n$/,'');
      assert.equal(createHash('sha256').update(exactEntry).digest('hex'),'cdd8a0a2afc40b47bd00fe02bfe5991d6026484910747657233d429f22337c3d',`${name}: exact North Dakota lifecycle entry`);
      text=replaceUnique(text,northDakotaEntry,'',`${name}: exact North Dakota lifecycle entry`);
      text=replaceUnique(text,',\n  }\n}','\n  }\n}',`${name}: North Dakota lifecycle object separator`);
      text=replaceUnique(text,'    "MO",\n    "ND"\n  ],\n  "reliabilityPolicy"','    "MO"\n  ],\n  "reliabilityPolicy"',`${name}: exact North Dakota active list entry`);
      text=replaceUnique(text,'      "DE": 55000,\n      "ND": 30000\n','      "DE": 55000\n',`${name}: exact North Dakota expected runtime entry`);
    }
    const deStart=text.lastIndexOf('    "DE": {');
    if(deStart>=0){
      const deEnd=text.indexOf('\n    }\n  }',deStart);
      const deBlock=deEnd>=0?text.slice(deStart,deEnd+6):'';
      assert.equal(createHash('sha256').update(deBlock).digest('hex'),'37151a0e8e0947ca70134c0be309271ff12edda21969d18d0f08262526bac666',`${name}: exact Delaware lifecycle entry`);
      text=replaceUnique(text,`,\n${deBlock}`,'',`${name}: exact Delaware lifecycle entry`);
      text=replaceUnique(text,'    "KS",\n    "DE",\n    "AR",\n    "MO"\n  ],\n  "reliabilityPolicy"',
        '    "KS",\n    "AR",\n    "MO"\n  ],\n  "reliabilityPolicy"',`${name}: four-state admission exact Delaware active list entry`);
      text=replaceUnique(text,'      "FL": 180000,\n      "DE": 55000\n','      "FL": 180000\n',`${name}: four-state admission exact Delaware forecast entry`);
    }
  }
  if(name==='engine/src/state-sources.mjs'){
    const northDakotaImport="import { NORTH_DAKOTA_RETAIL_CONFIG } from './collectors/north-dakota-retail-production.mjs';\n";
    if(text.includes(northDakotaImport)){
      text=replaceUnique(text,northDakotaImport,'',`${name}: North Dakota source import`);
      text=replaceUnique(text,'  NORTH_DAKOTA_RETAIL_CONFIG,\n','',`${name}: exact North Dakota source registration`);
    }
    const southDakotaImport="import { origin as SD_MR_LIQUOR_ORIGIN, batchPath as SD_MR_LIQUOR_PATH } from './south-dakota-pickup-policy.mjs';\n";
    const southDakotaEntry="  {\n    id: 'SD', label: 'South Dakota first-party pickup inventory', tier: 'B', strategy: 'retailer_store_inventory', cadence: '30m',\n    value: 'Exact Mr. Liquor Santé pickup at two reviewed Rapid City premises; statewide coverage is not established.',\n    sources: [{ kind: 'api', url: SD_MR_LIQUOR_ORIGIN + SD_MR_LIQUOR_PATH, label: 'Mr. Liquor Rapid City first-party pickup', precisionOnly: true }],\n    apiCandidates: []\n  },\n";
    if(text.includes(southDakotaImport)){
      text=replaceUnique(text,southDakotaImport,'',`${name}: South Dakota source import`);
      text=replaceUnique(text,southDakotaEntry,'',`${name}: exact South Dakota source registration`);
    }
    const wyomingImport = "import { WYOMING_GROCERY_CONFIG } from './collectors/wyoming-grocery-production.mjs';\n";
    if (text.includes(wyomingImport)) {
      text = replaceUnique(text, wyomingImport, '', `${name}: Wyoming source import`);
      text = replaceUnique(text, "  if (source.id === 'WY') return WYOMING_GROCERY_CONFIG;\n", '', `${name}: Wyoming source registration`);
    }
    text=replaceUnique(text,reviewedOregonStateSource,originalOregonStateSource,`${name}: exact dormant Oregon source block`);
    const oregonRegistryOverlay = "  if (source.id === 'OR' && CONFIG_CUSTOMER_ACTIVE_STATE_IDS.has('OR')) return { ...source, active: true, disabledReason: null };\n";
    if (text.includes(oregonRegistryOverlay)) {
      text = replaceUnique(text, oregonRegistryOverlay, '', `${name}: exact Oregon production registry overlay`);
    }
    const minnesotaImport = "import { MINNESOTA_CITYHIVE_PRODUCTION_CONFIG } from './minnesota-cityhive-production-config.mjs';\n";
    if (text.includes(minnesotaImport)) {
      text = replaceUnique(text, minnesotaImport, '', `${name}: MN registry import`);
      text = replaceUnique(text, "  if (source.id === 'MN' && CONFIG_CUSTOMER_ACTIVE_STATE_IDS.has('MN')) return MINNESOTA_CITYHIVE_PRODUCTION_CONFIG;\n", '', `${name}: MN registry overlay`);
    }
    text=replaceUnique(text,"  ...CENTRAL_CITYHIVE_STATE_CONFIGS.filter(source=>source.id==='MO'),\n",
      "  {\n    id: 'MO', label: 'Missouri Costco warehouse bourbon watch', tier: 'B', strategy: 'costco_warehouse_inventory_watch', cadence: '15-60m',\n    value: 'Costco-only expansion state. Missouri Costco warehouses are useful private-market bourbon signals where verified.',\n    rareSignalTarget: false,\n    sources: [],\n    apiCandidates: []\n  },\n",`${name}: dormant Missouri source registration`);
    text=replaceUnique(text,'  ...CENTRAL_CITYHIVE_STATE_CONFIGS.filter(source=>source.id!==\'MO\'),\n','  ...CENTRAL_CITYHIVE_STATE_CONFIGS,\n',`${name}: central source config spread`);
    text=replaceUnique(text,"import {LOUISIANA_ALASKA_GROCERY_PRODUCTION_CONFIGS,LOUISIANA_ALASKA_GROCERY_PRODUCTION_STATES} from './louisiana-alaska-grocery-production-config.mjs';\n",'',`${name}: AK/LA production config import`);
    text=replaceUnique(text,
      "export const ALL_STATE_SOURCES = [...BASE_STATE_SOURCES.filter(source=>!NJ_MI_PRODUCTION_STATES.includes(source.id)&&!LOUISIANA_ALASKA_GROCERY_PRODUCTION_STATES.includes(source.id)),...NJ_MI_PRODUCTION_CONFIGS,...LOUISIANA_ALASKA_GROCERY_PRODUCTION_CONFIGS].map((source) => {\n  if(NJ_MI_PRODUCTION_STATES.includes(source.id)||LOUISIANA_ALASKA_GROCERY_PRODUCTION_STATES.includes(source.id))return source;",
      "export const ALL_STATE_SOURCES = [...BASE_STATE_SOURCES.filter(source=>!NJ_MI_PRODUCTION_STATES.includes(source.id)),...NJ_MI_PRODUCTION_CONFIGS].map((source) => {\n  if(NJ_MI_PRODUCTION_STATES.includes(source.id))return source;",
      `${name}: AK/LA dormant source registration`);
  }
  if(name==='src/config/state-lifecycle.json'||name==='src/config/stateLifecycle.ts'){
    text=replaceUnique(text,
      '      "customerSummary": "Research-only while the official daily store inventory source, immutable promotion evidence, and first publication remain behind the activation gate."',
      '      "customerSummary": "Research-only until Oregon Liquor Search browser/session collection reliably produces current store rows."',
      `${name}: exact dormant Oregon lifecycle summary`);
    const releasedWyoming = /^    "WY": \{\n[\s\S]+?^    \},\n/mu.exec(text)?.[0];
    if (releasedWyoming || text.includes('  "activeStates": [\n    "WY",\n')) {
      assert.equal(createHash('sha256').update(releasedWyoming || '').digest('hex'),
        'af5063c6bc3d8a818d4107490cd1d20b8a0b48da9562a5fe0cf692a8ecaaf719', name + ': exact attested WY entry');
      text = replaceUnique(text, releasedWyoming, '', name + ': Wyoming retailer lifecycle entry');
      text = replaceUnique(text, '  "activeStates": [\n    "WY",\n', '  "activeStates": [\n',
        name + ': exact WY active list head');
      text = replaceUnique(text, '    "stateExpectedRunMs": {\n      "WY": 30000,\n', '    "stateExpectedRunMs": {\n',
        name + ': exact WY measured runtime forecast');
    }
    const releasedMd = /^    "MD": \{\n[\s\S]+?^    \},\n/mu.exec(text)?.[0];
    if (releasedMd || text.includes('  "activeStates": [\n    "MD",\n')) {
      assert.equal(createHash('sha256').update(releasedMd || '').digest('hex'),
        'a1672988a50f6ec7ae0fd91b8e5ccb28252238d506819f6fedeaf8d65ce34059', name + ': exact attested MD entry');
      text = replaceUnique(text, releasedMd, '', name + ': Maryland pickup lifecycle entry');
      text = replaceUnique(text, '  "activeStates": [\n    "MD",\n', '  "activeStates": [\n',
        name + ': exact MD active list head');
      text = replaceUnique(text, '    "stateExpectedRunMs": {\n      "MD": 15000,\n', '    "stateExpectedRunMs": {\n',
        name + ': exact MD measured runtime forecast');
    }
    const releasedMo = /^    "MO": \{\n[\s\S]+?^    \},\n/mu.exec(text)?.[0];
    if (text.includes(',\n    "MO"\n  ],\n  "reliabilityPolicy"')) {
      assert.equal(createHash('sha256').update(releasedMo || '').digest('hex'), 'b3c0517b815c94279b4bc515258e09d3862042aae1c2783c64989da2e94e02a9', name + ': exact attested MO entry');
      text = replaceUnique(text, releasedMo, "    \"MO\": {\n      \"customerLabel\": \"Missouri\",\n      \"sourceLabel\": \"Missouri Costco warehouse bourbon watch\",\n      \"publicStatus\": \"research_only\",\n      \"shadowEligible\": true,\n      \"lifecycle\": \"blocked_costco_inventory_research\",\n      \"coverageTier\": \"blocked\",\n      \"refinementLevel\": \"warehouse\",\n      \"inventoryAlertable\": false,\n      \"watchAlertable\": false,\n      \"customerSummary\": \"Research-only: Missouri has Costco warehouse research configuration but no recurring verified observations, so customer coverage and alerts remain blocked.\"\n    },\n", name + ': MO lifecycle');
      text = replaceUnique(text, ',\n    "MO"\n  ],\n  "reliabilityPolicy"', '\n  ],\n  "reliabilityPolicy"', name + ': MO active list');
    }
    const arkansasEntry=/^    "AR": \{\n[\s\S]+?^    \},\n/mu.exec(text)?.[0];
    if (arkansasEntry || text.includes('    "AR"\n  ],\n  "reliabilityPolicy"')) {
      assert.equal(createHash('sha256').update(arkansasEntry || '').digest('hex'),
        'f78516d4a82fa49c7625cac1b82054da266033f6f612dbe95303ddfee7cfd3f9', `${name}: exact attested AR lifecycle entry`);
      text = replaceUnique(text, arkansasEntry, '', `${name}: exact attested AR lifecycle entry`);
      text = replaceUnique(text, ',\n    "AR"\n  ],\n  "reliabilityPolicy"',
        '\n  ],\n  "reliabilityPolicy"', `${name}: exact AR active list tail`);
      text = replaceUnique(text, '    "stateExpectedRunMs": {\n      "AR": 30000,\n',
        '    "stateExpectedRunMs": {\n', `${name}: exact AR expected runtime`);
    }
    const activeKansasTail=/^    \},\n    "KS": \{[\s\S]+?^    \}\n  \}/mu.exec(text)?.[0];
    const kansasTailSha='e58074869dfcb88cc8f7dce74e9e00a1c636559a05824c61cc3a3a4b6a3c3c8a';
    if(activeKansasTail&&createHash('sha256').update(activeKansasTail).digest('hex')===kansasTailSha){
      text=replaceUnique(text,activeKansasTail,'    }\n  }',`${name}: exact attested KS lifecycle tail`);
      const activeTailWithMo='    "MO",\n    "KS"\n  ],\n  "reliabilityPolicy"';
      if(text.includes(activeTailWithMo)) text=replaceUnique(text,activeTailWithMo,'    "MO"\n  ],\n  "reliabilityPolicy"',`${name}: exact KS active list tail alongside MO`);
      else text=replaceUnique(text,'    "MN",\n    "KS"\n  ],\n  "reliabilityPolicy"','    "MN"\n  ],\n  "reliabilityPolicy"',`${name}: exact KS active list tail`);
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
      const activeStatesWithMo = '    "RI",\n    "MN",\n    "MO"\n  ],\n  "reliabilityPolicy"';
      if (text.includes(activeStatesWithMo)) text = replaceUnique(text, activeStatesWithMo,
        '    "RI"\n  ],\n  "reliabilityPolicy"', `${name}: exact MN/MO active list tail`);
      else text = replaceUnique(text, '    "RI",\n    "MN"\n  ],\n  "reliabilityPolicy"',
        '    "RI"\n  ],\n  "reliabilityPolicy"', `${name}: exact MN active list tail`);
      text = replaceUnique(text, '    "stateExpectedRunMs": {\n      "MN": 30000,\n',
        '    "stateExpectedRunMs": {\n', `${name}: exact MN expected runtime`);
    }
    const quote = String.fromCharCode(34);
    const moStart = text.indexOf(`    ${quote}MO${quote}: {`);
    const msStart = text.indexOf(`    ${quote}MS${quote}: {`, moStart);
    const moEnd = msStart > moStart ? text.lastIndexOf('    },', msStart) : -1;
    const activeMissouri = moEnd > moStart ? text.slice(moStart, moEnd + 6) : '';
    if (activeMissouri && ['4903f307402d6bda0a655772a81cde6f39408d2ec08a7c667cf4bd9ca872fbc0',
      '4cbb1b6701d454a0c276f096d87e5e0df5ac1e2149af47e6f134582001cca400']
      .includes(createHash('sha256').update(activeMissouri).digest('hex'))) {
      const dormantMissouri = `    "MO": {
      "customerLabel": "Missouri",
      "sourceLabel": "Missouri Costco warehouse bourbon watch",
      "publicStatus": "research_only",
      "shadowEligible": true,
      "lifecycle": "blocked_costco_inventory_research",
      "coverageTier": "blocked",
      "refinementLevel": "warehouse",
      "inventoryAlertable": false,
      "watchAlertable": false,
      "customerSummary": "Research-only: Missouri has Costco warehouse research configuration but no recurring verified observations, so customer coverage and alerts remain blocked."
    },`;
      text = replaceUnique(text, activeMissouri, dormantMissouri, `${name}: exact attested MO lifecycle entry`);
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
    // Reconcile only the reviewed 24-store NM admission against the archived original.
    const regionalNm = text.match(/^    "NM": \{[\s\S]+?^    \}/mu)?.[0];
    if (regionalNm && createHash('sha256').update(regionalNm).digest('hex') === '8c7438a5fdb42b035334ba6204eb1432f7b31480dedf53a7d2f5d054742a1324') {
      text = replaceUnique(text, regionalNm, admission.NM.reviewed, name + ': four-state admission NM regional expansion');
    }
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
  if(name==='src/config/state-lifecycle.json')for(const [current,historical]of [
    ['Northwest / DeSoto–Memphis fringe','Northwest / DeSoto\\u2013Memphis fringe'],
    ['Northeast / Tupelo–Golden Triangle','Northeast / Tupelo\\u2013Golden Triangle'],
    ['Delta / Greenville–Clarksdale–Greenwood','Delta / Greenville\\u2013Clarksdale\\u2013Greenwood'],
    ['Central / Jackson–Madison–Rankin','Central / Jackson\\u2013Madison\\u2013Rankin'],
    ['Pine Belt / Hattiesburg–Laurel','Pine Belt / Hattiesburg\\u2013Laurel'],
    ['Gulf Coast / Gulfport–Biloxi–Pascagoula','Gulf Coast / Gulfport\\u2013Biloxi\\u2013Pascagoula'],
    ['Southwest / Natchez–Brookhaven–McComb–Vicksburg','Southwest / Natchez\\u2013Brookhaven\\u2013McComb\\u2013Vicksburg'],
    ['Sparse exact-store Mississippi retailer inventory across DeSoto County, the Jackson–Madison area, and an identity-bound Tupelo merchant cohort, plus conservative non-inventory release-watch evidence. Exact-store binary orderability is visible on-site only when freshly observed; marketplace controls do not claim exact bottle counts, pickup, delivery, or guaranteed fulfillment, release-watch evidence stays nonalertable, outbound alerts remain disabled, and customers should verify before driving.',
      'Sparse exact-store Mississippi retailer inventory across DeSoto County, the Jackson\\u2013Madison area, and an identity-bound Tupelo merchant cohort, plus conservative non-inventory release-watch evidence. Exact-store binary orderability is visible on-site only when freshly observed; marketplace controls do not claim exact bottle counts, pickup, delivery, or guaranteed fulfillment, release-watch evidence stays nonalertable, outbound alerts remain disabled, and customers should verify before driving.'],
    ['First-party retailer store availability and pickup orderability across Las Vegas Valley and Reno–Sparks. Binary availability is not an exact shelf count; verify before driving. Costco remains a separate warehouse watch lane.',
      'First-party retailer store availability and pickup orderability across Las Vegas Valley and Reno\\u2013Sparks. Binary availability is not an exact shelf count; verify before driving. Costco remains a separate warehouse watch lane.'],
  ])text=replaceUnique(text,current,historical,`${name}: exact historical JSON unicode escapes`);
  if(name==='src/config/state-lifecycle.json'||name==='src/config/stateLifecycle.ts'){
    const current='"workerConcurrency": 5,';
    if(text.includes(current))text=replaceUnique(text,current,'"workerConcurrency": 4,',`${name}: exact five-worker capacity forecast`);
  }
  if(name==='src/config/state-lifecycle.json')text=replaceUnique(text,'Reno–Sparks','Reno\\u2013Sparks',`${name}: exact Nevada area Unicode escape`);
  return Buffer.from(text);
}
