export const HUNT_OUTCOME_PROMPT_REPEAT_MS = 7 * 24 * 60 * 60 * 1_000;
const HUNT_OUTCOME_DEFAULT_WINDOW_MS = 24 * 60 * 60 * 1_000;

export interface HuntOutcomePromptSignal {
  kind: "availability" | "release" | "event";
  displayAt: string;
  expiresAt?: string;
  historical?: boolean;
}

function timestamp(value: unknown) {
  const parsed = typeof value === "string" ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function signalHasExpiredForOutcome(signal: HuntOutcomePromptSignal, now: number) {
  if (signal.kind !== "availability" || !Number.isFinite(now)) return false;
  if (signal.historical === true) return true;
  const displayAt = timestamp(signal.displayAt);
  if (displayAt === null || displayAt > now) return false;
  const explicitExpiry = timestamp(signal.expiresAt);
  return (explicitExpiry ?? displayAt + HUNT_OUTCOME_DEFAULT_WINDOW_MS) <= now;
}

export function shouldOfferHuntOutcomePrompt({
  signal,
  now = Date.now(),
  lastPromptedAt,
}: {
  signal: HuntOutcomePromptSignal;
  now?: number;
  lastPromptedAt?: number | null;
}) {
  if (!signalHasExpiredForOutcome(signal, now)) return false;
  return !Number.isFinite(lastPromptedAt) || now - Number(lastPromptedAt) >= HUNT_OUTCOME_PROMPT_REPEAT_MS;
}

export function huntOutcomePromptStorageKey(signalId: string) {
  return `bourbon-signal:hunt-outcome-prompt:${encodeURIComponent(signalId.trim())}`;
}
