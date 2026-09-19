import { useAuth } from "@clerk/expo";
import { createContext, type PropsWithChildren, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Platform } from "react-native";
import { useMobileApi } from "../hooks/useMobileApi";
import {
  createPurchaseCoordinator,
  type AppleMembershipApi,
  type AppleProductId,
  type PurchaseAdapter,
  type PurchaseCoordinatorState,
} from "./purchases";
import { createRevenueCatPurchaseAdapter } from "./revenuecat-adapter";

const initialState: PurchaseCoordinatorState = {
  status: "signed_out",
  message: "Sign in to view Apple purchase options.",
  products: [],
  profile: null,
  eligibleProductIds: [],
  restoreAvailable: false,
  membership: null,
};

type PurchasesContextValue = PurchaseCoordinatorState & {
  purchase(productId: AppleProductId): Promise<void>;
  restore(): Promise<void>;
  refresh(): Promise<void>;
};

const PurchasesContext = createContext<PurchasesContextValue | null>(null);

export function PurchasesProvider({ children, adapter: injectedAdapter }: PropsWithChildren<{ adapter?: PurchaseAdapter }>) {
  const auth = useAuth();
  const mobileApi = useMobileApi();
  const apiRef = useRef(mobileApi);
  apiRef.current = mobileApi;
  const adapter = useMemo(() => injectedAdapter ?? createRevenueCatPurchaseAdapter(), [injectedAdapter]);
  const api = useMemo<AppleMembershipApi>(() => ({
    getMemberProfile: (options) => apiRef.current.getMemberProfile(options),
    getAppleMembershipReadiness: (options) => apiRef.current.getAppleMembershipReadiness(options),
    reconcileAppleMembership: (input) => apiRef.current.reconcileAppleMembership(input),
  }), []);
  const coordinator = useMemo(() => createPurchaseCoordinator({
    adapter,
    api,
    publicIosApiKey: process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY || "",
    platform: Platform.OS === "ios" ? "ios" : Platform.OS === "android" ? "android" : "web",
  }), [adapter, api]);
  const [state, setState] = useState<PurchaseCoordinatorState>(coordinator.getState());
  const sessionRef = useRef({ isLoaded: auth.isLoaded, isSignedIn: Boolean(auth.isSignedIn), userId: auth.userId || null });
  sessionRef.current = { isLoaded: auth.isLoaded, isSignedIn: Boolean(auth.isSignedIn), userId: auth.userId || null };

  useEffect(() => coordinator.subscribe(setState), [coordinator]);
  useEffect(() => {
    void coordinator.syncSession(sessionRef.current);
  }, [auth.isLoaded, auth.isSignedIn, auth.userId, coordinator]);

  const value = useMemo<PurchasesContextValue>(() => ({
    ...state,
    async purchase(productId) { await coordinator.purchase(productId); },
    async restore() { await coordinator.restore(); },
    async refresh() { await coordinator.syncSession(sessionRef.current); },
  }), [coordinator, state]);

  return <PurchasesContext.Provider value={value}>{children}</PurchasesContext.Provider>;
}

export function usePurchases() {
  const value = useContext(PurchasesContext);
  if (!value) throw new Error("usePurchases must be used within PurchasesProvider.");
  return value;
}
