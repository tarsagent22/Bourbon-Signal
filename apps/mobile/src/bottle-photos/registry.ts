// Shared wire contract and exact resolver. Server imports this module too; it has
// no native dependencies or bundled registry. New reviewed data needs only a web release.
export const PHOTO_ORIGIN = 'https://www.bourbonsignal.com';
export type BottlePhoto = Readonly<{
  catalogId: string;
  displayName: string;
  exactNames: readonly string[];
  sha256: string;
  width: 400;
  height: 600;
}>;
export type PhotoRegistry = Readonly<{ schemaVersion: 1; revision: string; entries: readonly BottlePhoto[] }>;
export type PhotoIdentity = { bottleId?: string; bottleName?: string; canonicalKey?: string };
export type CatalogIdentity = { id: string; name?: string; canonicalName?: string };
const HASH = /^[a-f0-9]{64}$/;
// Keep ages, decimal proofs, finish, punctuation and word order. This is not
// catalog search normalization. The sole 10Y alias is reviewed publication data.
const exact = (value: string) => value.trim().replace(/\s+/g, ' ').replace(/’/g, "'").toLowerCase();
const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const keys = (value: Record<string, unknown>, allowed: string[]) => Object.keys(value).length === allowed.length && Object.keys(value).every(k => allowed.includes(k));
const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 240 && value === value.trim() && !/[\x00-\x1f]/.test(value);

export function parsePhotoRegistry(value: unknown): PhotoRegistry | undefined {
  if (!record(value) || !keys(value, ['schemaVersion', 'revision', 'entries']) || value.schemaVersion !== 1
    || typeof value.revision !== 'string' || !HASH.test(value.revision) || !Array.isArray(value.entries)
    || value.entries.length > 5000) return undefined;
  const ids = new Set<string>();
  for (const row of value.entries) {
    if (!record(row) || !keys(row, ['catalogId', 'displayName', 'exactNames', 'sha256', 'width', 'height'])
      || !text(row.catalogId) || !/^[a-zA-Z0-9_-]+$/.test(row.catalogId) || ids.has(row.catalogId)
      || !text(row.displayName) || !Array.isArray(row.exactNames) || !row.exactNames.length || row.exactNames.length > 20
      || !row.exactNames.every(text) || !row.exactNames.includes(row.displayName)
      || typeof row.sha256 !== 'string' || !HASH.test(row.sha256) || row.width !== 400 || row.height !== 600) return undefined;
    ids.add(row.catalogId);
  }
  return value as unknown as PhotoRegistry;
}

export function photoUrl(photo: BottlePhoto): string | undefined {
  return HASH.test(photo.sha256) ? `${PHOTO_ORIGIN}/bottle-photos/${photo.sha256}.png` : undefined;
}

function namedRows(registry: PhotoRegistry, name: string) {
  return registry.entries.filter(row => row.exactNames.some(n => exact(n) === exact(name)));
}

export function photoIdentityConflicts(registry: PhotoRegistry | undefined, identity: PhotoIdentity, catalog: readonly CatalogIdentity[] = []): boolean {
  if (registry && identity.bottleName && new Set(namedRows(registry, identity.bottleName).map(row => row.sha256)).size > 1) return true;
  if (!identity.bottleId || !identity.bottleName) return false;
  const id = identity.bottleId;
  const name = identity.bottleName;
  const byId = registry?.entries.find(row => row.catalogId === id || `bible-${row.catalogId}` === id);
  if (byId && !byId.exactNames.some(n => exact(n) === exact(name))) return true;
  // Saved `bible-` is an explicit legacy namespace, not a fuzzy identifier repair.
  // Do not import catalog alias arrays: they contain known edition collisions.
  const known = catalog.filter(row => row.id === id || `bible-${row.id}` === id);
  return known.some(row => {
    const knownName = row.name ?? row.canonicalName ?? '';
    if (exact(knownName) === exact(name)) return false;
    const approved = registry && namedRows(registry, knownName);
    return !approved?.some(photo => photo.exactNames.some(n => exact(n) === exact(name)));
  });
}

export function resolveBottlePhoto(registry: PhotoRegistry | undefined, identity: PhotoIdentity, catalog: readonly CatalogIdentity[] = []): BottlePhoto | undefined {
  if (!registry || photoIdentityConflicts(registry, identity, catalog)) return undefined;
  const byId = registry.entries.find(row => row.catalogId === identity.bottleId);
  if (identity.bottleName) {
    const rows = namedRows(registry, identity.bottleName);
    if (!rows.length || new Set(rows.map(row => row.sha256)).size !== 1) return undefined;
    if (byId && !rows.includes(byId)) return undefined;
    return byId ?? rows[0];
  }
  // canonicalKey is deliberately never consulted: server keys discard edition.
  return byId;
}
