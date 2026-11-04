import { useAuth } from "@clerk/expo";
import { createContext, type PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import { useMobileApi } from "../hooks/useMobileApi";
import {
  createPurchaseCoordinator,
  type AppleMembershipApi,
  type AppleProductId,
  type PurchaseAdapter,
  type PurchaseCoordinatorState,
} from "./purchases";
import { createRevenueCatPurchaseAdapter } from "./revenuecat-adapter";
import { notifyMembershipChanged } from "./membership-events";

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
  const adapter = useMemo(() => injectedAdapter ?? createRevenueCatPurchaseAdapter(undefined, Platform.OS === "android" ? "android" : "ios"), [injectedAdapter]);
  const api = useMemo<AppleMembershipApi>(() => ({
    getMemberProfile: (options) => apiRef.current.getMemberProfile(options),
    getGoogleMembershipReadiness: (options) => apiRef.current.getGoogleMembershipReadiness(options),
    reconcileGoogleMembership: (input) => apiRef.current.reconcileGoogleMembership(input),
    getAppleMembershipReadiness: (options) => apiRef.current.getAppleMembershipReadiness(options),
    reconcileAppleMembership: (input) => apiRef.current.reconcileAppleMembership(input),
  }), []);
  const coordinator = useMemo(() => createPurchaseCoordinator({
    adapter,
    api,
    publicAndroidApiKey: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY || "",
    publicIosApiKey: process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY || "",
    platform: Platform.OS === "ios" ? "ios" : Platform.OS === "android" ? "android" : "web",
    onMembershipChanged: notifyMembershipChanged,
  }), [adapter, api]);
  const [state, setState] = useState<PurchaseCoordinatorState>(coordinator.getState());
  const sessionRef = useRef({ isLoaded: auth.isLoaded, isSignedIn: Boolean(auth.isSignedIn), userId: auth.userId || null });
  sessionRef.current = { isLoaded: auth.isLoaded, isSignedIn: Boolean(auth.isSignedIn), userId: auth.userId || null };

  useEffect(() => coordinator.subscribe(setState), [coordinator]);
  useEffect(() => {
    if (!auth.isLoaded) return;
    if (!auth.isSignedIn || Platform.OS === "web") {
      void coordinator.syncSession(sessionRef.current);
      return;
    }
    // Run after the first screen can render; never wait for purchase prices or
    // present a restore/authentication sheet during normal sign-in.
    let lastCheck = 0;
    const recognize = () => {
      if (Date.now() - lastCheck < 30_000) return;
      lastCheck = Date.now();
      void coordinator.recognizeSession(sessionRef.current);
    };
    const timer = setTimeout(recognize, 1_200);
    const subscription = AppState.addEventListener("change", state => {
      if (state === "active") recognize();
    });
    return () => { clearTimeout(timer); subscription.remove(); };
  }, [auth.isLoaded, auth.isSignedIn, auth.userId, coordinator]);

  // Stable across purchase-state updates so screen entry effects do not keep
  // reconfiguring StoreKit. Auth changes still reload the active account.
  const refresh = useCallback(async () => {
    await coordinator.syncSession({ isLoaded: auth.isLoaded, isSignedIn: Boolean(auth.isSignedIn), userId: auth.userId || null });
  }, [auth.isLoaded, auth.isSignedIn, auth.userId, coordinator]);

  const value = useMemo<PurchasesContextValue>(() => ({
    ...state,
    async purchase(productId) { await coordinator.purchase(productId); },
    async restore() { await coordinator.restore(); },
    refresh,
  }), [coordinator, state, refresh]);

  return <PurchasesContext.Provider value={value}>{children}</PurchasesContext.Provider>;
}

export function usePurchases() {
  const value = useContext(PurchasesContext);
  if (!value) throw new Error("usePurchases must be used within PurchasesProvider.");
  return value;
}
