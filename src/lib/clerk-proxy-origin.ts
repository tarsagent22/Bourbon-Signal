export const CLERK_PROXY_CANONICAL_HOST = "www.bourbonsignal.com";

export function normalizeClerkProxyRequest(request: Request) {
  const headers = new Headers(request.headers);
  headers.set("x-forwarded-proto", "https");
  headers.set("x-forwarded-host", CLERK_PROXY_CANONICAL_HOST);

  const hasBody = ["POST", "PUT", "PATCH"].includes(request.method);
  const init: RequestInit & { duplex?: "half" } = {
    method: request.method,
    headers,
    body: hasBody ? request.body : undefined,
    duplex: hasBody ? "half" : undefined,
  };

  return new Request(request.url, init);
}
