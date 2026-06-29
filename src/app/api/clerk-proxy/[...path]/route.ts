import { clerkFrontendApiProxy } from "@clerk/nextjs/server";

const APEX_HOST = "bourbonsignal.com";
const PROXY_PATH = "/api/clerk-proxy";

function normalizeProxyOrigin(request: Request) {
  const headers = new Headers(request.headers);
  headers.set("x-forwarded-proto", "https");
  headers.set("x-forwarded-host", APEX_HOST);
  return new Request(request, { headers });
}

async function proxy(request: Request) {
  try {
    return await clerkFrontendApiProxy(normalizeProxyOrigin(request), {
      proxyPath: PROXY_PATH,
      publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
      secretKey: process.env.CLERK_SECRET_KEY,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Clerk proxy error";
    return Response.json({ error: "Clerk proxy failed", message }, { status: 500 });
  }
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const DELETE = proxy;
export const PATCH = proxy;
