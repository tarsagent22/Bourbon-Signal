import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isProtectedRoute = createRouteMatcher([
  "/dashboard(.*)",
  "/settings(.*)",
  "/alerts(.*)",
  "/api/alerts(.*)",
  "/api/user/preferences(.*)",
  "/api/alerts/preview(.*)",
  "/api/checkout(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/dashboard(.*)",
    "/settings(.*)",
    "/alerts(.*)",
    "/api/alerts(.*)",
    "/api/user/preferences(.*)",
    "/api/alerts/preview(.*)",
    "/api/checkout(.*)",
  ],
};
