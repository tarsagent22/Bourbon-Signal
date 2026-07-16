import { containsSensitiveDemandInput } from "./demand-intelligence.ts";

type SearchSurface = "bottle-check" | "finder";
type SearchOutcome = "matched" | "unmatched" | "suggested" | "selected" | "submitted";

export interface SearchCaptureEvent {
  surface: SearchSurface;
  query: string;
  state?: string;
  mode?: string;
  outcome?: SearchOutcome;
  matchedBottleId?: string | null;
  matchedBottleName?: string | null;
  suggestionCount?: number;
  resultCount?: number;
  confidence?: string | null;
  localScore?: number | null;
  scoreStatus?: string | null;
}

function cleanText(value: unknown, maxLength = 160) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, maxLength) : "";
}

export function sanitizeSearchCaptureEvent(event: SearchCaptureEvent) {
  const stringValues = [event.query, event.state, event.mode, event.matchedBottleId, event.matchedBottleName, event.confidence, event.scoreStatus];
  if (stringValues.some(containsSensitiveDemandInput)) return null;
  const query = cleanText(event.query);
  if (query.length < 2) return null;

  return {
    event: "bourbon_signal_search",
    surface: event.surface,
    query,
    state: cleanText(event.state, 8).toUpperCase() || undefined,
    mode: cleanText(event.mode, 32) || undefined,
    outcome: event.outcome,
    matchedBottleId: cleanText(event.matchedBottleId, 120) || undefined,
    matchedBottleName: cleanText(event.matchedBottleName, 160) || undefined,
    suggestionCount: Number.isFinite(event.suggestionCount) ? event.suggestionCount : undefined,
    resultCount: Number.isFinite(event.resultCount) ? event.resultCount : undefined,
    confidence: cleanText(event.confidence, 20) || undefined,
    localScore: typeof event.localScore === "number" ? event.localScore : null,
    scoreStatus: cleanText(event.scoreStatus, 40) || undefined,
  };
}

export function captureSearchEvent(event: SearchCaptureEvent) {
  const payload = sanitizeSearchCaptureEvent(event);
  if (!payload) return false;

  // The offline report immediately collapses these bounded events into k-anonymous aggregates.
  console.info(`BS_SEARCH_EVENT ${JSON.stringify({ ...payload, capturedAt: new Date().toISOString() })}`);
  return true;
}
