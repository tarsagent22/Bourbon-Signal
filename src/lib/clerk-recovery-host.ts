const CLERK_RECOVERY_HOST = "clerk.bourbonsignal.com";
const CLERK_PROXY_ORIGIN = "https://bourbonsignal.com";
const CLERK_PROXY_PATH = "/api/clerk-proxy";

export function resolveClerkRecoveryUrl(requestUrl: string, hostHeader: string | null) {
  const hostname = (hostHeader || "").split(":")[0].toLowerCase();
  if (hostname !== CLERK_RECOVERY_HOST) return null;

  const source = new URL(requestUrl);
  return new URL(`${CLERK_PROXY_PATH}${source.pathname}${source.search}`, CLERK_PROXY_ORIGIN).toString();
}
