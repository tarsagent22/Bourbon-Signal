import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  PHASE_ORDER,
  acquireWriterLock,
  appendPhaseResult,
  createTaskPacket,
  runBoundedTasks,
  summarizeTimings,
  taskPacketDigest,
  validateAcceptanceEvidence,
  validateTaskPacket,
  verifyPhaseTransition,
} from './lib/engine-expansion-speed.mjs';
import { calculateStateExpansionMetrics } from './lib/state-expansion-runtime.mjs';
import { isSouthCarolinaCityHiveInventory } from '../engine/src/south-carolina-retailer-policy.mjs';

function completePacket(state = 'GA') {
  const packet = createTaskPacket({ state, objective: 'Expand exact-store inventory safely.' });
  packet.runId = '12345678-1234-4234-8234-123456789abc';
  packet.baseline = {
    capturedAt: new Date().toISOString(),
    productionCommit: 'a'.repeat(40),
    coverageStatus: 'Focused',
    knownStores: 10,
    liveStores: 8,
    alertGradeStores: 7,
    representedAreas: 5,
    freshExactStoreDrops: 12,
    roadblocks: ['One source blocked'],
  };
  packet.demand = { evidence: ['One statewide request'], priorityAreas: ['Atlanta'] };
  packet.sourceAtlas = [{ sourceId: 'retailer-a', url: 'https://retailer.example/api/inventory', authority: 'first_party', storeBinding: 'exact', inventoryEligibility: true, status: 'proven', nextRoute: 'Implement exact reviewed identity.' }];
  packet.trustContract = {
    exactStoreIdentity: 'Reviewed merchant ID and full address must match.',
    productIdentity: 'Stable product and variant IDs are required.',
    quantitySemantics: 'Binary orderability is not exact quantity.',
    freshness: 'Only successful recognized responses advance freshness.',
    staleFallback: 'Stale rows remain labeled and non-alertable.',
    schedulerPersistence: 'Attempts and successful refreshes remain distinct.',
    alertability: 'Fresh exact-store positive evidence is required.',
  };
  packet.customerPath = {
    lifecycle: 'Focused until measured promotion gates pass.',
    areas: ['Atlanta'],
    feedAndApi: 'Selected state returns freshest eligible rows.',
    preferencesAndAlerts: 'Area selection and matching remain exact.',
  };
  packet.acceptance = {
    minKnownStores: 12,
    minLiveStores: 10,
    minAlertGradeStores: 9,
    minRepresentedAreas: 6,
    minFreshExactStoreDrops: 15,
    maxAlertableStaleRows: 0,
  };
  packet.commands = {
    contractFreeze: 'node scripts/engine-expansion-speed.mjs verify --packet=packet.json',
    implementation: 'node scripts/implement-state-expansion.mjs',
    focusedTests: 'node --test engine/test/example.test.mjs',
    liveProbe: 'npm --prefix engine run run -- --states=GA',
    diffFreeze: 'git diff --check',
    fullValidation: 'npm --prefix engine run test:data-plane',
    review: 'codex exec --sandbox read-only review',
    ciDeployment: 'node scripts/verify-release-lane.mjs --phase=merge --pr=$(gh pr view --json number --jq .number) --expected-head=$(git rev-parse HEAD) --apply',
    productionRefresh: 'gh workflow run refresh-feed.yml --ref=main',
    productionVerification: 'node scripts/verify-production-live.mjs',
  };
  packet.discoveryCommands = {
    baseline: 'node scripts/capture-baseline.mjs',
    sourceAtlas: 'node engine/src/discovery/state-source-discovery.mjs',
    codeInventory: 'node scripts/code-inventory.mjs',
    browserDiscovery: 'npm --prefix engine run browser:discover -- --states=GA',
  };
  packet.rollback = { boundary: 'Revert the merge and retain the previous state partition.', owner: 'operator' };
  packet.repository = {
    repo: 'tarsagent22/Bourbon-Signal',
    baseCommit: 'a'.repeat(40),
    initializedHeadCommit: 'a'.repeat(40),
    branch: 'perf/test',
    worktreePath: 'C:/worktree',
  };
  packet.artifacts = { acceptanceEvidence: 'out/engine-expansion/GA-acceptance.json' };
  packet.release = { objective: 'Expand exact-store inventory safely.', releaseLaneGuard: 'scripts/verify-release-lane.mjs', productionTarget: 'bourbonsignal.com' };
  packet.contractFrozenAt = new Date().toISOString();
  return packet;
}

test('task packet fails closed until baseline, trust, customer, acceptance, commands, and rollback are concrete', () => {
  const packet = createTaskPacket({ state: 'ga', objective: 'Expand Georgia.' });
  const result = validateTaskPacket(packet);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /baseline|trustContract|customerPath|acceptance|commands|rollback/iu);
});

test('complete frozen task packet passes and normalizes the state', () => {
  const packet = completePacket('ga');
  const result = validateTaskPacket(packet);
  assert.equal(result.ok, true, result.errors.join('\n'));
  assert.equal(packet.state, 'GA');
  assert.deepEqual(PHASE_ORDER.slice(0, 4), ['baseline', 'source-atlas', 'code-inventory', 'browser-discovery']);
});

test('phase transitions require all discovery lanes and reject every repeated broad-gate attempt', () => {
  const packet = completePacket();
  const completed = ['baseline', 'source-atlas', 'code-inventory', 'browser-discovery', 'contract-freeze', 'implementation', 'focused-tests', 'live-probe', 'diff-freeze'];
  assert.throws(() => verifyPhaseTransition({ packet, phase: 'contract-freeze', completedPhases: ['baseline', 'source-atlas', 'code-inventory'] }), /browser-discovery/iu);
  assert.doesNotThrow(() => verifyPhaseTransition({ packet, phase: 'full-validation', completedPhases: completed }));
  assert.throws(() => verifyPhaseTransition({ packet, phase: 'review', completedPhases: completed }), /full-validation/iu);
  assert.throws(() => verifyPhaseTransition({ packet, phase: 'full-validation', completedPhases: completed, attemptedPhases: ['full-validation'] }), /already attempted/iu);
  assert.doesNotThrow(() => verifyPhaseTransition({ packet, phase: 'review', completedPhases: [...completed, 'full-validation'] }));
  assert.throws(() => verifyPhaseTransition({ packet, phase: 'ci-deployment', completedPhases: [...completed, 'full-validation'] }), /review/iu);
});

test('bounded task runner parallelizes independent lanes while honoring its concurrency ceiling', async () => {
  let active = 0;
  let peak = 0;
  const results = await runBoundedTasks(
    ['baseline', 'atlas', 'code', 'browser'].map((name) => ({
      name,
      run: async () => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 15));
        active -= 1;
        return name;
      },
    })),
    { concurrency: 3 },
  );
  assert.equal(peak, 3);
  assert.deepEqual(results.map((row) => row.value).sort(), ['atlas', 'baseline', 'browser', 'code']);
});

test('phase ledger is machine-readable and summarizes the measured critical path', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'engine-speed-'));
  const ledger = path.join(dir, 'timings.jsonl');
  await appendPhaseResult(ledger, { state: 'GA', phase: 'baseline', startedAt: '2026-07-30T00:00:00.000Z', endedAt: '2026-07-30T00:00:05.000Z', durationMs: 5000, outcome: 'passed' });
  await appendPhaseResult(ledger, { state: 'GA', phase: 'source-atlas', startedAt: '2026-07-30T00:00:00.000Z', endedAt: '2026-07-30T00:00:08.000Z', durationMs: 8000, outcome: 'passed' });
  const summary = summarizeTimings((await readFile(ledger, 'utf8')).trim().split('\n').map(JSON.parse));
  assert.equal(summary.phaseCount, 2);
  assert.equal(summary.totalPhaseWorkMs, 13000);
  assert.equal(summary.wallClockMs, 8000);
  assert.equal(summary.slowestPhase.phase, 'source-atlas');
});

test('frozen packet digest changes on mutation and acceptance floors are executable', () => {
  const packet = completePacket();
  const digest = taskPacketDigest(packet);
  packet.acceptance.minLiveStores += 1;
  assert.notEqual(taskPacketDigest(packet), digest);
  const evidence = {
    schemaVersion: 'bourbon-signal-engine-expansion-acceptance-v1',
    evidenceId: 'abcdef12-1234-4234-8234-123456789abc',
    state: 'GA',
    runId: packet.runId,
    packetDigest: digest,
    phase: 'live-probe',
    headCommit: packet.repository.initializedHeadCommit,
    diffDigest: 'd'.repeat(64),
    capturedAt: new Date().toISOString(),
    productionCommit: 'c'.repeat(40),
    knownStores: 12,
    liveStores: 10,
    alertGradeStores: 9,
    representedAreas: 6,
    freshExactStoreDrops: 15,
    alertableStaleRows: 0,
  };
  const binding = { requireProductionCommit: true, expectedPhase: 'live-probe', expectedHeadCommit: packet.repository.initializedHeadCommit, expectedDiffDigest: 'd'.repeat(64), expectedPacketDigest: digest };
  assert.equal(validateAcceptanceEvidence(packet, evidence, binding).ok, false, 'raised live floor must fail');
  packet.acceptance.minLiveStores = 10;
  assert.equal(validateAcceptanceEvidence(packet, evidence, binding).ok, true);
  evidence.alertableStaleRows = 1;
  assert.equal(validateAcceptanceEvidence(packet, evidence, binding).ok, false);
});

test('state metrics count safe on-site-only exact stores as live without upgrading them to alert-grade', () => {
  const observedAt = new Date().toISOString();
  const row = {
    state: 'MS',
    eventType: 'retailer_store_inventory_result',
    sourceLabel: 'Reviewed Mississippi retailer',
    sourceUrl: 'https://retailer.example/shop/product/bottle-1',
    canonicalBottleId: 'bb_test',
    storeId: 'ms-permit-000001',
    storeName: 'Reviewed Store',
    storeAddress: '1 Main St Jackson MS 39201',
    merchantId: 'merchant-1',
    productId: 'bottle-1',
    locationPrecision: 'store_level',
    sourceAvailabilityVerified: true,
    availabilityStatus: 'orderable',
    eligibleForOnSite: true,
    eligibleForDelivery: false,
    canAlertAsInventory: false,
    canAlertAsWatch: false,
    observedAt,
  };
  assert.deepEqual(calculateStateExpansionMetrics({
    stateCode: 'MS',
    stateReport: { signals: [row] },
    siteDrops: { drops: [row] },
    knownStoreFloor: 690,
    representedAreasFloor: 1,
    minimumObservedAtMs: Date.parse(observedAt),
  }), {
    knownStores: 690,
    liveStores: 1,
    alertGradeStores: 0,
    representedAreas: 1,
    freshExactStoreDrops: 1,
    alertableStaleRows: 0,
  });
});

test('state metrics accept proof-bearing binary retailer inventory without inventing quantity', () => {
  const observedAt = new Date().toISOString();
  const row = {
    state: 'SC',
    stateCode: 'SC',
    eventType: 'cityhive_store_inventory_result',
    sourceLabel: "Green's Beverage South Carolina CityHive store inventory",
    sourceUrl: 'https://greensbeverages.com/shop/product/bulleit-bourbon/product-1?option-id=option-1',
    sourceChain: 'greens-beverage',
    canonicalBottleId: 'bb_test',
    storeId: 'greens-beverage:61dc4ab6a1d5721307e9c20e',
    storeName: 'Reviewed Store',
    storeAddress: '1 Main St, Columbia, SC 29201',
    merchantId: '61dc4ab6a1d5721307e9c20e',
    productId: 'product-1',
    variantId: 'option-1',
    sourceProductProofId: 'product-1',
    locationPrecision: 'store_level',
    sourceAvailabilityVerified: true,
    availabilityStatus: 'binary_retailer_in_stock',
    quantity: 0,
    quantityIsExact: false,
    canAlertAsInventory: true,
    observedAt,
  };
  const metrics = calculateStateExpansionMetrics({
    stateCode: 'SC',
    stateReport: { signals: [row] },
    siteDrops: { drops: [row] },
    minimumObservedAtMs: Date.parse(observedAt),
    strictInventoryValidator: isSouthCarolinaCityHiveInventory,
  });
  assert.equal(metrics.liveStores, 1);
  assert.equal(metrics.alertGradeStores, 1);
  assert.equal(metrics.freshExactStoreDrops, 1);
  const forged = calculateStateExpansionMetrics({
    stateCode: 'SC',
    stateReport: { signals: [{ ...row, sourceUrl: 'https://evil.example/product' }] },
    siteDrops: { drops: [{ ...row, sourceUrl: 'https://evil.example/product' }] },
    minimumObservedAtMs: Date.parse(observedAt),
    strictInventoryValidator: isSouthCarolinaCityHiveInventory,
  });
  assert.equal(forged.liveStores, 0);
  assert.equal(forged.alertGradeStores, 0);
  assert.equal(forged.freshExactStoreDrops, 0);
});

test('writer lock is exclusive and released explicitly', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'engine-speed-lock-'));
  const lockFile = path.join(dir, 'writer.lock');
  const release = await acquireWriterLock(lockFile, { state: 'GA', phase: 'implementation' });
  await assert.rejects(() => acquireWriterLock(lockFile, { state: 'GA', phase: 'implementation' }), /writer lock/iu);
  await release();
  const releaseAgain = await acquireWriterLock(lockFile, { state: 'GA', phase: 'implementation' });
  await releaseAgain();
});
