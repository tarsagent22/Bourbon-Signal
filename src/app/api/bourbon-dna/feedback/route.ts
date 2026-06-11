import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";

export type BourbonDnaFeedbackSignal = "useful" | "not_for_me" | "already_own";

export interface BourbonDnaFeedbackEntry {
  bottleId: string;
  bottleName: string;
  signal: BourbonDnaFeedbackSignal;
  matchedTags: string[];
  score?: number;
  createdAt: string;
}

function normalizeSignal(value: unknown): BourbonDnaFeedbackSignal | null {
  if (value === "useful" || value === "not_for_me" || value === "already_own") return value;
  return null;
}

function normalizeExisting(input: unknown): BourbonDnaFeedbackEntry[] {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>).entries : [];
  if (!Array.isArray(raw)) return [];
  const entries: BourbonDnaFeedbackEntry[] = [];

  for (const rawItem of raw) {
    if (!rawItem || typeof rawItem !== "object") continue;
    const item = rawItem as Record<string, unknown>;
    const signal = normalizeSignal(item.signal);
    const bottleId = typeof item.bottleId === "string" ? item.bottleId : "";
    const bottleName = typeof item.bottleName === "string" ? item.bottleName : "";
    if (!signal || !bottleId || !bottleName) continue;
    entries.push({
      bottleId,
      bottleName,
      signal,
      matchedTags: Array.isArray(item.matchedTags) ? item.matchedTags.filter((tag): tag is string => typeof tag === "string").slice(0, 12) : [],
      score: typeof item.score === "number" && Number.isFinite(item.score) ? item.score : undefined,
      createdAt: typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString(),
    });
  }

  return entries;
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const payload = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const signal = normalizeSignal(payload.signal);
  const bottleId = typeof payload.bottleId === "string" ? payload.bottleId.trim() : "";
  const bottleName = typeof payload.bottleName === "string" ? payload.bottleName.trim() : "";
  if (!signal || !bottleId || !bottleName) return NextResponse.json({ error: "Invalid DNA feedback." }, { status: 400 });

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const existing = normalizeExisting(user.publicMetadata?.bourbonDnaFeedback);
  const entry: BourbonDnaFeedbackEntry = {
    bottleId,
    bottleName,
    signal,
    matchedTags: Array.isArray(payload.matchedTags) ? payload.matchedTags.filter((tag): tag is string => typeof tag === "string").slice(0, 12) : [],
    score: typeof payload.score === "number" && Number.isFinite(payload.score) ? payload.score : undefined,
    createdAt: new Date().toISOString(),
  };

  const nextEntries = [entry, ...existing.filter((item) => !(item.bottleId === bottleId && item.signal === signal))].slice(0, 200);
  await client.users.updateUserMetadata(userId, {
    publicMetadata: {
      bourbonDnaFeedback: {
        entries: nextEntries,
        updatedAt: entry.createdAt,
      },
    },
  });

  return NextResponse.json({ ok: true, bourbonDnaFeedback: { entries: nextEntries, updatedAt: entry.createdAt } });
}
