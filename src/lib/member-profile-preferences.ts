import { US_STATE_CODES } from "./coverage-model.ts";

export interface MemberProfilePreferences {
  homeState: string | null;
  homeStateSelectedAt: string | null;
}

export const EMPTY_MEMBER_PROFILE_PREFERENCES: MemberProfilePreferences = {
  homeState: null,
  homeStateSelectedAt: null,
};

const VALID_STATE_CODES = new Set<string>(US_STATE_CODES);

export class MemberProfilePreferenceValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MemberProfilePreferenceValidationError";
  }
}

function validTimestamp(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

export function normalizeMemberProfilePreferences(input: unknown): MemberProfilePreferences {
  const source = input && typeof input === "object" && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {};
  const state = typeof source.homeState === "string" ? source.homeState.trim().toUpperCase() : "";
  const homeState = VALID_STATE_CODES.has(state) ? state : null;
  return {
    homeState,
    homeStateSelectedAt: homeState ? validTimestamp(source.homeStateSelectedAt) : null,
  };
}

export function applyMemberProfilePreferencePatch(
  existingInput: unknown,
  requestedInput: unknown,
  now = new Date().toISOString(),
): MemberProfilePreferences {
  const existing = normalizeMemberProfilePreferences(existingInput);
  const requestedSource = requestedInput && typeof requestedInput === "object" && !Array.isArray(requestedInput)
    ? requestedInput as Record<string, unknown>
    : {};
  const requestedState = typeof requestedSource.homeState === "string"
    ? requestedSource.homeState.trim().toUpperCase()
    : "";
  if (!VALID_STATE_CODES.has(requestedState)) {
    throw new MemberProfilePreferenceValidationError("Choose a valid U.S. state or the District of Columbia.");
  }
  const selectedAt = validTimestamp(now);
  if (!selectedAt) throw new Error("A valid server selection timestamp is required.");
  return {
    homeState: requestedState,
    homeStateSelectedAt: existing.homeState === requestedState && existing.homeStateSelectedAt
      ? existing.homeStateSelectedAt
      : selectedAt,
  };
}
