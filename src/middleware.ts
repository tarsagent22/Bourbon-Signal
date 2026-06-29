import { NextResponse } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { isQaPreviewRequest } from "@/lib/preview-qa";

const isProtectedRoute = createRouteMatcher([
  "/alerts(.*)",
  "/bottle-check(.*)",
  "/dashboard(.*)",
  "/events(.*)",

  "/finder(.*)",
  "/map(.*)",
  "/settings(.*)",
  "/success(.*)",
  "/api/alerts(.*)",
  "/api/bottle-check(.*)",
  "/api/bottles(.*)",
  "/api/checkout(.*)",
  "/api/events(.*)",

  "/api/locations(.*)",
  "/api/nc-intelligence(.*)",
  "/api/search-events(.*)",
  "/api/stores(.*)",
  "/api/user/preferences(.*)",
]);

export default clerkMiddleware(async (auth, request) => {
  const url = new URL(request.url);
  if (url.pathname === "/api/alerts/deliver") return NextResponse.next();
  if (url.pathname === "/api/webhooks/stripe") return NextResponse.next();
  if (isQaPreviewRequest(request)) return NextResponse.next();
  if (!isProtectedRoute(request)) return NextResponse.next();

  const { userId } = await auth();
  if (userId) return NextResponse.next();

  if (url.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Account required" }, { status: 401 });
  }

  const signUpUrl = new URL("/sign-up", request.url);
  signUpUrl.searchParams.set("redirect_url", `${url.pathname}${url.search}`);
  return NextResponse.redirect(signUpUrl);
}, {
  frontendApiProxy: {
    enabled: true,
  },
});

export const config = {
  matcher: [
    // Skip Next internals and static assets, but run on app/API routes.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/api/(.*)",
    "/__clerk/(.*)",
  ],
};
