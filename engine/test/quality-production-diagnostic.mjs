// Offline diagnostic only: reconstruct quality inputs from captured state reports.
import { readFile } from 'node:fs/promises';
import { BourbonBible } from '../src/core/bible.mjs';
import { canonicalizeSignal } from '../src/operational-report.mjs';
import { bibleLookup, buildDrops } from '../src/export-site-contract.mjs';
import { buildStateQualityInputs, buildStateQualityScorecard } from '../src/state-quality-scorecard.mjs';
import path from 'node:path';
const root = process.argv[2];
if (!root) throw new Error('Supply captured fixture directory');
const read = async (file) => JSON.parse(await readFile(file, 'utf8'));
const biblePath = process.argv[3] || 'out/bourbon-bible.json';
const biblePayload = await read(biblePath);
const bible = new BourbonBible(biblePayload.records);
const stats = await read(path.join(root, 'site/stats.json'));
const generatedAt = '2026-09-04T23:24:17.014Z';
const output = [];
for (const state of ['MD-MONTGOMERY', 'KY']) {
  const report = await read(path.join(root, 'states', `${state}.json`));
  const signals = report.signals.map(signal => canonicalizeSignal(signal, bible));
  const drops = buildDrops(signals, bibleLookup(biblePayload.records), signals);
  const coverage = { ...stats.stateCoverage.states.find(row => row.state === state), roadblockCount: report.roadblocks.length, status: report.status, signalCount: signals.length };
  const inputs = buildStateQualityInputs({ stateCoverage: { states: [coverage] }, drops, alerts: [] });
  output.push({ state, capturedBaselineCoverage: stats.stateCoverage.states.find(row => row.state === state), currentQuality: buildStateQualityScorecard(inputs, { generatedAt }).states[0], drops });
}
console.log(JSON.stringify({ generatedAt, provenance: root, caveat: 'Reconstructed from captured reports and local bible; previous operational snapshot, accepted quality and alert candidates were not included in the supplied fixture.', states: output }, null, 2));
