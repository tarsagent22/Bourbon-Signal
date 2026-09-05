// Run after quality-episode-diagnostic.mjs; extracts actual captured rows, not invented inputs.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
const root = process.argv[2];
if (!root) throw new Error('Supply reports directory');
const read = async file => JSON.parse(await readFile(path.join(root, file), 'utf8'));
const replay = await read('quality-episode-replay.json');
const baseline = await read('accepted-site-baseline/drops.json');
const files = ['accepted-site-baseline/manifest.json', 'accepted-site-baseline/state-quality.json', 'accepted-site-baseline/drops.json', 'accepted-site-baseline/stats.json', 'full-failed-fixture/states/MD-MONTGOMERY.json', 'full-failed-fixture/states/KY.json', 'quality-bible-reconstruction/engine/out/bourbon-bible.json'];
const { BourbonBible } = await import('../src/core/bible.mjs');
const { canonicalizeSignal } = await import('../src/operational-report.mjs');
const { buildDrops, bibleLookup } = await import('../src/export-site-contract.mjs');
const biblePayload = await read('quality-bible-reconstruction/engine/out/bourbon-bible.json');
const bible = new BourbonBible(biblePayload.records);
const signals = [];
for (const state of ['MD-MONTGOMERY', 'KY']) {
  const report = await read(`full-failed-fixture/states/${state}.json`);
  const canonical = report.signals.map(signal => canonicalizeSignal(signal, bible));
  signals.push(...canonical.filter(signal => buildDrops([signal], bibleLookup(biblePayload.records), [signal], baseline).length));
}
const bibleRecords = biblePayload.records.filter(record => signals.some(signal => signal.canonicalBottleId === record.id));
const hashes = Object.fromEntries(await Promise.all(files.map(async file => [file, createHash('sha256').update(await readFile(path.join(root, file))).digest('hex')])));
await writeFile(new URL('./fixtures/quality-baseline-production.json', import.meta.url), JSON.stringify({ provenance: { cache: replay.provenance.cache, recoveryWorkflow: replay.provenance.recoveryWorkflow, failedRun: replay.provenance.failedRun, caveat: replay.provenance.caveat, sha256: hashes, extraction: 'Accepted rows and episode-backed diagnostic quality inputs copied verbatim; no complete rejected operational inputs exist.' }, signals, bibleRecords, acceptedGeneratedAt: replay.provenance.manifest.generatedAt, generatedAt: replay.generatedAt, states: replay.states.map(({ state, accepted, replay }) => ({ state, accepted, replay })), drops: baseline.drops.filter(row => ['MD-MONTGOMERY', 'KY'].includes(row.state)) }, null, 2) + '\n');
console.log('Extracted production quality fixture with file hashes.');
