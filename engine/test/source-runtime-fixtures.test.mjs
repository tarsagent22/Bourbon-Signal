import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const fixture = async (name) => JSON.parse(await readFile(new URL(`./fixtures/source-runtime/${name}`, import.meta.url), 'utf8'));

test('hardening fixture corpus names every required failure, fallback, and recovery scenario', async () => {
  const required = [
    'unreachable.json',
    'malformed-payload.json',
    'collapse.json',
    'failed-sibling.json',
    'stale-fallback.json',
    'public-nonalertable.json',
    'recovery.json',
  ];
  const scenarios = await Promise.all(required.map(fixture));

  assert.deepEqual(scenarios.map((scenario) => scenario.scenario), [
    'unreachable',
    'malformed',
    'volume-collapse',
    'failed-sibling',
    'stale-fallback',
    'public-but-nonalertable',
    'half-open-recovery',
  ]);
  assert.equal(scenarios.every((scenario) => scenario.expected && typeof scenario.expected.status === 'string'), true);
});
