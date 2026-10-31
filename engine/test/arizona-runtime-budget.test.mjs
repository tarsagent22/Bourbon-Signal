import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function budgets(overrides = {}) {
  const runner = new URL('../src/run.mjs', import.meta.url).href;
  const precision = new URL('../src/collectors/precision-probes.mjs', import.meta.url).href;
  const program = `
    globalThis.fetch = () => { throw new Error('Importing the runtime policy must not start collection'); };
    const { stateTimeoutMs } = await import(${JSON.stringify(runner)});
    const { legacyPrecisionRuntimeOptions } = await import(${JSON.stringify(precision)});
    const {ILLINOIS_GROCERY_SOURCE_TIMEOUT_MS}=await import(new URL('../src/collectors/illinois-grocery-runtime-source.mjs', ${JSON.stringify(import.meta.url)}).href);
    const {CALIFORNIA_GROCERY_SOURCE_TIMEOUT_MS} = await import(new URL('../src/collectors/california-grocery-runtime-source.mjs', ${JSON.stringify(import.meta.url)}).href);
    console.log(JSON.stringify({ parent: stateTimeoutMs({ id: 'AZ' }), child: legacyPrecisionRuntimeOptions('AZ', {}, {}).timeoutMs, californiaParent: stateTimeoutMs({id:'CA'}), californiaChild: CALIFORNIA_GROCERY_SOURCE_TIMEOUT_MS, illinoisParent:stateTimeoutMs({id:'IL'}),illinoisChild:ILLINOIS_GROCERY_SOURCE_TIMEOUT_MS,ordinaryState: stateTimeoutMs({ id: 'AL' }), nevadaParent: stateTimeoutMs({ id: 'NV' }), nevadaChild: legacyPrecisionRuntimeOptions('NV', {}, {}).timeoutMs }));
  `;
  const env = { ...process.env, BOURBON_SIGNAL_STATE_TIMEOUT_MS: '', BOURBON_SIGNAL_AZ_STATE_TIMEOUT_MS: '', BOURBON_SIGNAL_AZ_PRECISION_TIMEOUT_MS: '', BOURBON_SIGNAL_NV_STATE_TIMEOUT_MS: '', BOURBON_SIGNAL_NV_PRECISION_TIMEOUT_MS: '', BOURBON_SIGNAL_LEGACY_PRECISION_TIMEOUT_MS: '', ...overrides };
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', program], { env, encoding: 'utf8', windowsHide: true, timeout: 10_000 });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  return JSON.parse(result.stdout);
}

test('the actual Arizona state watchdog outlives its precision-source budget and remains bounded', () => {
  const result = budgets();
  assert.ok(result.parent >= result.child + 120_000, 'The state watchdog must allow the source attempt plus parent work');
  assert.equal(result.child,26*60_000,'The deeper grocery sweep must leave room for independent retailer siblings');
  assert.ok(result.parent <= 28 * 60_000, 'Keep a hard twenty-eight-minute state ceiling');
  assert.equal(result.ordinaryState, 180_000, 'Other states retain their generic budget');
});

test('an explicit Arizona parent budget is honored independently of the generic state watchdog', () => {
  const result = budgets({ BOURBON_SIGNAL_AZ_STATE_TIMEOUT_MS: '650000', BOURBON_SIGNAL_STATE_TIMEOUT_MS: '200000' });
  assert.equal(result.parent, 650_000);
  assert.equal(result.ordinaryState, 200_000);
});

test('the larger California pass fits inside its parent and the workflow deadlines',()=>{
  const result=budgets();
  assert.equal(result.californiaChild,26*60_000);
  assert.equal(result.californiaParent,28*60_000);
  assert.ok(result.californiaParent>=result.californiaChild+120_000);
});

test('Nevada grocery and storefront budget fits within its bounded parent watchdog', () => {
  const result = budgets();
  assert.equal(result.nevadaChild, 600_000);
  assert.equal(result.nevadaParent, 720_000);
  assert.ok(result.nevadaParent >= result.nevadaChild + 120_000);
  const override = budgets({ BOURBON_SIGNAL_NV_STATE_TIMEOUT_MS: '650000' });
  assert.equal(override.nevadaParent, 650_000);
  assert.equal(override.nevadaChild, 600_000);
});

test('the import-safe runner still executes its CLI and rejects an unknown state before collection', t => {
  const temporaryRoot = realpathSync(tmpdir());
  const directory = mkdtempSync(path.join(temporaryRoot, 'bs-az-cli-'));
  assert.ok(realpathSync(directory).startsWith(temporaryRoot + path.sep));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../src/run.mjs', import.meta.url))], {
    cwd: directory, env: { ...process.env, BOURBON_SIGNAL_RUN_STATES: 'ZZ', BOURBON_SIGNAL_BROWSER_PREFLIGHT: '0', BOURBON_SIGNAL_REFRESH_SOURCES: '' },
    encoding: 'utf8', windowsHide: true, timeout: 10_000,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unknown requested state id\(s\): ZZ/);
});

test('Illinois and Arizona source, parent, subprocess, workflow and publication budgets align',()=>{
  const result=budgets();const workflow=readFileSync(new URL('../../.github/workflows/refresh-feed.yml',import.meta.url),'utf8');
  const run=Number(workflow.match(/BOURBON_SIGNAL_RUN_STEP_TIMEOUT_MS: "(\d+)"/)[1]);
  const refresh=Number(workflow.match(/BOURBON_SIGNAL_REFRESH_STEP_TIMEOUT_MS: "(\d+)"/)[1]);
  const job=Number(workflow.match(/timeout-minutes: (\d+)/)[1])*60_000;
  assert.equal(result.illinoisChild,40*60_000);assert.equal(result.illinoisParent,43*60_000);
  assert.ok(result.illinoisParent>=result.illinoisChild+120_000);
  assert.ok(run>=Math.max(result.parent,result.illinoisParent)+120_000);
  assert.ok(refresh>=run+120_000);assert.ok(job>=refresh+10*60_000);
});
