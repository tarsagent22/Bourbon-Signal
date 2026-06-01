import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fingerprintName, normalizeBottleName, stableId, titleCase } from './core/text.mjs';

const ROOT = path.resolve('..');
const OUT = path.resolve('out');

async function readJson(file, fallback) {
  try { return JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, '')); } catch { return fallback; }
}

function extractSiteBottleNames(source) {
  const names = [];
  const re = /name:\s*["'`]([^"'`]+)["'`]/g;
  let match;
  while ((match = re.exec(source))) names.push(match[1]);
  return names;
}

function addRecord(records, rawName, meta = {}) {
  const normalized = normalizeBottleName(rawName);
  if (!normalized || normalized.length < 3) return;
  const key = fingerprintName(normalized) || normalized.toLowerCase();
  if (!key || key.length < 2) return;

  const aliasKeys = [normalized, ...(meta.aliases || [])]
    .map((alias) => fingerprintName(alias) || normalizeBottleName(alias).toLowerCase())
    .filter((aliasKey) => aliasKey && aliasKey.length >= 2);
  const existingKey = [key, ...aliasKeys].find((candidate) => records.has(candidate));
  const existing = existingKey ? records.get(existingKey) : null;
  if (existing) {
    existing.aliases = [...new Set([...existing.aliases, normalized, ...(meta.aliases || [])])].sort();
    existing.sources = [...new Set([...existing.sources, ...(meta.sources || [])])];
    if (meta.tier && existing.tier === 'unknown') existing.tier = meta.tier;
    if (meta.producer && !existing.producer) existing.producer = meta.producer;
    for (const aliasKey of aliasKeys) records.set(aliasKey, existing);
    return;
  }
  const record = {
    id: `bb_${stableId([key])}`,
    canonical: meta.canonical || titleCase(normalized),
    normalizedKey: key,
    aliases: [...new Set([normalized, ...(meta.aliases || [])])].sort(),
    tier: meta.tier || 'unknown',
    producer: meta.producer || null,
    sources: [...new Set(meta.sources || [])]
  };
  records.set(key, record);
  for (const aliasKey of aliasKeys) records.set(aliasKey, record);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const records = new Map();
  const seedFiles = [
    { file: path.resolve('data/bourbon-bible-seed.json'), source: 'seed' },
    { file: path.resolve('data/bourbon-bible-additions.json'), source: 'state-data-additions' }
  ];
  const verifiedAliasNotes = [];
  for (const seedFile of seedFiles) {
    const seed = await readJson(seedFile.file, { families: [], verifiedAliasNotes: [] });
    verifiedAliasNotes.push(...(seed.verifiedAliasNotes || []));
    for (const family of seed.families || []) {
      addRecord(records, family.canonical, {
        canonical: family.canonical,
        aliases: family.aliases || [],
        tier: family.tier,
        producer: family.producer,
        sources: [seedFile.source, ...(family.sourceStates || []).map((s) => `state:${s}`)]
      });
    }
  }

  try {
    const bottlesTs = await readFile(path.join(ROOT, 'src/data/bottles.ts'), 'utf8');
    for (const name of extractSiteBottleNames(bottlesTs)) addRecord(records, name, { sources: ['site:bottles.ts'] });
  } catch {}

  try {
    const oldDrops = await readJson(path.join(ROOT, 'src/data/drops.json'), { drops: [] });
    for (const drop of oldDrops.drops || []) addRecord(records, drop.tracked_brand_name || drop.brand_name, { sources: ['site:old-drops'] });
  } catch {}

  const uniqueRecords = [...new Map([...records.values()].map((record) => [record.id, record])).values()];
  const bible = {
    generatedAt: new Date().toISOString(),
    count: uniqueRecords.length,
    verifiedAliasNotes,
    records: uniqueRecords.sort((a, b) => a.canonical.localeCompare(b.canonical))
  };
  await writeFile(path.join(OUT, 'bourbon-bible.json'), JSON.stringify(bible, null, 2));
  console.log(`Built bourbon bible with ${bible.count} canonical records.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
