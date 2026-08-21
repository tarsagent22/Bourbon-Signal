import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { PATCH as updateLegacySighting } from "@/app/api/sightings/route";
import { createSignalActionHandler, signalApiError } from "@/lib/signals/signal-api-route";

const handleSignalAction = createSignalActionHandler({
  updateSighting: (request) => updateLegacySighting(request as NextRequest),
});

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return signalApiError(401, "UNAUTHORIZED", "Sign in to continue.");
  const { id } = await context.params;
  return handleSignalAction(request, id);
}
