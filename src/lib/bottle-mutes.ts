export interface MutedBottle { bottleId?: string; bottleName: string }
export interface BottleMuteState { bottles: MutedBottle[]; version: number }
export interface BottleMuteMutation { bottleId?: string; bottleName: string; muted: boolean }
export interface MuteCatalogBottle { id: string; canonicalName: string; aliases?: string[] }
export const muteBottleKey = (value: string) => value.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
export class BottleMuteError extends Error {
  constructor(public code: string, public status: number, message: string) { super(message); }
}
export function normalizeBottleMutes(value: unknown): BottleMuteState {
  const source = object(value);
  const bottles = (Array.isArray(source.bottles) ? source.bottles : []).map(object)
    .filter(b => typeof b.bottleName === "string" && muteBottleKey(b.bottleName))
    .map(b => ({ bottleName: String(b.bottleName), ...(typeof b.bottleId === "string" && b.bottleId ? { bottleId: b.bottleId } : {}) }));
  return { bottles, version: Number.isSafeInteger(source.version) && Number(source.version) >= 0 ? Number(source.version) : 0 };
}
export function applyBottleMuteMutation(current: BottleMuteState, value: unknown, catalog: MuteCatalogBottle[]): BottleMuteState {
  const m = object(value);
  if (typeof m.bottleName !== "string" || !muteBottleKey(m.bottleName) || m.bottleName.length > 200 || typeof m.muted !== "boolean" || (m.bottleId !== undefined && (typeof m.bottleId !== "string" || !m.bottleId || m.bottleId.length > 200))) {
    throw new BottleMuteError("invalid_bottle_mute", 400, "Choose a bottle and whether its alerts are muted.");
  }
  const name = m.bottleName.trim();
  const matches = catalog.filter(b => m.bottleId ? b.id === m.bottleId : [b.canonicalName, ...(b.aliases || [])].some(n => muteBottleKey(n) === muteBottleKey(name)));
  if (m.bottleId && !matches.length && !current.bottles.some(b => b.bottleId === m.bottleId && !m.muted)) throw new BottleMuteError("unknown_mute_bottle", 400, "This bottle is no longer in the catalog. Refresh and try again.");
  const bottle = matches.length === 1 ? { bottleId: matches[0].id, bottleName: matches[0].canonicalName } : { bottleName: name, ...(typeof m.bottleId === "string" ? { bottleId: m.bottleId } : {}) };
  const same = (b: MutedBottle) => bottle.bottleId && b.bottleId ? bottle.bottleId === b.bottleId : muteBottleKey(b.bottleName) === muteBottleKey(bottle.bottleName);
  const remaining = current.bottles.filter(b => !same(b));
  const bottles = m.muted ? [...remaining, bottle] : remaining;
  if (bottles.length > 100 && bottles.length > current.bottles.length) throw new BottleMuteError("muted_bottle_limit", 400, "You can mute up to 100 bottles. Allow alerts for one before adding another.");
  const changed = JSON.stringify(current.bottles) !== JSON.stringify(bottles);
  if (changed && current.version === Number.MAX_SAFE_INTEGER) throw new BottleMuteError("mute_storage_unavailable", 503, "Bottle preferences are temporarily unavailable.");
  return { bottles, version: current.version + (changed ? 1 : 0) };
}
// Exact identities and exact aliases only: a mute must never swallow a different expression.
export function createBottleMuteMatcher(state: BottleMuteState, catalog: MuteCatalogBottle[]) {
  if (!state.bottles.length) return (_candidate: Record<string, unknown>) => false;
  const ids = new Set(state.bottles.map(b => b.bottleId).filter(Boolean));
  const names = new Set<string>();
  const byId = new Map(catalog.map(b => [b.id, b]));
  const canonicalIds = new Map(catalog.map(b => [muteBottleKey(b.canonicalName), b.id]));
  const aliasOwners = new Map<string, Set<string>>();
  for (const b of catalog) for (const name of [b.canonicalName, ...(b.aliases || [])]) {
    const key = muteBottleKey(name);
    if (!aliasOwners.has(key)) aliasOwners.set(key, new Set());
    aliasOwners.get(key)!.add(b.id);
  }
  for (const muted of state.bottles) {
    names.add(muteBottleKey(muted.bottleName));
    const id = muted.bottleId || canonicalIds.get(muteBottleKey(muted.bottleName));
    const bottle = id ? byId.get(id) : undefined;
    if (bottle) {
      ids.add(bottle.id);
      for (const name of [bottle.canonicalName, ...(bottle.aliases || [])]) if (aliasOwners.get(muteBottleKey(name))?.size === 1) names.add(muteBottleKey(name));
    }
  }
  return (candidate: Record<string, unknown>) => {
    const id = typeof candidate.bottleId === "string" ? candidate.bottleId : typeof candidate.bottle_id === "string" ? candidate.bottle_id : "";
    if (id && ids.has(id)) return true;
    if (id && byId.has(id)) return false;
    const name = muteBottleKey(String(candidate.canonicalName || candidate.bottle || candidate.rawName || ""));
    const knownId = canonicalIds.get(name);
    if (knownId) return ids.has(knownId);
    return names.has(name);
  };
}
