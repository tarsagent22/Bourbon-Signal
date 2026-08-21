import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { GET as getLegacyDrops } from "@/app/api/drops/route";
import { GET as getLegacySightings, POST as createLegacySighting } from "@/app/api/sightings/route";
import { createSignalFeedHandler } from "@/lib/signals/signal-route";
import { createSignalCreateHandler, signalApiError } from "@/lib/signals/signal-api-route";

const handleSignalFeed = createSignalFeedHandler({
  getDrops: (request) => getLegacyDrops(request as NextRequest),
  getSightings: (request) => getLegacySightings(request as NextRequest),
});
const handleSignalCreate = createSignalCreateHandler({
  createSighting: (request) => createLegacySighting(request as NextRequest),
});

export async function GET(request: NextRequest) {
  return handleSignalFeed(request);
}

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return signalApiError(401, "UNAUTHORIZED", "Sign in to continue.");
  return handleSignalCreate(request);
}
