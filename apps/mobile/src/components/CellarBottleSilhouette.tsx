import { LabelFreeBottleArtwork } from './LabelFreeBottleArtwork';

// Unreviewed entries get an original neutral bottle, never a guessed brand shape.
export function CellarBottleSilhouette({ size = 'grid' }: { size?: 'grid' | 'list' | 'detail' | 'showcase' | 'feed' }) {
  return <LabelFreeBottleArtwork shape="neutral" size={size} />;
}
