import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { beforeEach } from 'node:test';
import { BourbonBible } from '../src/core/bible.mjs';
import { buildIndianaPaylessAvailabilityProof, normalizeIndianaCityHiveQuantity } from '../src/collectors/indiana-retailer-matching.mjs';
import { INDIANA_CAPTURED_SOURCE_DENIALS, indianaDeniedSourceSkip } from '../src/collectors/indiana-source-denial-policy.mjs';
import { candidateFromChange, canonicalizeSignal } from '../src/operational-report.mjs';
import { bibleLookup, buildAlerts, buildCurrentInventoryAlertsFromDrops, buildDrops } from '../src/export-site-contract.mjs';
import { diagnoseIndianaImprovementsArtifact, verifyIndianaImprovementsArtifact } from '../src/verify-in-improvements.mjs';

const captured = JSON.parse(await readFile(new URL('./fixtures/indiana-retailer/2026-10-22-identity-regressions.json', import.meta.url), 'utf8'));
const bible = await BourbonBible.load(new URL('../out/bourbon-bible.json', import.meta.url));
beforeEach((t) => t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-10-22T20:00:00.000Z') }));

function input() {
  const payless = structuredClone(captured.signals.find((row) => row.rawName === 'Maker’s Mark Private Selections'));
  Object.assign(payless, buildIndianaPaylessAvailabilityProof({ rawName: payless.rawName, observedAt: payless.observedAt,
    sourceUrl: payless.sourceUrl, storeAddress: payless.storeAddress,
    pickupText: `${payless.rawName}. Available at our East Street location. Stop by and pick your bottle up today!` }));
  payless.raw.productBinding = payless.sourceProductBinding;
  const sentinel = structuredClone(captured.signals.find((row) => row.rawName === 'Buffalo Trace Bourbon'));
  Object.assign(sentinel, normalizeIndianaCityHiveQuantity(100), { availabilityStatus: 'binary_retailer_in_stock' });
  Object.assign(sentinel.raw, { reportedQuantity: 100, binaryAvailability: true });
  if (sentinel.raw.option) sentinel.raw.option.quantity = 100;
  const signals = [payless, sentinel];
  const skips = Object.keys(INDIANA_CAPTURED_SOURCE_DENIALS).map((key) => indianaDeniedSourceSkip(key));
  const canonical = signals.map((row) => canonicalizeSignal(row, bible));
  const drops = buildDrops(canonical, bibleLookup(bible.records), canonical);
  const reported = buildAlerts({ candidates: canonical.map((row) => candidateFromChange({ type: 'new_signal', key: row.key, after: row }, false)) });
  const current = buildCurrentInventoryAlertsFromDrops(drops);
  return {
    state: { state: 'IN', status: 'useful', signals, roadblocks: skips.flatMap((skip) => skip.roadblocks),
      precisionMetadata: { indianaSourcePolicy: { policyId: 'in-captured-direct-403-routes-disabled-20261022',
        disabledRouteAttempts: 0, skippedSourceKeys: skips.map((skip) => skip.metadata.sourceKey),
        decisions: skips.map((skip) => ({ sourceKey: skip.metadata.sourceKey, attemptCount: 0, denialEvidence: skip.metadata.denialEvidence })) } } },
    drops: { runId: 'indiana-fixture', drops },
    alerts: { runId: 'indiana-fixture', candidates: current, alerts: reported },
  };
}

test('actual captured source to exporter to reported alerts preserves both binary availability contracts', () => {
  const fixture = input();
  assert.equal(fixture.drops.drops.length, 2);
  assert.equal(fixture.alerts.alerts.length, 2);
  assert.equal(fixture.alerts.candidates.length, 2);
  const result = verifyIndianaImprovementsArtifact(JSON.parse(JSON.stringify(fixture)));
  assert.equal(result.status, 'ok');
  assert.equal(result.disabledRouteCount, 4);
  assert.equal(result.metadata.newPublicGainClaimed, 0);
  assert.equal(result.metadata.measuredProductionGain, null);
  assert.equal(result.metadata.canaryQueriesEnabled, false);
});

test('both known source identity errors fail in public drops and reported alerts, including conflicting display aliases', () => {
  for (const source of [captured.signals[0], captured.signals[2]]) {
    for (const surface of ['drops', 'alerts']) {
      const fixture = input();
      const row = { ...structuredClone(source), canAlertAsInventory: false, canAlertAsWatch: false };
      if (surface === 'drops') fixture.drops.drops.push(row);
      else { fixture.alerts.candidates = []; fixture.alerts.alerts.push(row); }
      assert.ok(diagnoseIndianaImprovementsArtifact(fixture).errors.some((error) => error.includes('prohibited Indiana bottle identity')));
    }
  }
  const fixture = input();
  fixture.drops.drops.push({ ...captured.signals[0], canonicalName: 'Woodford Reserve Rye', bottleName: 'Woodford Reserve Bourbon' });
  assert.equal(diagnoseIndianaImprovementsArtifact(fixture).status, 'failed');
  const cloaked = input();
  cloaked.state.signals.push({ ...captured.signals[2], canAlertAsInventory: false, canAlertAsWatch: false });
  cloaked.drops.drops.push({ ...captured.signals[2], rawName: "Wild Turkey Master's Keep", canAlertAsInventory: false, canAlertAsWatch: false });
  assert.equal(diagnoseIndianaImprovementsArtifact(cloaked).status, 'failed', 'a published label cannot override its actual state source title');
});

test('Payless cannot publish invented quantity, missing proof, changed premises or a falsely renewed source clock', () => {
  for (const mutate of [
    (row) => { row.quantity = 1; },
    (row) => { row.quantityIsExact = true; },
    (row) => { row.sourceProductBinding = null; },
    (row) => { row.storeAddress = 'Other premises'; },
    (row) => { row.observedAt = '2026-10-22T19:59:00.000Z'; row.sourceProductBinding.observedAt = row.observedAt; },
  ]) {
    const fixture = input();
    const row = fixture.drops.drops.find((entry) => entry.storeId === 'payless-liquors:east-street');
    mutate(row);
    assert.equal(diagnoseIndianaImprovementsArtifact(fixture).status, 'failed');
  }
});

test('sentinel values cannot become exact quantities in alertable state, public rows or actual reported alerts', () => {
  for (const surface of ['state', 'drops', 'alerts']) for (const quantity of [1, 100]) {
    const fixture = input();
    const rows = surface === 'state' ? fixture.state.signals : surface === 'drops' ? fixture.drops.drops : fixture.alerts.alerts;
    rows.find((row) => row.sourceChain === 'wise-guys').quantity = quantity;
    assert.ok(diagnoseIndianaImprovementsArtifact(fixture).errors.some((error) => error.includes('sentinel')));
  }
  const fixture = input();
  const legacy = structuredClone(fixture.state.signals.find((row) => row.sourceChain === 'wise-guys'));
  Object.assign(legacy, { storeId: 'wise-guys:retained-legacy', quantity: 1, quantityIsExact: null,
    canAlertAsInventory: false, canAlertAsWatch: false, stale: true });
  fixture.state.signals.push(legacy);
  assert.equal(diagnoseIndianaImprovementsArtifact(fixture).status, 'ok', 'nonalertable retained diagnostics do not regain inventory authority');
  const erased = input();
  const row = erased.drops.drops.find((entry) => entry.sourceChain === 'wise-guys');
  Object.assign(row, { reportedQuantity: null, binaryAvailability: false, quantitySemantics: null, quantity: 1 });
  assert.equal(diagnoseIndianaImprovementsArtifact(erased).status, 'failed', 'erasing public sentinel metadata cannot hide the actual source sentinel');
});

test('all four denied routes need zero attempts, complete policy metadata and their original bounded denial clock', () => {
  for (const mutate of [
    (fixture) => { fixture.state.roadblocks.pop(); },
    (fixture) => { fixture.state.roadblocks[0].attemptCount = 1; },
    (fixture) => { fixture.state.roadblocks[0].evidenceRuntimeFinishedAt = new Date().toISOString(); },
    (fixture) => { fixture.state.roadblocks[0].denialEvidence.individualRequestFinishedAt = new Date().toISOString(); },
    (fixture) => { fixture.state.precisionMetadata.indianaSourcePolicy.decisions[0].denialEvidence.aggregatePrecisionCheckedAt = new Date().toISOString(); },
    (fixture) => { fixture.state.precisionMetadata.indianaSourcePolicy.disabledRouteAttempts = 1; },
  ]) {
    const fixture = input(); mutate(fixture);
    assert.equal(diagnoseIndianaImprovementsArtifact(fixture).status, 'failed');
  }
});

test('the CLI saves its failed source-bound diagnosis and the unchanged full legacy gate failure', async () => {
  const fixture = input();
  fixture.drops.drops.find((row) => row.storeId === 'payless-liquors:east-street').quantity = 1;
  const directory = await mkdtemp(path.join(tmpdir(), 'in-improvements-verifier-'));
  const out = path.join(directory, 'out');
  try {
    for (const [name, payload] of [['states/IN.json', fixture.state], ['site/drops.json', fixture.drops], ['site/alerts.json', fixture.alerts]]) {
      await mkdir(path.dirname(path.join(out, name)), { recursive: true });
      await writeFile(path.join(out, name), JSON.stringify(payload));
    }
    const child = spawnSync(process.execPath, [fileURLToPath(new URL('../src/verify-in-improvements.mjs', import.meta.url))], {
      cwd: directory, encoding: 'utf8', timeout: 15_000, env: { ...process.env, BOURBON_SIGNAL_OUT_DIR: out },
    });
    assert.equal(child.status, 1, child.stderr);
    const report = JSON.parse(await readFile(path.join(out, 'verification/in-improvements.json'), 'utf8'));
    assert.equal(report.status, 'failed');
    assert.ok(report.errors.some((error) => error.includes('Payless')));
    assert.ok(report.errors.some((error) => error.includes('legacy Indiana verifier')));
    assert.equal(report.legacyVerification.status, 'failed');
    assert.equal(report.metadata.newPublicGainClaimed, 0);
    const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
    assert.equal(pkg.scripts['verify:in'], 'node src/verify-in.mjs');
    assert.equal(pkg.scripts['verify:in:improvements'], 'node src/verify-in-improvements.mjs');
  } finally {
    assert.equal(path.dirname(directory), path.resolve(tmpdir()));
    assert.ok(path.basename(directory).startsWith('in-improvements-verifier-'));
    await rm(directory, { recursive: true, force: true });
  }
});
