export type DraftFields = Record<string, string | number | boolean | string[]>;
export interface DraftStore { getItemAsync(key: string): Promise<string | null>; setItemAsync(key: string, value: string): Promise<void>; deleteItemAsync(key: string): Promise<void> }
const writes = new Map<string, Promise<void>>();
export function draftKey(owner: string | null | undefined, form: string) {
  return owner && /^[\w-]+$/.test(owner) ? `bourbon-signal.draft.${form}.${owner}` : "";
}
export function parseDraft<T extends DraftFields>(raw: string | null, defaults: T): T | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    if (data.version !== 1 || !data.fields || typeof data.fields !== "object") return null;
    const result = { ...defaults };
    for (const key of Object.keys(defaults)) {
      const value = data.fields[key];
      const valid = Array.isArray(defaults[key])
        ? Array.isArray(value) && value.length <= 50 && value.every(item => typeof item === "string" && item.length <= 200)
        : typeof value === typeof defaults[key] && (typeof value !== "number" || Number.isFinite(value)) && (typeof value !== "string" || value.length <= 12000);
      if (!valid) return null;
      result[key as keyof T] = value;
    }
    return result;
  } catch { return null; }
}
// Serialize writes and deletion across mounts so an older pending save cannot resurrect a discarded draft.
export function writeDraft(store: DraftStore, key: string, fields: DraftFields | null) {
  if (!key) return Promise.resolve();
  const previous = writes.get(key) || Promise.resolve();
  const next = previous.catch(() => undefined).then(() => fields === null ? store.deleteItemAsync(key) : store.setItemAsync(key, JSON.stringify({ version: 1, fields })));
  writes.set(key, next);
  void next.finally(() => { if (writes.get(key) === next) writes.delete(key); }).catch(() => undefined);
  return next;
}
export async function readDraft<T extends DraftFields>(store: DraftStore, key: string, defaults: T) {
  if (!key) return null;
  await writes.get(key)?.catch(() => undefined);
  return parseDraft(await store.getItemAsync(key), defaults);
}
