import "server-only";

import type { CoverageContract } from "@/lib/coverage-model";
import { buildCoverageDemandSummary, type CoverageDemandMemberSegment } from "@/lib/coverage-demand";
import { getCoverageRequestRepository } from "@/lib/coverage-request-repository";
import {
  classifyCompanyMember,
  type CompanyMemberUser,
} from "@/lib/company-control-room";

export async function readCoverageDemandForOwner(
  users: readonly CompanyMemberUser[],
  coverage: CoverageContract,
) {
  try {
    const memberSegments: Record<string, CoverageDemandMemberSegment> = {};
    for (const user of users) {
      if (!user.id) continue;
      const member = classifyCompanyMember(user);
      if (member.isOwner || member.isRetailer) continue;
      memberSegments[user.id] = member.isPaid ? "paid" : "free";
    }
    const requests = await getCoverageRequestRepository().listDemandForOwner();
    return {
      source: "database" as const,
      partial: requests.length >= 10_000,
      ...buildCoverageDemandSummary({ requests, memberSegments, coverage }),
    };
  } catch {
    return {
      source: "unavailable" as const,
      partial: false,
      totalOpenRequests: 0,
      uniqueRequesters: 0,
      targets: [],
    };
  }
}
