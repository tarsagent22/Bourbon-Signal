import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { classifyCompanyMember } from "@/lib/company-control-room";
import {
  EXPERIMENT_PARTICIPATION_METADATA_KEY,
  buildExperimentApiResponse,
  recordExperimentExposure,
} from "@/lib/experiment-participation";
import {
  RELEASE_RADAR_FOLLOW_CTA_LABELS,
  RELEASE_RADAR_FOLLOW_EXPERIMENT_ID,
  assignActiveExperiment,
  getActiveExperiment,
  isExperimentKillSwitchEnabled,
  isExperimentProductionHost,
} from "@/lib/growth-experiments";

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}

function disabled() {
  return json({ enabled: false, variant: null, ctaLabel: RELEASE_RADAR_FOLLOW_CTA_LABELS.control });
}

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return json({ error: "Unauthorized" }, 401);

  if (isExperimentKillSwitchEnabled() || !isExperimentProductionHost(request.nextUrl.hostname)) return disabled();
  const payload = await request.json().catch(() => ({})) as { action?: unknown };
  if (payload.action !== "exposure") return json({ error: "Invalid action" }, 400);

  const experiment = getActiveExperiment();
  if (!experiment || experiment.id !== RELEASE_RADAR_FOLLOW_EXPERIMENT_ID) return disabled();

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const member = classifyCompanyMember(user);
  if (member.isOwner || member.isRetailer) return disabled();

  const assignment = assignActiveExperiment(userId);
  if (!assignment) return disabled();
  const update = recordExperimentExposure(user.privateMetadata || {}, experiment, assignment);
  if (update.changed) {
    await client.users.updateUserMetadata(userId, {
      privateMetadata: {
        [EXPERIMENT_PARTICIPATION_METADATA_KEY]: update.privateMetadata[EXPERIMENT_PARTICIPATION_METADATA_KEY],
      },
    });
  }
  return json(buildExperimentApiResponse(experiment, assignment));
}
