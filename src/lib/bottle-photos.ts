import registryData from '../../public/bottle-photos/registry.v1.json';
import { PHOTO_ORIGIN, parsePhotoRegistry, photoUrl, resolveBottlePhoto, type BottlePhoto } from '../../apps/mobile/src/bottle-photos/registry';
import { resolveLabeledBottleArtwork } from '../../shared/labeled-bottle-artwork';

// Labeled illustrations take priority over the historical photo registry.
// Both use exact identities, never canonical keys or search aliases.
const registry = parsePhotoRegistry(registryData);
export type CatalogBottlePhoto = BottlePhoto & { url: string };
export function catalogBottlePhoto(bottle: { id: string; canonicalName: string }): CatalogBottlePhoto | undefined {
  const labeled = resolveLabeledBottleArtwork({bottleId:bottle.id, bottleName:bottle.canonicalName});
  if (labeled) return { ...labeled, url: `${PHOTO_ORIGIN}/bottle-artwork/${labeled.sha256}.png` };
  const photo = resolveBottlePhoto(registry, { bottleId: bottle.id, bottleName: bottle.canonicalName });
  const url = photo && photoUrl(photo);
  return photo && url ? { ...photo, url } : undefined;
}
