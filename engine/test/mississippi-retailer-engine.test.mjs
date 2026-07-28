import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  MISSISSIPPI_RETAILER_SOURCES,
  parseMississippiCityHiveHtml,
  parseMississippiGoToLiquorStoreProducts,
  parseMississippiMoonshineResponse,
} from '../src/collectors/mississippi-retailer-surfaces.mjs';
import {
  buildMississippiRetailerSignal,
  collectMississippiRetailers,
} from '../src/collectors/mississippi-retailer-collector.mjs';
import {
  isMississippiRetailerInventory,
  isMississippiRetailerSignalIdentity,
} from '../src/mississippi-retailer-policy.mjs';
import {
  MISSISSIPPI_SOURCE_CONFIG_DIGEST,
  silenceMississippiResearchCandidates,
  suppressMississippiActivationBaseline,
} from '../src/mississippi-activation-policy.mjs';
import { verifyMississippiReleasePolicy } from '../src/mississippi-release-policy.mjs';
import { validateMississippiShadowEvidenceArtifact } from '../src/verify-ms.mjs';
import { summarizeMississippiSourceHealth } from '../src/mississippi-source-health.mjs';
import { confidenceForSignal } from '../src/confidence-policy.mjs';
import { getStateLifecycle } from '../src/state-lifecycle.mjs';
import { ALL_STATE_SOURCES } from '../src/state-sources.mjs';

const registry = JSON.parse(await readFile(new URL('../data/mississippi-retailer-registry.json', import.meta.url), 'utf8'));
const fixture = (name) => readFile(new URL(`./fixtures/ms/${name}`, import.meta.url), 'utf8');

function exactSignal(source, row = {}) {
  return buildMississippiRetailerSignal(source, {
    productId: source.platform === 'cityhive' ? 'product-1' : source.platform === 'moonshine' ? '2896' : '1138',
    variantId: source.platform === 'cityhive' ? 'option-1' : source.platform === 'moonshine' ? '3605' : null,
    title: 'Buffalo Trace Bourbon 750ml',
    productUrl: source.platform === 'cityhive'
      ? `${source.baseUrl}/shop/product/buffalo-trace/product-1?option-id=option-1`
      : source.platform === 'moonshine'
        ? `${source.baseUrl}/shop/buffalo-trace-bourbon-2896`
        : `${source.baseUrl}/p/buffalo-trace-bourbon/1138`,
    price: 31.99,
    reportedQuantity: 7,
    sourceAvailabilityVerified: true,
    pickupOfferVerified: true,
    premisesVerified: true,
    ...row,
  }, {
    observedAt: '2026-07-25T20:00:00.000Z',
    bottle: { id: 'bb_test', canonical: 'Buffalo Trace Bourbon', tier: 'allocated', confidence: 0.94 },
  });
}

test('registry binds eight reviewed stores to exact permit, merchant, host, premises, and independent runtime IDs', () => {
  assert.equal(registry.schemaVersion, 1);
  assert.equal(registry.stores.length, 8);
  assert.deepEqual(new Set(registry.stores.map((store) => store.permitNumber)), new Set(['046478', '040562', '029254', '044692', '044411', '049222', '051851', '007481']));
  assert.equal(new Set(registry.stores.map((store) => store.sourceRuntimeId)).size, 8);
  assert.deepEqual(registry.stores.slice(0, 4).map((store) => ({
    permit: store.permitNumber,
    merchant: store.merchantId,
    controlStore: store.controlStoreId || null,
    host: store.hostname,
    city: store.city,
    zip: store.zip,
  })), [
    { permit: '046478', merchant: '955132', controlStore: '1031', host: 'www.aliquorwarehouse.com', city: 'Winona', zip: '38967' },
    { permit: '040562', merchant: '736142', controlStore: '1069', host: 'www.cabinfeverliquor.com', city: 'Nesbit', zip: '38651' },
    { permit: '029254', merchant: '68ba2980113a7a29c2076fc3', controlStore: null, host: 'www.desotoliquor.com', city: 'Horn Lake', zip: '38637' },
    { permit: '044411', merchant: '323', controlStore: null, host: 'www.moonshinems.com', city: 'Madison', zip: '39110' },
  ]);
  assert.deepEqual(registry.stores.filter((store) => store.platform === 'moonshine').map((store) => ({
    name: store.name,
    seller: store.moonshineSellerId,
    url: store.sellerUrl,
    pickup: store.pickupAvailable,
  })), [
    { name: 'Barleys Beer Barn', seller: 323, url: 'https://www.moonshinems.com/barleysbeerbarn', pickup: true },
    { name: 'Cork Screw', seller: 2118, url: 'https://www.moonshinems.com/corkscrew', pickup: true },
    { name: 'Madison Cellars', seller: 7, url: 'https://www.moonshinems.com/madisoncellars', pickup: true },
    { name: 'Terra Nova', seller: 1882, url: 'https://www.moonshinems.com/terranova', pickup: true },
  ]);
  assert.deepEqual(new Set(MISSISSIPPI_RETAILER_SOURCES.map((source) => source.permitNumber)), new Set(registry.stores.map((store) => store.permitNumber)));
  assert.deepEqual(registry.stores.map((store) => store.autonomousFetchAllowed), [false, false, true, true, true, true, true, true]);
  assert.deepEqual(registry.stores.map((store) => store.sourcePolicyStatus), ['blocked_by_source_policy', 'blocked_by_source_policy', 'allowed', 'allowed', 'allowed', 'allowed', 'allowed', 'allowed']);
});

test('GoTo parser requires visible store-bound orderability, safe format, and a clean same-host product URL', async () => {
  const source = MISSISSIPPI_RETAILER_SOURCES.find((entry) => entry.permitNumber === '046478');
  const rows = parseMississippiGoToLiquorStoreProducts(await fixture('gotoliquor/positive.html'), source);
  assert.deepEqual(rows, [{
    productId: '1138',
    variantId: null,
    title: 'Buffalo Trace Bourbon 750ml',
    productUrl: 'https://www.aliquorwarehouse.com/p/buffalo-trace-bourbon/1138',
    price: 31.99,
    reportedQuantity: null,
    quantity: 0,
    quantityIsExact: false,
    sourceAvailabilityVerified: true,
    pickupOfferVerified: true,
    premisesVerified: true,
    inventorySemantics: 'binary_retailer_orderable_no_exact_count',
  }]);
  assert.deepEqual(parseMississippiGoToLiquorStoreProducts(
    (await fixture('gotoliquor/positive.html')).replaceAll('955132', '999999'),
    source,
  ), []);
  assert.deepEqual(parseMississippiGoToLiquorStoreProducts(
    (await fixture('gotoliquor/positive.html')).replaceAll('1031', '9999'),
    source,
  ), []);
});

test('CityHive parser binds exact merchant and premises but converts orderability to non-exact zero quantity', async () => {
  const source = MISSISSIPPI_RETAILER_SOURCES.find((entry) => entry.permitNumber === '029254');
  const rows = parseMississippiCityHiveHtml(await fixture('cityhive/positive.html'), source);
  assert.equal(rows.length, 1);
  assert.deepEqual({
    merchantId: rows[0].merchantId,
    productId: rows[0].productId,
    variantId: rows[0].variantId,
    quantity: rows[0].quantity,
    quantityIsExact: rows[0].quantityIsExact,
    pickupOfferVerified: rows[0].pickupOfferVerified,
    premisesVerified: rows[0].premisesVerified,
    semantics: rows[0].inventorySemantics,
  }, {
    merchantId: '68ba2980113a7a29c2076fc3',
    productId: 'product-1',
    variantId: 'option-1',
    quantity: 0,
    quantityIsExact: false,
    pickupOfferVerified: true,
    premisesVerified: true,
    semantics: 'binary_retailer_orderable_no_exact_count',
  });
  const forged = (await fixture('cityhive/positive.html')).replaceAll(
    '904 Goodman Rd W Ste A Horn Lake MS 38637',
    '999 Attacker Rd Jackson MS 39201',
  );
  assert.deepEqual(parseMississippiCityHiveHtml(forged, source), []);
});

test('Moonshine parser binds the selected seller, exact product URL, safe bottle size, price, and cart control', async () => {
  const source = MISSISSIPPI_RETAILER_SOURCES.find((entry) => entry.permitNumber === '007481');
  const payload = JSON.parse(await fixture('moonshine/positive.json'));
  const rows = parseMississippiMoonshineResponse(payload, source);
  assert.deepEqual(rows, [{
    productId: '2896',
    variantId: '3605',
    platformProductId: '3605',
    title: 'Bulleit Straight Bourbon 90 Proof 1.75L',
    productUrl: 'https://www.moonshinems.com/shop/17088-bulleit-straight-bourbon-90-proof-2896',
    price: 50.99,
    reportedQuantity: null,
    quantity: 0,
    quantityIsExact: false,
    sourceAvailabilityVerified: true,
    pickupOfferVerified: true,
    premisesVerified: true,
    inventorySemantics: 'binary_retailer_orderable_no_exact_count',
  }]);
  const forgedSeller = { ...payload, moonshine_seller_id: 7 };
  assert.deepEqual(parseMississippiMoonshineResponse(forgedSeller, source), []);
  const forgedControl = { ...payload, available_store_tab: payload.available_store_tab.replace('seller_id\" value=\"1882', 'seller_id\" value=\"7') };
  assert.deepEqual(parseMississippiMoonshineResponse(forgedControl, source), []);
  const unsafeSize = { ...payload, product_store: payload.product_store.replace('1.75L', '375ml') };
  assert.deepEqual(parseMississippiMoonshineResponse(unsafeSize, source), []);
});

test('exact Mississippi policy accepts guarded binary evidence and rejects every forged binding', () => {
  const source = MISSISSIPPI_RETAILER_SOURCES.find((entry) => entry.permitNumber === '029254');
  const signal = exactSignal(source);
  assert.equal(isMississippiRetailerSignalIdentity(signal), true);
  assert.equal(isMississippiRetailerInventory(signal), true);
  const moonshine = MISSISSIPPI_RETAILER_SOURCES.find((entry) => entry.permitNumber === '007481');
  assert.equal(isMississippiRetailerSignalIdentity(exactSignal(moonshine)), true);
  assert.equal(isMississippiRetailerInventory(exactSignal(moonshine)), true);
  const blockedGoTo = MISSISSIPPI_RETAILER_SOURCES.find((entry) => entry.permitNumber === '046478');
  assert.equal(isMississippiRetailerSignalIdentity(exactSignal(blockedGoTo)), false);
  assert.equal(isMississippiRetailerInventory(exactSignal(blockedGoTo)), false);
  for (const forged of [
    { ...signal, permitNumber: '999999' },
    { ...signal, sourceRuntimeId: 'retailer:ms:forged' },
    { ...signal, merchantId: '999999' },
    { ...signal, raw: { ...signal.raw, controlStoreId: '9999' } },
    { ...signal, raw: { ...signal.raw, displayedMerchantId: '999999' } },
    { ...signal, sourceUrl: 'https://attacker.example/p/bourbon/1138' },
    { ...signal, storeAddress: '999 Attacker Rd Jackson MS 39201' },
    { ...signal, city: 'Jackson', storeCity: 'Jackson' },
    { ...signal, zip: '39201', postalCode: '39201' },
    { ...signal, quantity: 1 },
    { ...signal, quantityIsExact: true },
    { ...signal, pickupOfferVerified: false },
    { ...signal, sourceAvailabilityVerified: false },
    { ...signal, rawName: 'Buffalo Trace Bourbon 12 x 50ml' },
    { ...signal, stale: true },
  ]) assert.equal(isMississippiRetailerInventory(forged), false, JSON.stringify(forged));
});

test('research lifecycle keeps exact positive rows visible but nonalertable and suppresses the first baseline', () => {
  const lifecycle = getStateLifecycle('MS');
  const source = MISSISSIPPI_RETAILER_SOURCES.find((entry) => entry.permitNumber === '029254');
  const signal = exactSignal(source);
  const confidence = confidenceForSignal(signal);
  assert.equal(confidence.canAlertAsInventory, false);
  assert.equal(confidence.canAlertAsWatch, false);
  const [baseline] = suppressMississippiActivationBaseline(
    [{ ...signal, eligibleForDelivery: true, eligibleForEmail: true, eligibleForSms: true, blockers: [] }],
    [],
    [signal],
  );
  assert.equal(baseline.eligibleForDelivery, false);
  assert.equal(baseline.eligibleForEmail, false);
  assert.equal(baseline.eligibleForSms, false);
  assert.ok(baseline.blockers.includes('state_activation_baseline'));
  const [promotionBaseline] = suppressMississippiActivationBaseline(
    [{ ...signal, eligibleForDelivery: true, eligibleForEmail: true, eligibleForSms: true, blockers: [] }],
    [signal],
    [signal],
    { activated: true },
  );
  assert.equal(promotionBaseline.eligibleForDelivery, false, 'research/shadow history cannot stand in for the persisted post-promotion baseline marker');
  const [afterPersistedBaseline] = suppressMississippiActivationBaseline(
    [{ ...signal, eligibleForDelivery: true, eligibleForEmail: true, eligibleForSms: true, blockers: [] }],
    [signal],
    [signal],
    {
      markerVersion: 'bourbon-signal/ms-activation-baseline@1',
      state: 'MS',
      baselineEstablished: true,
      sourceConfigDigest: MISSISSIPPI_SOURCE_CONFIG_DIGEST,
      lifecycleActivatedAt: '2026-07-27T12:00:00.000Z',
    },
  );
  assert.equal(afterPersistedBaseline.eligibleForDelivery, true);
  const [wrongConfigBaseline] = suppressMississippiActivationBaseline(
    [{ ...signal, eligibleForDelivery: true, blockers: [] }],
    [],
    [signal],
    {
      markerVersion: 'bourbon-signal/ms-activation-baseline@1',
      state: 'MS',
      baselineEstablished: true,
      sourceConfigDigest: '0'.repeat(64),
      lifecycleActivatedAt: '2026-07-27T12:00:00.000Z',
    },
  );
  assert.equal(wrongConfigBaseline.eligibleForDelivery, false);
  const [researchSilent] = silenceMississippiResearchCandidates([{ ...signal, eligibleForOnSite: true, eligibleForDelivery: true }]);
  assert.equal(researchSilent.eligibleForOnSite, false);
  assert.equal(researchSilent.eligibleForDelivery, false);
  assert.throws(() => verifyMississippiReleasePolicy({
    lifecycle,
    signals: [signal],
    alerts: [{ state: 'MS', eligibleForOnSite: true, eligibleForDelivery: false, eligibleForEmail: false, eligibleForSms: false }],
  }), /cannot publish or deliver/iu);
});

test('sparse Mississippi coverage permits exact rows on-site while keeping every outbound channel closed', () => {
  const source = MISSISSIPPI_RETAILER_SOURCES.find((entry) => entry.permitNumber === '029254');
  const signal = exactSignal(source);
  const lifecycle = {
    publicStatus: 'active',
    coverageTier: 'sparse_live_store_inventory',
    inventoryAlertable: false,
    watchAlertable: false,
  };
  const result = verifyMississippiReleasePolicy({
    lifecycle,
    phase: 'sparse',
    signals: [signal],
    alerts: [{ state: 'MS', eligibleForOnSite: true, eligibleForDelivery: false, eligibleForEmail: false, eligibleForSms: false, published: false }],
  });
  assert.equal(result.onSiteOnly, true);
  assert.throws(() => verifyMississippiReleasePolicy({
    lifecycle,
    phase: 'sparse',
    signals: [signal],
    alerts: [{ state: 'MS', eligibleForOnSite: true, eligibleForDelivery: true, eligibleForEmail: false, eligibleForSms: false }],
  }), /sparse coverage can be on-site only/iu);
});

test('collector isolates allowed stores and reports policy-blocked sources without requesting them', async () => {
  const htmlByHost = new Map([
    ['www.aliquorwarehouse.com', await fixture('gotoliquor/positive.html')],
    ['www.cabinfeverliquor.com', (await fixture('gotoliquor/positive.html'))
      .replaceAll('A Liquor Warehouse', 'Cabin Fever Wine & Spirits')
      .replaceAll('955132', '736142')
      .replaceAll('Winona, 38967', 'Nesbit, 38651')
      .replaceAll('1031', '1069')],
    ['www.desotoliquor.com', await fixture('cityhive/positive.html')],
    ['thehernandowinespirits.com', (await fixture('cityhive/positive.html'))
      .replaceAll('68ba2980113a7a29c2076fc3', '669150d28f28f1287440bdce')
      .replaceAll('904 Goodman Rd W Ste A Horn Lake MS 38637', '2358 Mt Pleasant Rd Hernando MS 38632')
      .replaceAll('https://www.desotoliquor.com', 'https://thehernandowinespirits.com')],
  ]);
  const requestedHosts = [];
  const result = await collectMississippiRetailers({ id: 'MS' }, {
    fetchText: async (url) => {
      requestedHosts.push(new URL(url).hostname);
      return { ok: true, status: 200, text: htmlByHost.get(new URL(url).hostname) };
    },
    fetchJson: async () => ({ ok: true, status: 200, cookie: 'session_id=test', payload: { product_store: '', available_store_tab: '' } }),
    matchBottle: () => ({ id: 'bb_test', canonical: 'Buffalo Trace Bourbon', tier: 'allocated', confidence: 0.94 }),
    now: () => new Date('2026-07-25T20:00:00.000Z'),
    sourceRunnerOptions: { timeoutMs: 5_000, maxAttempts: 1 },
  });
  assert.equal(result.sourceResults.length, 8);
  assert.equal(new Set(result.sourceResults.map((entry) => entry.sourceId)).size, 8);
  assert.ok(result.sourceResults.every((entry) => entry.alertable === false
    && entry.inventoryAlertable === false
    && entry.watchAlertable === false));
  assert.deepEqual(new Set(requestedHosts), new Set(['www.desotoliquor.com', 'thehernandowinespirits.com', 'www.moonshinems.com']));
  assert.equal(result.runtime.partitionCount, 6);
  assert.equal(result.runtime.blockedSourceCount, 2);
  assert.equal(result.sourceResults.filter((entry) => entry.status === 'source_policy_blocked').length, 2);
  assert.equal(result.roadblocks.filter((entry) => entry.status === 'source_policy_blocked').length, 2);
  assert.ok(result.signals.length >= 2);
  assert.ok(result.signals.every((signal) => signal.quantity === 0 && signal.quantityIsExact === false));
});

test('reachable zero-row Mississippi storefronts remain explicit roadblocks and nonalertable', async () => {
  const result = await collectMississippiRetailers({ id: 'MS' }, {
    fetchText: async () => ({ ok: true, status: 200, text: '<html><body>No exact-store orderability rows</body></html>' }),
    fetchJson: async () => ({ ok: true, status: 200, cookie: 'session_id=test', payload: { product_store: '', available_store_tab: '' } }),
    matchBottle: () => ({ id: 'bb_test', canonical: 'Buffalo Trace Bourbon', tier: 'allocated', confidence: 0.94 }),
    now: () => new Date('2026-07-25T20:00:00.000Z'),
    sourceRunnerOptions: { timeoutMs: 5_000, maxAttempts: 1 },
  });
  assert.equal(result.signals.length, 0);
  assert.equal(result.roadblocks.length, 8);
  assert.equal(result.roadblocks.filter((entry) => entry.status === 'reachable_no_safe_orderability_rows').length, 6);
  assert.equal(result.roadblocks.filter((entry) => entry.status === 'source_policy_blocked').length, 2);
  assert.ok(result.sourceResults.every((entry) => entry.alertable === false));
});

test('blocked BottleCapps probes stay health-visible, nonalertable, and out of inventory authority', async () => {
  const atlas = JSON.parse(await readFile(new URL('../data/source-atlas/MS.json', import.meta.url), 'utf8'));
  const health = summarizeMississippiSourceHealth({ atlas, sourceResults: [] });
  assert.equal(health.inventorySources, 6);
  assert.equal(health.directorySourcePolicyStatus, 'source_policy_blocked');
  assert.equal(health.blockedBySourcePolicy, 7);
  assert.equal(health.sourceOffline, 2);
  assert.equal(health.platformProbeOnly, 2);
  assert.equal(health.entries.filter((entry) => entry.platform === 'bottlecapps').length, 9);
  assert.ok(health.entries.filter((entry) => entry.platform === 'bottlecapps')
    .every((entry) => entry.healthVisible && !entry.inventoryAuthoritative && !entry.alertable));
});

test('shadow verification rejects a hand-authored run count without bound production evidence', () => {
  const commit = 'a'.repeat(40);
  const digests = { retailerRegistry: 'b'.repeat(64), program: 'c'.repeat(64), lifecycle: 'd'.repeat(64) };
  const evidence = {
    contractVersion: 'bourbon-signal/ms-shadow-evidence@1',
    state: 'MS',
    codeCommitSha: commit,
    configDigests: digests,
    runs: [0, 1, 2].map((index) => ({
      runId: `fake-run-${index}`,
      runner: 'production-runner',
      codeCommitSha: commit,
      configDigests: digests,
      startedAt: new Date(Date.parse('2026-07-27T00:00:00.000Z') + index * 12 * 60 * 60_000).toISOString(),
      finishedAt: new Date(Date.parse('2026-07-27T00:05:00.000Z') + index * 12 * 60 * 60_000).toISOString(),
      publicationAttempted: false,
      deliveryCount: 0,
      baselineDeliveries: 0,
      sourceResults: [],
      signals: [],
      alertOutputs: [],
    })),
  };
  assert.throws(
    () => validateMississippiShadowEvidenceArtifact(evidence, { expectedCommitSha: commit, expectedConfigDigests: digests }),
    /verified immutable GitHub workflow provenance/iu,
  );
  const artifactBoundEvidence = {
    ...evidence,
    runs: [0, 1, 2].map((index) => ({
      runId: `gha-${1000 + index}-1`,
      github: { workflowRunId: 1000 + index, runAttempt: 1, artifactId: 2000 + index, artifactDigest: `sha256:${'e'.repeat(64)}` },
      sourceResults: MISSISSIPPI_RETAILER_SOURCES.map((source) => ({ sourceId: source.sourceRuntimeId, status: 'success' })),
    })),
  };
  const verifiedArtifactContents = new Map(artifactBoundEvidence.runs.map((run, index) => [String(run.github.workflowRunId), {
    artifactId: run.github.artifactId,
    artifactDigest: run.github.artifactDigest,
    headSha: commit,
    evidence: {
      state: 'MS',
      mode: 'shadow',
      publication: { productionSnapshotTouched: false },
      alerts: { disabled: true, deliveryAttempted: false, candidateRowsExported: false },
      metrics: { alertCandidateCount: 0 },
      execution: { ok: true },
      collector: { status: 'useful', startedAt: new Date(Date.parse('2026-07-27T00:00:00.000Z') + index * 12 * 60 * 60_000).toISOString(), finishedAt: new Date(Date.parse('2026-07-27T00:05:00.000Z') + index * 12 * 60 * 60_000).toISOString() },
    },
    report: { state: 'MS', sourceResults: [], signals: [] },
  }]));
  assert.throws(
    () => validateMississippiShadowEvidenceArtifact(artifactBoundEvidence, { expectedCommitSha: commit, expectedConfigDigests: digests, verifiedGithubRuns: verifiedArtifactContents }),
    /source results must contain one result per registered Mississippi source/iu,
    'checked-in self-asserted rows cannot substitute for the downloaded artifact report',
  );
});

test('Mississippi is a hybrid research-only source with direct precision dispatch and no legacy collapse', async () => {
  const lifecycle = getStateLifecycle('MS');
  assert.equal(lifecycle.publicStatus, 'research_only');
  assert.equal(lifecycle.promotionStage, 'research_only');
  assert.equal(lifecycle.shadowEligible, true);
  assert.equal(lifecycle.inventoryAlertable, false);
  assert.equal(lifecycle.watchAlertable, false);

  const stateSource = ALL_STATE_SOURCES.find((entry) => entry.id === 'MS');
  assert.equal(stateSource.strategy, 'hybrid_official_intelligence_private_retailer');
  assert.ok(stateSource.sources.some((source) => source.sourceLayer === 'directory'));
  assert.ok(stateSource.sources.some((source) => source.sourceLayer === 'official_intelligence'));
  assert.equal(stateSource.sources.filter((source) => source.sourceLayer === 'private_retailer_inventory').length, 6);
  assert.equal(stateSource.sources.filter((source) => source.sourceLayer === 'storefront_probe').length, 2);

  const precision = await readFile(new URL('../src/collectors/precision-probes.mjs', import.meta.url), 'utf8');
  assert.match(precision, /if \(config\.id === 'MS'\) return collectMississippiRetailers/);
  const legacySet = precision.match(/const LEGACY_PRECISION_RUNTIME_STATES = new Set\(\[([\s\S]*?)\]\);/)?.[1] || '';
  assert.doesNotMatch(legacySet, /'MS'/);
  const operational = await readFile(new URL('../src/operational-report.mjs', import.meta.url), 'utf8');
  assert.match(operational, /silenceMississippiResearchCandidates\(georgiaGuardedCandidates\)/);
  assert.match(operational, /MISSISSIPPI_ACTIVATION_STATE[\s\S]*mississippi-retailer-activation\.json/);
  assert.match(operational, /sourceConfigDigest:\s*MISSISSIPPI_SOURCE_CONFIG_DIGEST/);
});
