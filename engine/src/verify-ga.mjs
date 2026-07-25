import { readFile } from 'node:fs/promises';

import { verifyGeorgiaReleasePolicy } from './georgia-release-policy.mjs';

const state = JSON.parse(await readFile('out/states/GA.json', 'utf8'));
const siteDrops = JSON.parse(await readFile('out/site/states/GA/drops.json', 'utf8')).drops || [];
const siteAlerts = JSON.parse(await readFile('out/site/alerts.json', 'utf8')).alerts || [];
const maxInventoryAgeHours = Number(process.env.BOURBON_SIGNAL_GA_MAX_INVENTORY_AGE_HOURS || 12);
const allowLabeledLastKnownFallback = process.argv.includes('--allow-labeled-last-known-fallback');

const result = verifyGeorgiaReleasePolicy({
  state,
  siteDrops,
  siteAlerts,
  maxInventoryAgeHours,
  allowLabeledLastKnownFallback,
});

console.log(JSON.stringify(result, null, 2));
