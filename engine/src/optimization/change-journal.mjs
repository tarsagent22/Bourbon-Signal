import { createHash } from 'node:crypto';

const DEFAULT_NOVELTY_FIELDS = ['state', 'bottleId', 'canonicalName', 'eventType', 'sourceLabel', 'sourceUrl', 'locationPrecision', 'board', 'county', 'city', 'storeId', 'storeName', 'availabilityStatus', 'price'];

function stableObject(value) {
  return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
}

export function signalNoveltyKey(signal, fields = DEFAULT_NOVELTY_FIELDS) {
  const identity = stableObject(Object.fromEntries(fields.map((field) => [field, signal[field] ?? null])));
  return createHash('sha256').update(JSON.stringify(identity)).digest('hex').slice(0, 24);
}

export function appendChangeJournal(existing = [], signals = [], options = {}) {
  const entries = structuredClone(Array.isArray(existing) ? existing : existing.entries || []);
  const byKey = new Map(entries.map((entry) => [entry.noveltyKey, entry]));
  const recordedAt = options.recordedAt || new Date().toISOString();
  for (const signal of signals) {
    const noveltyKey = signalNoveltyKey(signal, options.noveltyFields);
    const found = byKey.get(noveltyKey);
    if (found) {
      found.lastSeenAt = signal.observedAt || recordedAt;
      found.occurrences = Number(found.occurrences || 1) + 1;
      found.latest = structuredClone(signal);
    } else {
      const entry = { noveltyKey, firstSeenAt: signal.observedAt || recordedAt, lastSeenAt: signal.observedAt || recordedAt, occurrences: 1, latest: structuredClone(signal) };
      entries.push(entry);
      byKey.set(noveltyKey, entry);
    }
  }
  return { generatedAt: recordedAt, entryCount: entries.length, entries };
}
