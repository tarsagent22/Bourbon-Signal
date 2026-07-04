import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { isRewardsAdminEmail } from "@/lib/sighting-rewards";
import { readBottleContributionQueue, updateBottleContribution } from "@/lib/bottle-contributions";

function primaryEmail(user: { emailAddresses?: unknown[]; primaryEmailAddressId?: unknown }) {
  const emails = Array.isArray(user.emailAddresses) ? user.emailAddresses as Array<Record<string, unknown>> : [];
  const primaryId = typeof user.primaryEmailAddressId === "string" ? user.primaryEmailAddressId : "";
  const primary = emails.find((email) => email.id === primaryId) || emails[0];
  return typeof primary?.emailAddress === "string" ? primary.emailAddress : "";
}

async function requireAdmin() {
  const { userId } = await auth();
  if (!userId) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  if (!isRewardsAdminEmail(primaryEmail(user))) return { error: NextResponse.json({ error: "Admin only" }, { status: 403 }) };
  return { client, adminUserId: userId };
}

export async function GET() {
  const admin = await requireAdmin();
  if (admin.error) return admin.error;
  const queue = await readBottleContributionQueue();
  return NextResponse.json({ ok: true, queue, contributions: queue.contributions });
}

export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();
  if (admin.error) return admin.error;
  const payload = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = typeof payload.id === "string" ? payload.id : "";
  const action = typeof payload.action === "string" ? payload.action : "";
  if (!id) return NextResponse.json({ error: "Missing contribution" }, { status: 400 });
  const status = action === "match" ? "matched_existing"
    : action === "needs_human" ? "needs_human"
      : action === "added" ? "added"
        : action === "reject" ? "rejected"
          : action === "ignore" ? "ignored"
            : null;
  if (!status) return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  const updated = await updateBottleContribution(id, {
    status,
    candidateBottleId: typeof payload.candidateBottleId === "string" ? payload.candidateBottleId : undefined,
    candidateBottleName: typeof payload.candidateBottleName === "string" ? payload.candidateBottleName : undefined,
    notes: typeof payload.notes === "string" ? payload.notes.slice(0, 1000) : `Marked ${status} by admin.`,
  });
  return NextResponse.json({ ok: true, contribution: updated });
}
