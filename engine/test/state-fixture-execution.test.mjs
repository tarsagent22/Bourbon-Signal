import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { executeStateFixtures, validateStateFixtures } from '../src/verify-state-fixtures.mjs';

const fixtureUrl = new URL('../data/state-fixtures/UT.json', import.meta.url);
const bibleUrl = new URL('../out/bourbon-bible.json', import.meta.url);

test('Utah golden fixtures execute against bottle, identity, timestamp, and lifecycle semantics', async () => {
  const payload = JSON.parse(await readFile(fixtureUrl, 'utf8'));
  assert.equal(validateStateFixtures(payload).ok, true);
  const valid = await executeStateFixtures(payload, { bibleFile: bibleUrl });
  assert.equal(valid.ok, true, valid.failures.join('\n'));

  const tampered = structuredClone(payload);
  tampered.cases.find((item) => item.kind === 'availability_semantics').expected.canAlertAsInventory = true;
  const rejected = await executeStateFixtures(tampered, { bibleFile: bibleUrl });
  assert.equal(rejected.ok, false);
  assert.match(rejected.failures.join('\n'), /canAlertAsInventory/);
});
