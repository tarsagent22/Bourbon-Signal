import { useAuth } from "@clerk/expo";
import { useMemo } from "react";
import { createMobileApi } from "../api/client";

export function useMobileApi() {
  const { getToken } = useAuth();
  return useMemo(() => createMobileApi({ getToken }), [getToken]);
}
