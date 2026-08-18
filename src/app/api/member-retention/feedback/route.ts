import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { classifyCompanyMember } from "@/lib/company-control-room";
import { normalizeRetentionFeedback } from "@/lib/member-retention";

export const dynamic = "force-dynamic";

const PRIVATE_HEADERS = { "Cache-Control": "private, no-store" };

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {};
}

function existingFeedback(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is UnknownRecord => Boolean(item && typeof item === "object" && !Array.isArray(item))).slice(-4) : [];
}

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "Account required." }, { status: 401, headers: PRIVATE_HEADERS });

  let feedback;
  try {
    feedback = normalizeRetentionFeedback(await request.json());
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Invalid feedback." }, { status: 400, headers: PRIVATE_HEADERS });
  }

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const member = classifyCompanyMember(user);
  if (!member.isPaid || member.isOwner || member.isRetailer || (member.effectiveTier !== "standard" && member.effectiveTier !== "barrel")) {
    return NextResponse.json({ ok: false, error: "An active paid membership is required." }, { status: 403, headers: PRIVATE_HEADERS });
  }

  const privateMetadata = record(user.privateMetadata);
  const history = existingFeedback(privateMetadata.retentionFeedback);
  const now = new Date().toISOString();
  const latest = history.at(-1);
  const duplicate = latest
    && latest.reason === feedback.reason
    && latest.details === feedback.details
    && latest.nextStep === feedback.nextStep
    && typeof latest.createdAt === "string"
    && Date.now() - Date.parse(latest.createdAt) < 60_000;
  if (!duplicate) {
    await client.users.updateUserMetadata(userId, {
      privateMetadata: {
        retentionFeedback: [...history, {
          ...feedback,
          source: "settings_membership",
          createdAt: now,
        }],
      },
    });
  }

  return NextResponse.json({ ok: true }, { headers: PRIVATE_HEADERS });
}
