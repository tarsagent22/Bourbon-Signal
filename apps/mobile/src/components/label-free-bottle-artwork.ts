import type { CellarBottleIdentity } from './cellar-bottle-artwork';

export type LabelFreeShape = 'eagle' | 'taylor' | 'michters' | 'stagg' | 'blantons';

// Reviewed 750 ml shape families only. Names remain visible beside the artwork:
// shared geometry does not imply identical age, proof, or edition. Never expand
// from catalog aliases: Taylor's seed includes known cross-edition aliases.
export const LABEL_FREE_PRODUCTS: ReadonlyArray<Readonly<{
  id: string; name: string; shape: LabelFreeShape; names?: readonly string[];
}>> = [
  { id: 'eagle-rare-10', name: 'Eagle Rare 10 Year', shape: 'eagle', names: ['Eagle Rare 10', 'Eagle Rare 10Y', 'Eagle Rare 10 Yr'] },
  { id: 'eagle-rare-single-barrel-select', name: 'Eagle Rare Single Barrel Select', shape: 'eagle' },
  { id: 'eh-taylor-small-batch', name: 'E.H. Taylor Small Batch', shape: 'taylor', names: ['EH Taylor Small Batch', 'Colonel E.H. Taylor Small Batch', 'E.H. Taylor Jr. Small Batch', 'E.H. Taylor Jr. Small Batch .75L', 'Colonel E.H. Taylor Small Batch Bottled in Bond Bourbon', 'Colonel E.H. Taylor Small Batch Bottled in Bond'] },
  { id: 'eh-taylor-single-barrel', name: 'E.H. Taylor Single Barrel', shape: 'taylor', names: ['E.H. Taylor Jr. Single Barrel', 'E.H. Taylor Jr. Single Barrel Bourbon'] },
  { id: 'e-h-taylor-single-barrel-select', name: 'E.H. Taylor Single Barrel Select', shape: 'taylor' },
  { id: 'e-h-taylor-jr-straight-rye-whiskey', name: 'E.H. Taylor Jr. Straight Rye Whiskey', shape: 'taylor', names: ['E.H. Taylor Straight Rye', 'E.H. Taylor Rye'] },
  { id: 'michters-us-1-small-batch-bourbon', name: "Michter's US*1 Small Batch Bourbon", shape: 'michters', names: ["Michters US Small Batch", "Michter's US 1 Small Batch", "Michter's US*1 Small Batch"] },
  { id: 'bb_71e0a5ef723ea82c', name: "Michter's US 1 Straight Bourbon Small Batch", shape: 'michters' },
  { id: 'michter-us1-bourbon', name: "Michter's US*1 Bourbon", shape: 'michters' },
  { id: 'michters-us-1-rye-whiskey', name: "Michter's US*1 Rye Whiskey", shape: 'michters' },
  { id: 'michters-us-1-sour-mash-whiskey', name: "Michter's US*1 Sour Mash Whiskey", shape: 'michters' },
  { id: 'stagg', name: 'Stagg', shape: 'stagg', names: ['Stagg Jr', 'Stagg Junior', 'Stagg Bourbon', 'George T Stagg Jr'] },
  { id: 'stagg-26b', name: 'Stagg 26B', shape: 'stagg' },
  { id: 'stagg-single-barrel-select', name: 'Stagg Single Barrel Select', shape: 'stagg' },
  { id: 'blantons-single-barrel', name: "Blanton's Single Barrel", shape: 'blantons', names: ["Blanton's Original Single Barrel", 'Blantons', "Blanton's", 'Blanton'] },
  { id: 'blantons-single-barrel-select', name: "Blanton's Single Barrel Select", shape: 'blantons' },
];

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

