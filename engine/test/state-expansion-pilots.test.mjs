import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('pilot evidence records measured source classes and exactly one safe customer-facing promotion', async () => {
  const ledger = JSON.parse(await readFile(new URL('../data/state-expansion-pilots.json', import.meta.url), 'utf8'));
  assert.deepEqual(ledger.pilots.map((pilot) => pilot.state), ['OR', 'NH', 'CO', 'UT']);
  assert.ok(ledger.pilots.every((pilot) => pilot.evidence.length > 0 && pilot.evidence.every((entry) => entry.status === 'measured')));
  const promoted = ledger.pilots.filter((pilot) => pilot.customerActivationChanged === true);
  assert.deepEqual(promoted.map((pilot) => pilot.state), ['UT']);
  assert.equal(promoted[0].lifecycleStage, 'active');
  assert.equal(promoted[0].alertGrade, false);
  assert.equal(ledger.pilots.find((pilot) => pilot.state === 'CO').lifecycleStage, 'probeable');
  assert.ok(ledger.pilots.filter((pilot) => pilot.state !== 'UT').every((pilot) => pilot.customerActivationChanged === false));
});
