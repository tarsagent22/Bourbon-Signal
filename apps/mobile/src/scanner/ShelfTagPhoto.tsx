import type { RadarBottleOption } from '../api/types';

export interface ShelfTagPhotoProps {
  catalog: readonly RadarBottleOption[];
  onConfirm: (price: string, sizeMl: number, matches: RadarBottleOption[]) => void;
}

export const canReadShelfPhoto = false;
export function ShelfTagPhoto(_props: ShelfTagPhotoProps) { return null; }
