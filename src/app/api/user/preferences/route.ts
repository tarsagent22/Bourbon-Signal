import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import {
  getDefaultNotificationPreferences,
  normalizeNotificationPreferences,
  type NotificationPreferences,
} from "@/lib/notification-preferences";

export interface AreaPreferences {
  states: string[];
  ncBoards: string[];
  vaCities: string[];
  paCounties: string[];
  paStores: string[];
}

export type AlertMode = "specific_bottles" | "anything_notable";

export interface UserAlertPreferences {
  areaPreferences: AreaPreferences;
  notificationPreferences: NotificationPreferences;
  alertMode: AlertMode;
}

const EMPTY_AREA_PREFERENCES: AreaPreferences = {
  states: [],
  ncBoards: [],
  vaCities: [],
  paCounties: [],
  paStores: [],
};

function normalizeAlertMode(input: unknown): AlertMode {
  return input === "anything_notable" ? "anything_notable" : "specific_bottles";
}

function normalizeAreaPreferences(input: unknown): AreaPreferences {
  const source = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;

  const toStringArray = (value: unknown) =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

  return {
    states: toStringArray(source.states),
    ncBoards: toStringArray(source.ncBoards),
    vaCities: toStringArray(source.vaCities),
    paCounties: toStringArray(source.paCounties),
    paStores: toStringArray(source.paStores),
  };
}

function buildResponseFromMetadata(user: Awaited<ReturnType<Awaited<ReturnType<typeof clerkClient>>["users"]["getUser"]>>): UserAlertPreferences {
  return {
    areaPreferences: normalizeAreaPreferences(user.publicMetadata?.areaPreferences),
    notificationPreferences: normalizeNotificationPreferences(user.publicMetadata?.notificationPreferences),
    alertMode: normalizeAlertMode(user.publicMetadata?.alertMode),
  };
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  return NextResponse.json(buildResponseFromMetadata(user));
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const payload = (await req.json().catch(() => ({}))) as Partial<UserAlertPreferences>;
  const areaPreferences = normalizeAreaPreferences(payload.areaPreferences ?? EMPTY_AREA_PREFERENCES);
  const notificationPreferences = normalizeNotificationPreferences(
    payload.notificationPreferences ?? getDefaultNotificationPreferences()
  );
  const alertMode = normalizeAlertMode(payload.alertMode);

  const client = await clerkClient();
  await client.users.updateUserMetadata(userId, {
    publicMetadata: { areaPreferences, notificationPreferences, alertMode },
  });

  return NextResponse.json({ ok: true, areaPreferences, notificationPreferences, alertMode });
}
