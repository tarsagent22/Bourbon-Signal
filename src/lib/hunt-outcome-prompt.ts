export const HUNT_OUTCOME_PROMPT_REPEAT_MS = 7 * 24 * 60 * 60 * 1_000;
export const HUNT_OUTCOME_DEFAULT_WINDOW_MS = 24 * 60 * 60 * 1_000;

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

export function signalHasExpiredForOutcome(signal: HuntOutcomePromptSignal, now = Date.now()) {
  if (signal.kind !== "availability" || !Number.isFinite(now)) return false;
  if (signal.historical === true) return true;
  const displayAt = timestamp(signal.displayAt);
  if (displayAt === null || displayAt > now) return false;
  const explicitExpiry = timestamp(signal.expiresAt);
  const expiresAt = explicitExpiry ?? displayAt + HUNT_OUTCOME_DEFAULT_WINDOW_MS;
  return expiresAt <= now;
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
  let hash = 2_166_136_261;
  for (const char of signalId.trim()) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16_777_619);
  }
  return `bourbon-signal.hunt-outcome-prompt.${(hash >>> 0).toString(16)}`;
}
