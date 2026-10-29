import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {STATE_LIFECYCLE_CONFIG} from '../src/state-lifecycle.mjs';
import {withResearchLifecycle, researchSourceForState} from '../src/research-state-registry.mjs';
import {westernGroceryPromotionAllowed} from '../src/collectors/western-grocery-production.mjs';
import {centralCityHiveProductionAllowed} from '../src/collectors/central-cityhive-production.mjs';
import {selectActiveResearchRenewals, suppressActiveRenewalReport, isActiveRenewalResearchInventory} from '../src/active-research-renewal.mjs';
import {runExpansionShadow, selectShadowCandidates, classifyShadowReadiness, assertActiveRenewalIncidentSafety,
  createActiveRenewalFetch, verifyActiveRenewalMaintenance} from '../src/run-expansion-shadow.mjs';
import {buildStateCanaryPreview} from '../src/build-state-canary-preview.mjs';
import {persistCityHiveIncidentJournal} from '../src/collectors/central-cityhive-transport.mjs';
import {BourbonBible} from '../src/core/bible.mjs';
import {NEW_MEXICO_GROCERY_SOURCES} from '../src/collectors/new-mexico-grocery-premises.mjs';
import {parseGroceryExpansionInventory} from '../src/collectors/grocery-xapi-expansion.mjs';
const four = ['WA', 'NM', 'WI', 'OK'];
const all = [...four, 'LA', 'AK', 'MA', 'CT', 'RI'];
// Qualification occurs before the five new states are admitted; preserve that
// explicit fixture context even when the suite rehearses an active33 lifecycle.
const lifecycle = () => {const config=structuredClone(STATE_LIFECYCLE_CONFIG),pending=['LA','AK','MA','CT','RI'];config.activeStates=config.activeStates.filter(state=>!pending.includes(state));for(const state of pending)if(config.states[state])config.states[state].publicStatus='research_only';return withResearchLifecycle(config);};
const authority = (state, config) => (['WA', 'NM'].includes(state) ? westernGroceryPromotionAllowed : centralCityHiveProductionAllowed)(state, config, {env: {}});
const directory = () => mkdtemp(path.join(tmpdir(), 'bs-active-research-renewal-'));
// Offline GitHub API schema fixtures only, never workflow maintenance evidence.
const manualEnv = {GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_ACTIONS: 'true', GITHUB_RUN_ID: '123',
  GITHUB_REPOSITORY: 'tarsagent22/Bourbon-Signal'};
const maintenanceFixture = async route => route === 'workflows/refresh-feed.yml'
  ? {id: 311991230, path: '.github/workflows/refresh-feed.yml', state: 'disabled_manually'}
  : {total_count: 0, workflow_runs: []};

test('actual admitted four retain production authority but remain excluded from ordinary shadow selection', () => {
  const config = lifecycle(), before = JSON.stringify(config);
  assert.deepEqual(selectShadowCandidates(config, {states: four}), []);
  assert.deepEqual(selectActiveResearchRenewals({lifecycle: config, states: all, renewActiveStates: four,
    eventName: 'workflow_dispatch', productionAllowed: authority, researchSourceForState}), ['NM', 'OK', 'WA', 'WI']);
  assert.equal(JSON.stringify(config), before);
  assert.equal(researchSourceForState('WA', {shadowMode: false}), null);
});

test('invalid, unproven, disabled or quarantined explicit renewals reject the complete batch before any child or prerequisite', async () => {
  const root = await directory(); let calls = 0;
  try {
    const cases = [
      {env: {GITHUB_EVENT_NAME: 'schedule'}},
      {env: {}},
      {renewActiveStates: ['CA'], states: ['LA', 'CA']},
      {renewActiveStates: ['WA', 'WA']},
      {states: ['LA']},
      {limit: 3},
      {env: {GITHUB_EVENT_NAME: 'workflow_dispatch', BOURBON_SIGNAL_DISABLED_STATES: 'WI'}},
      {env: {GITHUB_EVENT_NAME: 'workflow_dispatch', BOURBON_SIGNAL_QUARANTINED_STATES: 'NM'}},
      {mutate: config => { config.activeStates = config.activeStates.filter(state => state !== 'WA'); }},
      {mutate: config => { config.states.OK.promotionEvidence.shadowRuns = 2; }},
      {mutate: config => { config.states.WI.promotionEvidence.canaryRuns = 1; }},
      {mutate: config => { delete config.states.NM.promotionEvidence.immutableEvidence; }},
      {mutate: config => { config.states.WA.inventoryAlertable = true; }},
    ];
    for (const item of cases) {
      const config = lifecycle(); item.mutate?.(config);
      await assert.rejects(() => runExpansionShadow({lifecycle: config, states: all, renewActiveStates: four, limit: 9,
        env: {GITHUB_EVENT_NAME: 'workflow_dispatch'}, cwd: root, outDir: path.join(root, 'shadow'),
        runCollector: async () => { calls++; }, prepareCandidate: async () => { calls++; }, ...item}));
      assert.equal(calls, 0);
    }
    await assert.rejects(() => runExpansionShadow({lifecycle: lifecycle(), states: all, limit: 9,
      env: {GITHUB_EVENT_NAME: 'schedule'}, cwd: root, runCollector: async () => { calls++; }}), /limit/);
    assert.equal(calls, 0);
  } finally { await rm(root, {recursive: true, force: true}); }
});

test('all-nine manual research routes only the four admitted states through renewal and disables every channel without changing clocks', async () => {
  const root = await directory(), calls = [], observedAt = new Date().toISOString();
  try {
    const summary = await runExpansionShadow({lifecycle: lifecycle(), states: all, renewActiveStates: four, limit: 9,
      env: manualEnv, maintenanceRequestJson: maintenanceFixture, cwd: root, outDir: path.join(root, 'shadow'),
      runCollector: async (state, file, _cwd, options) => {
        calls.push([state, options.renewal]);
        await writeFile(file, JSON.stringify({state, strategy: 'retailer_store_inventory', status: 'no_trusted_inventory',
          startedAt: observedAt, finishedAt: observedAt, signals: [], sources: [], sourceResults: [], roadblocks: [],
          metadata: {complete: true, shadowOnly: true, productionActivationAllowed: false, customerDeliveryAllowed: false}}));
        return {ok: true};
      }});
    assert.deepEqual(summary.candidates, [...all].sort());
    assert.deepEqual(calls.filter(([, renewal]) => renewal).map(([state]) => state), [...four].sort());
    assert.equal(summary.complete, false); // Zero inventory is not a qualifying source observation.
    for (const result of summary.results) {
      const report = JSON.parse(await readFile(path.join(result.directory, 'report.json'), 'utf8'));
      assert.equal(report.startedAt, observedAt); assert.equal(report.finishedAt, observedAt);
      assert.equal(Boolean(report.metadata.manualActiveRenewal), four.includes(result.state));
      assert.equal(result.publication.allowed, false); assert.equal(result.alerts.deliveryAttempted, false);
    }
  } finally { await rm(root, {recursive: true, force: true}); }
});

test('actual captured-format grocery proof remains trusted research after all-false suppression; marker alone cannot grant stock or visibility', async () => {
  const fixture = JSON.parse(await readFile(new URL('./fixtures/new-mexico-grocery-expansion/identity.json', import.meta.url)));
  const bible = new BourbonBible(fixture.records), source = NEW_MEXICO_GROCERY_SOURCES.find(row => row.merchantId === fixture.source.merchantId);
  const observedAt = new Date().toISOString();
  const rows = parseGroceryExpansionInventory({response: {docs: fixture.products}}, source, bible, {observedAt});
  assert.ok(rows.length);
  const raw = {state: 'NM', strategy: 'retailer_store_inventory', metadata: {complete: true, shadowOnly: true,
    productionActivationAllowed: false, customerDeliveryAllowed: false}, signals: rows.map(row => ({...row,
      sourceRuntimeId: 'research:nm:grocery-xapi', raw: {...row.raw, shadowOnly: true},
      sourceProductBinding: {...row.sourceProductBinding, shadowOnly: true}})), sources: [{ok: true}], sourceResults: [], roadblocks: []};
  const report = suppressActiveRenewalReport('NM', raw), row = report.signals[0];
  assert.equal(raw.signals[0].canAlertAsInventory, true);
  assert.equal(row.observedAt, observedAt); assert.equal(row.sourceProductBinding.observedAt, observedAt);
  assert.equal(isActiveRenewalResearchInventory(row, report), true);
  assert.equal(classifyShadowReadiness(report).inventory.ready, true);
  for (const key of ['canAlertAsInventory','canAlertAsWatch','alertable','eligibleForOnSite','eligibleForDropFeed',
    'eligibleForWatch','eligibleForDelivery','deliveryEligible','eligibleForEmail','eligibleForSms']) assert.equal(row[key], false);
  for (const mutate of [r => {r.eligibleForOnSite = true;}, r => {r.price += 1;}, r => {r.sourceRuntimeId = 'nm:grocery-xapi';},
    r => {r.raw.shadowOnly = false;}, r => {r.sourceProductBinding.shadowOnly = false;}, r => {r.quarantined = true;}]) {
    const changed = structuredClone(row); mutate(changed);
    assert.equal(isActiveRenewalResearchInventory(changed, report), false);
  }
  assert.equal(isActiveRenewalResearchInventory(row, {...report, metadata: {...report.metadata, complete: false}}), false);
  assert.equal(classifyShadowReadiness(report, {now: new Date(Date.parse(observedAt) + 2 * 60 * 60_000 + 1).toISOString()}).inventory.ready, false);
  assert.throws(() => suppressActiveRenewalReport('NM', {...raw, signals: rows}), /research report/);
});

test('restored production/research holds, expired denial records and corrupt files all stop before any sibling collection', async () => {
  const root = await directory(), out = path.join(root, 'out'), file = path.join(out, 'source-incidents/western-grocery/WA-grocery-production-incidents.json');
  let calls = 0;
  try {
    await mkdir(path.dirname(file), {recursive: true});
    const entry = {httpStatus: 403, lastAttemptAt: '2026-01-01T00:00:00.000Z', nextAllowedAt: '2026-01-02T00:00:00.000Z'};
    for (const body of ['{invalid', 'null', JSON.stringify({schemaVersion: 1, state: 'WA', hosts: {'www.safeway.com': entry}, inFlight: null}),
      JSON.stringify({schemaVersion: 1, state: 'WA', hosts: {}, inFlight: {attemptId: '1'.repeat(36), startedAt: new Date().toISOString()}})]) {
      await writeFile(file, body);
      await assert.rejects(() => runExpansionShadow({lifecycle: lifecycle(), states: all, renewActiveStates: four, limit: 9,
        env: {GITHUB_EVENT_NAME: 'workflow_dispatch'}, cwd: root, runCollector: async () => {calls++;}}));
      assert.equal(await readFile(file, 'utf8'), body); assert.equal(calls, 0);
    }
    await writeFile(file, '{}'); await assertActiveRenewalIncidentSafety('WA', {out});
    await rm(file); await mkdir(file); // An unreadable file surface must not become a cold read.
    await assert.rejects(() => assertActiveRenewalIncidentSafety('WA', {out}));
  } finally { await rm(root, {recursive: true, force: true}); }
});

test('native header-first denial survives parent abort, honors longer Retry-After and prevents cold follow-up HTTP', async () => {
  const out = await directory(), originalFetch = globalThis.fetch, controller = new AbortController(); let calls = 0;
  try {
    globalThis.fetch = async () => {calls++; controller.abort(); return new Response('', {status: 429, headers: {'retry-after': String(3 * 86400)}});};
    const maintenance = await verifyActiveRenewalMaintenance({env: manualEnv, requestJson: maintenanceFixture});
    const fetchText = await createActiveRenewalFetch('WA', {out, maintenance});
    const response = await fetchText('https://www.safeway.com/abs/pub/xapi/storeresolver/v2/all?zipcode=98101&radius=50&size=100', {signal: controller.signal});
    assert.equal(response.status, 429); assert.equal(calls, 1);
    const journal = JSON.parse(await readFile(path.join(out, 'research-source-attempts/active-renewal-journals/WA.json'), 'utf8'));
    assert.equal(journal.inFlight, null);
    assert.ok(Date.parse(journal.hosts['www.safeway.com'].nextAllowedAt) - Date.parse(journal.hosts['www.safeway.com'].lastAttemptAt) >= 3 * 86400_000);
    assert.equal(JSON.stringify(journal).includes('signals'), false);
    await assert.rejects(() => createActiveRenewalFetch('WA', {out, maintenance}), /review/);
    assert.equal(calls, 1);
  } finally { globalThis.fetch = originalFetch; await rm(out, {recursive: true, force: true}); }
});

test('denial journal write failure preserves observed HTTP status and unresolved durable latch without stock', async () => {
  const out = await directory(); let calls = 0;
  try {
    const maintenance = await verifyActiveRenewalMaintenance({env: manualEnv, requestJson: maintenanceFixture});
    const fetchText = await createActiveRenewalFetch('NM', {out, maintenance,
      fetchText: async (_url, options) => {calls++; await options.onResponse({status: 403, retryAfterSeconds: 172800}); throw Error('must not reach body');},
      persistJournal: (file, journal) => {if (Object.keys(journal.hosts).length) throw Object.assign(Error('synthetic rename failure'), {code: 'EIO'}); return persistCityHiveIncidentJournal(file, journal);}});
    await assert.rejects(() => fetchText('https://www.safeway.com/abs/pub/xapi/storeresolver/v2/all'), error => error.status === 403);
    const journal = JSON.parse(await readFile(path.join(out, 'research-source-attempts/active-renewal-journals/NM.json'), 'utf8'));
    assert.ok(journal.inFlight); assert.deepEqual(journal.hosts, {}); assert.equal(JSON.stringify(journal).includes('signals'), false);
    await assert.rejects(() => createActiveRenewalFetch('NM', {out, maintenance}), /unresolved/i); assert.equal(calls, 1);
  } finally { await rm(out, {recursive: true, force: true}); }
});

test('a newly captured renewal denial stops the batch before the next shared-host state', async () => {
  const root = await directory(), out = path.join(root, 'out'); let calls = 0;
  try {
    await assert.rejects(() => runExpansionShadow({lifecycle: lifecycle(), states: ['NM','WA'], renewActiveStates: ['NM','WA'], limit: 2,
      env: manualEnv, maintenanceRequestJson: maintenanceFixture, cwd: root, outDir: path.join(root, 'shadow'),
      runCollector: async (state, file) => {
        calls++; const clock = new Date().toISOString(), journal = path.join(out, 'research-source-attempts/active-renewal-journals', state + '.json');
        persistCityHiveIncidentJournal(journal, {schemaVersion: 1, state, inFlight: null, hosts: {'www.safeway.com': {
          httpStatus: 403, lastAttemptAt: clock, nextAllowedAt: new Date(Date.parse(clock) + 86400_000).toISOString()}}});
        await writeFile(file, JSON.stringify({state, status: 'no_trusted_inventory', startedAt: clock, finishedAt: clock,
          signals: [], sources: [{ok: false, status: 403}], sourceResults: [], metadata: {complete: false, shadowOnly: true,
            productionActivationAllowed: false, customerDeliveryAllowed: false}}));
        return {ok: true};
      }}), /incident\/review hold/);
    assert.equal(calls, 1);
  } finally { await rm(root, {recursive: true, force: true}); }
});

test('actual preview builder accepts already-active lifecycle without changing production authority or enabling delivery', async () => {
  const root = await directory(), config = lifecycle(), before = JSON.stringify(config), siteDir = path.join(root, 'site');
  try {
    await mkdir(siteDir); await writeFile(path.join(siteDir, 'manifest.json'), '{}');
    for (const state of four) {
      const outDir = path.join(root, 'canary', state);
      const result = await buildStateCanaryPreview({state, candidateDrops: [], lifecycleConfig: config, siteDir, outDir});
      const preview = JSON.parse(await readFile(path.join(outDir, 'lifecycle-preview.json'), 'utf8'));
      assert.equal(preview.states[state].promotionStage, 'canary');
      assert.equal(preview.states[state].inventoryAlertable, false); assert.equal(preview.states[state].watchAlertable, false);
      assert.equal(result.preview.previewPolicy.productionSnapshotPublicationEnabled, false);
      assert.equal(result.preview.previewPolicy.alertDeliveryEnabled, false);
      assert.equal(authority(state, config), true);
    }
    assert.equal(JSON.stringify(config), before);
  } finally { await rm(root, {recursive: true, force: true}); }
});

test('workflow keeps default schedule, serializes renewal with production and requires read-only maintenance authority', async () => {
  const workflow = await readFile(new URL('../../.github/workflows/state-expansion-shadow.yml', import.meta.url), 'utf8');
  assert.match(workflow, /cron: "15 1,5,9,13,17,21 \* \* \*"/);
  assert.match(workflow, /MAX_LIMIT=5/); assert.match(workflow, /EVENT_NAME.*workflow_dispatch/);
  for (const value of ['grocery-WA.json','grocery-NM.json','central-cityhive-journals','active-renewal-journals']) {
    assert.ok(workflow.split(value).length - 1 >= 2);
  }
  assert.match(workflow, /Save active-four research incidents[\s\S]*?if: always\(\)/);
  assert.match(workflow, /inventory-western-grocery-incidents/); assert.match(workflow, /inventory-central-cityhive-incidents/);
  assert.equal(workflow.includes('grocery-production-cache.json'), false);
  assert.match(workflow, /inputs\.renew_active_states == '' && \(inputs\.states == 'NJ,MI'/);
  assert.match(workflow, /inputs\.renew_active_states != '' && 'production-inventory-refresh' \|\| 'state-expansion-shadow'/);
  assert.match(workflow, /actions: read/); assert.match(workflow, /GITHUB_TOKEN: \$\{\{ github.token \}\}/);
  assert.match(workflow, /refresh-feed\.yml must be disabled_manually and idle/);
  assert.equal(workflow.includes('gh workflow disable'), false); assert.equal(workflow.includes('gh workflow enable'), false);
});

test('actual maintenance verifier requires disabled_manually and zero every active queue before collection', async () => {
  const routes = [], requestJson = async route => {routes.push(route); return maintenanceFixture(route);};
  const proof = await verifyActiveRenewalMaintenance({env: manualEnv, requestJson});
  assert.equal(proof.workflowState, 'disabled_manually'); assert.equal(proof.productionReenableAllowed, false);
  assert.equal(proof.researchCachesVisibleToMain, false); assert.equal(proof.activeProductionRunCount, 0);
  assert.equal(routes.length, 7);
  for (const state of ['active','disabled_inactivity','disabled_fork',undefined]) {
    await assert.rejects(() => verifyActiveRenewalMaintenance({env: manualEnv, requestJson: async route => route === 'workflows/refresh-feed.yml'
      ? {id: 311991230, path: '.github/workflows/refresh-feed.yml', state} : maintenanceFixture(route)}), /disabled_manually/);
  }
  for (const status of ['queued','in_progress','requested','waiting','pending']) {
    await assert.rejects(() => verifyActiveRenewalMaintenance({env: manualEnv, requestJson: async route => route.includes(`status=${status}&`)
      ? {total_count: 1, workflow_runs: [{workflow_id: 311991230, status}]} : maintenanceFixture(route)}), /zero/);
  }
  await assert.rejects(() => verifyActiveRenewalMaintenance({env: manualEnv, requestJson: async route => route.endsWith('per_page=20')
    ? {total_count: 1, workflow_runs: [{workflow_id: 311991230, status: 'future_unknown_status'}]} : maintenanceFixture(route)}), /Unknown or active/);
  await assert.rejects(() => verifyActiveRenewalMaintenance({env: manualEnv, requestJson: async () => {throw Error('synthetic 403');}}), /403/);
  for (const env of [{...manualEnv, GITHUB_EVENT_NAME: 'schedule'}, {...manualEnv, GITHUB_REPOSITORY: 'foreign/repo'},
    {...manualEnv, GITHUB_ACTIONS: 'false'}, {...manualEnv, GITHUB_RUN_ID: ''}])
    await assert.rejects(() => verifyActiveRenewalMaintenance({env, requestJson}), /actual manual/);
});

test('maintenance failure stops the complete nine-state batch before any prerequisite or source collector', async () => {
  const root = await directory(); let calls = 0;
  try {
    for (const requestJson of [async () => {throw Error('synthetic GitHub unavailable');}, async route => route === 'workflows/refresh-feed.yml'
      ? {id: 311991230, path: '.github/workflows/refresh-feed.yml', state: 'active'} : maintenanceFixture(route)]) {
      await assert.rejects(() => runExpansionShadow({lifecycle: lifecycle(), states: all, renewActiveStates: four, limit: 9,
        env: manualEnv, maintenanceRequestJson: requestJson, cwd: root, outDir: path.join(root, 'shadow'),
        runCollector: async () => {calls++;}, prepareCandidate: async () => {calls++;}}));
      assert.equal(calls, 0);
    }
  } finally {await rm(root, {recursive: true, force: true});}
});

test('direct renewal transport cannot replace a verified API maintenance observation with body flags', async () => {
  let calls = 0;
  for (const maintenance of [undefined, {workflowState: 'disabled_manually', activeProductionRunCount: 0, checkedAt: new Date().toISOString()}]) {
    await assert.rejects(() => createActiveRenewalFetch('WA', {maintenance, fetchText: async () => {calls++;}}), /just-verified/);
  }
  assert.equal(calls, 0);
});
