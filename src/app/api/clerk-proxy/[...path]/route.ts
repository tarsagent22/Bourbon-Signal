import { clerkFrontendApiProxy } from "@clerk/nextjs/server";
import { normalizeClerkProxyRequest } from "@/lib/clerk-proxy-origin";

const PROXY_PATH = "/api/clerk-proxy";

async function proxy(request: Request) {
  try {
    return await clerkFrontendApiProxy(normalizeClerkProxyRequest(request), {
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
