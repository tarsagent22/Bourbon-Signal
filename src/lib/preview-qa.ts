import type { NextRequest } from "next/server";
import type { MembershipTier } from "@/lib/entitlements";

export const QA_PREVIEW_TIERS: MembershipTier[] = ["free", "standard", "barrel", "bottled-in-bond"];
export const QA_PREVIEW_TIER: MembershipTier = "bottled-in-bond";
export const QA_PREVIEW_TIER_COOKIE = "bourbon_signal_qa_tier";
export const QA_PREVIEW_TIER_STORAGE_KEY = "bourbonSignalQaTier";

export const QA_PREVIEW_PREFERENCES = {
  areaPreferences: {
    states: ["NC", "VA", "PA"],
    ncBoards: [],
    vaCities: [],
    ohCities: [],
    iaCities: [],
    idCities: [],
    paCounties: [],
    paStores: [],
  },
  notificationPreferences: {
    onSite: { enabled: true },
    email: { enabled: true, mode: "major_only" as const },
    sms: { enabled: false, available: true, mode: "major_only" as const, verified: false },
  },
  alertMode: "anything_notable" as const,
  bottleAlertPreferences: {
    bottleNames: ["Blanton's Single Barrel", "Weller Antique 107", "E.H. Taylor Small Batch"],
    bottleKeys: ["blanton s single barrel", "weller antique 107", "e h taylor small batch"],
  },
  collectionPreferences: {
    bottles: [],
  },
  sightingsPreferences: {
    submittedSightings: [],
    signalReports: [],
    sightingVotes: [],
  },
};

export function normalizeQaPreviewTier(value: unknown): MembershipTier {
  if (value === "free" || value === "standard" || value === "barrel" || value === "bottled-in-bond") return value;
  if (value === "bib" || value === "founder" || value === "lifetime") return "bottled-in-bond";
  return QA_PREVIEW_TIER;
}

function hostLooksLikeSafeQaPreview(hostname: string) {
  const host = hostname.toLowerCase().split(":")[0];
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.includes("bourbonsignal-git-launch-membershi")
  );
}

export function isQaPreviewRequest(request: NextRequest) {
  const host = request.headers.get("host") || "";
  return process.env.BOURBON_SIGNAL_QA_PREVIEW === "1" || hostLooksLikeSafeQaPreview(host);
}

export function getQaPreviewTierFromRequest(request: NextRequest): MembershipTier {
  const queryTier = request.nextUrl.searchParams.get("qaTier") || request.nextUrl.searchParams.get("tier");
  if (queryTier) return normalizeQaPreviewTier(queryTier);
  const headerTier = request.headers.get("x-bourbon-signal-qa-tier");
  if (headerTier) return normalizeQaPreviewTier(headerTier);
  const cookieTier = request.cookies.get(QA_PREVIEW_TIER_COOKIE)?.value;
  if (cookieTier) return normalizeQaPreviewTier(cookieTier);
  return QA_PREVIEW_TIER;
}

export function isQaPreviewMode() {
  if (process.env.NEXT_PUBLIC_BOURBON_SIGNAL_QA_PREVIEW === "1") return true;
  if (typeof window === "undefined") return false;
  return hostLooksLikeSafeQaPreview(window.location.hostname);
}

function queryTierFromBrowser() {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  return params.get("qaTier") || params.get("tier");
}

function cookieTierFromBrowser() {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${QA_PREVIEW_TIER_COOKIE}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function setQaPreviewTier(tier: MembershipTier) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(QA_PREVIEW_TIER_STORAGE_KEY, tier);
  }
  if (typeof document !== "undefined") {
    document.cookie = `${QA_PREVIEW_TIER_COOKIE}=${encodeURIComponent(tier)}; path=/; max-age=1209600; SameSite=Lax`;
  }
}

export function getQaPreviewTierFromBrowser(): MembershipTier {
  if (typeof window === "undefined") return QA_PREVIEW_TIER;
  const queryTier = queryTierFromBrowser();
  if (queryTier) {
    const tier = normalizeQaPreviewTier(queryTier);
    setQaPreviewTier(tier);
    return tier;
  }
  const storedTier = window.localStorage.getItem(QA_PREVIEW_TIER_STORAGE_KEY);
  if (storedTier) return normalizeQaPreviewTier(storedTier);
  const cookieTier = cookieTierFromBrowser();
  if (cookieTier) return normalizeQaPreviewTier(cookieTier);
  return QA_PREVIEW_TIER;
}
