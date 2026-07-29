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
    const requesterProfiles: Record<string, { name: string | null; email: string | null }> = {};
    for (const user of users) {
      if (!user.id) continue;
      const member = classifyCompanyMember(user);
      if (member.isOwner || member.isRetailer) continue;
      memberSegments[user.id] = member.isPaid ? "paid" : "free";
      const primaryEmail = user.emailAddresses?.find((email) => email.id === user.primaryEmailAddressId)?.emailAddress
        || user.emailAddresses?.[0]?.emailAddress
        || null;
      const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
      requesterProfiles[user.id] = {
        name: fullName || user.username || null,
        email: primaryEmail,
      };
    }
    const requests = await getCoverageRequestRepository().listDemandForOwner();
    return {
      source: "database" as const,
      partial: requests.filter((request) => request.status === "requested" || request.status === "on_radar").length >= 10_000,
      ...buildCoverageDemandSummary({ requests, memberSegments, requesterProfiles, coverage }),
    };
  } catch {
    return {
      source: "unavailable" as const,
      partial: false,
      totalOpenRequests: 0,
      uniqueRequesters: 0,
      notificationOptIns: 0,
      targets: [],
      recentRequests: [],
    };
  }
}
