import { BottleArtworkImage } from './BottleArtworkImage';

// Unreviewed entries get an original neutral bottle, never a guessed brand shape.
export function CellarBottleSilhouette({ size = 'grid' }: { size?: 'grid' | 'list' | 'detail' | 'showcase' | 'feed' }) {
  return <BottleArtworkImage source={require('../../assets/bottles/neutral-labeled.png')} size={size} />;
}
