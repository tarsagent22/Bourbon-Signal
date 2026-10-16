import data from './labeled-bottle-artwork-registry.json';
import captions from './labeled-bottle-artwork-captions.json';
import { parsePhotoRegistry, resolveBottlePhoto, type PhotoIdentity, type CatalogIdentity } from '../apps/mobile/src/bottle-photos/registry';

// Labeled illustrations are edition-specific. Never inherit the old shape map:
// Small Batch, Single Barrel and Rye may share glass, but not their labels.
export const LABELED_BOTTLE_ARTWORK = parsePhotoRegistry(data)!;
if (!LABELED_BOTTLE_ARTWORK) throw new Error('Invalid labeled bottle artwork registry');

export function resolveLabeledBottleArtwork(identity: PhotoIdentity, catalog: readonly CatalogIdentity[] = []) {
  const bottleId = identity.bottleId?.replace(/^bible-/, '');
  return resolveBottlePhoto(LABELED_BOTTLE_ARTWORK, {...identity, bottleId}, catalog);
}

export function labeledArtworkCaption(catalogId: string): string | undefined {
  return (captions as Record<string, string>)[catalogId];
}
