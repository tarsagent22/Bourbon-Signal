import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { validateBrowserBenchmarkContract } from '../../automation/bourbon-signal/browser-benchmark.mjs';

test('browser benchmark contract has ten tasks and cannot represent pending work as measured', async () => {
  const contract = JSON.parse(await readFile(new URL('../../automation/bourbon-signal/browser-benchmark-contract.json', import.meta.url), 'utf8'));
  const result = validateBrowserBenchmarkContract(contract);
  assert.equal(result.ok, true, result.errors.join('\n'));
  assert.equal(contract.tasks.length, 10);
  assert.ok(contract.tasks.every((task) => task.measurements.codex_native.status === 'pending'));
  assert.ok(contract.tasks.every((task) => task.measurements.hermes_browser.status === 'pending'));
});
