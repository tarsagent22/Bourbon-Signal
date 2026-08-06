export type WelcomeLocalPreviewChooserStatus = "loading" | "eligible" | "active" | "expired" | "ineligible" | "error";

export interface WelcomeOnboardingCoverageState {
  code: string;
  name: string;
  areas: readonly string[];
  scope: {
    knownBoards: number;
    verifiedSourceTargets: number;
  };
}

function cleanExample(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

export function welcomeLocalPreviewCanChooseTarget(status: WelcomeLocalPreviewChooserStatus) {
  return status === "eligible" || status === "active";
}

export function welcomeLocalSearchPlaceholder(state: WelcomeOnboardingCoverageState) {
  const area = state.areas.map(cleanExample).find(Boolean);
  if (area) return state.scope.knownBoards > 0
    ? `Try ${area} or an ABC board`
    : `Try ${area} or a store`;
  return state.scope.knownBoards > 0
    ? `Try a city or ABC board in ${state.name}`
    : `Try a city or store in ${state.name}`;
}

export function coverageMonitoringFootprint(state: WelcomeOnboardingCoverageState) {
  if (state.scope.knownBoards > 0) {
    return {
      count: Math.max(0, Math.trunc(state.scope.knownBoards)),
      label: "ABC boards in monitoring library",
      unit: "boards" as const,
    };
  }
  return {
    count: Math.max(0, Math.trunc(state.scope.verifiedSourceTargets)),
    label: "Stores in monitoring library",
    unit: "stores" as const,
  };
}
