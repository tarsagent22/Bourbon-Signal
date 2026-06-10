import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import {
  getDefaultNotificationPreferences,
  normalizeNotificationPreferences,
  type NotificationPreferences,
} from "@/lib/notification-preferences";
import { ACTIVE_ENGINE_STATE_CODES } from "@/lib/activeStates";

export interface AreaPreferences {
  states: string[];
  ncBoards: string[];
  vaCities: string[];
  ohCities: string[];
  iaCities: string[];
  paCounties: string[];
  paStores: string[];
}

export type AlertMode = "specific_bottles" | "anything_notable";

export interface CollectionBottlePreference {
  bottleId: string;
  bottleName: string;
  canonicalKey: string;
  rating: number;
  notes?: string;
  addedAt: string;
  updatedAt: string;
}

export interface UserAlertPreferences {
  areaPreferences: AreaPreferences;
  notificationPreferences: NotificationPreferences;
  alertMode: AlertMode;
  bottleAlertPreferences: {
    bottleNames: string[];
    bottleKeys: string[];
  };
  collectionPreferences: {
    bottles: CollectionBottlePreference[];
  };
}

const EMPTY_AREA_PREFERENCES: AreaPreferences = {
  states: [],
  ncBoards: [],
  vaCities: [],
  ohCities: [],
  iaCities: [],
  paCounties: [],
  paStores: [],
};

const EMPTY_BOTTLE_ALERT_PREFERENCES: UserAlertPreferences["bottleAlertPreferences"] = {
  bottleNames: [],
  bottleKeys: [],
};

const EMPTY_COLLECTION_PREFERENCES: UserAlertPreferences["collectionPreferences"] = {
  bottles: [],
};

function normalizeAlertMode(input: unknown): AlertMode {
  return input === "specific_bottles" ? "specific_bottles" : "anything_notable";
}

function normalizeAreaPreferences(input: unknown): AreaPreferences {
  const source = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;

  const toStringArray = (value: unknown) =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

  const supportedStates = new Set<string>(ACTIVE_ENGINE_STATE_CODES);

  return {
    states: toStringArray(source.states).filter((state) => supportedStates.has(state)),
    ncBoards: toStringArray(source.ncBoards),
    vaCities: toStringArray(source.vaCities),
    ohCities: toStringArray(source.ohCities),
    iaCities: toStringArray(source.iaCities),
    paCounties: toStringArray(source.paCounties),
    paStores: toStringArray(source.paStores),
  };
}

function normalizeBottleKey(value: string) {
  return value.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeBottleAlertPreferences(input: unknown): UserAlertPreferences["bottleAlertPreferences"] {
  const source = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const toStringArray = (value: unknown) =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  const unique = (values: string[]) => Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).slice(0, 100);
  return {
    bottleNames: unique(toStringArray(source.bottleNames)),
    bottleKeys: unique(toStringArray(source.bottleKeys).map(normalizeBottleKey)),
  };
}

function normalizeCollectionPreferences(input: unknown): UserAlertPreferences["collectionPreferences"] {
  const source = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const rawBottles = Array.isArray(source.bottles) ? source.bottles : [];
  const seen = new Set<string>();
  const bottles: CollectionBottlePreference[] = [];

  for (const raw of rawBottles) {
    const item = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const bottleName = typeof item.bottleName === "string" ? item.bottleName.trim() : "";
    const bottleId = typeof item.bottleId === "string" ? item.bottleId.trim() : normalizeBottleKey(bottleName);
    const canonicalKey = normalizeBottleKey(typeof item.canonicalKey === "string" ? item.canonicalKey : bottleName || bottleId);
    if (!bottleName || !canonicalKey || seen.has(canonicalKey)) continue;
    seen.add(canonicalKey);
    const rawRating = typeof item.rating === "number" && Number.isFinite(item.rating) ? item.rating : 0;
    const rating = Math.max(0, Math.min(100, Math.round(rawRating)));
    const addedAt = typeof item.addedAt === "string" ? item.addedAt : new Date().toISOString();
    const updatedAt = typeof item.updatedAt === "string" ? item.updatedAt : addedAt;
    bottles.push({
      bottleId,
      bottleName,
      canonicalKey,
      rating,
      notes: typeof item.notes === "string" ? item.notes.slice(0, 500) : "",
      addedAt,
      updatedAt,
    });
  }

  return { bottles: bottles.slice(0, 250) };
}

function buildResponseFromMetadata(user: Awaited<ReturnType<Awaited<ReturnType<typeof clerkClient>>["users"]["getUser"]>>): UserAlertPreferences {
  return {
    areaPreferences: normalizeAreaPreferences(user.publicMetadata?.areaPreferences),
    notificationPreferences: normalizeNotificationPreferences(user.publicMetadata?.notificationPreferences),
    alertMode: normalizeAlertMode(user.publicMetadata?.alertMode),
    bottleAlertPreferences: normalizeBottleAlertPreferences(user.publicMetadata?.bottleAlertPreferences),
    collectionPreferences: normalizeCollectionPreferences(user.publicMetadata?.collectionPreferences),
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
  const bottleAlertPreferences = normalizeBottleAlertPreferences(payload.bottleAlertPreferences ?? EMPTY_BOTTLE_ALERT_PREFERENCES);
  const collectionPreferences = normalizeCollectionPreferences(payload.collectionPreferences ?? EMPTY_COLLECTION_PREFERENCES);

  const client = await clerkClient();
  await client.users.updateUserMetadata(userId, {
    publicMetadata: { areaPreferences, notificationPreferences, alertMode, bottleAlertPreferences, collectionPreferences },
  });

  return NextResponse.json({ ok: true, areaPreferences, notificationPreferences, alertMode, bottleAlertPreferences, collectionPreferences });
}
