import test from 'node:test';
import assert from 'node:assert/strict';
import { validateOregonShadowChanges } from '../../scripts/download-oregon-shadow.mjs';

test('Oregon replay permits only exact source-independent preparation changes', () => {
  const files = [
    'engine/src/collectors/oregon-daily-production.mjs',
    'engine/src/export-site-contract.mjs',
    'engine/src/verify-oregon-first-publication.mjs',
    'engine/data/canary-inputs/OR.json',
  ].map(filename => ({ filename }));
  assert.deepEqual(validateOregonShadowChanges('a'.repeat(40), 'b'.repeat(40), { status: 'ahead', files }), files.map(file => file.filename));
  assert.deepEqual(validateOregonShadowChanges('a'.repeat(40), 'b'.repeat(40), {
    status: 'diverged', ahead_by: 12, behind_by: 6, files,
  }), files.map(file => file.filename));
});

test('Oregon replay rejects changes to any source acquisition/parser path', () => {
  for (const filename of [
    '.github/workflows/state-expansion-shadow.yml',
    'engine/src/or-browser-collector.mjs',
    'engine/src/or-daily-inventory.mjs',
    'engine/src/research-oregon-runtime.mjs',
    'engine/src/research-state-registry.mjs',
    'engine/src/run-expansion-shadow.mjs',
  ]) {
    assert.throws(() => validateOregonShadowChanges('a'.repeat(40), 'b'.repeat(40), {
      status: 'ahead', files: [{ filename }],
    }), /collector\/source changed/);
  }
});

test('Oregon replay rejects unknown changes and invalid comparisons', () => {
  assert.throws(() => validateOregonShadowChanges('a'.repeat(40), 'b'.repeat(40), {
    status: 'ahead', files: [{ filename: 'engine/src/unknown.mjs' }],
  }), /collector\/source changed/);
  assert.throws(() => validateOregonShadowChanges('a'.repeat(40), 'b'.repeat(40), {
    status: 'diverged', ahead_by: 90, behind_by: 6, files: [],
  }), /collector\/source changed/);
  assert.deepEqual(validateOregonShadowChanges('a'.repeat(40), 'a'.repeat(40), null), []);
});
