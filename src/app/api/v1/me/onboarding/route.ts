import { auth, clerkClient } from "@clerk/nextjs/server";
import { createCommunitySightingsRepository } from "@/lib/community-sightings-repository";
import { communityDisplayNameFromMetadata } from "@/lib/community-display-name";
import { MobileOnboardingValidationError, prepareMobileOnboarding } from "@/lib/mobile-onboarding";
import { publicSignalIdentityFromMetadata } from "@/lib/signals/signal-api-contract";
import { PRIVATE_SIGNAL_API_HEADERS, signalApiError } from "@/lib/signals/signal-api-route";
import { ensureMemberNumber } from "@/lib/member-numbers";
import { normalizeOnboardingDraft } from "../../../../../../shared/mobile-onboarding";

export const dynamic = "force-dynamic";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return signalApiError(401, "UNAUTHORIZED", "Sign in to continue.");
  try {
    const client = await clerkClient();
    const user = await ensureMemberNumber(client, await client.users.getUser(userId));
    const mobileOnboarding = record(record(user.privateMetadata).mobileOnboarding);
    const completedAt = typeof mobileOnboarding.completedAt === "string" ? mobileOnboarding.completedAt : "";
    const onboardingCompleted = Boolean(completedAt && Number.isFinite(Date.parse(completedAt)));
    return Response.json({
      contractVersion: "bourbon-signal/mobile-api@1",
      completed: onboardingCompleted,
      draft: normalizeOnboardingDraft(mobileOnboarding.draft),
    }, { headers: PRIVATE_SIGNAL_API_HEADERS });
  } catch {
    return signalApiError(503, "ONBOARDING_UNAVAILABLE", "Account setup status could not be checked. Try again.", true);
  }
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return signalApiError(401, "UNAUTHORIZED", "Sign in to continue.");

  try {
    const body = record(await request.json().catch(() => null));
    const now = new Date().toISOString();
    const action = body.action ?? "complete";
    if (!["save", "profile", "complete"].includes(String(action))) return signalApiError(400, "INVALID_ONBOARDING", "Choose a valid setup action.");
    const draft = body.draft === undefined ? null : normalizeOnboardingDraft(body.draft);
    if ((action !== "complete" || body.draft !== undefined) && !draft) return signalApiError(400, "INVALID_ONBOARDING", "Your setup could not be saved. Check your answers.");
    const prepared = action === "save" ? null : prepareMobileOnboarding(body, now);
    const client = await clerkClient();
    const user = await ensureMemberNumber(client, await client.users.getUser(userId));
    const currentPublic = record(user.publicMetadata);
    const currentPrivate = record(user.privateMetadata);
    const previousName = communityDisplayNameFromMetadata(currentPublic);
    const identity = publicSignalIdentityFromMetadata(currentPublic);
    const existingOnboarding = record(currentPrivate.mobileOnboarding);
    if (!prepared) {
      await client.users.updateUserMetadata(userId, { privateMetadata: { mobileOnboarding: { ...existingOnboarding, draft, updatedAt: now } } });
      return Response.json({ contractVersion: "bourbon-signal/mobile-api@1", completed: Boolean(existingOnboarding.completedAt), draft }, { headers: PRIVATE_SIGNAL_API_HEADERS });
    }
    const firstAffirmedAt = typeof existingOnboarding.age21AffirmedAt === "string"
      && Number.isFinite(Date.parse(existingOnboarding.age21AffirmedAt))
      ? existingOnboarding.age21AffirmedAt
      : prepared.privateMetadata.mobileOnboarding.age21AffirmedAt;
    const repository = identity ? createCommunitySightingsRepository() : null;

    if (repository && identity) {
      await repository.updateReporterDisplayName(userId, prepared.displayName, { ...identity, displayName: prepared.displayName });
    }
    try {
      await client.users.updateUserMetadata(userId, {
        publicMetadata: { ...prepared.publicMetadata, memberProfile: { ...record(currentPublic.memberProfile), ...prepared.publicMetadata.memberProfile } },
        privateMetadata: {
          mobileOnboarding: {
            ...existingOnboarding,
            ...prepared.privateMetadata.mobileOnboarding,
            version: draft ? 2 : 1,
            completedAt: action === "complete" ? now : existingOnboarding.completedAt || null,
            ...(draft ? { draft } : {}),
            age21AffirmedAt: firstAffirmedAt,
          },
        },
      });
    } catch (error) {
      if (repository && identity) {
        await repository.updateReporterDisplayName(
          userId,
          previousName || "",
          { ...identity, ...(previousName ? { displayName: previousName } : {}) },
        ).catch(() => undefined);
      }
      throw error;
    }

    return Response.json({
      contractVersion: "bourbon-signal/mobile-api@1",
      completed: action === "complete" || Boolean(existingOnboarding.completedAt),
      draft,
    }, { headers: PRIVATE_SIGNAL_API_HEADERS });
  } catch (error) {
    if (error instanceof MobileOnboardingValidationError) {
      return signalApiError(400, "INVALID_ONBOARDING", error.message);
    }
    return signalApiError(503, "ONBOARDING_UNAVAILABLE", "Your profile could not be saved. Try again.", true);
  }
}
