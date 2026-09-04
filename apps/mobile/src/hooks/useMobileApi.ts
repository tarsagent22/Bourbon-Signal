import { useAuth } from "@clerk/expo";
import { useEffect, useMemo, useRef } from "react";
import { createMobileApi, MobileApiError } from "../api/client";

export function useMobileApi() {
  const { getToken, userId, sessionId } = useAuth();
  const identity = `${userId || ''}:${sessionId || ''}`;
  const current = useRef({ identity, getToken });
  current.current = { identity, getToken };
  const api = useMemo(() => createMobileApi({ getToken: async () => {
    if (current.current.identity !== identity) throw new MobileApiError('The account changed. Please retry.', 401, 'SESSION_CHANGED');
    const token = await current.current.getToken();
    if (current.current.identity !== identity) throw new MobileApiError('The account changed. Please retry.', 401, 'SESSION_CHANGED');
    return token;
  } }), [identity]);
  useEffect(() => () => api.clearReadCache(), [api]);
  return api;
}
