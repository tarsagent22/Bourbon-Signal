import { STATE_LIFECYCLE_CONFIG } from "../config/stateLifecycle.ts";

type SearchSurface = "bottle-check" | "finder";
type SearchOutcome = "matched" | "unmatched" | "suggested" | "selected" | "submitted";

export interface SearchCaptureEvent {
  surface: SearchSurface;
  state?: string;
  outcome?: SearchOutcome;
  canonicalBottleId?: string | null;
  suggestionCount?: number;
  resultCount?: number;
}

const SEARCH_SURFACES = new Set<SearchSurface>(["bottle-check", "finder"]);
const SEARCH_OUTCOMES = new Set<SearchOutcome>(["matched", "unmatched", "suggested", "selected", "submitted"]);
const APPROVED_STATES = new Set<string>(STATE_LIFECYCLE_CONFIG.activeStates);
const MAX_CAPTURED_COUNT = 1_000;

function canonicalBottleId(value: unknown) {
  if (typeof value !== "string") return undefined;
  const candidate = value.trim().toLowerCase();
  return /^[a-z0-9][a-z0-9_-]{0,159}$/.test(candidate) ? candidate : undefined;
}

function approvedState(value: unknown) {
  if (typeof value !== "string") return undefined;
  const candidate = value.trim().toUpperCase();
  return APPROVED_STATES.has(candidate) ? candidate : undefined;
}

function boundedCount(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.min(MAX_CAPTURED_COUNT, Math.max(0, Math.floor(value)));
}

export function sanitizeSearchCaptureEvent(event: SearchCaptureEvent) {
  if (!SEARCH_SURFACES.has(event.surface)) return null;

  return {
    event: "bourbon_signal_search",
    surface: event.surface,
    canonicalBottleId: canonicalBottleId(event.canonicalBottleId),
    state: approvedState(event.state),
    outcome: event.outcome && SEARCH_OUTCOMES.has(event.outcome) ? event.outcome : undefined,
    suggestionCount: boundedCount(event.suggestionCount),
    resultCount: boundedCount(event.resultCount),
  };
}

export function captureSearchEvent(event: SearchCaptureEvent) {
  const payload = sanitizeSearchCaptureEvent(event);
  if (!payload) return false;

  console.info(`BS_SEARCH_EVENT ${JSON.stringify(payload)}`);
  return true;
}
