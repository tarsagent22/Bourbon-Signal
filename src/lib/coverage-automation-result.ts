export const COVERAGE_AUTOMATION_RESULT_SCHEMA = "bourbon-signal/coverage-expansion-result@2" as const;

export type CoverageAutomationOutcome = "improved" | "engine_improved" | "blocked";

export interface CoverageAutomationTerminalResult {
  schemaVersion: typeof COVERAGE_AUTOMATION_RESULT_SCHEMA;
  outcome: CoverageAutomationOutcome;
  headline: string;
  productionFingerprint: string | null;
  pullRequest: null | { number: number; url: string; mergeCommit: string };
  ci: { status: "passed" | "not_applicable" };
  refresh: null | { runId: string; url: string; artifactDigest: string };
  metrics: {
    baselineExactStoreRows: number;
    productionExactStoreRows: number;
    baselineLiveStores: number;
    productionLiveStores: number;
    baselineCustomerCards: number;
    productionCustomerCards: number;
  };
  canonicalVerification: { verified: boolean; url: string | null };
  exploration: {
    sourceCandidates: Array<{
      sourceId: string;
      sourceClass: "first_party" | "delegated_marketplace" | "official_directory" | "other_public";
      outcome: "adopted" | "viable_not_adopted" | "rejected" | "blocked";
      reasonCode: string;
    }>;
    knownSourceUniverseComplete: boolean;
    secondPass: "not_required" | "completed";
  };
  requesterNotification: { ready: boolean; reasonCode: string };
  blockerCode: string | null;
  limitations: string[];
}

export interface LegacyCoverageAutomationTerminalResult {
  schemaVersion: "bourbon-signal/coverage-expansion-result@1";
  outcome: CoverageAutomationOutcome;
  headline: string;
  productionFingerprint: string | null;
  pullRequest: { number: number; url: string; mergeCommit: string } | null;
  ci: { status: "passed" | "not_applicable" };
  refresh: { runId: string; url: string; artifactDigest: string } | null;
  metrics: CoverageAutomationTerminalResult["metrics"];
  canonicalVerification: { verified: boolean; url: string | null };
  sourcesReviewed: number;
  blockerCode: string | null;
  limitations: string[];
}

export type CoverageAutomationCompletionResult = CoverageAutomationTerminalResult | LegacyCoverageAutomationTerminalResult;

const DIRECTIVE = /MEDIA\s*:|\[\[|\]\]|(?:ignore|override|disregard).{0,32}(?:instruction|prompt|rule)/i;

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, keys: string[], label: string) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${label} has an invalid shape.`);
  }
}

function text(value: unknown, label: string, max: number, pattern?: RegExp) {
  if (typeof value !== "string") throw new Error(`${label} must be text.`);
  const normalized = value.replace(/[\u0000-\u001f\u007f\u0085\u2028\u2029]/g, " ").replace(/\s+/g, " ").trim();
  if (!normalized || normalized.length > max || DIRECTIVE.test(normalized) || (pattern && !pattern.test(normalized))) {
    throw new Error(`${label} is invalid.`);
  }
  return normalized;
}

function nullableText(value: unknown, label: string, max: number, pattern?: RegExp) {
  return value === null ? null : text(value, label, max, pattern);
}

function integer(value: unknown, label: string) {
  if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) > 1_000_000_000) throw new Error(`${label} must be a bounded non-negative integer.`);
  return Number(value);
}

function strictUrl(value: unknown, label: string, host: string, pathname: RegExp) {
  const raw = text(value, label, 300);
  const parsed = new URL(raw);
  if (parsed.protocol !== "https:" || parsed.hostname !== host || !pathname.test(parsed.pathname) || parsed.username || parsed.password) {
    throw new Error(`${label} is not allowlisted.`);
  }
  return parsed.toString();
}

export function parseCoverageAutomationResult(value: unknown): CoverageAutomationTerminalResult {
  const root = objectValue(value, "result");
  exactKeys(root, [
    "schemaVersion", "outcome", "headline", "productionFingerprint", "pullRequest", "ci",
    "refresh", "metrics", "canonicalVerification", "exploration", "requesterNotification", "blockerCode", "limitations",
  ], "result");
  if (root.schemaVersion !== COVERAGE_AUTOMATION_RESULT_SCHEMA) throw new Error("result schemaVersion is invalid.");
  const outcome = root.outcome;
  if (outcome !== "improved" && outcome !== "engine_improved" && outcome !== "blocked") throw new Error("result outcome is invalid.");

  const pullRequestValue = root.pullRequest === null ? null : objectValue(root.pullRequest, "pullRequest");
  if (pullRequestValue) exactKeys(pullRequestValue, ["number", "url", "mergeCommit"], "pullRequest");
  const pullRequest = pullRequestValue ? {
    number: integer(pullRequestValue.number, "pullRequest.number"),
    url: strictUrl(pullRequestValue.url, "pullRequest.url", "github.com", /^\/tarsagent22\/Bourbon-Signal\/pull\/\d+\/?$/),
    mergeCommit: text(pullRequestValue.mergeCommit, "pullRequest.mergeCommit", 64, /^[a-f0-9]{40}$/),
  } : null;
  if (pullRequest && new URL(pullRequest.url).pathname.replace(/\/$/, "").split("/").at(-1) !== String(pullRequest.number)) {
    throw new Error("pullRequest URL does not match pullRequest.number.");
  }

  const ciValue = objectValue(root.ci, "ci");
  exactKeys(ciValue, ["status"], "ci");
  const ciStatus = ciValue.status;
  if (ciStatus !== "passed" && ciStatus !== "not_applicable") throw new Error("ci.status is invalid.");

  const refreshValue = root.refresh === null ? null : objectValue(root.refresh, "refresh");
  if (refreshValue) exactKeys(refreshValue, ["runId", "url", "artifactDigest"], "refresh");
  const refresh = refreshValue ? {
    runId: text(refreshValue.runId, "refresh.runId", 30, /^\d+$/),
    url: strictUrl(refreshValue.url, "refresh.url", "github.com", /^\/tarsagent22\/Bourbon-Signal\/actions\/runs\/\d+\/?$/),
    artifactDigest: text(refreshValue.artifactDigest, "refresh.artifactDigest", 71, /^sha256:[a-f0-9]{64}$/),
  } : null;
  if (refresh && new URL(refresh.url).pathname.replace(/\/$/, "").split("/").at(-1) !== refresh.runId) {
    throw new Error("refresh URL does not match refresh.runId.");
  }

  const metricsValue = objectValue(root.metrics, "metrics");
  const metricKeys = [
    "baselineExactStoreRows", "productionExactStoreRows", "baselineLiveStores",
    "productionLiveStores", "baselineCustomerCards", "productionCustomerCards",
  ];
  exactKeys(metricsValue, metricKeys, "metrics");
  const metrics = Object.fromEntries(metricKeys.map((key) => [key, integer(metricsValue[key], `metrics.${key}`)])) as unknown as CoverageAutomationTerminalResult["metrics"];

  const canonicalValue = objectValue(root.canonicalVerification, "canonicalVerification");
  exactKeys(canonicalValue, ["verified", "url"], "canonicalVerification");
  if (typeof canonicalValue.verified !== "boolean") throw new Error("canonicalVerification.verified must be boolean.");
  const canonicalUrl = canonicalValue.url === null ? null : strictUrl(
    canonicalValue.url,
    "canonicalVerification.url",
    "www.bourbonsignal.com",
    /^\/(?:api\/(?:drops|stats|coverage)|coverage)(?:\/|$)/,
  );

  if (!Array.isArray(root.limitations) || root.limitations.length > 10) throw new Error("limitations must be a bounded array.");
  const limitations = root.limitations.map((entry, index) => text(entry, `limitations[${index}]`, 240));
  const productionFingerprint = nullableText(root.productionFingerprint, "productionFingerprint", 240, /^[a-zA-Z0-9:|.,_/@+ -]+$/);
  const blockerCode = nullableText(root.blockerCode, "blockerCode", 80, /^[a-z0-9_-]+$/);
  if (outcome !== "blocked" && blockerCode !== null) throw new Error("non-blocked results must not contain blockerCode.");
  const explorationValue = objectValue(root.exploration, "exploration");
  exactKeys(explorationValue, ["sourceCandidates", "knownSourceUniverseComplete", "secondPass"], "exploration");
  if (!Array.isArray(explorationValue.sourceCandidates) || explorationValue.sourceCandidates.length > 50) {
    throw new Error("exploration.sourceCandidates must be a bounded array.");
  }
  const sourceCandidates = explorationValue.sourceCandidates.map((candidate, index) => {
    const value = objectValue(candidate, `exploration.sourceCandidates[${index}]`);
    exactKeys(value, ["sourceId", "sourceClass", "outcome", "reasonCode"], `exploration.sourceCandidates[${index}]`);
    const sourceClass = value.sourceClass;
    if (!["first_party", "delegated_marketplace", "official_directory", "other_public"].includes(String(sourceClass))) {
      throw new Error(`exploration.sourceCandidates[${index}].sourceClass is invalid.`);
    }
    const candidateOutcome = value.outcome;
    if (!["adopted", "viable_not_adopted", "rejected", "blocked"].includes(String(candidateOutcome))) {
      throw new Error(`exploration.sourceCandidates[${index}].outcome is invalid.`);
    }
    return {
      sourceId: text(value.sourceId, `exploration.sourceCandidates[${index}].sourceId`, 80, /^[a-z0-9][a-z0-9:-]*$/),
      sourceClass: sourceClass as CoverageAutomationTerminalResult["exploration"]["sourceCandidates"][number]["sourceClass"],
      outcome: candidateOutcome as CoverageAutomationTerminalResult["exploration"]["sourceCandidates"][number]["outcome"],
      reasonCode: text(value.reasonCode, `exploration.sourceCandidates[${index}].reasonCode`, 80, /^[a-z0-9][a-z0-9_-]*$/),
    };
  });
  if (new Set(sourceCandidates.map((candidate) => candidate.sourceId)).size !== sourceCandidates.length) {
    throw new Error("exploration.sourceCandidates contains duplicate source identities.");
  }
  if (typeof explorationValue.knownSourceUniverseComplete !== "boolean") {
    throw new Error("exploration.knownSourceUniverseComplete must be boolean.");
  }
  if (explorationValue.secondPass !== "not_required" && explorationValue.secondPass !== "completed") {
    throw new Error("exploration.secondPass is invalid.");
  }
  const exploration: CoverageAutomationTerminalResult["exploration"] = {
    sourceCandidates,
    knownSourceUniverseComplete: explorationValue.knownSourceUniverseComplete,
    secondPass: explorationValue.secondPass,
  };

  const requesterNotificationValue = objectValue(root.requesterNotification, "requesterNotification");
  exactKeys(requesterNotificationValue, ["ready", "reasonCode"], "requesterNotification");
  if (typeof requesterNotificationValue.ready !== "boolean") throw new Error("requesterNotification.ready must be boolean.");
  const requesterNotification = {
    ready: requesterNotificationValue.ready,
    reasonCode: text(requesterNotificationValue.reasonCode, "requesterNotification.reasonCode", 80, /^[a-z0-9][a-z0-9_-]*$/),
  };

  if (outcome === "improved") {
    if (!pullRequest || ciStatus !== "passed" || !refresh || !canonicalValue.verified || !canonicalUrl || !productionFingerprint) {
      throw new Error("improved results require merged, refreshed, canonically verified production evidence.");
    }
    const materialTargetGain = metrics.productionExactStoreRows > metrics.baselineExactStoreRows
      || metrics.productionLiveStores > metrics.baselineLiveStores;
    if (!materialTargetGain) throw new Error("improved results require a material target-level gain in exact-store rows or live stores.");
    if (!exploration.knownSourceUniverseComplete) throw new Error("improved results require a complete known-source universe audit.");
    if (!sourceCandidates.some((candidate) => candidate.outcome === "adopted")) throw new Error("improved results require adopted-source evidence.");
    if (metrics.productionLiveStores <= 1 && exploration.secondPass !== "completed") {
      throw new Error("sparse improved results require a second discovery pass.");
    }
  }
  if (outcome === "engine_improved" && (!pullRequest || ciStatus !== "passed" || !refresh || !canonicalValue.verified || !canonicalUrl)) {
    throw new Error("engine_improved results require merged and production-verified engine evidence.");
  }
  const trustedAutomationFailure = blockerCode === "automation_terminal_contract_failure" || blockerCode === "automation_task_missing";
  if (outcome === "blocked" && (!blockerCode
    || (!trustedAutomationFailure && (sourceCandidates.length < 1 || !exploration.knownSourceUniverseComplete))
    || ciStatus !== "not_applicable")) {
    throw new Error("blocked results require a blocker code, a complete applicable source-universe audit, and not_applicable CI.");
  }

  const notificationReady = outcome === "improved" && (
    metrics.productionExactStoreRows > metrics.baselineExactStoreRows
    || metrics.productionLiveStores > metrics.baselineLiveStores
  );
  const customerPathImproved = metrics.productionCustomerCards > metrics.baselineCustomerCards;
  const sparseSecondPassComplete = metrics.productionLiveStores > 1 || exploration.secondPass === "completed";
  const expectedNotificationReady = Boolean(notificationReady
    && customerPathImproved
    && exploration.knownSourceUniverseComplete
    && sparseSecondPassComplete
    && canonicalValue.verified
    && canonicalUrl
    && refresh
    && pullRequest
    && ciStatus === "passed");
  if (requesterNotification.ready !== expectedNotificationReady) {
    throw new Error("requesterNotification.ready does not match production and exploration evidence.");
  }
  const expectedNotificationReason = expectedNotificationReady
    ? "production_verified_material_gain"
    : trustedAutomationFailure
      ? "automation_failure"
      : outcome === "blocked"
        ? "blocked"
        : outcome === "engine_improved"
          ? "engine_only"
          : !notificationReady
            ? "material_gain_missing"
            : !customerPathImproved
              ? "customer_path_not_improved"
              : !exploration.knownSourceUniverseComplete
                ? "source_universe_incomplete"
                : !sparseSecondPassComplete
                  ? "second_pass_required"
                  : "production_proof_incomplete";
  if (requesterNotification.reasonCode !== expectedNotificationReason) {
    throw new Error("requesterNotification.reasonCode does not match the terminal evidence.");
  }

  return {
    schemaVersion: COVERAGE_AUTOMATION_RESULT_SCHEMA,
    outcome,
    headline: text(root.headline, "headline", 240),
    productionFingerprint,
    pullRequest,
    ci: { status: ciStatus },
    refresh,
    metrics,
    canonicalVerification: { verified: canonicalValue.verified, url: canonicalUrl },
    exploration,
    requesterNotification,
    blockerCode,
    limitations,
  };
}

export function parseCoverageAutomationCompletionResult(value: unknown): CoverageAutomationCompletionResult {
  const probe = objectValue(value, "result");
  if (probe.schemaVersion !== "bourbon-signal/coverage-expansion-result@1") return parseCoverageAutomationResult(value);
  exactKeys(probe, [
    "schemaVersion", "outcome", "headline", "productionFingerprint", "pullRequest", "ci",
    "refresh", "metrics", "canonicalVerification", "sourcesReviewed", "blockerCode", "limitations",
  ], "legacy result");
  const outcome = probe.outcome;
  if (outcome !== "improved" && outcome !== "engine_improved" && outcome !== "blocked") throw new Error("legacy result outcome is invalid.");
  const headline = text(probe.headline, "legacy headline", 240);
  const productionFingerprint = nullableText(probe.productionFingerprint, "legacy productionFingerprint", 240, /^[a-zA-Z0-9:|.,_/@+ -]+$/);
  const pullValue = probe.pullRequest === null ? null : objectValue(probe.pullRequest, "legacy pullRequest");
  if (pullValue) exactKeys(pullValue, ["number", "url", "mergeCommit"], "legacy pullRequest");
  const pullRequest = pullValue ? {
    number: integer(pullValue.number, "legacy pullRequest.number"),
    url: text(pullValue.url, "legacy pullRequest.url", 300, /^https:\/\/github\.com\/tarsagent22\/Bourbon-Signal\/pull\/\d+\/?$/),
    mergeCommit: text(pullValue.mergeCommit, "legacy pullRequest.mergeCommit", 40, /^[a-f0-9]{40}$/),
  } : null;
  if (pullRequest && new URL(pullRequest.url).pathname.replace(/\/$/, "").split("/").at(-1) !== String(pullRequest.number)) throw new Error("legacy pullRequest URL does not match number.");
  const ciValue = objectValue(probe.ci, "legacy ci");
  exactKeys(ciValue, ["status"], "legacy ci");
  if (ciValue.status !== "passed" && ciValue.status !== "not_applicable") throw new Error("legacy ci.status is invalid.");
  const ciStatus = ciValue.status;
  const refreshValue = probe.refresh === null ? null : objectValue(probe.refresh, "legacy refresh");
  if (refreshValue) exactKeys(refreshValue, ["runId", "url", "artifactDigest"], "legacy refresh");
  const refresh = refreshValue ? {
    runId: text(refreshValue.runId, "legacy refresh.runId", 30, /^\d+$/),
    url: text(refreshValue.url, "legacy refresh.url", 300, /^https:\/\/github\.com\/tarsagent22\/Bourbon-Signal\/actions\/runs\/\d+\/?$/),
    artifactDigest: text(refreshValue.artifactDigest, "legacy refresh.artifactDigest", 71, /^sha256:[a-f0-9]{64}$/),
  } : null;
  if (refresh && new URL(refresh.url).pathname.replace(/\/$/, "").split("/").at(-1) !== refresh.runId) throw new Error("legacy refresh URL does not match run id.");
  const metricValue = objectValue(probe.metrics, "legacy metrics");
  const metricKeys = ["baselineExactStoreRows", "productionExactStoreRows", "baselineLiveStores", "productionLiveStores", "baselineCustomerCards", "productionCustomerCards"] as const;
  exactKeys(metricValue, [...metricKeys], "legacy metrics");
  const metrics = Object.fromEntries(metricKeys.map((key) => [key, integer(metricValue[key], `legacy metrics.${key}`)])) as unknown as CoverageAutomationTerminalResult["metrics"];
  const canonicalValue = objectValue(probe.canonicalVerification, "legacy canonicalVerification");
  exactKeys(canonicalValue, ["verified", "url"], "legacy canonicalVerification");
  if (typeof canonicalValue.verified !== "boolean") throw new Error("legacy canonicalVerification.verified must be boolean.");
  const canonicalUrl = nullableText(canonicalValue.url, "legacy canonicalVerification.url", 300, /^https:\/\/www\.bourbonsignal\.com\/(?:api\/(?:drops|stats|coverage)|coverage)(?:\/|\?|$)/);
  const sourcesReviewed = integer(probe.sourcesReviewed, "legacy sourcesReviewed");
  const blockerCode = nullableText(probe.blockerCode, "legacy blockerCode", 80, /^[a-z0-9_-]+$/);
  if (!Array.isArray(probe.limitations) || probe.limitations.length > 10) throw new Error("legacy limitations must be a bounded array.");
  const limitations = probe.limitations.map((entry, index) => text(entry, `legacy limitations[${index}]`, 240));
  const gain = metrics.productionExactStoreRows > metrics.baselineExactStoreRows
    || metrics.productionLiveStores > metrics.baselineLiveStores
    || metrics.productionCustomerCards > metrics.baselineCustomerCards;
  if (outcome === "improved" && (!pullRequest || ciStatus !== "passed" || !refresh || !canonicalValue.verified || !canonicalUrl || !productionFingerprint || !gain)) {
    throw new Error("legacy improved result requires production proof and a measured gain.");
  }
  if (outcome === "engine_improved" && (!pullRequest || ciStatus !== "passed" || !refresh || !canonicalValue.verified || !canonicalUrl)) {
    throw new Error("legacy engine_improved result requires production proof.");
  }
  const trustedFailure = blockerCode === "automation_terminal_contract_failure" || blockerCode === "automation_task_missing";
  if (outcome === "blocked" && (!blockerCode || (!trustedFailure && sourcesReviewed < 1) || ciStatus !== "not_applicable")) {
    throw new Error("legacy blocked result requires blocker evidence.");
  }
  return {
    schemaVersion: "bourbon-signal/coverage-expansion-result@1",
    outcome,
    headline,
    productionFingerprint,
    pullRequest,
    ci: { status: ciStatus },
    refresh,
    metrics,
    canonicalVerification: { verified: canonicalValue.verified, url: canonicalUrl },
    sourcesReviewed,
    blockerCode,
    limitations,
  };
}
