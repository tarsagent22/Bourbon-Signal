import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { CUSTOMER_ACTIVE_STATE_IDS, STATE_SOURCES } from '../src/state-sources.mjs';
import { compareStateQuality, buildStateQualityScorecard } from '../src/state-quality-scorecard.mjs';
import { LOCATION_PROFILES } from '../src/location-precision.mjs';

test('Texas is a customer-active state collected and exported with every active-state run', () => {
  assert.equal(CUSTOMER_ACTIVE_STATE_IDS.has('TX'), true);
  assert.equal(STATE_SOURCES.some((state) => state.id === 'TX'), true);
  assert.equal(LOCATION_PROFILES.TX.target, 'store_level');
});

test('a labeled preserved fallback does not block fresh states from publishing', () => {
  const previous = { states: [{ state: 'VA', score: 90, releaseEligible: true, input: { dropCount: 100, status: 'useful' } }] };
  const current = { states: [{ state: 'VA', score: 88, releaseEligible: true, input: { dropCount: 100, status: 'stale_useful_quality_fallback' } }] };
  const result = compareStateQuality(previous, current);
  assert.equal(result.ok, true);
  assert.match(result.warnings.join(' '), /preserved fallback/i);
});

test('state quality v2 uses a current-snapshot baseline', () => {
  assert.equal(buildStateQualityScorecard([]).schemaVersion, 2);
});

test('scheduled refresh persists collector history, the actual scheduler state, and runs twice hourly', async () => {
  const workflow = await readFile(new URL('../../.github/workflows/refresh-feed.yml', import.meta.url), 'utf8');
  const cacheStep = workflow.match(/- name: Restore collector artifacts and adaptive scheduler state[\s\S]*?(?=\n      - name:)/)?.[0] || '';
  const browserRestoreStep = workflow.match(/- name: Restore browser source artifacts[\s\S]*?(?=\n      - name:)/)?.[0] || '';
  const stableSaveStep = workflow.match(/- name: Save verified collector state[\s\S]*?(?=\n      - name:)/)?.[0] || '';
  const browserSaveStep = workflow.match(/- name: Save browser source artifacts[\s\S]*?(?=\n      - name:)/)?.[0] || '';
  const hydrationStep = workflow.match(/- name: Hydrate complete state reports for recovery[\s\S]*?(?=\n      - name:)/)?.[0] || '';
  const diagnosticsStep = workflow.match(/- name: Preserve refresh diagnostics[\s\S]*$/)?.[0] || '';
  assert.match(workflow, /cron:\s*["']7,37 \* \* \* \*['"]/);
  assert.match(workflow, /permissions:[\s\S]*?actions:\s*read/);
  assert.match(hydrationStep, /GH_TOKEN:[\s\S]*?hydrate-state-reports\.mjs/);
  assert.doesNotMatch(hydrationStep, /if:/, 'state report hydration must also protect scheduled runs from a cold or version-missed cache');
  assert.ok(workflow.indexOf('Hydrate complete state reports for recovery') < workflow.indexOf('Refresh all due customer-active states'), 'every refresh must hydrate a complete baseline before collection');
  const scheduledGeorgiaStep = workflow.match(/- name: Verify Georgia scheduled lane or isolate an explicit last-known fallback[\s\S]*?(?=\n      - name:)/)?.[0] || '';
  const targetedGeorgiaStep = workflow.match(/- name: Verify Georgia targeted private-retailer recovery[\s\S]*?(?=\n      - name:)/)?.[0] || '';
  assert.match(scheduledGeorgiaStep, /if:\s*\$\{\{ !inputs\.states \}\}[\s\S]*--allow-labeled-last-known-fallback/);
  assert.match(targetedGeorgiaStep, /inputs\.states && contains\(inputs\.states, 'GA'\)[\s\S]*run: npm run verify:ga/);
  assert.doesNotMatch(targetedGeorgiaStep, /allow-labeled-last-known-fallback/, 'GA-targeted recovery must remain fresh-only');
  const scheduledVirginiaStep = workflow.match(/- name: Verify Virginia scheduled lane or isolate a safe stale fallback[\s\S]*?(?=\n      - name:)/)?.[0] || '';
  const targetedVirginiaStep = workflow.match(/- name: Verify Virginia targeted statewide live inventory recovery[\s\S]*?(?=\n      - name:)/)?.[0] || '';
  assert.match(scheduledVirginiaStep, /if:\s*\$\{\{ !inputs\.states \}\}[\s\S]*--allow-safe-stale-fallback/);
  assert.match(targetedVirginiaStep, /inputs\.states && contains\(inputs\.states, 'VA'\)[\s\S]*run: npm run verify:va/);
  assert.doesNotMatch(targetedVirginiaStep, /allow-safe-stale-fallback/, 'VA-targeted recovery must remain strict');
  const scheduledPennsylvaniaStep = workflow.match(/- name: Verify Pennsylvania scheduled lane or isolate a safe stale fallback[\s\S]*?(?=\n      - name:)/)?.[0] || '';
  const targetedPennsylvaniaStep = workflow.match(/- name: Verify Pennsylvania targeted exact-store recovery[\s\S]*?(?=\n      - name:)/)?.[0] || '';
  assert.match(scheduledPennsylvaniaStep, /if:\s*\$\{\{ !inputs\.states \}\}[\s\S]*--allow-safe-stale-fallback/);
  assert.match(targetedPennsylvaniaStep, /inputs\.states && contains\(inputs\.states, 'PA'\)[\s\S]*run: npm run verify:pa/);
  assert.doesNotMatch(targetedPennsylvaniaStep, /allow-safe-stale-fallback/, 'PA-targeted recovery must remain strict');
  const ncQualityStep = workflow.match(/- name: Verify North Carolina current-plus-stale signal continuity[\s\S]*?(?=\n      - name:)/)?.[0] || '';
  assert.match(ncQualityStep, /if:\s*\$\{\{ !inputs\.states \|\| contains\(inputs\.states, 'NC'\) \}\}[\s\S]*run: npm run verify:nc/);
  const scheduledDemandMetroStep = workflow.match(/- name: Verify demand metro generated evidence with fresh retained fallback[\s\S]*?(?=\n      - name:)/)?.[0] || '';
  const scheduledTennesseeStep = workflow.match(/- name: Verify Tennessee generated contract with fresh retained fallback[\s\S]*?(?=\n      - name:)/)?.[0] || '';
  assert.match(scheduledDemandMetroStep, /if:\s*\$\{\{ !inputs\.states \}\}/, 'unrelated targeted refreshes must not be blocked by the scheduled demand-metro fallback gate');
  assert.match(scheduledTennesseeStep, /if:\s*\$\{\{ !inputs\.states \}\}/, 'unrelated targeted refreshes must not be blocked by the scheduled Tennessee fallback gate');
  const scheduledCaliforniaStep = workflow.match(/- name: Verify California scheduled lane or isolate a safe retained partition[\s\S]*?(?=\n      - name:)/)?.[0] || '';
  const targetedCaliforniaStep = workflow.match(/- name: Verify California targeted exact-store recovery[\s\S]*?(?=\n      - name:)/)?.[0] || '';
  assert.match(scheduledCaliforniaStep, /if:\s*\$\{\{ !inputs\.states \}\}[\s\S]*--allow-safe-retained-not-due/);
  assert.match(targetedCaliforniaStep, /inputs\.states && contains\(inputs\.states, 'CA'\)[\s\S]*run: npm run verify:ca/);
  assert.doesNotMatch(targetedCaliforniaStep, /allow-safe-retained-not-due/, 'CA-targeted recovery must remain strict');
  const productionVerificationStep = workflow.match(/- name: Verify production observes the refreshed engine or roll back[\s\S]*?(?=\n      - name:)/)?.[0] || '';
  assert.match(productionVerificationStep, /BOURBON_SIGNAL_VERIFY_STATES:\s*\$\{\{ inputs\.states \|\| '' \}\}/);
  assert.match(productionVerificationStep, /verify:production-engine[\s\S]*?--rollback/);
  assert.match(cacheStep, /engine\/out\/optimization\/state-run-metrics\.json/);
  assert.match(cacheStep, /engine\/out\/optimization\/source-run-history\.json/);
  assert.match(cacheStep, /engine\/out\/browser/);
  assert.match(cacheStep, /inventory-collector-state-/, 'stable restore must keep the legacy combined path/version for one-step migration');
  assert.match(browserRestoreStep, /engine\/out\/browser/);
  assert.match(browserRestoreStep, /inventory-browser-state-/);
  assert.match(browserRestoreStep, /github\.run_attempt/, 'browser cache must be replaceable across workflow re-runs');
  assert.match(stableSaveStep, /if:\s*success\(\)/);
  assert.match(stableSaveStep, /engine\/out\/browser/);
  assert.match(browserSaveStep, /if:\s*always\(\)/);
  assert.match(browserSaveStep, /engine\/out\/browser/);
  assert.match(browserSaveStep, /github\.run_attempt/);
  assert.match(diagnosticsStep, /engine\/out\/optimization\/source-run-history\.json/);
  assert.match(diagnosticsStep, /engine\/out\/source-slo-7d\.json/);
  assert.match(diagnosticsStep, /engine\/out\/source-slo-7d\.md/);
  assert.match(diagnosticsStep, /engine\/out\/source-usefulness-roi\.json/);
  assert.match(diagnosticsStep, /engine\/out\/source-usefulness-roi\.md/);
  const workflowTimeoutMinutes = Number(workflow.match(/timeout-minutes:\s*(\d+)/)?.[1] || 0);
  assert.ok(workflowTimeoutMinutes >= 80, `refresh workflow timeout ${workflowTimeoutMinutes}m must cover 30m FWGS + 22m state run + installs, verification, publication, and rollback checks`);
  assert.doesNotMatch(workflow, /Refresh and gate the Texas candidate/);
  assert.match(workflow, /verify:production-engine[\s\S]*?--rollback/);
  assert.match(workflow, /engine\/out\/snapshots/);
  for (const stepName of [
    'Refresh all due customer-active states',
    'Verify coherent site contract',
    'Verify no unproven state promotion entered the customer path',
    'Publish and atomically activate encrypted snapshot',
    'Verify production observes the refreshed engine or roll back',
  ]) {
    const step = workflow.match(new RegExp(`- name: ${stepName}[\\s\\S]*?(?=\\n      - name:)`))?.[0] || '';
    assert.ok(step, `missing unconditional nationwide gate: ${stepName}`);
    assert.doesNotMatch(step, /\n        if:/, `${stepName} must remain unconditional`);
  }
  const exporter = await readFile(new URL('../src/export-site-contract.mjs', import.meta.url), 'utf8');
  assert.match(exporter, /buildStateQualityInputs\(\{ stateCoverage, drops: currentDrops,/);
  assert.match(exporter, /comparisonFallbackStateIds[\s\S]*partialFallbackStateIds/);
  assert.match(exporter, /partial_fallback_current_plus_stale/);
  assert.match(exporter, /currentInput:\s*current\?\.input/);
  assert.match(exporter, /const comparableStateQuality = partialFallbackStateIds\.length[\s\S]*states:[\s\S]*filter/);
  const runner = await readFile(new URL('../src/run.mjs', import.meta.url), 'utf8');
  assert.match(runner, /degraded_previous_report_retry/);
  assert.match(runner, /previousReport\.stale === true/);
  const refreshRunner = await readFile(new URL('../src/refresh-site.mjs', import.meta.url), 'utf8');
  assert.ok(
    refreshRunner.indexOf("runNode('src/export-site-contract.mjs')") < refreshRunner.indexOf("runNode('src/source-usefulness-report.mjs')"),
    'source usefulness must inspect the final customer-visible export',
  );
  assert.match(refreshRunner, /try\s*\{[\s\S]*runNode\('src\/source-usefulness-report\.mjs'\)[\s\S]*catch[\s\S]*warnings\.push/, 'source usefulness diagnostics must remain non-gating');
  const fallback = await readFile(new URL('../src/state-report-fallback.mjs', import.meta.url), 'utf8');
  assert.match(fallback, /lastGoodAt:\s*report\.lastGoodAt\s*\|\|\s*report\.finishedAt/);
  assert.match(fallback, /canAlertAsInventory:\s*false/);
  assert.match(fallback, /canAlertAsWatch:\s*false/);
  const verifier = await readFile(new URL('../src/verify-site-contract.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(verifier, /should not include TX|contains TX customer-facing|contains TX in states array/);
  const blobReader = await readFile(new URL('../../src/lib/vercel-blob-snapshot-storage.ts', import.meta.url), 'utf8');
  assert.match(blobReader, /_engine_pointer/);
  assert.match(blobReader, /cache:\s*["']no-store["']/);
  const siteContract = await readFile(new URL('../../src/lib/site-engine-contract.ts', import.meta.url), 'utf8');
  assert.match(siteContract, /const readActivePointer = unstable_cache\([\s\S]*?blobStorage\.readPointer\(\)[\s\S]*?revalidate:\s*15/);
  const productionGuard = await readFile(new URL('../../scripts/verify-production-engine-regression.mjs', import.meta.url), 'utf8');
  assert.match(productionGuard, /Live stateCount .*does not match local/);
  assert.match(productionGuard, /Live generatedAt .*does not match local/);
  assert.match(productionGuard, /PRODUCTION_VERIFY_ATTEMPTS/);
  assert.match(productionGuard, /cache-control.*no-cache/);
});

test('stats endpoint propagates the exact remote snapshot provenance used by the watchdog', async () => {
  const route = await readFile(new URL('../../src/app/api/stats/route.ts', import.meta.url), 'utf8');
  assert.match(route, /readSiteExportResults\(\[[\s\S]*?["']stats["']/);
  assert.doesNotMatch(route, /Promise\.all\(\[[\s\S]*?readSiteExportResult/);
  assert.match(route, /siteExportHeaders\(statsResult\.source,\s*statsResult\.snapshotId\)/);
  assert.match(route, /result\.source\s*!==\s*statsResult\.source/);
  assert.match(route, /result\.snapshotId\s*!==\s*statsResult\.snapshotId/);
  assert.doesNotMatch(route, /if\s*\(statsResult\.source\s*===\s*["']remote-snapshot["']\)/);
  assert.doesNotMatch(route, /siteExportHeaders\(["']local-export["']\)/);
});

test('independent watchdog and monthly recovery drill are required operational contracts', async () => {
  const watchdogWorkflow = await readFile(new URL('../../.github/workflows/engine-watchdog.yml', import.meta.url), 'utf8');
  assert.match(watchdogWorkflow, /cron:\s*["']\*\/10 \* \* \* \*['"]/);
  assert.match(watchdogWorkflow, /actions:\s*write/);
  assert.match(watchdogWorkflow, /production-engine-watchdog\.mjs/);
  assert.match(watchdogWorkflow, /workflow run refresh-feed\.yml/);
  assert.match(watchdogWorkflow, /upload-artifact@v4/);

  const drillWorkflow = await readFile(new URL('../../.github/workflows/engine-recovery-drill.yml', import.meta.url), 'utf8');
  assert.match(drillWorkflow, /cron:\s*["']17 6 1 \* \*['"]/);
  assert.match(drillWorkflow, /run-recovery-drill\.mjs/);

  const ci = await readFile(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');
  assert.match(ci, /verify:reliability/);
});
