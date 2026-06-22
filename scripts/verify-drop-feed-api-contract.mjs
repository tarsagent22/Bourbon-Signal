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

function normalizedName(drop) {
  return String(drop.rawName || drop.raw_name || drop.bottleName || drop.brand_name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function looksLikeFalseFourRosesRare(drop) {
  const name = normalizedName(drop);
  return /\bfour roses\b/.test(name)
    && /\b(small batch|small batch select|single barrel)\b/.test(name)
    && !/\b(limited edition|limited release|le|barrel strength|cask strength|private selection|private barrel|single barrel select|oes[foqkv]|obs[foqkv])\b/.test(name);
}

const dropWorthyTiers = new Set(['unicorn', 'allocated', 'limited']);

const allStates = await getJson('/api/drops?state=all&limit=20');
if (!Array.isArray(allStates.drops) || allStates.drops.length === 0 || Number(allStates.total || 0) === 0) {
  fail('/api/drops?state=all should mean all covered states, not a literal ALL state filter.');
}

const wilkesboroBoard = await getJson('/api/drops?state=NC&store=Wilkesboro%20ABC&limit=20');
const wilkesboroHenry = (wilkesboroBoard.drops || []).find((drop) => /henry\s+mckenna/i.test(`${drop.bottleName || ''} ${drop.canonicalName || ''} ${drop.rawName || ''}`));
if (!wilkesboroHenry) {
  fail('/api/drops?state=NC&store=Wilkesboro%20ABC should treat the NC area label as a board query and include Henry McKenna when present.');
}

const wilkesboroCounty = await getJson('/api/drops?state=NC&store=Wilkesboro%20County&bottle=Henry%20McKenna&limit=20');
if (Number(wilkesboroCounty.total || 0) === 0) {
  fail('/api/drops should not exclude a valuable NC board signal when the same area is expressed as county text instead of ABC board text.');
}

const marylandAlias = await getJson('/api/drops?state=MD&limit=1');
const marylandInternal = await getJson('/api/drops?state=MD-MONTGOMERY&limit=1');
if (Number(marylandAlias.total || 0) !== Number(marylandInternal.total || 0)) {
  fail('/api/drops?state=MD should resolve to Maryland coverage instead of requiring MD-MONTGOMERY in public URLs.');
}

const defaultFeed = await getJson('/api/drops?limit=50');
const defaultBadTiers = (defaultFeed.drops || [])
  .map((drop) => rarity(drop))
  .filter((tier) => !dropWorthyTiers.has(tier));
if (defaultBadTiers.length > 0) {
  fail(`/api/drops default feed should not return standard/core/unknown bottles; saw tiers: ${Array.from(new Set(defaultBadTiers)).join(', ')}`);
}
const defaultFalseRare = (defaultFeed.drops || []).filter(looksLikeFalseFourRosesRare);
if (defaultFalseRare.length > 0) {
  fail('/api/drops default feed should not show standard Four Roses rows as rare drops.');
}

const unicornFeed = await getJson('/api/drops?tier=unicorn&limit=7');
if (!Array.isArray(unicornFeed.drops) || unicornFeed.drops.length === 0 || Number(unicornFeed.total || 0) === 0) {
  fail('/api/drops?tier=unicorn should find unicorn drops beyond the first default preview page.');
} else {
  const nonUnicorn = unicornFeed.drops.filter((drop) => rarity(drop) !== 'unicorn');
  if (nonUnicorn.length > 0) {
    fail(`/api/drops?tier=unicorn should return only unicorn rows; saw ${nonUnicorn.map((drop) => rarity(drop) || 'missing').join(', ')}`);
  }
  const falseRareRows = unicornFeed.drops.filter(looksLikeFalseFourRosesRare);
  if (falseRareRows.length > 0) {
    fail('/api/drops?tier=unicorn should not return regular Four Roses Small Batch/Single Barrel rows caused by broad bible matching.');
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
