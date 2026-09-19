import { normalizeCommunityDisplayName } from "./community-display-name.ts";
import { applyMemberProfilePreferencePatch } from "./member-profile-preferences.ts";

export class MobileOnboardingValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MobileOnboardingValidationError";
  }
}

export interface MobileOnboardingInput {
  displayName?: unknown;
  age21Affirmed?: unknown;
  homeState?: unknown;
}

export function prepareMobileOnboarding(input: MobileOnboardingInput, now = new Date().toISOString()) {
  if (input.age21Affirmed !== true) {
    throw new MobileOnboardingValidationError("You must affirm that you are 21 or older.");
  }
  const displayName = normalizeCommunityDisplayName(input.displayName);
  if (!displayName.ok) throw new MobileOnboardingValidationError(displayName.error);
  let memberProfile;
  try {
    memberProfile = applyMemberProfilePreferencePatch({}, { homeState: input.homeState }, now);
  } catch (error) {
    throw new MobileOnboardingValidationError(error instanceof Error ? error.message : "Choose a valid U.S. state or the District of Columbia.");
  }
  return {
    displayName: displayName.value,
    publicMetadata: {
      communityDisplayName: displayName.value,
      memberProfile,
    },
    privateMetadata: {
      mobileOnboarding: {
        version: 1 as const,
        age21AffirmedAt: now,
        completedAt: now,
      },
    },
  };
}
