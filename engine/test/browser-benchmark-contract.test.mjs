import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { validateBrowserBenchmarkContract } from '../../automation/bourbon-signal/browser-benchmark.mjs';

test('browser benchmark contract has ten tasks and distinguishes measured work from honest blockers', async () => {
  const contract = JSON.parse(await readFile(new URL('../../automation/bourbon-signal/browser-benchmark-contract.json', import.meta.url), 'utf8'));
  const result = validateBrowserBenchmarkContract(contract);
  assert.equal(result.ok, true, result.errors.join('\n'));
  assert.equal(contract.tasks.length, 10);
  assert.ok(contract.tasks.every((task) => task.measurements.codex_native.status === 'pending' && task.measurements.codex_native.reason));
  const hermes = contract.tasks.map((task) => task.measurements.hermes_browser);
  assert.equal(hermes.filter((measurement) => measurement.status === 'completed').length, 3);
  assert.equal(hermes.filter((measurement) => measurement.status === 'pending').length, 7);
  assert.ok(hermes.filter((measurement) => measurement.status === 'completed').every((measurement) => measurement.metrics.completed === true && measurement.metrics.durationMs > 0));
  assert.ok(hermes.filter((measurement) => measurement.status === 'pending').every((measurement) => measurement.reason && measurement.metrics === null));
});
