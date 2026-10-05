export type CoverageStatus = 'requested' | 'on_radar' | 'improved' | 'closed';
export const coverageStatusLabels: Record<CoverageStatus, string> = { requested: 'Requested', on_radar: 'Under review', improved: 'Coverage improved', closed: 'Closed' };
export interface CoverageRequestItem {
  id: string; targetType: 'state' | 'city' | 'county' | 'store'; stateCode: string;
  areaLabel: string; canonicalTargetKey: string; storeName: string | null;
  status: CoverageStatus; requestedAt: string; updatedAt: string;
  memberUpdate?: string | null;
}
