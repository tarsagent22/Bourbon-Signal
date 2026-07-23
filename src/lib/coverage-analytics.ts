export const COVERAGE_ANALYTICS_EVENTS = [
  "coverage_page_viewed",
  "coverage_state_selected",
  "coverage_search_resolved",
  "coverage_request_started",
  "coverage_request_submitted",
] as const;

export type CoverageAnalyticsEvent = typeof COVERAGE_ANALYTICS_EVENTS[number];

const EVENT_NAMES = new Set<string>(COVERAGE_ANALYTICS_EVENTS);
const PROPERTY_KEYS = new Set(["state", "targetType", "resultCategory"]);
const TARGET_TYPES = new Set(["state", "city", "store", "unknown"]);
const RESULT_CATEGORIES = new Set([
  "covered",
  "partially-covered",
  "known-not-active",
  "actively-monitored",
  "known-expansion-candidate",
  "not-found",
]);

export function sanitizeCoverageAnalyticsEvent(event: unknown, properties: Record<string, unknown>) {
  if (typeof event !== "string" || !EVENT_NAMES.has(event)) return null;
  if (Object.keys(properties).some((key) => !PROPERTY_KEYS.has(key))) return null;
  const safe: Record<string, string> = {};
  if (properties.state !== undefined) {
    if (typeof properties.state !== "string" || !/^[A-Z]{2}$/.test(properties.state)) return null;
    safe.state = properties.state;
  }
  if (properties.targetType !== undefined) {
    if (typeof properties.targetType !== "string" || !TARGET_TYPES.has(properties.targetType)) return null;
    safe.targetType = properties.targetType;
  }
  if (properties.resultCategory !== undefined) {
    if (typeof properties.resultCategory !== "string" || !RESULT_CATEGORIES.has(properties.resultCategory)) return null;
    safe.resultCategory = properties.resultCategory;
  }
  if (event !== "coverage_page_viewed" && !safe.state) return null;
  if (event === "coverage_search_resolved" && (!safe.targetType || !safe.resultCategory)) return null;
  if ((event === "coverage_request_started" || event === "coverage_request_submitted") && !safe.targetType) return null;
  return safe;
}
