import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fingerprintName, normalizeBottleName } from './text.mjs';

export class BourbonBible {
  constructor(records) {
    this.records = records;
    this.byKey = new Map();
    this.aliasIndex = [];
    for (const record of records) {
      this.byKey.set(record.normalizedKey, record);
      for (const alias of [record.canonical, ...(record.aliases || [])]) {
        const key = fingerprintName(alias);
        if (key) this.aliasIndex.push({ key, alias, record });
      }
    }
    this.aliasIndex.sort((a, b) => b.key.length - a.key.length);
  }

  static async load(file = path.resolve('out/bourbon-bible.json')) {
    const data = JSON.parse(await readFile(file, 'utf8'));
    return new BourbonBible(data.records || []);
  }

  match(rawName) {
    const normalized = normalizeBottleName(rawName);
    const key = fingerprintName(normalized);
    if (!key) return null;
    if (this.byKey.has(key)) return { record: this.byKey.get(key), confidence: 1, method: 'exact-key' };

    let best = null;
    for (const item of this.aliasIndex) {
      if (key.includes(item.key) || item.key.includes(key)) {
        const confidence = Math.min(item.key.length, key.length) / Math.max(item.key.length, key.length);
        if (!best || confidence > best.confidence) best = { record: item.record, confidence, method: 'alias-containment' };
      }
    }
    return best && best.confidence >= 0.55 ? best : null;
  }

  scanText(text) {
    const haystack = String(text || '').toLowerCase();
    const found = new Map();
    for (const item of this.aliasIndex) {
      const alias = item.alias.toLowerCase();
      if (alias.length < 5) continue;
      if (haystack.includes(alias)) found.set(item.record.id, item.record);
    }
    return [...found.values()];
  }
}
