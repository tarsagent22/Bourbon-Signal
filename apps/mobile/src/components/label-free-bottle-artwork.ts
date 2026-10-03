import type { CellarBottleIdentity } from './cellar-bottle-artwork';
import type { LABEL_FREE_ARTWORK } from './label-free-artwork-assets';
import { LABEL_FREE_PRODUCTS } from './label-free-artwork-catalog';
export { FIRST_BATCH_PRODUCTS, LABEL_FREE_PRODUCTS } from './label-free-artwork-catalog';

export type LabelFreeShape = keyof typeof LABEL_FREE_ARTWORK;

// Exact reviewed IDs and names only; lossy catalog aliases cannot select art.
function normalize(value?: string) {
  return (value || '').toLowerCase().replace(/['’.*]/g, '').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\be h taylor\b/g, 'eh taylor');
}
const byId = new Map(LABEL_FREE_PRODUCTS.map(product => [product.id, product]));
const byName = new Map(LABEL_FREE_PRODUCTS.flatMap(product =>
  [product.name, ...(product.names || [])].map(name => [normalize(name), product.shape] as const)));

export function resolveLabelFreeBottleArtwork(identity: CellarBottleIdentity): LabelFreeShape | undefined {
  const name = normalize(identity.bottleName);
  const product = identity.bottleId ? byId.get(identity.bottleId) : undefined;
  const namedShape = name ? byName.get(name) : undefined;
  // A present unsupported or conflicting name must never inherit a stale ID's art.
  if (name) return product && product.shape !== namedShape ? undefined : namedShape;
  // Canonical keys drop age/edition tokens; they cannot select artwork on their own.
  return product?.shape;
}

export function labelFreeArtworkCaption(identity: CellarBottleIdentity): string | undefined {
  const shape = resolveLabelFreeBottleArtwork(identity);
  if (!shape) return undefined;
  const product = identity.bottleName
    ? LABEL_FREE_PRODUCTS.find(item => [item.name, ...(item.names || [])].some(name => normalize(name) === normalize(identity.bottleName)))
    : identity.bottleId ? byId.get(identity.bottleId) : undefined;
  if (product?.presentation === 'collection') return 'Collection artwork · edition not specified';
  if (product?.presentation === 'representative') return 'Illustrative bottle · packaging not verified';
  return undefined;
}
