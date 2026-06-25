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

const hourMs = 60 * 60 * 1000;
const dayMs = 24 * hourMs;
const maxInventoryAgeMs = 72 * hourMs;
const maxDeliveryAgeMs = 14 * dayMs;

function dropTime(drop) {
  const value = drop.last_confirmed_at || drop.lastConfirmedAt || drop.timestamp || drop.displayAt || drop.observed_at || drop.observedAt;
  const time = Date.parse(value || '');
  return Number.isFinite(time) ? time : NaN;
}

function maxPublicAgeMs(drop) {
  const type = String(drop.event_type || drop.type || '').toLowerCase();
  const category = String(drop.signal_category || drop.signalCategory || '').toLowerCase();
  const scope = String(drop.availability_scope || drop.availabilityScope || '').toLowerCase();
  const precision = String(drop.location_precision || drop.locationPrecision || '').toLowerCase();
  const canAlert = drop.can_alert_as_inventory === true || drop.canAlertAsInventory === true;
  if (canAlert || category === 'inventory' || scope === 'store_reported' || precision === 'store_level' || type.includes('in_stock') || type.includes('inventory_result')) return maxInventoryAgeMs;
  if (category === 'delivery' || type.includes('shipment') || type.includes('delivery') || type.includes('allocation_snapshot')) return maxDeliveryAgeMs;
  return 30 * dayMs;
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
if (defaultFeed.engineFresh === false) {
  fail('/api/drops default feed should not surface normal cards when the checked-in engine export is stale.');
}
if (!defaultFeed.lastUpdated || !Number.isFinite(Date.parse(defaultFeed.lastUpdated))) {
  fail('/api/drops should report a real engine/export timestamp instead of inventing current freshness.');
}
if (Array.isArray(defaultFeed.degradedStatesFiltered) && defaultFeed.degradedStatesFiltered.length > 0) {
  fail(`/api/drops should be backed by a healthy engine export; degraded states filtered: ${defaultFeed.degradedStatesFiltered.join(', ')}`);
}
const staleDrops = (defaultFeed.drops || []).filter((drop) => {
  const time = dropTime(drop);
  return !Number.isFinite(time) || Date.now() - time > maxPublicAgeMs(drop) || time > Date.now() + 15 * 60 * 1000;
});
if (staleDrops.length > 0) {
  fail(`/api/drops default feed should not portray stale/undated signals as fresh; saw ${staleDrops.length} stale rows.`);
}
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
const defaultBottleKeys = (defaultFeed.drops || [])
  .map((drop) => String(drop.canonicalId || drop.canonical_id || drop.bottleName || drop.rawName || '').toLowerCase())
  .filter(Boolean);
const uniqueDefaultBottleKeys = new Set(defaultBottleKeys);
if (defaultBottleKeys.length >= 7 && uniqueDefaultBottleKeys.size < 5) {
  fail(`/api/drops default preview should be diversified across bottles; saw only ${uniqueDefaultBottleKeys.size} unique bottles in ${defaultBottleKeys.length} cards.`);
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
