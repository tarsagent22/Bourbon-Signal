import type { Signal } from "../api/types";

const previews = new WeakMap<object, Map<string, { signal: Signal; savedAt: number }>>();
const lifetime = 5 * 60_000;

export function rememberReport(owner: object, signal: Signal) {
  const entries = previews.get(owner) || new Map();
  entries.delete(signal.id);
  entries.set(signal.id, { signal, savedAt: Date.now() });
  if (entries.size > 16) entries.delete(entries.keys().next().value!);
  previews.set(owner, entries);
}

export function readReportPreview(owner: object, id: string) {
  const entry = previews.get(owner)?.get(id);
  return entry && Date.now() - entry.savedAt < lifetime ? entry.signal : null;
}
