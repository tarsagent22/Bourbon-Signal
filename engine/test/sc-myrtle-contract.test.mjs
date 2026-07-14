import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const collector = readFileSync(new URL('../src/collectors/precision-probes.mjs', import.meta.url), 'utf8');
const verifier = readFileSync(new URL('../src/verify-sc.mjs', import.meta.url), 'utf8');
const refreshWorkflow = readFileSync(new URL('../../.github/workflows/refresh-feed.yml', import.meta.url), 'utf8');

function defaultHours(constantName) {
  const match = collector.match(new RegExp(`const ${constantName} = Number\\(process\\.env\\.[A-Z0-9_]+ \\|\\| (\\d+) \\* 60 \\* 60_000\\)`));
  assert.ok(match, `missing hour-based default for ${constantName}`);
  return Number(match[1]);
}

function defaultNumber(constantName) {
  const match = collector.match(new RegExp(`const ${constantName} = Number\\(process\\.env\\.[A-Z0-9_]+ \\|\\| (\\d+)\\)`));
  assert.ok(match, `missing numeric default for ${constantName}`);
  return Number(match[1]);
}

test('Myrtle Beach CityHive inventory refresh stays inside the public freshness window', () => {
  assert.ok(defaultHours('SC_CITYHIVE_CACHE_MAX_AGE_MS') <= 6, 'SC CityHive cache must refresh at least every six hours');
  assert.equal(defaultNumber('SC_CITYHIVE_MAX_PAGES'), 1, 'one well-covered CityHive category page per merchant avoids request amplification');
});

test('Myrtle Beach live inventory remains a South Carolina release contract', () => {
  assert.match(refreshWorkflow, /states:[\s\S]*description: "Optional comma-separated state ids to refresh"/);
  assert.match(refreshWorkflow, /BOURBON_SIGNAL_RUN_STATES: \$\{\{ inputs\.states \|\| '' \}\}/);
  assert.match(collector, /id: 'beach-discount-beverages'[\s\S]*baseUrl: 'https:\/\/beachdiscountbeverages\.com'[\s\S]*https:\/\/beachdis0402bdcd\.sites\.cityhive\.app\/shop\/\?subtype=bourbon[\s\S]*merchantIds: \['6144e1c2085a5f20a622a15f'\]/);
  assert.match(collector, /id: 'greens-beverage'[\s\S]*https:\/\/greensbeb2c6efe1\.sites\.cityhive\.app\/shop\/\?subtype=bourbon/, "Green's should use the CityHive-hosted first-party storefront route that works from scheduled runners");
  assert.match(collector, /'61e1d04c823936166693c7f3'/, "Green's Myrtle Beach merchant must remain selected");
  assert.match(verifier, /Myrtle Beach inventory rows below threshold/);
  assert.match(verifier, /Myrtle Beach fresh inventory rows below threshold/);
  assert.match(verifier, /Myrtle Beach inventory store coverage too low/);
  assert.match(verifier, /Myrtle Beach exported drops below threshold/);
  assert.match(verifier, /Myrtle Beach exported store coverage too low/);
});
