import registryData from '../../public/bottle-photos/registry.v1.json';
import { parsePhotoRegistry, photoUrl, resolveBottlePhoto, type BottlePhoto } from '../../apps/mobile/src/bottle-photos/registry';

// The public registry is the single photo map for catalog and native consumers.
// Never consult canonical_key or search aliases to infer an edition.
const registry = parsePhotoRegistry(registryData);
export type CatalogBottlePhoto = BottlePhoto & { url: string };
export function catalogBottlePhoto(bottle: { id: string; canonicalName: string }): CatalogBottlePhoto | undefined {
  const photo = resolveBottlePhoto(registry, { bottleId: bottle.id, bottleName: bottle.canonicalName });
  const url = photo && photoUrl(photo);
  return photo && url ? { ...photo, url } : undefined;
}
