export interface MemberSightingBoundary {
  createdAt: string;
  id: string;
}

export function canUseMemberSightingBoundary(
  feedPreviewLimit: number | null,
  boundary: MemberSightingBoundary | null,
) {
  return boundary === null || feedPreviewLimit === null;
}
