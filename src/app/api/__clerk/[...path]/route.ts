import { clerkFrontendApiProxy } from "@clerk/nextjs/server";

const APEX_HOST = "bourbonsignal.com";
const PROXY_PATH = "/api/__clerk";

function normalizeProxyOrigin(request: Request) {
  const headers = new Headers(request.headers);
  headers.set("x-forwarded-proto", "https");
  headers.set("x-forwarded-host", APEX_HOST);
  return new Request(request, { headers });
}

async function proxy(request: Request) {
  return clerkFrontendApiProxy(normalizeProxyOrigin(request), { proxyPath: PROXY_PATH });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const DELETE = proxy;
export const PATCH = proxy;
