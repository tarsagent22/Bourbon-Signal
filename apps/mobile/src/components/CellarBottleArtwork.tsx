import type { CellarBottleIdentity } from './cellar-bottle-artwork';
import { CellarBottleSilhouette } from './CellarBottleSilhouette';
import { resolveLabelFreeBottleArtwork } from './label-free-bottle-artwork';
import { LabelFreeBottleArtwork } from './LabelFreeBottleArtwork';
import { Image, Text, View } from 'react-native';
import { useEffect, useState } from 'react';
import { labelFreeArtworkCaption } from './label-free-bottle-artwork';

export function CellarBottleArtwork({ bottle, size = 'grid' }: {
  bottle: CellarBottleIdentity;
  size?: 'grid' | 'list' | 'detail' | 'showcase' | 'feed';
}) {
  const shape = resolveLabelFreeBottleArtwork(bottle);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [bottle.bottleId]);
  if (!shape && bottle.bottleId?.startsWith('owner-') && !failed) {
    const width = size === 'detail' ? 180 : size === 'feed' ? 64 : size === 'showcase' ? 88 : size === 'grid' ? 80 : 44;
    const height = size === 'detail' ? 270 : size === 'feed' ? 102 : size === 'showcase' ? 148 : size === 'grid' ? 116 : 62;
    return <Image source={{uri:`${(process.env.EXPO_PUBLIC_API_URL || 'https://www.bourbonsignal.com').replace(/\/$/, '')}/api/v1/bottle-artwork/${encodeURIComponent(bottle.bottleId)}`}} style={{width,height}} resizeMode="contain" accessibilityLabel={`Bottle illustration for ${bottle.bottleName || 'this bottle'}`} onError={() => setFailed(true)} />;
  }
  const caption = size === 'detail' ? labelFreeArtworkCaption(bottle) : undefined;
  if (shape && caption) return <View style={{ alignItems: 'center', width: 200 }}>
    <LabelFreeBottleArtwork shape={shape} size={size} />
    <Text style={{ color: '#A69D93', fontSize: 11, lineHeight: 15, textAlign: 'center', marginTop: 4 }}>{caption}</Text>
  </View>;
  if (shape) return <LabelFreeBottleArtwork shape={shape} size={size} />;
  return <CellarBottleSilhouette size={size} />;
}
