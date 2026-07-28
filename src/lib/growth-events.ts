export const GROWTH_EVENT_NAMES = [
  "product_surface_viewed",
  "signup_started",
  "registration_completed",
  "onboarding_state_selected",
  "free_value_reached",
  "pricing_viewed",
  "checkout_started",
  "membership_activated",
  "alert_area_saved",
  "watchlist_saved",
  "notification_channel_enabled",
  "paid_activation_completed",
  "first_alert_created",
  "retailer_application_started",
  "retailer_store_verified",
  "retailer_first_signal_live",
  "experiment_exposure",
  "experiment_metric",
  "radar_release_followed",
  "radar_bottle_tracked",
  "radar_market_handoff",
  "radar_calendar_exported",
] as const;

export type GrowthEventName = typeof GROWTH_EVENT_NAMES[number];
export type DurableGrowthMilestone =
  | "signup_started"
  | "registration_completed"
  | "onboarding_state_selected"
  | "free_value_reached"
  | "pricing_viewed"
  | "checkout_started"
  | "membership_activated"
  | "paid_activation_completed"
  | "first_alert_created";
export type GrowthSurface =
  | "homepage"
  | "sign_up"
  | "welcome"
  | "dashboard"
  | "drop_feed"
  | "release_radar"
  | "bottle_check"
  | "pricing"
  | "retailer"
  | "unknown";
export interface GrowthAttribution {
  surface: GrowthSurface;
  campaign: string;
  referrerHost: string;
}

const SURFACES = new Set<GrowthSurface>(["homepage", "sign_up", "welcome", "dashboard", "drop_feed", "release_radar", "bottle_check", "pricing", "retailer", "unknown"]);
const EVENT_NAMES = new Set<string>(GROWTH_EVENT_NAMES);
const MAX_VALUE_LENGTH = 80;

function safeToken(value: unknown, fallback = "unknown") {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized && normalized.length <= MAX_VALUE_LENGTH ? normalized : fallback;
}

function safeHost(value: unknown) {
  if (typeof value !== "string" || value.length > 1_000) return "unknown";
  try {
    const host = new URL(value).hostname.toLowerCase();
    return /^[a-z0-9.-]{1,253}$/.test(host) ? host : "unknown";
  } catch {
    return "unknown";
  }
}

export function normalizeGrowthAttribution(input: Record<string, unknown>): GrowthAttribution {
  const surfaceValue = safeToken(input.surface).replace(/-/g, "_");
  const surface = SURFACES.has(surfaceValue as GrowthSurface) ? surfaceValue as GrowthSurface : "unknown";
  const source = safeToken(input.utm_source);
  const medium = safeToken(input.utm_medium);
  const campaignName = safeToken(input.utm_campaign);
  const allowedSources = new Set(["newsletter", "direct", "instagram", "facebook", "meta", "google", "bing", "partner"]);
  const allowedMedia = new Set(["email", "social", "paid_social", "organic", "referral", "none"]);
  const suppliedCampaignParts = typeof input.campaign === "string" ? input.campaign.split(":") : [];
  const suppliedCampaign = suppliedCampaignParts.length === 3
    && String(input.campaign).length <= MAX_VALUE_LENGTH
    && allowedSources.has(suppliedCampaignParts[0])
    && allowedMedia.has(suppliedCampaignParts[1])
    && /^[a-z0-9_-]{1,80}$/.test(suppliedCampaignParts[2])
    ? suppliedCampaignParts.join(":")
    : null;
  const composedCampaign = `${source}:${medium}:${campaignName}`;
  const campaign = suppliedCampaign || (allowedSources.has(source) && allowedMedia.has(medium) && campaignName !== "unknown" && composedCampaign.length <= MAX_VALUE_LENGTH
    ? composedCampaign
    : "unknown");
  const referrer = input.referrer || (typeof input.referrerHost === "string" ? `https://${input.referrerHost}` : "");
  return { surface, campaign, referrerHost: safeHost(referrer) };
}

export function mergeFirstTouch(existing: GrowthAttribution | null | undefined, incoming: GrowthAttribution) {
  return existing || incoming;
}

export function mergeGrowthMilestoneMetadata(metadata: Record<string, unknown>, milestone: DurableGrowthMilestone, at: string) {
  const current = metadata.activation && typeof metadata.activation === "object"
    ? metadata.activation as Record<string, unknown>
    : {};
  return {
    ...metadata,
    activation: {
      ...current,
      [milestone]: current[milestone] || at,
    },
  };
}

export function sanitizeGrowthEvent(name: unknown, properties: Record<string, unknown>) {
  if (typeof name !== "string" || !EVENT_NAMES.has(name)) return null;
  const keys = Object.keys(properties);
  if (keys.some((key) => /email|phone|name|address|user|clerk|stripe|query|url|id/i.test(key))) return null;
  const safe: Record<string, string> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (!/^(surface|source|campaign|channel|tier|experiment|variant|metric|kind|market|verification|precision)$/.test(key) || typeof value !== "string" || value.length > MAX_VALUE_LENGTH || /https?:\/\//i.test(value) || /@/.test(value) || /(?:\+?\d[\s().-]*){7,}/.test(value)) return null;
    safe[key] = safeToken(value);
  }
  if (name === "experiment_exposure" && (!safe.experiment || !safe.variant || !safe.surface || safe.metric)) return null;
  if (name === "experiment_metric" && (!safe.experiment || !safe.variant || !safe.surface || !safe.metric)) return null;
  if ((name === "experiment_exposure" || name === "experiment_metric") && Object.values(safe).some((value) => value === "unknown")) return null;
  return safe;
}

export function isProductionGrowthEnvironment(hostname: string) {
  return hostname === "bourbonsignal.com" || hostname === "www.bourbonsignal.com";
}

export function normalizeCheckoutSource(value: unknown): GrowthSurface {
  const token = safeToken(value).replace(/-/g, "_");
  return SURFACES.has(token as GrowthSurface) ? token as GrowthSurface : "unknown";
}

export function contextualProductHref(path: "pricing" | "sign_up", source: unknown) {
  const safeSource = normalizeCheckoutSource(source);
  const target = path === "pricing" ? "/pricing" : "/sign-up";
  return safeSource === "unknown" ? target : `${target}?source=${safeSource}`;
}

export function resolveSignUpRedirect(value: unknown) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return "/welcome";
  return value;
}
