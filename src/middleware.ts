import { NextResponse } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isProtectedRoute = createRouteMatcher([
  "/alerts(.*)",
  "/bottle-check(.*)",
  "/dashboard(.*)",
  "/events(.*)",

  "/finder(.*)",
  "/map(.*)",
  "/settings(.*)",
  "/sightings(.*)",
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
  if (!isProtectedRoute(request)) return NextResponse.next();

  const { userId } = await auth();
  if (userId) return NextResponse.next();

  if (url.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Account required" }, { status: 401 });
  }

  const signUpUrl = new URL("/sign-up", request.url);
  const redirectAfterAccount = url.pathname.startsWith("/sightings") ? "/pricing" : `${url.pathname}${url.search}`;
  signUpUrl.searchParams.set("redirect_url", redirectAfterAccount);
  return NextResponse.redirect(signUpUrl);
});

export const config = {
  matcher: [
    // Skip Next internals and static assets, but run on app/API routes.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/api/(.*)",
    "/__clerk/(.*)",
  ],
};
