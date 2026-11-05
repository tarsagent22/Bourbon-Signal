import { homeFeedCache } from "../signals/home-feed-cache";
import { Platform } from "react-native";
import { useAuth } from "@clerk/expo";
import { createContext, createElement, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from "react";
import { createMobileApi, MobileApiError } from "../api/client";
import { subscribeMembershipChanges } from "../membership/membership-events";

function useAccountMobileApi() {
  const { getToken, userId, sessionId } = useAuth();
  const identity = `${userId || ''}:${sessionId || ''}`;
  const [membershipRevision, setMembershipRevision] = useState(0);
  const current = useRef({ identity, getToken });
  current.current = { identity, getToken };
  const api = useMemo(() => ({ ...createMobileApi({ readCooldownMs: 30_000, rewardPlatform: Platform.OS === "ios" ? "ios" : Platform.OS === "android" ? "android" : "web", getToken: async () => {
    if (current.current.identity !== identity) throw new MobileApiError('The account changed. Please retry.', 401, 'SESSION_CHANGED');
    const token = await current.current.getToken();
    if (current.current.identity !== identity) throw new MobileApiError('The account changed. Please retry.', 401, 'SESSION_CHANGED');
    return token;
  } }), pushAccountId: userId || "", accountIdentity: identity }), [identity]);
  useEffect(() => () => { api.clearReadCache(); void homeFeedCache.clear(userId || "").catch(() => undefined); }, [api, userId]);
  useEffect(() => subscribeMembershipChanges(changedUserId => {
    if (changedUserId !== userId) return;
    api.clearReadCache();
    void homeFeedCache.clear(changedUserId).catch(() => undefined);
    setMembershipRevision(value => value + 1);
  }), [api, userId]);
  return useMemo(() => ({ ...api, membershipRevision }), [api, membershipRevision]);
}

const MobileApiContext = createContext<ReturnType<typeof useAccountMobileApi> | null>(null);
export function MobileApiProvider({ children }: PropsWithChildren) {
  const api = useAccountMobileApi();
  // Changing the provider key remounts Expo Router during Clerk finalization
  // and sign-out. Keep navigation mounted; the API and protected stack own
  // account isolation and invalidate old requests when the identity changes.
  return createElement(MobileApiContext.Provider, { value: api }, children);
}
export function useMobileApi() {
  const api = useContext(MobileApiContext);
  if (!api) throw new Error("MobileApiProvider is required.");
  return api;
}
