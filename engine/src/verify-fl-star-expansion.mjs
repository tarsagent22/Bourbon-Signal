import { readFile } from 'node:fs/promises';

import { verifyFloridaStarExpansionArtifact } from './verification/florida-star-expansion-verifier.mjs';

const statePath = process.env.BOURBON_SIGNAL_FL_STAR_VERIFY_FILE || process.env.BOURBON_SIGNAL_FL_VERIFY_FILE || 'out/states/FL.json';
const baselinePath = process.env.BOURBON_SIGNAL_FL_STAR_BASELINE_FILE || 'data/florida-star-expansion-baseline.json';
const state = JSON.parse(await readFile(statePath, 'utf8'));
const baseline = JSON.parse(await readFile(baselinePath, 'utf8'));
const maxInventoryAgeMs = Math.min(90 * 60_000, Math.max(15 * 60_000, Number(process.env.BOURBON_SIGNAL_FL_MAX_INVENTORY_AGE_MS) || 90 * 60_000));

console.log(JSON.stringify(verifyFloridaStarExpansionArtifact({
  state,
  baseline,
  now: Date.now(),
  maxInventoryAgeMs,
}), null, 2));
