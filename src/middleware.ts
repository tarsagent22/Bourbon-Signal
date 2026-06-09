import { NextResponse } from "next/server";
import { clerkMiddleware } from "@clerk/nextjs/server";

// Temporarily keep Clerk installed but do not require sign-in while the site is being edited.
// Re-enable route protection here when onboarding/subscriptions are ready.
export default clerkMiddleware(() => {
  return NextResponse.next();
});

export const config = {
  matcher: [
    "/dashboard(.*)",
    "/settings(.*)",
    "/alerts(.*)",
    "/api/alerts(.*)",
    "/api/user/preferences(.*)",
    "/api/alerts/preview(.*)",
    "/api/feedback(.*)",
    "/api/checkout(.*)",
  ],
};
