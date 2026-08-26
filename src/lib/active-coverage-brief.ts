import type { CoverageRequestRepository } from "@/lib/coverage-request-repository";

export type ActiveCoverageBriefRepository = Pick<
  CoverageRequestRepository,
  "listActiveForBrief" | "summarizeActiveAutomationStatusesForOwner"
>;

export async function buildActiveCoverageBrief(repository: ActiveCoverageBriefRepository, now = new Date()) {
  const [allRequests, activeAutomationStatuses] = await Promise.all([
    repository.listActiveForBrief(200),
    repository.summarizeActiveAutomationStatusesForOwner(),
  ]);
  const requests = allRequests
    .slice(0, 200)
    .map((request) => ({
      targetType: request.targetType,
      stateCode: request.stateCode,
      areaLabel: request.areaLabel,
      storeName: request.storeName || null,
      status: request.status,
      requestedAt: request.requestedAt,
      updatedAt: request.updatedAt,
    }));
  return {
    contractVersion: "bourbon-signal/active-coverage-requests@2" as const,
    generatedAt: now.toISOString(),
    source: "production_read_api" as const,
    count: requests.length,
    requests,
    automationHealth: { activeAutomationStatuses },
  };
}
