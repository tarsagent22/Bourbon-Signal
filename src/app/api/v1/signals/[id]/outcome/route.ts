import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { GET as getSignalDetail } from "../route";
import { createHuntOutcomeApi } from "@/lib/hunt-outcome-api";
import { getHuntOutcomeRepository } from "@/lib/hunt-outcome-repository";
import { signalApiError } from "@/lib/signals/signal-api-route";

function outcomeApi() {
  return createHuntOutcomeApi({
    repository: getHuntOutcomeRepository(),
    readSignal: (request, signalId) => getSignalDetail(request as NextRequest, {
      params: Promise.resolve({ id: signalId }),
    }),
  });
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return signalApiError(401, "UNAUTHORIZED", "Sign in to continue.");
  const { id } = await context.params;
  return outcomeApi().get(request, id, userId);
}

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return signalApiError(401, "UNAUTHORIZED", "Sign in to continue.");
  const { id } = await context.params;
  return outcomeApi().put(request, id, userId);
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return signalApiError(401, "UNAUTHORIZED", "Sign in to continue.");
  const { id } = await context.params;
  return outcomeApi().remove(request, id, userId);
}
