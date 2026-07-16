import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('pilot evidence records different source classes honestly without activation claims', async () => {
  const ledger = JSON.parse(await readFile(new URL('../data/state-expansion-pilots.json', import.meta.url), 'utf8'));
  assert.deepEqual(ledger.pilots.map((pilot) => pilot.state), ['OR', 'NH', 'CO']);
  assert.ok(ledger.pilots.every((pilot) => pilot.lifecycleStage === 'discovery'));
  assert.ok(ledger.pilots.every((pilot) => pilot.customerActivationChanged === false));
  assert.ok(ledger.pilots.every((pilot) => pilot.evidence.every((entry) => entry.status === 'unmeasured_repository_baseline')));
});
