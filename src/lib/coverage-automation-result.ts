export const COVERAGE_AUTOMATION_RESULT_SCHEMA = "bourbon-signal/coverage-expansion-result@1" as const;

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
  sourcesReviewed: number;
  blockerCode: string | null;
  limitations: string[];
}

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
    "refresh", "metrics", "canonicalVerification", "sourcesReviewed", "blockerCode", "limitations",
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
  const productionFingerprint = nullableText(root.productionFingerprint, "productionFingerprint", 240, /^[a-zA-Z0-9:|.,_/@+-]+$/);
  const blockerCode = nullableText(root.blockerCode, "blockerCode", 80, /^[a-z0-9_-]+$/);
  const sourcesReviewed = integer(root.sourcesReviewed, "sourcesReviewed");

  if (outcome === "improved") {
    if (!pullRequest || ciStatus !== "passed" || !refresh || !canonicalValue.verified || !canonicalUrl || !productionFingerprint) {
      throw new Error("improved results require merged, refreshed, canonically verified production evidence.");
    }
    const usefulGain = metrics.productionExactStoreRows > metrics.baselineExactStoreRows
      || metrics.productionLiveStores > metrics.baselineLiveStores
      || metrics.productionCustomerCards > metrics.baselineCustomerCards;
    if (!usefulGain) throw new Error("improved results require a measured customer-usable gain.");
  }
  if (outcome === "engine_improved" && (!pullRequest || ciStatus !== "passed" || !refresh || !canonicalValue.verified || !canonicalUrl)) {
    throw new Error("engine_improved results require merged and production-verified engine evidence.");
  }
  const trustedAutomationFailure = blockerCode === "automation_terminal_contract_failure" || blockerCode === "automation_task_missing";
  if (outcome === "blocked" && (!blockerCode || (!trustedAutomationFailure && sourcesReviewed < 1) || ciStatus !== "not_applicable")) {
    throw new Error("blocked results require a blocker code, applicable review evidence, and not_applicable CI.");
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
    sourcesReviewed,
    blockerCode,
    limitations,
  };
}
