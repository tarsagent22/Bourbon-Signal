import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { normalizeBottleName } from './text.mjs';
import { cityHiveUnsafeBottleMatchReason } from '../collectors/safe-bottle-match.mjs';

export const DROP_TIERS = new Set(['limited', 'allocated', 'highly_allocated', 'unicorn']);
export const isLibraryDetectionTarget = bottle => DROP_TIERS.has(bottle.nationalTier) || bottle.stateOverrides.some(override => DROP_TIERS.has(override.tier));
// Keep expression words, numbers, finishes and proof. The legacy fingerprint
// deliberately drops several of these and must never index new library entries.
export function libraryIdentityKey(value) {
  return normalizeBottleName(value).toLowerCase().replace(/&/g, ' and ')
    .replace(/\b(\d{1,2})\s*(?:years? old|years?|yrs?|y)\b/g, '$1 year')
    .replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function normalizeLibraryCatalog(payload) {
  const input = payload?.bottles || payload?.records;
  if (!Array.isArray(input) || !input.length || input.length > 20_000) throw new Error('Missing or invalid library catalog');
  const ids = new Set();
  return input.map(row => {
    if (typeof row.id !== 'string' || !row.id.trim() || ids.has(row.id)
      || typeof row.canonicalName !== 'string' || !libraryIdentityKey(row.canonicalName)
      || !Array.isArray(row.aliases) || row.aliases.some(alias => typeof alias !== 'string')
      || !['regular', ...DROP_TIERS].includes(row.nationalTier)
      || !Array.isArray(row.stateOverrides) || row.stateOverrides.some(o => !o || typeof o.jurisdiction !== 'string' || !['regular', ...DROP_TIERS].includes(o.tier))) {
      throw new Error(`Invalid or duplicate library identity: ${row?.id}`);
    }
    ids.add(row.id);
    return { id: row.id, canonicalName: row.canonicalName, aliases: [...new Set(row.aliases)].sort(), nationalTier: row.nationalTier,
      stateOverrides: row.stateOverrides.map(({ jurisdiction, tier }) => ({ jurisdiction, tier })),
      ...(typeof row.isAlertEligible === 'boolean' ? { isAlertEligible: row.isAlertEligible } : {}) };
  }).sort((a, b) => a.id.localeCompare(b.id));
}

export function catalogDigest(records) {
  return createHash('sha256').update(JSON.stringify(records)).digest('hex');
}

export async function readLibraryCatalog({ root, liveFile, nowMs = Date.now() }) {
  if (liveFile) {
    const snapshot = JSON.parse(await readFile(liveFile, 'utf8'));
    const records = normalizeLibraryCatalog(snapshot);
    const age = nowMs - Date.parse(snapshot.fetchedAt);
    if (snapshot.schemaVersion !== 1 || !Number.isFinite(age) || age < -60_000 || age > 3_600_000
      || snapshot.digest !== catalogDigest(records)) throw new Error('Library sync is stale or corrupt; refusing a partial production catalog');
    return { records, source: snapshot.source, fetchedAt: snapshot.fetchedAt, digest: snapshot.digest, mode: 'live' };
  }
  const records = normalizeLibraryCatalog(JSON.parse(await readFile(new URL('src/data/drop-feed-classification.generated.json', root), 'utf8')));
  return { records, source: 'src/data/drop-feed-classification.generated.json', fetchedAt: null, digest: catalogDigest(records), mode: 'static' };
}

export function integrateLibraryCatalog(legacy, catalog) {
  const records = legacy.map(row => ({ ...row, aliases: [...row.aliases] }));
  const canonicalIndex = new Map();
  const aliasIndex = new Map();
  const put = (index, key, record) => {
    if (!key) return;
    if (index.has(key) && index.get(key) !== record) index.set(key, null);
    else if (!index.has(key)) index.set(key, record);
  };
  for (const record of records) {
    put(canonicalIndex, libraryIdentityKey(record.canonical), record);
    for (const alias of [record.canonical, ...record.aliases]) put(aliasIndex, libraryIdentityKey(alias), record);
  }
  for (const bottle of catalog.records) {
    const key = libraryIdentityKey(bottle.canonicalName);
    // Canonical equality takes precedence over a broad legacy alias. Never use
    // containment or lossy fingerprints to merge distinct library expressions.
    let record = canonicalIndex.get(key) || aliasIndex.get(key);
    if (record && cityHiveUnsafeBottleMatchReason(bottle.canonicalName, record)) record = null;
    if (!record && !isLibraryDetectionTarget(bottle)) continue;
    if (!record) {
      record = { id: bottle.id, canonical: bottle.canonicalName, normalizedKey: `library:${bottle.id}`,
        aliases: [], tier: bottle.nationalTier === 'highly_allocated' ? 'unicorn' : bottle.nationalTier,
        producer: null, sources: ['app:library'], strictLibraryIdentity: true };
      if (records.some(row => row.id === record.id)) throw new Error(`Conflicting engine/library id ${record.id}`);
      records.push(record);
    }
    record.libraryIdentities ||= [];
    record.libraryIdentities.push(bottle);
    // New library aliases are consulted by the strict index only. They must
    // never change the legacy substring matcher or general page scanner.
  }
  return records;
}
