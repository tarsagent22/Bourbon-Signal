import { useAuth } from "@clerk/expo";
import { createContext, createElement, useContext, useEffect, useMemo, useRef, type PropsWithChildren } from "react";
import { createMobileApi, MobileApiError } from "../api/client";

function useAccountMobileApi() {
  const { getToken, userId, sessionId } = useAuth();
  const identity = `${userId || ''}:${sessionId || ''}`;
  const current = useRef({ identity, getToken });
  current.current = { identity, getToken };
  const api = useMemo(() => ({ ...createMobileApi({ getToken: async () => {
    if (current.current.identity !== identity) throw new MobileApiError('The account changed. Please retry.', 401, 'SESSION_CHANGED');
    const token = await current.current.getToken();
    if (current.current.identity !== identity) throw new MobileApiError('The account changed. Please retry.', 401, 'SESSION_CHANGED');
    return token;
  } }), pushAccountId: userId || "", accountIdentity: identity }), [identity]);
  useEffect(() => () => api.clearReadCache(), [api]);
  return api;
}

const MobileApiContext = createContext<ReturnType<typeof useAccountMobileApi> | null>(null);
export function MobileApiProvider({ children }: PropsWithChildren) {
  const api = useAccountMobileApi();
  return createElement(MobileApiContext.Provider, { value: api, key: api.accountIdentity }, children);
}
export function useMobileApi() {
  const api = useContext(MobileApiContext);
  if (!api) throw new Error("MobileApiProvider is required.");
  return api;
}
