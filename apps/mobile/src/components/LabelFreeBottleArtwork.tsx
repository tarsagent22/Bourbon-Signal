import type { LabelFreeShape } from './label-free-bottle-artwork';
import { LABEL_FREE_ARTWORK } from './label-free-artwork-assets';
import { BottleArtworkImage } from './BottleArtworkImage';

export function LabelFreeBottleArtwork({ shape, size = 'grid' }: {
  shape: LabelFreeShape; size?: 'grid' | 'list' | 'detail' | 'showcase' | 'feed';
}) {
  return <BottleArtworkImage source={LABEL_FREE_ARTWORK[shape]} size={size} />;
}
