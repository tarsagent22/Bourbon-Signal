import { NextRequest } from "next/server";
import { GET as getLegacyDrops } from "@/app/api/drops/route";
import { GET as getLegacySightings } from "@/app/api/sightings/route";
import { createSignalFeedHandler } from "@/lib/signals/signal-route";

const handleSignalFeed = createSignalFeedHandler({
  getDrops: (request) => getLegacyDrops(request as NextRequest),
  getSightings: (request) => getLegacySightings(request as NextRequest),
});

export async function GET(request: NextRequest) {
  return handleSignalFeed(request);
}
