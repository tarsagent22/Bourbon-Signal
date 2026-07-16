export interface RadarMarketInitializationState {
  market: string;
  initialized: boolean;
}

interface ResolveRadarMarketInitializationInput {
  state: RadarMarketInitializationState;
  preferencesReady: boolean;
  preferredMarket?: string;
  fallbackMarket?: string;
  userSelected: boolean;
}

export function resolveRadarMarketInitialization({
  state,
  preferencesReady,
  preferredMarket,
  fallbackMarket,
  userSelected,
}: ResolveRadarMarketInitializationInput): RadarMarketInitializationState {
  if (state.initialized || !preferencesReady) return state;

  return {
    market: userSelected ? state.market : preferredMarket || fallbackMarket || state.market || "US",
    initialized: true,
  };
}
