import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { selectTrustedRuns, statesRequiredForHydration, validateStateReportDirectory } from './hydrate-state-reports.mjs';

assert.deepEqual(
  statesRequiredForHydration(['CO', 'IN', 'NY', 'VA'], 'NY, co'),
  ['IN', 'VA'],
  'Targeted states are refreshed next and must not block hydration when older artifacts predate their activation.',
);

assert.deepEqual(
  selectTrustedRuns([
    { databaseId: 10, headBranch: 'feature' },
    { databaseId: 11, headBranch: 'main' },
    { databaseId: 'bad', headBranch: 'main' },
  ], 'main').map((run) => run.databaseId),
  [11],
  'Only successful-run metadata from the trusted production branch may become hydration input.',
);

const root = await mkdtemp(path.join(os.tmpdir(), 'state-report-hydration-test-'));
try {
  await mkdir(root, { recursive: true });
  await writeFile(path.join(root, 'PA.json'), JSON.stringify({ state: 'PA', finishedAt: '2026-07-20T00:00:00.000Z', signals: [] }));

  const incomplete = await validateStateReportDirectory(root, ['OH', 'PA']);
  assert.equal(incomplete.ok, false);
  assert.match(incomplete.failures.join('\n'), /OH: report missing/);

  await writeFile(path.join(root, 'OH.json'), JSON.stringify({ state: 'OH', finishedAt: '2026-07-20T00:00:00.000Z', signals: [] }));
  const complete = await validateStateReportDirectory(root, ['OH', 'PA']);
  assert.deepEqual(complete, { ok: true, failures: [] });

  await writeFile(path.join(root, 'OH.json'), JSON.stringify({ state: 'PA', finishedAt: '2026-07-20T00:00:00.000Z', signals: [] }));
  const mismatched = await validateStateReportDirectory(root, ['OH', 'PA']);
  assert.equal(mismatched.ok, false);
  assert.match(mismatched.failures.join('\n'), /OH: state identity mismatch/);

  console.log('State report hydration contracts passed.');
} finally {
  await rm(root, { recursive: true, force: true });
}
