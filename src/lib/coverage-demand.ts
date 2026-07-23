import type { CoverageCapability, CoverageContract, CoverageHealth } from "./coverage-model.ts";
import type { CoverageRequestStatus } from "./coverage-request.ts";
import type { OwnerCoverageRequestRow } from "./coverage-request-repository.ts";

export type CoverageDemandMemberSegment = "paid" | "free" | "unknown";

export interface CoverageDemandTarget {
  targetType: "state" | "city" | "store";
  stateCode: string;
  label: string;
  uniqueRequesters: number;
  paidRequesters: number;
  freeRequesters: number;
  unknownRequesterMix: number;
  currentCapability: CoverageCapability;
  currentCapabilityLabel: string;
  currentHealth: CoverageHealth;
  currentHealthLabel: string;
  gap: string;
  statuses: Record<CoverageRequestStatus, number>;
  oldestRequestedAt: string;
  latestUpdatedAt: string;
}

export interface CoverageDemandSummary {
  totalOpenRequests: number;
  uniqueRequesters: number;
  targets: CoverageDemandTarget[];
}

function gapForTarget(
  targetType: CoverageDemandTarget["targetType"],
  capability: CoverageCapability,
) {
  if (targetType === "store") {
    return capability === "not-active"
      ? "No active state source; exact-store monitoring remains a gap."
      : "Exact-store monitoring for this requested location still needs review.";
  }
  if (targetType === "city") {
    return capability === "not-active"
      ? "No active state source; this city or area remains uncovered."
      : "City or area depth is not established by the current state capability alone.";
  }
  if (capability === "not-active") return "No current customer-facing state source.";
  if (capability === "deep") return "Broader state depth was requested despite current deep source coverage.";
  return "Broader state capability remains requested.";
}

const WEAKNESS_WEIGHT: Record<CoverageCapability, number> = {
  "not-active": 5,
  intelligence: 4,
  focused: 3,
  active: 2,
  deep: 1,
};

export function buildCoverageDemandSummary(args: {
  requests: readonly OwnerCoverageRequestRow[];
  memberSegments: Readonly<Record<string, CoverageDemandMemberSegment>>;
  coverage: CoverageContract;
}): CoverageDemandSummary {
  const openRequests = args.requests.filter((request) => request.status === "requested" || request.status === "on_radar");
  const globalRequesters = new Set(openRequests.map((request) => request.userId));
  const grouped = new Map<string, OwnerCoverageRequestRow[]>();
  for (const request of openRequests) {
    const group = grouped.get(request.canonicalTargetKey) || [];
    group.push(request);
    grouped.set(request.canonicalTargetKey, group);
  }

  const targets = [...grouped.values()].map((requests): CoverageDemandTarget & { sortWeight: number } => {
    const first = requests[0];
    const state = args.coverage.states.find((entry) => entry.code === first.stateCode);
    const capability = state?.capability || "not-active";
    const health = state?.health || "no-recent-update";
    const requesterSegments = new Map<string, CoverageDemandMemberSegment>();
    for (const request of requests) {
      requesterSegments.set(request.userId, args.memberSegments[request.userId] || "unknown");
    }
    const segments = [...requesterSegments.values()];
    const statuses: Record<CoverageRequestStatus, number> = {
      requested: 0,
      on_radar: 0,
      improved: 0,
      closed: 0,
    };
    for (const request of requests) statuses[request.status] += 1;
    const label = first.targetType === "store"
      ? first.storeName || first.areaLabel
      : first.areaLabel || state?.name || first.stateCode;
    const uniqueRequesters = requesterSegments.size;
    const paidRequesters = segments.filter((segment) => segment === "paid").length;
    return {
      targetType: first.targetType,
      stateCode: first.stateCode,
      label,
      uniqueRequesters,
      paidRequesters,
      freeRequesters: segments.filter((segment) => segment === "free").length,
      unknownRequesterMix: segments.filter((segment) => segment === "unknown").length,
      currentCapability: capability,
      currentCapabilityLabel: state?.capabilityLabel || "Not active yet",
      currentHealth: health,
      currentHealthLabel: state?.healthLabel || "No recent update",
      gap: gapForTarget(first.targetType, capability),
      statuses,
      oldestRequestedAt: requests.map((request) => request.requestedAt).sort()[0] || "",
      latestUpdatedAt: requests.map((request) => request.updatedAt).sort().at(-1) || "",
      sortWeight: paidRequesters * 20 + uniqueRequesters * 10 + WEAKNESS_WEIGHT[capability],
    };
  });

  return {
    totalOpenRequests: openRequests.length,
    uniqueRequesters: globalRequesters.size,
    targets: targets
      .sort((left, right) => right.sortWeight - left.sortWeight || left.label.localeCompare(right.label))
      .map(({ sortWeight: _sortWeight, ...target }) => target),
  };
}
