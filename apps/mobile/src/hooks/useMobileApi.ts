import { useAuth } from "@clerk/expo";
import { useCallback, useRef } from "react";
import { createMobileApi } from "../api/client";

export function useMobileApi() {
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const apiRef = useRef<ReturnType<typeof createMobileApi> | null>(null);
  if (!apiRef.current) {
    apiRef.current = createMobileApi({ getToken: () => getTokenRef.current() });
  }
  return apiRef.current;
}

export function useStableSignOut() {
  const { signOut } = useAuth();
  const signOutRef = useRef(signOut);
  signOutRef.current = signOut;
  return useCallback(() => signOutRef.current(), []);
}
