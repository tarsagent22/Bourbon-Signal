const baseUrl = process.env.DROP_FEED_BASE_URL || process.env.BASE_URL || 'http://127.0.0.1:3000';
const failures = [];

function fail(message) {
  failures.push(message);
}

async function getJson(path) {
  const url = new URL(path, baseUrl);
  const res = await fetch(url, { headers: { 'User-Agent': 'bourbon-signal-drop-feed-contract/1.0' } });
  if (!res.ok) throw new Error(`${url} returned HTTP ${res.status}`);
  return res.json();
}

function rarity(drop) {
  return String(drop.rarity_tier || drop.tier || '').toLowerCase();
}

const dropWorthyTiers = new Set(['unicorn', 'allocated', 'limited']);

const allStates = await getJson('/api/drops?state=all&limit=20');
if (!Array.isArray(allStates.drops) || allStates.drops.length === 0 || Number(allStates.total || 0) === 0) {
  fail('/api/drops?state=all should mean all covered states, not a literal ALL state filter.');
}

const defaultFeed = await getJson('/api/drops?limit=50');
const defaultBadTiers = (defaultFeed.drops || [])
  .map((drop) => rarity(drop))
  .filter((tier) => !dropWorthyTiers.has(tier));
if (defaultBadTiers.length > 0) {
  fail(`/api/drops default feed should not return standard/core/unknown bottles; saw tiers: ${Array.from(new Set(defaultBadTiers)).join(', ')}`);
}

const unicornFeed = await getJson('/api/drops?tier=unicorn&limit=7');
if (!Array.isArray(unicornFeed.drops) || unicornFeed.drops.length === 0 || Number(unicornFeed.total || 0) === 0) {
  fail('/api/drops?tier=unicorn should find unicorn drops beyond the first default preview page.');
} else {
  const nonUnicorn = unicornFeed.drops.filter((drop) => rarity(drop) !== 'unicorn');
  if (nonUnicorn.length > 0) {
    fail(`/api/drops?tier=unicorn should return only unicorn rows; saw ${nonUnicorn.map((drop) => rarity(drop) || 'missing').join(', ')}`);
  }
}

const mixedFeed = await getJson('/api/drops?tier=unicorn,allocated&limit=20');
const mixedTiers = new Set((mixedFeed.drops || []).map((drop) => rarity(drop)));
for (const tier of mixedTiers) {
  if (!['unicorn', 'allocated'].includes(tier)) fail(`/api/drops?tier=unicorn,allocated returned unexpected tier ${tier}.`);
}

if (failures.length) {
  console.error('Drop feed API contract failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Drop feed API contract passed.');
