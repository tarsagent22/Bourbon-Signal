import type { RadarBottleOption } from '../api/types';
export interface ScannerProps {
  active: boolean;
  catalog: readonly RadarBottleOption[];
  onMatches: (matches: RadarBottleOption[]) => void;
}
