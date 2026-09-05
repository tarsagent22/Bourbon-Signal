import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { assertStateQualityBaseline, migrateStateQualityBaseline, STATE_QUALITY_SCHEMA_VERSION } from './state-quality-scorecard.mjs';
import { verifyRunCoherence } from './site-run-coherence.mjs';
import { verifyStateDropPartitions } from './site-state-partitions.mjs';

// Read-only. A version change never authorizes dropping the comparison baseline.
// An entirely absent site can bootstrap; a damaged published site cannot.
export async function loadComparableStateQualityBaseline(siteDir) {
  const read = async (file, optional = false) => {
    try { return JSON.parse(await readFile(path.join(siteDir, file), 'utf8')); }
    catch (error) {
      if (optional && error.code === 'ENOENT') return null;
      throw new Error(`State-quality baseline ${file}: ${error.message}`);
    }
  };
  const exists = async file => {
    try { await lstat(path.join(siteDir, file)); return true; }
    catch (error) {
      if (error.code === 'ENOENT') return false;
      throw new Error(`State-quality baseline ${file}: ${error.message}`);
    }
  };
  if (!(await exists('state-quality.json'))) {
    for (const file of ['manifest.json', 'stats.json', 'drops.json', 'alerts.json', 'state-health.json', 'events.json', 'stores.json', 'locations.json', 'bottles.json', 'historical-trends.json', 'nc-intelligence.json', 'states']) {
      if (await exists(file)) throw new Error('Published site is missing its state-quality baseline.');
    }
    return null;
  }
  const previous = await read('state-quality.json');
  if (!previous || typeof previous !== 'object' || Array.isArray(previous)) throw new Error('Invalid state-quality baseline payload.');
  if (![2, STATE_QUALITY_SCHEMA_VERSION].includes(previous.schemaVersion)) throw new Error(`Unsupported state-quality baseline schema version ${previous.schemaVersion}.`);
  if (previous.schemaVersion === STATE_QUALITY_SCHEMA_VERSION) migrateStateQualityBaseline(previous);
  const manifest = await read('manifest.json');
  if (!manifest?.runId || !manifest.generatedAt || !manifest.engineGeneratedAt) throw new Error('State-quality baseline manifest lacks run identity.');
  const files = ['stats.json', 'state-health.json', 'drops.json', 'alerts.json', 'events.json', 'stores.json', 'locations.json', 'states/index.json'];
  const payloads = Object.fromEntries(await Promise.all(files.map(async file => [file, await read(file)])));
  const index = payloads['states/index.json'];
  if (!Array.isArray(index?.states) || !Array.isArray(payloads['drops.json']?.drops)) throw new Error('State-quality baseline is missing drop partitions.');
  const partitions = new Map();
  for (const entry of index.states) {
    if (!/^[A-Z]+(?:-[A-Z]+)*$/.test(entry.state) || entry.file !== `states/${entry.state}/drops.json` || partitions.has(entry.state)) throw new Error('State-quality baseline has invalid partition identity.');
    const partition = await read(entry.file);
    if (!Array.isArray(partition?.drops)) throw new Error(`${entry.state}: missing baseline drops.`);
    partitions.set(entry.state, partition);
  }
  const coverage = payloads['stats.json']?.stateCoverage?.states;
  if (!Array.isArray(coverage)) throw new Error('State-quality baseline lacks accepted coverage.');
  const acceptedStates = new Set();
  for (const row of coverage) {
    if (!row || !/^[A-Z]+(?:-[A-Z]+)*$/.test(row.state) || acceptedStates.has(row.state)) throw new Error('State-quality baseline has invalid accepted coverage identity.');
    acceptedStates.add(row.state);
  }
  assertStateQualityBaseline(previous, { acceptedStates });
  if (acceptedStates.size !== partitions.size || index.stateCount !== partitions.size) throw new Error('State-quality baseline coverage and partition state sets differ.');
  for (const state of previous.states) {
    if (!partitions.has(state.state)) throw new Error(`${state.state}: missing state-quality baseline partition.`);
  }
  const coherence = verifyRunCoherence({ ...payloads, quality: previous, ...Object.fromEntries(partitions) }, manifest);
  const lossless = verifyStateDropPartitions(payloads['drops.json'].drops, { index, payloads: partitions });
  if (!coherence.ok || !lossless.ok) throw new Error(`State-quality baseline migration validation failed: ${[...coherence.errors, ...lossless.errors].join(' ')}`);
  return migrateStateQualityBaseline(previous, { drops: payloads['drops.json'].drops });
}
