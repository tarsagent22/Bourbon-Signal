import type { CellarBottleIdentity } from './cellar-bottle-artwork';
import { CellarBottleSilhouette } from './CellarBottleSilhouette';
import { resolveLabelFreeBottleArtwork } from './label-free-bottle-artwork';
import { LabelFreeBottleArtwork } from './LabelFreeBottleArtwork';
import { Text, View } from 'react-native';
import { labelFreeArtworkCaption } from './label-free-bottle-artwork';

export function CellarBottleArtwork({ bottle, size = 'grid' }: {
  bottle: CellarBottleIdentity;
  size?: 'grid' | 'list' | 'detail' | 'showcase';
}) {
  const shape = resolveLabelFreeBottleArtwork(bottle);
  const caption = size === 'detail' ? labelFreeArtworkCaption(bottle) : undefined;
  if (shape && caption) return <View style={{ alignItems: 'center', width: 200 }}>
    <LabelFreeBottleArtwork shape={shape} size={size} />
    <Text style={{ color: '#A69D93', fontSize: 11, lineHeight: 15, textAlign: 'center', marginTop: 4 }}>{caption}</Text>
  </View>;
  if (shape) return <LabelFreeBottleArtwork shape={shape} size={size} />;
  return <CellarBottleSilhouette size={size} />;
}
