import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fingerprintName, normalizeBottleName } from './text.mjs';
import { libraryIdentityKey } from './library-catalog.mjs';

export class BourbonBible {
  constructor(records) {
    this.records = records;
    this.byKey = new Map();
    this.byNormalizedAlias = new Map();
    this.aliasIndex = [];
    this.byLibraryAlias = new Map();
    for (const record of records) {
      for (const bottle of record.libraryIdentities || []) {
        for (const alias of [bottle.canonicalName, ...bottle.aliases]) {
          const key = libraryIdentityKey(alias);
          if (this.byLibraryAlias.has(key) && this.byLibraryAlias.get(key) !== record) this.byLibraryAlias.set(key, null);
          else if (!this.byLibraryAlias.has(key)) this.byLibraryAlias.set(key, record);
        }
      }
      if (record.strictLibraryIdentity) continue;
      if (this.byKey.has(record.normalizedKey) && this.byKey.get(record.normalizedKey) !== record) this.byKey.set(record.normalizedKey, null);
      else if (!this.byKey.has(record.normalizedKey)) this.byKey.set(record.normalizedKey, record);
      for (const alias of [record.canonical, ...(record.aliases || [])]) {
        const normalizedAlias = normalizeBottleName(alias).toLowerCase().replace(/\s+/g, ' ').trim();
        if (normalizedAlias) {
          if (this.byNormalizedAlias.has(normalizedAlias) && this.byNormalizedAlias.get(normalizedAlias) !== record) this.byNormalizedAlias.set(normalizedAlias, null);
          else if (!this.byNormalizedAlias.has(normalizedAlias)) this.byNormalizedAlias.set(normalizedAlias, record);
        }
        const key = fingerprintName(alias);
        if (key) this.aliasIndex.push({ key, alias, record });
      }
    }
    this.aliasIndex.sort((a, b) => b.key.length - a.key.length);
    const libraryCanonicals = new Map();
    for (const record of records) for (const bottle of record.libraryIdentities || []) {
      const key = libraryIdentityKey(bottle.canonicalName);
      if (libraryCanonicals.has(key) && libraryCanonicals.get(key) !== record) libraryCanonicals.set(key, null);
      else if (!libraryCanonicals.has(key)) libraryCanonicals.set(key, record);
    }
    // A complete canonical expression outranks an alias borrowed by an older
    // family record. Conflicting canonical identities still fail closed.
    for (const [key, record] of libraryCanonicals) this.byLibraryAlias.set(key, record);
    this.byLibraryCanonical = libraryCanonicals;
  }

  static async load(file = path.resolve('out/bourbon-bible.json')) {
    const data = JSON.parse(await readFile(file, 'utf8'));
    return new BourbonBible(data.records || []);
  }

  match(rawName) {
    const normalized = normalizeBottleName(rawName);
    const normalizedAlias = normalized.toLowerCase().replace(/\s+/g, ' ').trim();
    const libraryKey = libraryIdentityKey(rawName);
    const exactAlias = this.byNormalizedAlias.get(normalizedAlias);
    if (exactAlias && !this.byLibraryCanonical.has(libraryKey)) return { record: exactAlias, confidence: 1, method: 'exact-normalized-alias' };
    if (this.byLibraryAlias.has(libraryKey)) {
      const record = this.byLibraryAlias.get(libraryKey);
      return record ? { record, confidence: 1, method: 'exact-library-identity' } : null;
    }
    if (this.byNormalizedAlias.has(normalizedAlias) && !exactAlias) return null;
    if (exactAlias) return { record: exactAlias, confidence: 1, method: 'exact-normalized-alias' };
    if (/\b(?:small batch|limited edition|single barrel|barrel proof|double oaked|straight bourbon)\b/iu.test(normalized)) return null;
    const key = fingerprintName(normalized);
    if (!key) return null;
    if (this.byKey.has(key)) return this.byKey.get(key) ? { record: this.byKey.get(key), confidence: 1, method: 'exact-key' } : null;

    let best = null;
    let ambiguous = false;
    for (const item of this.aliasIndex) {
      if (key.includes(item.key) || item.key.includes(key)) {
        const confidence = Math.min(item.key.length, key.length) / Math.max(item.key.length, key.length);
        if (!best || confidence > best.confidence) {
          best = { record: item.record, confidence, method: 'alias-containment' };
          ambiguous = false;
        } else if (confidence === best.confidence && item.record !== best.record) ambiguous = true;
      }
    }
    return !ambiguous && best && best.confidence >= 0.55 ? best : null;
  }

  scanText(text) {
    const haystack = String(text || '').toLowerCase();
    const found = new Map();
    for (const item of this.aliasIndex) {
      const alias = item.alias.toLowerCase();
      const normalizedAlias = normalizeBottleName(item.alias).toLowerCase().replace(/\s+/g, ' ').trim();
      if (this.byNormalizedAlias.get(normalizedAlias) == null) continue;
      if (alias.length < 5) continue;
      if (haystack.includes(alias)) found.set(item.record.id, item.record);
    }
    return [...found.values()];
  }
}
