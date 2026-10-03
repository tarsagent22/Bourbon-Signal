import type { CellarBottleIdentity } from './cellar-bottle-artwork';
import { CellarBottleSilhouette } from './CellarBottleSilhouette';
import { resolveLabelFreeBottleArtwork } from './label-free-bottle-artwork';
import { LabelFreeBottleArtwork } from './LabelFreeBottleArtwork';

export function CellarBottleArtwork({ bottle, size = 'grid' }: {
  bottle: CellarBottleIdentity;
  size?: 'grid' | 'list' | 'detail' | 'showcase';
}) {
  const shape = resolveLabelFreeBottleArtwork(bottle);
  if (shape) return <LabelFreeBottleArtwork shape={shape} size={size} />;
  return <CellarBottleSilhouette size={size} />;
}
