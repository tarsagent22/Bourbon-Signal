import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
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
    console.log(JSON.stringify({ parent: stateTimeoutMs({ id: 'AZ' }), child: legacyPrecisionRuntimeOptions('AZ', {}, {}).timeoutMs, ordinaryState: stateTimeoutMs({ id: 'AL' }) }));
  `;
  const env = { ...process.env, BOURBON_SIGNAL_STATE_TIMEOUT_MS: '', BOURBON_SIGNAL_AZ_STATE_TIMEOUT_MS: '', BOURBON_SIGNAL_AZ_PRECISION_TIMEOUT_MS: '', BOURBON_SIGNAL_LEGACY_PRECISION_TIMEOUT_MS: '', ...overrides };
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', program], { env, encoding: 'utf8', windowsHide: true, timeout: 10_000 });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  return JSON.parse(result.stdout);
}

test('the actual Arizona state watchdog outlives its precision-source budget and remains bounded', () => {
  const result = budgets();
  assert.ok(result.parent >= result.child + 120_000, 'The state watchdog must allow the source attempt plus parent work');
  assert.ok(result.parent <= 12 * 60_000, 'Keep a hard twelve-minute state ceiling');
  assert.equal(result.ordinaryState, 180_000, 'Other states retain their generic budget');
});

test('an explicit Arizona parent budget is honored independently of the generic state watchdog', () => {
  const result = budgets({ BOURBON_SIGNAL_AZ_STATE_TIMEOUT_MS: '650000', BOURBON_SIGNAL_STATE_TIMEOUT_MS: '200000' });
  assert.equal(result.parent, 650_000);
  assert.equal(result.ordinaryState, 200_000);
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
