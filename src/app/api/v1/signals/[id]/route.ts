import { NextRequest } from "next/server";
import { GET as getLegacyDrops } from "@/app/api/drops/route";
import { GET as getLegacySightings } from "@/app/api/sightings/route";
import { createSignalDetailHandler } from "@/lib/signals/signal-api-route";

const handleSignalDetail = createSignalDetailHandler({
  getDrops: (request) => getLegacyDrops(request),
  getSightings: (request) => getLegacySightings(request as NextRequest),
});

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return handleSignalDetail(request, id);
}
