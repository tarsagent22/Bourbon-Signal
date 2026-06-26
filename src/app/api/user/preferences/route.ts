import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import {
  getDefaultNotificationPreferences,
  normalizeNotificationPreferences,
  type NotificationPreferences,
} from "@/lib/notification-preferences";
import { ACTIVE_ENGINE_STATE_CODES } from "@/lib/activeStates";
import type { MemberSighting, SignalReport, SignalReportKind, SightingVote, SightingVoteKind, SightingType, SightingsPreferences } from "@/lib/sightings";
import { getEntitlements } from "@/lib/entitlements";
import { getQaPreviewTierFromRequest, isQaPreviewRequest, QA_PREVIEW_PREFERENCES } from "@/lib/preview-qa";

export interface AreaPreferences {
  states: string[];
  ncBoards: string[];
  vaCities: string[];
  ohCities: string[];
  iaCities: string[];
  idCities: string[];
  paCounties: string[];
  paStores: string[];
}

export type AlertMode = "specific_bottles" | "anything_notable";

export interface CollectionBottlePreference {
  bottleId: string;
  bottleName: string;
  canonicalKey: string;
  rating: number;
  tasteTags?: string[];
  wouldBuyAgain?: boolean;
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
  sightingsPreferences?: SightingsPreferences;
}

const EMPTY_AREA_PREFERENCES: AreaPreferences = {
  states: [],
  ncBoards: [],
  vaCities: [],
  ohCities: [],
  iaCities: [],
  idCities: [],
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

const EMPTY_SIGHTINGS_PREFERENCES: SightingsPreferences = {
  submittedSightings: [],
  signalReports: [],
  sightingVotes: [],
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
    states: toStringArray(source.states).map((state) => state.toUpperCase()).filter((state) => supportedStates.has(state)),
    ncBoards: toStringArray(source.ncBoards),
    vaCities: toStringArray(source.vaCities),
    ohCities: toStringArray(source.ohCities),
    iaCities: toStringArray(source.iaCities),
    idCities: toStringArray(source.idCities),
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
      tasteTags: Array.isArray(item.tasteTags)
        ? Array.from(new Set(item.tasteTags.filter((tag): tag is string => typeof tag === "string").map((tag) => tag.trim()).filter(Boolean))).slice(0, 12)
        : [],
      wouldBuyAgain: typeof item.wouldBuyAgain === "boolean" ? item.wouldBuyAgain : rating >= 80,
      notes: typeof item.notes === "string" ? item.notes.slice(0, 500) : "",
      addedAt,
      updatedAt,
    });
  }

  return { bottles: bottles.slice(0, 250) };
}

function normalizeSightingsPreferences(input: unknown): SightingsPreferences {
  const source = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const rawSightings = Array.isArray(source.submittedSightings) ? source.submittedSightings : [];
  const rawReports = Array.isArray(source.signalReports) ? source.signalReports : [];

  const submittedSightings: MemberSighting[] = rawSightings.flatMap((raw) => {
    const item = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const bottleName = typeof item.bottleName === "string" ? item.bottleName.trim().slice(0, 140) : "";
    const storeId = typeof item.storeId === "string" ? item.storeId.trim().slice(0, 160) : "";
    const storeName = typeof item.storeName === "string" ? item.storeName.trim().slice(0, 180) : "";
    const storeAddress = typeof item.storeAddress === "string" ? item.storeAddress.trim().slice(0, 220) : "";
    if (!bottleName || !storeId || !storeName || !storeAddress) return [];
    const price = typeof item.price === "number" && Number.isFinite(item.price) ? Math.max(0, Math.min(99999, item.price)) : null;
    const sightingSource: MemberSighting["source"] = item.source === "feed" || item.source === "finder" ? item.source : "custom";
    const rarityTier: MemberSighting["rarityTier"] = item.rarityTier === "unicorn" || item.rarityTier === "allocated" || item.rarityTier === "limited" ? item.rarityTier : "limited";
    const sightingType: SightingType = item.sightingType === "online_social" ? "online_social" : "seen_in_store";
    return [{
      id: typeof item.id === "string" ? item.id.slice(0, 120) : `sighting_${Date.now()}`,
      bottleName,
      bottleId: typeof item.bottleId === "string" ? item.bottleId.slice(0, 160) : undefined,
      rarityTier,
      storeId,
      storeName,
      storeAddress,
      storeCity: typeof item.storeCity === "string" ? item.storeCity.slice(0, 120) : undefined,
      storeState: typeof item.storeState === "string" ? item.storeState.slice(0, 10).toUpperCase() : undefined,
      storeZip: typeof item.storeZip === "string" ? item.storeZip.slice(0, 20) : undefined,
      quantityEstimate: typeof item.quantityEstimate === "string" ? item.quantityEstimate.slice(0, 80) : undefined,
      price,
      notes: typeof item.notes === "string" ? item.notes.slice(0, 500) : undefined,
      source: sightingSource,
      sightingType,
      reporterUserId: typeof item.reporterUserId === "string" ? item.reporterUserId.slice(0, 120) : undefined,
      createdAt: typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString(),
    }];
  }).slice(0, 100);

  const signalReports: SignalReport[] = rawReports.flatMap((raw) => {
    const item = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const signalId = typeof item.signalId === "string" ? item.signalId.slice(0, 260) : "";
    const bottleName = typeof item.bottleName === "string" ? item.bottleName.trim().slice(0, 140) : "";
    const kind: SignalReportKind | null = item.kind === "not_seen" ? "not_seen" : item.kind === "seen" ? "seen" : null;
    if (!signalId || !bottleName || !kind) return [];
    return [{
      id: typeof item.id === "string" ? item.id.slice(0, 120) : `report_${Date.now()}`,
      signalId,
      bottleName,
      storeName: typeof item.storeName === "string" ? item.storeName.slice(0, 180) : undefined,
      storeAddress: typeof item.storeAddress === "string" ? item.storeAddress.slice(0, 220) : undefined,
      state: typeof item.state === "string" ? item.state.slice(0, 10).toUpperCase() : undefined,
      kind,
      createdAt: typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString(),
    }];
  }).slice(0, 250);

  const rawVotes = Array.isArray(source.sightingVotes) ? source.sightingVotes : [];
  const sightingVotes: SightingVote[] = rawVotes.flatMap((raw) => {
    const item = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const sightingId = typeof item.sightingId === "string" ? item.sightingId.slice(0, 160) : "";
    const kind: SightingVoteKind | null = item.kind === "down" ? "down" : item.kind === "up" ? "up" : null;
    if (!sightingId || !kind) return [];
    return [{ sightingId, kind, createdAt: typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString() }];
  }).slice(0, 500);

  return { submittedSightings, signalReports, sightingVotes };
}

function buildResponseFromMetadata(user: Awaited<ReturnType<Awaited<ReturnType<typeof clerkClient>>["users"]["getUser"]>>): UserAlertPreferences {
  return {
    areaPreferences: normalizeAreaPreferences(user.publicMetadata?.areaPreferences),
    notificationPreferences: normalizeNotificationPreferences(user.publicMetadata?.notificationPreferences),
    alertMode: normalizeAlertMode(user.publicMetadata?.alertMode),
    bottleAlertPreferences: normalizeBottleAlertPreferences(user.publicMetadata?.bottleAlertPreferences),
    collectionPreferences: normalizeCollectionPreferences(user.publicMetadata?.collectionPreferences),
    sightingsPreferences: normalizeSightingsPreferences(user.publicMetadata?.sightingsPreferences),
  };
}

function buildQaPreviewResponse(req: NextRequest, payload: Partial<UserAlertPreferences> = {}) {
  const tier = getQaPreviewTierFromRequest(req);
  const entitlements = getEntitlements(tier);
  let areaPreferences = normalizeAreaPreferences(payload.areaPreferences ?? QA_PREVIEW_PREFERENCES.areaPreferences);
  let notificationPreferences = normalizeNotificationPreferences(payload.notificationPreferences ?? QA_PREVIEW_PREFERENCES.notificationPreferences);
  const alertMode = payload.alertMode === undefined ? QA_PREVIEW_PREFERENCES.alertMode : normalizeAlertMode(payload.alertMode);
  let bottleAlertPreferences = normalizeBottleAlertPreferences(payload.bottleAlertPreferences ?? QA_PREVIEW_PREFERENCES.bottleAlertPreferences);
  const collectionPreferences = normalizeCollectionPreferences(payload.collectionPreferences ?? QA_PREVIEW_PREFERENCES.collectionPreferences);
  const sightingsPreferences = normalizeSightingsPreferences(payload.sightingsPreferences ?? QA_PREVIEW_PREFERENCES.sightingsPreferences);

  if (entitlements.alertAreaLimit === 0) {
    areaPreferences = { ...areaPreferences, states: [] };
    notificationPreferences = {
      ...notificationPreferences,
      onSite: { ...notificationPreferences.onSite, enabled: false },
      email: { ...notificationPreferences.email, enabled: false },
      sms: { ...notificationPreferences.sms, enabled: false },
    };
    bottleAlertPreferences = { bottleNames: [], bottleKeys: [] };
  }

  if (!entitlements.canReceiveSmsAlerts) {
    notificationPreferences = {
      ...notificationPreferences,
      sms: { ...notificationPreferences.sms, enabled: false },
    };
  }

  if (typeof entitlements.alertAreaLimit === "number") {
    areaPreferences = {
      ...areaPreferences,
      states: areaPreferences.states.slice(0, entitlements.alertAreaLimit),
    };
  }

  if (!entitlements.canUseAdvancedFilters) {
    areaPreferences = {
      ...areaPreferences,
      ncBoards: [],
      vaCities: [],
      ohCities: [],
      iaCities: [],
      idCities: [],
      paCounties: [],
      paStores: [],
    };
  }

  if (typeof entitlements.trackedBottleLimit === "number") {
    bottleAlertPreferences = {
      bottleNames: bottleAlertPreferences.bottleNames.slice(0, entitlements.trackedBottleLimit),
      bottleKeys: bottleAlertPreferences.bottleKeys.slice(0, entitlements.trackedBottleLimit),
    };
  }

  return {
    ok: true,
    qaPreview: true,
    qaTier: tier,
    entitlements,
    areaPreferences,
    notificationPreferences,
    alertMode,
    bottleAlertPreferences,
    collectionPreferences,
    sightingsPreferences,
  };
}

export async function GET(req: NextRequest) {
  if (isQaPreviewRequest(req)) return NextResponse.json(buildQaPreviewResponse(req));
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  return NextResponse.json(buildResponseFromMetadata(user));
}

export async function POST(req: NextRequest) {
  if (isQaPreviewRequest(req)) {
    const payload = (await req.json().catch(() => ({}))) as Partial<UserAlertPreferences>;
    const attemptedAlertWrite = payload.areaPreferences !== undefined || payload.notificationPreferences !== undefined || payload.alertMode !== undefined || payload.bottleAlertPreferences !== undefined;
    const entitlements = getEntitlements(getQaPreviewTierFromRequest(req));
    if (attemptedAlertWrite && entitlements.alertAreaLimit === 0) {
      return NextResponse.json({ error: "Alert setup is included with Standard Proof and above.", qaPreview: true, qaTier: entitlements.tier }, { status: 403 });
    }
    return NextResponse.json(buildQaPreviewResponse(req, payload));
  }
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const payload = (await req.json().catch(() => ({}))) as Partial<UserAlertPreferences>;
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const existing = buildResponseFromMetadata(user);

  let areaPreferences = normalizeAreaPreferences(payload.areaPreferences ?? existing.areaPreferences ?? EMPTY_AREA_PREFERENCES);
  let notificationPreferences = normalizeNotificationPreferences(
    payload.notificationPreferences ?? existing.notificationPreferences ?? getDefaultNotificationPreferences()
  );
  const alertMode = payload.alertMode === undefined ? existing.alertMode : normalizeAlertMode(payload.alertMode);
  let bottleAlertPreferences = normalizeBottleAlertPreferences(payload.bottleAlertPreferences ?? existing.bottleAlertPreferences ?? EMPTY_BOTTLE_ALERT_PREFERENCES);
  const collectionPreferences = normalizeCollectionPreferences(payload.collectionPreferences ?? existing.collectionPreferences ?? EMPTY_COLLECTION_PREFERENCES);
  const sightingsPreferences = normalizeSightingsPreferences(payload.sightingsPreferences ?? existing.sightingsPreferences ?? EMPTY_SIGHTINGS_PREFERENCES);
  const entitlements = getEntitlements(user.publicMetadata?.tier);
  const attemptedAlertWrite = payload.areaPreferences !== undefined || payload.notificationPreferences !== undefined || payload.alertMode !== undefined || payload.bottleAlertPreferences !== undefined;

  if (attemptedAlertWrite && entitlements.alertAreaLimit === 0) {
    return NextResponse.json({ error: "Alert setup is included with Standard Proof and above." }, { status: 403 });
  }

  if (!entitlements.canReceiveSmsAlerts) {
    notificationPreferences = {
      ...notificationPreferences,
      sms: { ...notificationPreferences.sms, enabled: false },
    };
  }

  if (typeof entitlements.alertAreaLimit === "number") {
    areaPreferences = {
      ...areaPreferences,
      states: areaPreferences.states.slice(0, entitlements.alertAreaLimit),
    };
  }

  if (!entitlements.canUseAdvancedFilters) {
    areaPreferences = {
      ...areaPreferences,
      ncBoards: [],
      vaCities: [],
      ohCities: [],
      iaCities: [],
      idCities: [],
      paCounties: [],
      paStores: [],
    };
  }

  if (typeof entitlements.trackedBottleLimit === "number") {
    bottleAlertPreferences = {
      bottleNames: bottleAlertPreferences.bottleNames.slice(0, entitlements.trackedBottleLimit),
      bottleKeys: bottleAlertPreferences.bottleKeys.slice(0, entitlements.trackedBottleLimit),
    };
  }

  await client.users.updateUserMetadata(userId, {
    publicMetadata: { areaPreferences, notificationPreferences, alertMode, bottleAlertPreferences, collectionPreferences, sightingsPreferences },
  });

  return NextResponse.json({ ok: true, areaPreferences, notificationPreferences, alertMode, bottleAlertPreferences, collectionPreferences, sightingsPreferences });
}
