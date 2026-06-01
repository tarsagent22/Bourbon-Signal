import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Temporarily keep Clerk installed but do not require sign-in while the site is being edited.
// Re-enable route protection here when onboarding/subscriptions are ready.
export default function middleware(_req: NextRequest) {
  return NextResponse.next();
}

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
