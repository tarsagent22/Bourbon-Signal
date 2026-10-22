import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { BourbonBible } from '../src/core/bible.mjs';
import { buildPennsylvaniaPickupSignals } from '../src/collectors/precision-probes.mjs';
import { canonicalizeSignal, candidateFromChange } from '../src/operational-report.mjs';
import { bibleLookup, buildDrops, buildAlerts, buildCurrentInventoryAlertsFromDrops, applyAlertPolicyToCandidate, capAlertCandidatesByState } from '../src/export-site-contract.mjs';
import { diagnosePennsylvaniaExpansionArtifact, verifyPennsylvaniaExpansionArtifact } from '../src/verify-pa-expansion.mjs';
import { pennsylvaniaConfiguredSourceSkip, pennsylvaniaDirectFwgsRoadblock } from '../src/collectors/pennsylvania-direct-source-policy.mjs';

const fixture = JSON.parse(await readFile(new URL('./fixtures/pennsylvania-fwgs/2026-10-22-reviewed-pickup.json', import.meta.url), 'utf8'));
const depthFixture = JSON.parse(await readFile(new URL('./fixtures/pennsylvania-fwgs/2026-10-22-reviewed-pickup-depth.json', import.meta.url), 'utf8'));
const bible = await BourbonBible.load(new URL('../out/bourbon-bible.json', import.meta.url));
const lookup = bibleLookup(bible.records);
const now = Date.parse(fixture.stateRuntime.finishedAt) + 5 * 60_000;
const publicSkus = ['000006917', '000031835', '000049054', '100022752'];
const standardSkus = ['000082899', '000098329'];
const expectations = { minimumReviewedPublicRows: 4, minimumReviewedPublicStores: 1 };
const sku = (row) => row.sourceProductBinding?.sku || row.sourceProductProofSku || row.raw?.product?.sku;

function capturedPipeline(t, mutateArtifact = () => {}, capture = fixture) {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse(fixture.stateRuntime.startedAt) });
  const browserArtifact = structuredClone(capture);
  mutateArtifact(browserArtifact);
  const collected = buildPennsylvaniaPickupSignals({ id: 'PA' }, bible, browserArtifact);
  t.mock.timers.setTime(now);
  const source = JSON.parse(JSON.stringify(collected.signals));
  const operational = JSON.parse(JSON.stringify(source.map((signal) => canonicalizeSignal(signal, bible))));
  const drops = buildDrops(operational, lookup, operational);
  const reported = buildAlerts({ candidates: operational.map((signal) => candidateFromChange({ type: 'new_signal', key: signal.key, before: null, after: signal }, false)) });
  const current = buildCurrentInventoryAlertsFromDrops(drops);
  const uncapped = [...new Map([...reported, ...current].map(applyAlertPolicyToCandidate).map((candidate) => [candidate.dedupeKey || candidate.id, candidate])).values()].filter((candidate) => candidate.eligibleForDelivery);
  const alerts = capAlertCandidatesByState(uncapped, 1000, 200);
  return { input: JSON.parse(JSON.stringify({
    state: { state: 'PA', status: 'useful', stale: false, ...fixture.stateRuntime, signals: source, precisionMetadata: collected.metadata,
      sourceResults: pennsylvaniaDirectFwgsRoadblock().denialEvidence.map((route) => pennsylvaniaConfiguredSourceSkip({ id: 'PA' }, { kind: 'html', url: route.url, label: route.label }, route.sourceId, { nowAt: fixture.stateRuntime.finishedAt }).sourceResult) },
    drops: { runId: 'captured-pa-expansion', drops }, alerts: { runId: 'captured-pa-expansion', alerts }, browserArtifact, now, expectations,
  })), operational, collected, reported, current, uncapped };
}

function rejected(input, mutate, pattern) {
  const changed = structuredClone(input);
  mutate(changed);
  assert.throws(() => verifyPennsylvaniaExpansionArtifact(changed), pattern);
}

test('captured FWGS pickup adapter, canonical JSON and both real alert pipelines preserve six matches and four public families', (t) => {
  const { input, operational, reported, current } = capturedPipeline(t);
  const result = verifyPennsylvaniaExpansionArtifact(input);
  assert.equal(result.sourceRows, 6);
  assert.equal(result.publicRows, 4);
  assert.equal(reported.length, 4);
  assert.equal(current.length, 4);
  assert.equal(result.alerts, 8, 'reported changes and current-inventory candidates have distinct exporter keys');
  assert.deepEqual(result.publicEligibleSkus.sort(), [...publicSkus].sort());
  assert.deepEqual(result.matchedStandardSkus.sort(), [...standardSkus].sort());
  assert.ok(Date.parse(input.browserArtifact.generatedAt) < Date.parse(input.state.startedAt), 'the original browser observation correctly precedes collection');
  assert.ok(operational.filter((row) => row.eventType === 'store_inventory_result').every((row) => row.canonicalBottleId && row.sourceProductBinding && row.observedAt === fixture.generatedAt));
  assert.ok(input.drops.drops.every((row) => row.observedAt === fixture.generatedAt && row.quantity > 0 && !/LICENSEE SERVICE CENTER/i.test(row.storeName)));
  assert.ok(!input.drops.drops.some((row) => standardSkus.includes(sku(row))));
  assert.ok(!input.alerts.alerts.some((row) => standardSkus.includes(sku(row))));
  assert.ok(reported.every((row) => row.sourceProductBinding == null && row.sourceProductProofSku), 'reported candidates bind through source SKU and exact public proof');
  assert.ok(current.every((row) => row.sourceProductBinding));
  const strict = diagnosePennsylvaniaExpansionArtifact({ ...input, expectations: undefined });
  assert.equal(strict.status, 'failed');
  assert.match(strict.errors.join('\n'), /800-row|250-store/);
});

test('wrong SKU, title, route or pickup premises cannot become reviewed public rows through downstream Bible rematching', (t) => {
  const { input } = capturedPipeline(t);
  for (const mutate of [
    (row) => { row.raw.product.sku = '999999999'; },
    (row) => { row.raw.product.name += ' Cask Strength'; },
    (row) => { row.raw.product.route += '?variant=unreviewed'; },
    (row) => { row.sourceProductBinding.sourceHost = 'unrelated.example'; },
    (row) => { row.raw.fwgsBottleMatch.canonicalBottleId = 'different-bottle'; },
    (row) => { row.raw.store.pickUp = false; },
    (row) => { row.raw.store.stateAddress = 'OH'; },
    (row) => { row.storeId = 'different-store'; },
  ]) rejected(input, (changed) => mutate(changed.state.signals.find((row) => row.eventType === 'store_inventory_result')), /mismatched|premises/);
  for (const key of ['sku', 'name', 'route']) {
    const artifact = structuredClone(fixture);
    const product = artifact.inventoryRows[0].product;
    product[key] = key === 'sku' ? '999999999' : `${product[key]} unreviewed`;
    const result = buildPennsylvaniaPickupSignals({ id: 'PA' }, bible, artifact);
    const canonical = JSON.parse(JSON.stringify(result.signals.map((row) => canonicalizeSignal(row, bible))));
    const published = buildDrops(canonical, lookup, canonical);
    assert.ok(!published.some((row) => row.sourceProductBinding?.sku === '000006917'));
    assert.ok(!published.some((row) => row.rawName?.includes('Booker')));
  }
});

test('store pickup quantity is independent of global product stock and rejects zero, aggregate or service-center alerts', (t) => {
  const { input } = capturedPipeline(t);
  assert.ok(input.state.signals.some((row) => row.eventType === 'store_inventory_result' && row.raw.product.inventory.stockStatus === 'OUT_OF_STOCK' && row.quantity > 0));
  assert.equal(verifyPennsylvaniaExpansionArtifact(input).status, 'ok', 'positive exact-store pickup quantity is authoritative for that store');
  rejected(input, (row) => { row.state.signals[0].raw.quantity = 0; }, /pickup quantity/);
  rejected(input, (row) => { row.state.precisionMetadata.directSearchAttempts = 1; }, /zero attempts/);
  rejected(input, (row) => { row.state.precisionMetadata.directSearchPolicy = 'retry_denied'; }, /zero attempts/);
  rejected(input, (row) => { row.state.sourceResults[0].attemptCount = 1; }, /remain disabled with zero attempts/);
  rejected(input, (row) => { row.state.sourceResults[0].checkedAt = row.state.finishedAt; }, /original checkedAt/);
  rejected(input, (row) => { row.state.signals[0].quantity = 0; }, /pickup quantity/);
  rejected(input, (row) => { row.drops.drops[0].type = 'store_inventory_aggregate'; row.drops.drops[0].locationPrecision = 'store_aggregate'; }, /positive source/);
  rejected(input, (row) => { row.alerts.alerts[0].eventType = 'store_inventory_aggregate'; }, /aggregate/);
  rejected(input, (row) => { row.alerts.alerts[0].storeName = 'LICENSEE SERVICE CENTER 9999'; }, /Licensee Service Center/);
  rejected(input, (row) => { row.state.signals.find((signal) => signal.eventType === 'licensee_service_center_inventory_observation').canAlertAsInventory = true; }, /Licensee Service Center/);
});

test('source freshness cannot be renewed by publication, fetched time or a false-fresh display timestamp', (t) => {
  const { input } = capturedPipeline(t);
  rejected(input, (row) => { row.now += 3 * 60 * 60_000; }, /two hours|stale/);
  rejected(input, (row) => { row.state.signals[0].observedAt = row.state.finishedAt; }, /false-fresh source observation/);
  rejected(input, (row) => { row.state.signals[0].raw.generatedAt = 'invalid'; }, /false-fresh source observation/);
  rejected(input, (row) => { row.drops.drops[0].observedAt = row.state.finishedAt; }, /observation proof/);
  rejected(input, (row) => { const drop = row.drops.drops[0]; drop.firstSeenAt = '2026-10-21T00:00:00.000Z'; drop.displayAt = drop.lastConfirmedAt; drop.timestampBasis = 'last_confirmed_at'; }, /falsely renews/);
  rejected(input, (row) => { row.browserArtifact.generatedAt = row.state.finishedAt; }, /false-fresh source observation/);
});

test('candidate-key uniqueness allows both alert paths but rejects copied or unbound public evidence', (t) => {
  const { input } = capturedPipeline(t);
  rejected(input, (row) => { row.alerts.alerts.push(structuredClone(row.alerts.alerts[0])); }, /candidate keys must be unique/);
  rejected(input, (row) => { delete row.alerts.alerts[0].id; delete row.alerts.alerts[0].dedupeKey; }, /candidate keys must be unique/);
  rejected(input, (row) => { row.alerts.alerts[0].quantity += 1; }, /accepted public source binding/);
  rejected(input, (row) => { row.alerts.alerts = []; }, /survive publication caps/);
  const reportedOnly = structuredClone(input);
  reportedOnly.alerts.alerts = reportedOnly.alerts.alerts.filter((candidate) => candidate.changeType !== 'current_inventory_signal');
  assert.equal(verifyPennsylvaniaExpansionArtifact(reportedOnly).publishedReviewedAlerts, 4, 'publication caps may retain reported candidates while every public identity remains eligible in the current builder');
  rejected(input, (row) => { row.drops.drops.push(structuredClone(row.drops.drops[0])); }, /Duplicate reviewed PA public/);
  rejected(input, (row) => { row.drops.drops[0].sourceProductBinding.sourceRoute += '-forged'; }, /observation proof/);
  rejected(input, (row) => { row.alerts.runId = 'different-run'; }, /different export runs/);
});

test('the actual exporter cap keeps bounded candidates while 912 captured public rows remain fully eligible before capping', (t) => {
  const capture = { generatedAt: depthFixture.generatedAt, inventoryEndpoint: depthFixture.inventoryEndpoint,
    inventoryRows: depthFixture.rows.map(([productSku, storeId, quantity]) => ({ product: depthFixture.products[productSku], location: depthFixture.locations[storeId], quantity })) };
  const { input, current, uncapped } = capturedPipeline(t, () => {}, capture);
  delete input.expectations;
  const result = verifyPennsylvaniaExpansionArtifact(input);
  assert.equal(result.sourceRows, 1362);
  assert.equal(result.publicRows, 912);
  assert.equal(result.publicStores, 387);
  assert.equal(current.length, 912);
  assert.equal(result.eligibleCurrentReviewedAlerts, 912);
  assert.ok(uncapped.length > 1000);
  assert.equal(result.alerts, 1000);
  assert.equal(result.publishedReviewedAlerts, 1000);
  assert.ok(input.alerts.alerts.filter((row) => row.changeType === 'current_inventory_signal').length < 912);
});

test('CLI writes diagnostics before a strict artifact verification failure', async (t) => {
  const { input } = capturedPipeline(t);
  const temporaryOut = await mkdtemp(path.join(os.tmpdir(), 'pa-expansion-verifier-'));
  assert.ok(path.resolve(temporaryOut).startsWith(`${path.resolve(os.tmpdir())}${path.sep}`));
  t.after(() => rm(temporaryOut, { recursive: true, force: true }));
  await Promise.all(['states', 'site', 'browser'].map((dir) => mkdir(path.join(temporaryOut, dir))));
  await Promise.all([['states/PA.json', input.state], ['site/drops.json', input.drops], ['site/alerts.json', input.alerts], ['browser/fwgs-store-inventory.json', input.browserArtifact]]
    .map(([file, payload]) => writeFile(path.join(temporaryOut, file), JSON.stringify(payload))));
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../src/verify-pa-expansion.mjs', import.meta.url))], { encoding: 'utf8', env: { ...process.env, BOURBON_SIGNAL_OUT_DIR: temporaryOut } });
  assert.equal(result.status, 1);
  const diagnostics = JSON.parse(await readFile(path.join(temporaryOut, 'pa-expansion-verification.json'), 'utf8'));
  assert.equal(diagnostics.status, 'failed');
  assert.equal(diagnostics.publicRows, 4);
  assert.equal(diagnostics.alertCandidateIdentities.length, 8);
  assert.match(diagnostics.errors.join('\n'), /800-row|250-store/);
});
