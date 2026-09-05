#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadComparableStateQualityBaseline } from './state-quality-baseline.mjs';
import {
  buildStateQualityInputs,
  buildStateQualityScorecard,
  compareStateQuality,
} from './state-quality-scorecard.mjs';

const siteDir = path.resolve('out', 'site');

async function readJson(name, fallback = null) {
  try { return JSON.parse(await readFile(path.join(siteDir, name), 'utf8')); } catch { return fallback; }
}

async function main() {
  const stats = await readJson('stats.json');
  const drops = await readJson('drops.json');
  const alerts = await readJson('alerts.json');
  const manifest = await readJson('manifest.json');
  const previous = await loadComparableStateQualityBaseline(siteDir);
  if (!stats?.stateCoverage || !Array.isArray(drops?.drops) || !Array.isArray(alerts?.alerts) || !manifest?.files) {
    throw new Error('Site exports are incomplete; expected stats, drops, alerts, and manifest.');
  }
  const generatedAt = stats.generatedAt || new Date().toISOString();
  const scorecard = buildStateQualityScorecard(
    buildStateQualityInputs({ stateCoverage: stats.stateCoverage, drops: drops.drops, alerts: alerts.alerts }),
    { generatedAt },
  );
  scorecard.regression = previous
    ? compareStateQuality(previous, scorecard)
    : { ok: true, failures: [], warnings: ['No previous state-quality scorecard; recording baseline.'] };
  if (!scorecard.regression.ok && process.env.BOURBON_SIGNAL_ALLOW_STATE_QUALITY_REGRESSION !== '1') {
    throw new Error(`State quality regression blocked scorecard update: ${scorecard.regression.failures.join(' ')}`);
  }
  scorecard.runId = manifest.runId;
  scorecard.engineGeneratedAt = manifest.engineGeneratedAt;
  if (previous?.baselineMigration) scorecard.baselineMigration = previous.baselineMigration;
  stats.stateQuality = scorecard.summary;
  manifest.files.stateQuality = 'state-quality.json';
  await writeFile(path.join(siteDir, 'state-quality.json'), JSON.stringify(scorecard, null, 2));
  await writeFile(path.join(siteDir, 'stats.json'), JSON.stringify(stats, null, 2));
  await writeFile(path.join(siteDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`State quality baseline: ${scorecard.summary.releaseEligibleStates}/${scorecard.summary.stateCount} states release-eligible; weakest ${scorecard.summary.weakestStates.join(', ')}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
