import type { RadarBottleOption } from '../api/types';
export interface ScannerProps {
  active: boolean;
  catalog: readonly RadarBottleOption[];
  onMatches: (matches: RadarBottleOption[]) => void;
  /** Resume analysis without tearing down and warming up the native camera. */
  session?: number;
  onMetrics?: (metrics: import('./live-label-session').ScanMetrics) => void;
}
