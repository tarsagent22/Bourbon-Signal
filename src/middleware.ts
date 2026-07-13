import { NextResponse } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isProtectedRoute = createRouteMatcher([
  "/alerts(.*)",
  "/admin(.*)",
  "/bottle-check(.*)",
  "/dashboard(.*)",
  "/retailers/portal(.*)",
  "/events(.*)",

  "/finder(.*)",
  "/map(.*)",
  "/settings(.*)",
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

function withDashboardCacheBust(response: NextResponse, pathname: string) {
  if (pathname === "/dashboard") {
    response.headers.set("Cache-Control", "no-store, max-age=0");
    response.headers.set("Clear-Site-Data", '"cache"');
  }
  return response;
}

export default clerkMiddleware(async (auth, request) => {
  const url = new URL(request.url);
  const hostname = (request.headers.get("host") || "").split(":")[0].toLowerCase();
  if (hostname === "bourbonsignal.com") {
    url.hostname = "www.bourbonsignal.com";
    url.port = "";
    return NextResponse.redirect(url, 308);
  }
  if (url.pathname === "/api/alerts/deliver") return NextResponse.next();
  if (url.pathname === "/api/alerts/manual-send") return NextResponse.next();
  if (url.pathname === "/api/webhooks/stripe") return NextResponse.next();
  if (!isProtectedRoute(request)) return withDashboardCacheBust(NextResponse.next(), url.pathname);

  const { userId } = await auth();
  if (userId) return withDashboardCacheBust(NextResponse.next(), url.pathname);

  if (url.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Account required" }, { status: 401 });
  }
  if (url.pathname.startsWith("/retailers/portal")) {
    const retailerLoginUrl = new URL("/retailers/login", request.url);
    retailerLoginUrl.searchParams.set("redirect_url", `${url.pathname}${url.search}`);
    return NextResponse.redirect(retailerLoginUrl);
  }

  const signUpUrl = new URL("/sign-up", request.url);
  const redirectAfterAccount = url.pathname.startsWith("/sightings") ? "/pricing" : `${url.pathname}${url.search}`;
  signUpUrl.searchParams.set("redirect_url", redirectAfterAccount);
  return withDashboardCacheBust(NextResponse.redirect(signUpUrl), url.pathname);
});

export const config = {
  matcher: [
    // Skip Next internals and static assets, but run on app/API routes.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/api/(.*)",
    "/__clerk/(.*)",
  ],
};
