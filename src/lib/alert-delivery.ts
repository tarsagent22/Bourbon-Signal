import { createHash, randomUUID } from "node:crypto";
import { clerkClient } from "@clerk/nextjs/server";
import { PaidDropAlertEmail } from "@/components/emails/PaidDropAlertEmail";
import { ALERT_FROM, ALERT_REPLY_TO, getResendClient } from "@/lib/email-alerts";
import { getServerEntitlements } from "@/lib/server-entitlements";
import { alertRarityIsSelected, buildAlertId, normalizeAlertRarityTier, normalizeNotificationPreferences, type EmailAlertMode, type MemberAlertRecord, type SmsAlertMode } from "@/lib/notification-preferences";
import { readSiteExport, readSiteExportResult } from "@/lib/site-engine-contract";
import { alertFreshnessIsDeliverable, evaluateAlertSnapshotSafety, resolveAlertFreshnessCapHours, signalFreshnessHoursAt } from "@/lib/alert-run-safety";
import { getActiveEngineStateName } from "@/lib/activeStates";
import { geographyState } from "@/lib/geography-directory";
import { locationMatchesAny, normalizeStateCodeParam } from "@/lib/location-normalization";
import { formatSmsAlert, isExactStoreSmsLocation } from "@/lib/sms-alert-copy";
import {
  enumerateUnderlyingAlertChildren,
  selectUnseenUnderlyingAlertChildren,
  stableGroupedAlertDedupeKey,
  stableUnderlyingAlertKey,
  withAvailabilityEpisodeIdentity,
} from "@/lib/alert-dedupe";
import { alertQueueDatabaseConfigured, createProductionAlertQueueRepository } from "@/lib/alert-queue/runtime";
import { reserveAlertDeliveryBatch, type AlertQueueMode } from "@/lib/alert-queue/delivery-gate";
import type { AlertCandidateRecord, AlertChannel } from "@/lib/alert-queue/repository";
import { ensureAlertDeliveryIdentityV2 } from "@/lib/alert-queue/clerk-migration";
import { californiaAreaMatchesFields, normalizeCaliforniaAreas } from "@/lib/california-area";
import { nevadaAreaMatchesFields, normalizeNevadaAreas } from "@/lib/nevada-area";
import { matchedNewYorkArea, newYorkAreaMatchesFields, normalizeNewYorkAreas } from "@/lib/new-york-area";
import { coloradoAreaMatchesFields, normalizeColoradoAreas } from "@/lib/colorado-area";
import { firstAlertCreatedMetadata } from "@/lib/member-activation";
import { buildExpoPushMessages, enabledPushTokens, pushPreferenceProjectionAllowsDelivery, sendExpoPushMessages } from "@/lib/push-devices";
import {
  CHARLOTTE_METRO_BOARD_GROUP,
  demandMetroAreaMatchesFields,
  demandMetroBoardGroupMatchesFields,
  normalizeDemandMetroAreas,
  normalizeNcBoardPreferences,
} from "@/lib/demand-metro-areas";
import { matchedNcAbcBoardPreference, ncAbcBoardPreferencesMatch } from "@/lib/nc-abc-boards";
import { buildCommunityAlertCandidates, canonicalCommunityStoreKey, COMMUNITY_ALERT_FRESHNESS_HOURS, qualifyCommunitySighting, type CanonicalCommunityStore } from "@/lib/community-alert-candidates";
import { createCommunitySightingsRepository } from "@/lib/community-sightings-repository";
import { candidateMatchesMonitoringScopes } from "@/lib/monitoring-scope-matcher";
import { monitoringScopesFromPreferences, type MonitoringScope } from "@/lib/monitoring-scopes";
import { listApprovedLocations } from "@/lib/approved-catalog-service";

export interface AreaPreferences {
  states: string[];
  ncBoards: string[];
  gaAreas: string[];
  tnAreas: string[];
  vaCities: string[];
  ohCities: string[];
  iaCities: string[];
  idCities: string[];
  scAreas: string[];
  caAreas: string[];
  nvAreas: string[];
  nyAreas: string[];
  coAreas: string[];
  paCounties: string[];
  paStores: string[];
  monitoringScopes?: MonitoringScope[];
}

export interface BottleAlertPreferences {
  bottleNames: string[];
  bottleKeys: string[];
}

type CandidateAlert = Record<string, unknown>;

type DeliveryRecord = {
  dedupeKey: string;
  underlyingStableKeys?: string[];
  deliveredAt: string;
  channel?: "email" | "sms";
  emailMode?: EmailAlertMode | null;
  smsMode?: SmsAlertMode | null;
  messageId: string | null;
  status?: string | null;
};

type AlertDeliveryMetadata = {
  dedupeIdentityVersion?: number;
  recent?: DeliveryRecord[];
  onSiteBaselineDedupeKeys?: string[];
  emailBaselineDedupeKeys?: string[];
  smsBaselineDedupeKeys?: string[];
  lastOnSiteBaselineAt?: string;
  lastEmailBaselineAt?: string;
  lastSmsBaselineAt?: string;
  lastRunAt?: string;
};

type AlertInboxMetadata = {
  recent: MemberAlertRecord[];
  lastSyncedAt?: string;
};

const MAX_RECENT_DELIVERIES_PER_USER = 250;
const MAX_RECENT_ONSITE_ALERTS_PER_USER = 100;
const MAX_DELIVERY_USERS = Number(process.env.ALERT_DELIVERY_MAX_USERS || 500);
const MAX_EMAILS_PER_RUN = Number(process.env.ALERT_DELIVERY_MAX_EMAILS_PER_RUN || 250);
const MAX_EMAILS_PER_USER = Number(process.env.ALERT_DELIVERY_MAX_EMAILS_PER_USER || 1);
const MAX_SMS_PER_RUN = Number(process.env.ALERT_DELIVERY_MAX_SMS_PER_RUN || 25);
const MAX_SMS_PER_USER = Number(process.env.ALERT_DELIVERY_MAX_SMS_PER_USER || 1);
const MAX_ONSITE_ALERTS_PER_USER = Number(process.env.ALERT_DELIVERY_MAX_ONSITE_ALERTS_PER_USER || 1);
const CANDIDATE_POOL_PER_USER = Number(process.env.ALERT_DELIVERY_CANDIDATE_POOL_PER_USER || 25);
const ALERT_DELIVERY_ENABLED = process.env.ALERT_DELIVERY_ENABLED === "1";
const ALERT_ONSITE_DELIVERY_ENABLED = ALERT_DELIVERY_ENABLED || process.env.ALERT_ONSITE_DELIVERY_ENABLED === "1";
const ALERT_EMAIL_DELIVERY_ENABLED = ALERT_DELIVERY_ENABLED || process.env.ALERT_EMAIL_DELIVERY_ENABLED === "1";
const ALERT_SMS_DELIVERY_ENABLED = process.env.ALERT_SMS_DELIVERY_ENABLED === "1";
const ALERT_REALTIME_MAX_FRESHNESS_HOURS = resolveAlertFreshnessCapHours(Number(process.env.ALERT_REALTIME_MAX_FRESHNESS_HOURS));
const ALERT_EMAIL_MAX_FRESHNESS_HOURS = resolveAlertFreshnessCapHours(Number(process.env.ALERT_EMAIL_MAX_FRESHNESS_HOURS || ALERT_REALTIME_MAX_FRESHNESS_HOURS));
const ALERT_SMS_MAX_FRESHNESS_HOURS = resolveAlertFreshnessCapHours(Number(process.env.ALERT_SMS_MAX_FRESHNESS_HOURS || ALERT_REALTIME_MAX_FRESHNESS_HOURS));
const ALERT_EMAIL_ALLOWED_RECIPIENTS = toStrings(process.env.ALERT_EMAIL_ALLOWED_RECIPIENTS?.split(",")).map((email) => email.toLowerCase());
const ALERT_SMS_ALLOWED_RECIPIENTS = toStrings(process.env.ALERT_SMS_ALLOWED_RECIPIENTS?.split(",")).map(normalizePhoneNumber).filter(Boolean);
const ALERT_SAFE_SUBJECT_PREFIX = "fresh signal detected";
const LEGACY_DENVER_METRO_LABEL = "Denver Metro"; // A saved legacy label, never an implicit statewide default.

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asBoolean(value: unknown) {
  return value === true;
}

function toStrings(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function normalizeAreaPrefs(input: unknown, explicitScopes?: unknown): AreaPreferences {
  const source = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const normalized: AreaPreferences = {
    states: Array.from(new Set(toStrings(source.states).map((state) => normalizeStateCodeParam(state)).filter((state): state is string => Boolean(state && geographyState(state))))),
    ncBoards: normalizeNcBoardPreferences(source.ncBoards),
    gaAreas: normalizeDemandMetroAreas("GA", source.gaAreas),
    tnAreas: normalizeDemandMetroAreas("TN", source.tnAreas),
    vaCities: toStrings(source.vaCities),
    ohCities: toStrings(source.ohCities),
    iaCities: toStrings(source.iaCities),
    idCities: toStrings(source.idCities),
    scAreas: toStrings(source.scAreas),
    caAreas: normalizeCaliforniaAreas(source.caAreas),
    nvAreas: normalizeNevadaAreas(source.nvAreas),
    nyAreas: normalizeNewYorkAreas(source.nyAreas),
    coAreas: normalizeColoradoAreas(source.coAreas),
    paCounties: toStrings(source.paCounties),
    paStores: toStrings(source.paStores),
  };
  normalized.monitoringScopes = monitoringScopesFromPreferences(normalized, explicitScopes);
  return normalized;
}

export function normalizeBottleAlertPreferences(input: unknown): BottleAlertPreferences {
  const source = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  return {
    bottleNames: uniqueStrings(toStrings(source.bottleNames)).slice(0, 100),
    bottleKeys: uniqueStrings(toStrings(source.bottleKeys).map(normalizeBottleKey)).slice(0, 100),
  };
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function stableHash(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}

function normalizePhoneNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("+") && digits.length >= 10 && digits.length <= 15) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return "";
}

function normalizeBottleKey(value: string) {
  return value.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function stateLabel(state: string) {
  return geographyState(state)?.name || getActiveEngineStateName(state) || state || "your area";
}

export async function readAlertCandidates() {
  return (await readAlertCandidateBatch()).candidates;
}

async function readAlertCandidateBatch() {
  const result = await readSiteExportResult("alerts");
  let communityCandidates: CandidateAlert[] = [];
  try {
    const storePayload = await readSiteExport("stores");
    const storeRows: Array<Record<string, unknown>> = [
      ...(Array.isArray(storePayload?.stores) ? storePayload.stores as Array<Record<string, unknown>> : []),
      ...(await listApprovedLocations().catch(() => [])).map((store) => store as unknown as Record<string, unknown>),
    ];
    const canonicalStores = new Map<string, CanonicalCommunityStore>();
    for (const store of storeRows) {
      const address = asString(store.address);
      const state = geographyState(asString(store.state || store.state_code))?.state || "";
      const city = asString(store.city || store.storeCity);
      const name = asString(store.name || store.displayLabel);
      if (!address || !state || !city || !name) continue;
      for (const id of [asString(store.id), asString(store.sourceStoreId), asString(store.storeId)].filter(Boolean)) {
        canonicalStores.set(canonicalCommunityStoreKey(state, id), { id, address, state, city, name });
      }
    }
    const now = new Date();
    const since = new Date(now.getTime() - COMMUNITY_ALERT_FRESHNESS_HOURS * 3_600_000).toISOString();
    const repository = createCommunitySightingsRepository();
    const recentCommunitySightings = await repository.listRecentAlertSightings(since, now.toISOString());
    const provisionallyEligibleIds = recentCommunitySightings
      .filter((input) => qualifyCommunitySighting({ ...input, alertAllowance: true }, now.toISOString(), canonicalStores).qualified)
      .map((input) => input.sighting.id);
    const authorizedSightingIds = await repository.reserveAlertAuthority(provisionallyEligibleIds, now.toISOString());
    const authorizedCommunitySightings = recentCommunitySightings.map((input) => ({
      ...input,
      alertAllowance: authorizedSightingIds.has(input.sighting.id),
    }));
    communityCandidates = buildCommunityAlertCandidates(authorizedCommunitySightings, now.toISOString(), canonicalStores);
  } catch (error) {
    if (process.env.NODE_ENV !== "test") console.warn("community alert candidates unavailable", error instanceof Error ? error.message : "unknown error");
  }
  return {
    candidates: [
      ...(Array.isArray(result.payload?.alerts)
        ? (result.payload.alerts as CandidateAlert[]).map(withAvailabilityEpisodeIdentity)
        : []),
      ...communityCandidates,
    ],
    snapshot: result,
  };
}

function candidateAreaLocationFields(candidate: CandidateAlert) {
  return [
    asString(candidate.locationName),
    asString(candidate.boardName),
    asString(candidate.location_name),
    asString(candidate.board_name),
    asString(candidate.displayLocation),
    asString(candidate.display_location),
    asString(candidate.storeName),
    asString(candidate.store_name),
    asString(candidate.storeAddress),
    asString(candidate.store_address),
    asString(candidate.storeCity),
    asString(candidate.store_city),
    asString(candidate.storeCounty),
    asString(candidate.store_county),
    asString(candidate.city),
    asString(candidate.county),
  ];
}

export function candidateMatchesArea(candidate: CandidateAlert, areaPrefs: AreaPreferences) {
  if (areaPrefs.monitoringScopes) return candidateMatchesMonitoringScopes(candidate, areaPrefs.monitoringScopes);
  const state = normalizeStateCodeParam(asString(candidate.state));
  if (!state) return false;
  if (areaPrefs.states.length && !areaPrefs.states.includes(state)) return false;

  const locationFields = candidateAreaLocationFields(candidate);

  if (state === "NC" && areaPrefs.ncBoards.length) {
    const ordinaryBoards = areaPrefs.ncBoards.filter((value) => value !== CHARLOTTE_METRO_BOARD_GROUP);
    return demandMetroBoardGroupMatchesFields(locationFields, areaPrefs.ncBoards)
      || (ordinaryBoards.length > 0 && ncAbcBoardPreferencesMatch(locationFields, ordinaryBoards));
  }
  if (state === "GA" && areaPrefs.gaAreas.length) return demandMetroAreaMatchesFields(state, locationFields, areaPrefs.gaAreas);
  if (state === "TN" && areaPrefs.tnAreas.length) return demandMetroAreaMatchesFields(state, locationFields, areaPrefs.tnAreas);
  if (state === "VA" && areaPrefs.vaCities.length) return locationMatchesAny(locationFields, areaPrefs.vaCities);
  if (state === "OH" && areaPrefs.ohCities.length) return locationMatchesAny(locationFields, areaPrefs.ohCities);
  if (state === "IA" && areaPrefs.iaCities.length) return locationMatchesAny(locationFields, areaPrefs.iaCities);
  if (state === "ID" && areaPrefs.idCities.length) return locationMatchesAny(locationFields, areaPrefs.idCities);
  if (state === "SC" && areaPrefs.scAreas.length) return locationMatchesAny(locationFields, areaPrefs.scAreas);
  if (state === "CA" && areaPrefs.caAreas.length) return californiaAreaMatchesFields(locationFields, areaPrefs.caAreas);
  if (state === "NV" && areaPrefs.nvAreas.length) return nevadaAreaMatchesFields(locationFields, areaPrefs.nvAreas);
  if (state === "NY" && areaPrefs.nyAreas.length) return newYorkAreaMatchesFields(locationFields, areaPrefs.nyAreas);
  if (state === "CO" && areaPrefs.coAreas.length) return coloradoAreaMatchesFields(locationFields, areaPrefs.coAreas);
  if (state === "PA" && (areaPrefs.paCounties.length || areaPrefs.paStores.length)) {
    const countyMatch = areaPrefs.paCounties.length > 0 && locationMatchesAny(locationFields, areaPrefs.paCounties);
    const storeMatch = areaPrefs.paStores.length > 0
      && locationMatchesAny([asString(candidate.storeId), asString(candidate.store_id)], areaPrefs.paStores);
    return countyMatch || storeMatch;
  }
  return true;
}

export function candidateMatchesBottlePrefs(candidate: CandidateAlert, alertMode: unknown, bottlePrefs: BottleAlertPreferences) {
  if (alertMode !== "specific_bottles") return true;
  const wanted = [...bottlePrefs.bottleKeys, ...bottlePrefs.bottleNames.map(normalizeBottleKey)].filter(Boolean);
  if (!wanted.length) return false;
  const candidateName = normalizeBottleKey(asString(candidate.bottle) || asString(candidate.rawName) || asString(candidate.canonicalName));
  if (!candidateName) return false;
  return wanted.some((bottle) => candidateName === bottle || candidateName.includes(bottle) || bottle.includes(candidateName));
}

function candidateMatchesEmailMode(candidate: CandidateAlert, mode: EmailAlertMode) {
  if (mode === "all") return true;
  if (mode === "major_only") return candidate.priorityClass === "major";
  return false;
}

function candidateMatchesSmsMode(candidate: CandidateAlert, mode: SmsAlertMode, bottlePrefs: BottleAlertPreferences) {
  if (mode === "major_only") return candidate.priorityClass === "major";
  return candidateMatchesBottlePrefs(candidate, "specific_bottles", bottlePrefs);
}

function hasSavedAreaPreferences(areaPrefs: AreaPreferences) {
  return Boolean(
    areaPrefs.states.length ||
    areaPrefs.ncBoards.length ||
    areaPrefs.gaAreas.length ||
    areaPrefs.tnAreas.length ||
    areaPrefs.vaCities.length ||
    areaPrefs.ohCities.length ||
    areaPrefs.iaCities.length ||
    areaPrefs.idCities.length ||
    areaPrefs.scAreas.length ||
    areaPrefs.caAreas.length ||
    areaPrefs.nvAreas.length ||
    areaPrefs.nyAreas.length ||
    areaPrefs.coAreas.length ||
    areaPrefs.paCounties.length ||
    areaPrefs.paStores.length
  );
}

function candidateAlertRank(candidate: CandidateAlert) {
  const priorityClass = asString(candidate.priorityClass).toLowerCase();
  const tier = asString(candidate.tier).toLowerCase();
  const deliveryChannel = asString(candidate.deliveryChannel).toLowerCase();
  const locationPrecision = asString(candidate.locationPrecision).toLowerCase();
  const eventType = asString(candidate.eventType).toLowerCase();
  const quantity = asNumber(candidate.quantity) || asNumber(candidate.warehouseQty);
  const reliability = asNumber(candidate.reliabilityScore, asNumber(candidate.score));
  const freshnessHours = asNumber(candidate.freshnessHours, 999);

  let rank = reliability;
  if (priorityClass === "major") rank += 1000;
  if (tier === "unicorn") rank += 700;
  if (tier === "allocated") rank += 450;
  if (deliveryChannel === "watch_candidate") rank += 175;
  if (locationPrecision === "store_level") rank += 150;
  if (/board_shipment|shipment_snapshot|warehouse_stock|limited_release_store_drop/.test(eventType)) rank += 100;
  if (quantity > 0) rank += Math.min(quantity, 75);
  if (Number.isFinite(freshnessHours)) rank -= Math.min(freshnessHours, 72) * 2;
  return rank;
}

function sortCandidatesForMember(a: CandidateAlert, b: CandidateAlert) {
  return candidateAlertRank(b) - candidateAlertRank(a);
}

export function candidateCanSendEmail(candidate: CandidateAlert) {
  if (candidate.eligibleForEmail === true) return true;
  if (candidate.eligibleForEmail === false) return false;

  const deliveryChannel = asString(candidate.deliveryChannel);
  const eventType = asString(candidate.eventType).toLowerCase();
  const state = asString(candidate.state).toUpperCase();
  const locationPrecision = asString(candidate.locationPrecision).toLowerCase();
  const quantity = asNumber(candidate.quantity) || asNumber(candidate.warehouseQty);
  const status = `${asString(candidate.availabilityStatus)} ${asString(candidate.availabilityLabel)}`.toLowerCase();
  const priorityClass = asString(candidate.priorityClass).toLowerCase();
  const tier = asString(candidate.tier).toLowerCase();
  const isRareBottle = priorityClass === "major" || tier === "unicorn" || tier === "allocated";
  const isActionableWatch = deliveryChannel === "watch_candidate"
    && isRareBottle
    && quantity > 0
    && /board_shipment|shipment_snapshot|warehouse_stock|limited_release_store_drop/i.test(eventType)
    && ["store_level", "board_county", "board_warehouse", "store_aggregate"].includes(locationPrecision);

  if (state === "IA" && /store_delivery_snapshot|store_allocation_snapshot|statewide_product_delivery_snapshot|statewide_product_inventory_snapshot/.test(eventType)) return false;
  if ((state === "MD-MONTGOMERY" || state === "UT") && /county_inventory_aggregate|board_inventory_aggregate|county_product|county_allocated|catalog_row|release_document|allocated_release/.test(eventType)) return false;
  if (deliveryChannel === "watch_candidate" && !isActionableWatch) return false;
  if (eventType.includes("release_surface") || eventType.includes("release-watch")) return false;
  if (eventType.includes("policy") || eventType.includes("license")) return false;
  if (eventType.includes("raffle") || eventType.includes("tasting")) return false;
  if (isActionableWatch) return true;
  if (locationPrecision === "store_level") return true;
  if (quantity > 0) return true;
  return /in_stock|limited|available|on_hand/.test(status);
}

export function candidateCanUseOnSite(candidate: CandidateAlert) {
  if (candidate.eligibleForOnSite === true) return true;
  if (candidate.eligibleForOnSite === false) return false;
  return candidateCanSendEmail(candidate);
}

function candidateCanSendSms(candidate: CandidateAlert) {
  if (candidate.eligibleForSms === true) return true;
  if (candidate.eligibleForSms === false) return false;
  const actionabilityClass = asString(candidate.actionabilityClass).toLowerCase();
  const tier = asString(candidate.tier).toLowerCase();
  const priorityClass = asString(candidate.priorityClass).toLowerCase();
  if (actionabilityClass === "board_or_county_lead") return priorityClass === "major" || tier === "unicorn" || tier === "allocated";
  if (["retailer_warehouse_watch", "store_delivery_lead", "distillery_release_watch"].includes(actionabilityClass)) return tier === "unicorn";
  return candidateCanSendEmail(candidate);
}

function freshnessPolicyHours(candidate: CandidateAlert, channel: "onSite" | "email" | "sms", fallback: number) {
  const policy = candidate.freshnessPolicyHours && typeof candidate.freshnessPolicyHours === "object" ? candidate.freshnessPolicyHours as Record<string, unknown> : null;
  const value = asNumber(policy?.[channel], Number.NaN);
  const candidateLimit = Number.isFinite(value) && value > 0 ? value : fallback;
  return Math.min(candidateLimit, ALERT_REALTIME_MAX_FRESHNESS_HOURS);
}

function candidateDeliveryBlockers(candidate: CandidateAlert) {
  return toStrings(candidate.blockers).map((blocker) => blocker.toLowerCase());
}

function candidateDeliveryCautions(candidate: CandidateAlert) {
  return toStrings(candidate.cautions).map((caution) => caution.toLowerCase());
}

function candidateFreshnessHoursAtDelivery(candidate: CandidateAlert, now: string = new Date().toISOString()) {
  return signalFreshnessHoursAt(asString(candidate.signalAt), now);
}

export function candidatePassesFreshOnSiteGuardrails(candidate: CandidateAlert, now?: string) {
  const blockers = candidateDeliveryBlockers(candidate);
  const cautions = candidateDeliveryCautions(candidate);
  const freshnessHours = candidateFreshnessHoursAtDelivery(candidate, now);

  if (!candidateCanUseOnSite(candidate)) return false;
  if (asBoolean(candidate.bootstrap)) return false;
  if (blockers.includes("bootstrap_run_not_sendable")) return false;
  if (blockers.includes("manual_refresh_quarantine")) return false;
  if (blockers.includes("stale_observation")) return false;
  if (cautions.includes("unknown_freshness")) return false;
  return alertFreshnessIsDeliverable(freshnessHours, freshnessPolicyHours(candidate, "onSite", ALERT_EMAIL_MAX_FRESHNESS_HOURS));
}

export function candidatePassesFreshEmailGuardrails(candidate: CandidateAlert, now?: string) {
  const blockers = candidateDeliveryBlockers(candidate);
  const cautions = candidateDeliveryCautions(candidate);
  const freshnessHours = candidateFreshnessHoursAtDelivery(candidate, now);

  if (!candidateCanSendEmail(candidate)) return false;
  if (asBoolean(candidate.bootstrap)) return false;
  if (blockers.includes("bootstrap_run_not_sendable")) return false;
  if (blockers.includes("manual_refresh_quarantine")) return false;
  if (blockers.includes("stale_observation")) return false;
  if (cautions.includes("unknown_freshness")) return false;
  return alertFreshnessIsDeliverable(freshnessHours, freshnessPolicyHours(candidate, "email", ALERT_EMAIL_MAX_FRESHNESS_HOURS));
}

export function candidatePassesFreshSmsGuardrails(candidate: CandidateAlert, now?: string) {
  if (!candidateCanSendSms(candidate)) return false;
  if (!candidatePassesFreshEmailGuardrails(candidate, now)) return false;
  const freshnessHours = candidateFreshnessHoursAtDelivery(candidate, now);
  return alertFreshnessIsDeliverable(freshnessHours, freshnessPolicyHours(candidate, "sms", ALERT_SMS_MAX_FRESHNESS_HOURS));
}

function candidateTimestampLabel(candidate: CandidateAlert) {
  const hours = asNumber(candidate.freshnessHours, NaN);
  if (Number.isFinite(hours)) {
    if (hours < 1) return "within the last hour";
    if (hours < 24) return `${Math.round(hours)} hour${Math.round(hours) === 1 ? "" : "s"} ago`;
    const days = Math.round(hours / 24);
    return `${days} day${days === 1 ? "" : "s"} ago`;
  }
  return "recently";
}

function candidateQuantityLabel(candidate: CandidateAlert) {
  const qty = asNumber(candidate.quantity) || asNumber(candidate.warehouseQty);
  if (qty > 0) return `${qty} bottle${qty === 1 ? "" : "s"} reported`;
  const label = asString(candidate.availabilityLabel) || asString(candidate.availabilityStatus);
  return label || null;
}

function compactJoin(parts: Array<string | null | undefined>, separator = ", ") {
  return parts
    .map((part) => asString(part).trim())
    .filter(Boolean)
    .filter((part, index, rows) => rows.findIndex((other) => other.toLowerCase() === part.toLowerCase()) === index)
    .join(separator);
}

function normalizeLocationLookupKey(value: string) {
  return value.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

type LocationLookupRecord = {
  state: string;
  name: string;
  address: string;
  city: string;
  county: string;
  zip: string;
  sourceStoreId: string;
  id: string;
};

let locationLookupCache: LocationLookupRecord[] | null = null;

async function loadSiteLocationLookupRecords() {
  if (locationLookupCache) return locationLookupCache;
  const records: LocationLookupRecord[] = [];
  for (const exportName of ["stores", "locations"] as const) {
    try {
      const payload = await readSiteExport(exportName);
      const rows = Array.isArray(payload?.[exportName]) ? payload[exportName] as Array<Record<string, unknown>> : [];
      for (const row of rows) {
        records.push({
          state: asString(row.state).toUpperCase(),
          name: asString(row.name),
          address: asString(row.address),
          city: asString(row.city),
          county: asString(row.county),
          zip: asString(row.zip),
          sourceStoreId: asString(row.sourceStoreId),
          id: asString(row.id),
        });
      }
    } catch {
      // Alert delivery must remain resilient if optional lookup exports are unavailable.
    }
  }
  locationLookupCache = records.filter((row) => row.state && row.name && row.address);
  return locationLookupCache;
}

function siteLocationLookupRecords() {
  return locationLookupCache || [];
}

function candidateLocationLookupRecord(candidate: CandidateAlert) {
  const state = asString(candidate.state).toUpperCase();
  const names = [
    asString(candidate.storeName),
    asString(candidate.locationName),
    asString(candidate.displayLocation),
    asString(candidate.boardName),
  ].map(normalizeLocationLookupKey).filter(Boolean);
  const ids = [asString(candidate.storeId), asString(candidate.store_id), asString(candidate.locationId), asString(candidate.id)]
    .map(normalizeLocationLookupKey)
    .filter(Boolean);
  if (!state || (!names.length && !ids.length)) return null;
  return siteLocationLookupRecords().find((row) => {
    if (row.state !== state) return false;
    const rowName = normalizeLocationLookupKey(row.name);
    const rowIds = [row.id, row.sourceStoreId].map(normalizeLocationLookupKey).filter(Boolean);
    return names.some((name) => rowName === name || rowName.includes(name) || name.includes(rowName))
      || ids.some((id) => rowIds.includes(id));
  }) || null;
}

function candidateLocationPrecision(candidate: CandidateAlert) {
  return asString(candidate.locationPrecision).toLowerCase();
}

function candidateIsStoreLevel(candidate: CandidateAlert) {
  return isExactStoreSmsLocation({
    locationPrecision: candidate.locationPrecision,
    actionabilityClass: candidate.actionabilityClass,
    eventType: candidate.eventType,
  });
}

function candidateAddressLabel(candidate: CandidateAlert) {
  const direct = asString(candidate.storeAddress) || asString(candidate.address) || asString(candidate.locationAddress);
  if (direct) return direct;
  const lookup = candidateLocationLookupRecord(candidate);
  if (lookup?.address) return lookup.address;
  const composed = compactJoin([
    asString(candidate.streetAddress) || asString(candidate.storeStreet) || asString(candidate.address1),
    asString(candidate.storeCity) || asString(candidate.city),
    asString(candidate.storeCounty) || asString(candidate.county),
    asString(candidate.state).toUpperCase()
  ]);
  return composed || null;
}

function candidateSubjectLocationLabel(candidate: CandidateAlert) {
  return asString(candidate.storeName) || asString(candidate.locationName) || asString(candidate.boardName) || asString(candidate.displayLocation) || stateLabel(asString(candidate.state));
}

function candidateBoardLevelLabel(candidate: CandidateAlert) {
  const base = asString(candidate.boardName) || asString(candidate.locationName) || asString(candidate.displayLocation) || stateLabel(asString(candidate.state));
  const precision = candidateLocationPrecision(candidate);
  if (precision === "board_warehouse" || /warehouse/.test(asString(candidate.eventType))) {
    return `${base} — board/warehouse signal, not a specific store address`;
  }
  if (precision === "board_county") {
    return `${base} — board/county signal; check the linked source for receiving stores`;
  }
  return base;
}

function candidateStoreLabel(candidate: CandidateAlert) {
  if (!candidateIsStoreLevel(candidate)) return candidateBoardLevelLabel(candidate);
  const store = candidateSubjectLocationLabel(candidate);
  const address = candidateAddressLabel(candidate);
  if (address && !store.toLowerCase().includes(address.toLowerCase())) return `${store} — ${address}`;
  if (address) return store;
  return `${store} — address unavailable; check source before driving`;
}

function candidateBottleNames(candidate: CandidateAlert) {
  const grouped = Array.isArray(candidate.__groupCandidates) ? candidate.__groupCandidates as CandidateAlert[] : [candidate];
  return uniqueStrings(grouped.map((item) => asString(item.bottle, "Bottle signal")));
}

function candidateBottleSummary(candidate: CandidateAlert) {
  const bottles = candidateBottleNames(candidate);
  if (bottles.length <= 2) return bottles.join(" and ");
  return `${bottles.slice(0, -1).join(", ")}, and ${bottles[bottles.length - 1]}`;
}

function candidateLocationGroupKey(candidate: CandidateAlert) {
  const state = asString(candidate.state).toUpperCase();
  const sourceType = asString(candidate.sourceType) || "engine";
  const precision = candidateLocationPrecision(candidate);
  const locationId = asString(candidate.storeId) || asString(candidate.store_id) || asString(candidate.locationId) || asString(candidate.boardId);
  const locationLabel = candidateStoreLabel(candidate);
  return [sourceType, state, precision, locationId || normalizeLocationLookupKey(locationLabel)].filter(Boolean).join("|");
}

export function groupCandidatesByLocation(candidates: CandidateAlert[]) {
  const community = candidates.filter((candidate) => asString(candidate.sourceType) === "community");
  const groups = new Map<string, CandidateAlert[]>();
  for (const candidate of candidates.filter((row) => asString(row.sourceType) !== "community")) {
    const key = candidateLocationGroupKey(candidate);
    groups.set(key, [...(groups.get(key) || []), candidate]);
  }

  const groupedEngine = Array.from(groups.entries()).map(([locationKey, rows]) => {
    const sorted = [...rows].sort(sortCandidatesForMember);
    const primary = sorted[0] || rows[0];
    const freshnessHours = Math.max(...sorted.map((candidate) => asNumber(candidate.freshnessHours, Number.NEGATIVE_INFINITY)).filter(Number.isFinite));
    const signalAt = sorted
      .map((candidate) => asString(candidate.signalAt))
      .filter(Boolean)
      .sort((a, b) => Date.parse(a) - Date.parse(b))[0] || asString(primary.signalAt);
    const quantity = sorted.reduce((sum, candidate) => sum + (asNumber(candidate.quantity) || asNumber(candidate.warehouseQty)), 0);
    const groupDedupeKey = stableGroupedAlertDedupeKey(locationKey, sorted);
    return {
      ...primary,
      __groupCandidates: sorted,
      bottle: candidateBottleSummary({ __groupCandidates: sorted }),
      quantity,
      signalAt,
      freshnessHours: Number.isFinite(freshnessHours) ? freshnessHours : primary.freshnessHours,
      dedupeKey: groupDedupeKey,
      matchKey: `location-group:${stableHash(locationKey)}`,
    } as CandidateAlert;
  });
  return [...community, ...groupedEngine].sort(sortCandidatesForMember);
}

function underlyingStableKeys(candidate: CandidateAlert) {
  return enumerateUnderlyingAlertChildren(candidate).map(stableUnderlyingAlertKey).filter(Boolean);
}

function candidateWithUnderlyingChildren(candidate: CandidateAlert, children: CandidateAlert[]) {
  if (!children.length) return null;
  if (asString(candidate.sourceType) === "community" && children.length === 1) {
    return { ...children[0], __groupCandidates: children } as CandidateAlert;
  }
  const locationKey = candidateLocationGroupKey(candidate);
  const regrouped = groupCandidatesByLocation(children);
  return regrouped.find((grouped) => candidateLocationGroupKey(grouped) === locationKey)
    || regrouped[0]
    || null;
}

function selectUnseenCandidate(
  candidate: CandidateAlert,
  seenStableKeys: ReadonlySet<string>,
  seenLegacyGroupKeys: ReadonlySet<string>,
) {
  const legacyGroupKey = asString(candidate.dedupeKey, asString(candidate.id));
  if (legacyGroupKey && seenLegacyGroupKeys.has(legacyGroupKey)) return null;
  return candidateWithUnderlyingChildren(
    candidate,
    selectUnseenUnderlyingAlertChildren(candidate, seenStableKeys),
  );
}

function flattenUnderlyingStableKeys(candidates: CandidateAlert[]) {
  return uniqueStrings(candidates.flatMap(underlyingStableKeys));
}

function matchedLocationFromOptions(candidate: CandidateAlert, options: string[]) {
  const values = [
    asString(candidate.locationName),
    asString(candidate.displayLocation),
    asString(candidate.storeName),
    asString(candidate.storeAddress),
    asString(candidate.storeCity),
    asString(candidate.storeCounty),
    asString(candidate.boardName),
    asString(candidate.location_name),
    asString(candidate.display_location),
    asString(candidate.store_name),
    asString(candidate.store_address),
    asString(candidate.store_city),
    asString(candidate.store_county),
    asString(candidate.board_name),
  ];
  return options.find((option) => locationMatchesAny(values, [option]));
}

function candidateMatchedArea(candidate: CandidateAlert, areaPrefs: AreaPreferences) {
  const rawState = asString(candidate.state);
  const state = geographyState(rawState)?.state || normalizeStateCodeParam(rawState) || rawState.toUpperCase();
  if (areaPrefs.monitoringScopes) {
    const matching = areaPrefs.monitoringScopes.find((scope) => scope.state === state && candidateMatchesMonitoringScopes(candidate, [scope]));
    return matching?.label || stateLabel(state);
  }
  const locationName = asString(candidate.locationName) || asString(candidate.storeName) || asString(candidate.storeAddress);
  const locationFields = candidateAreaLocationFields(candidate);
  if (state === "NC" && areaPrefs.ncBoards.length) {
    if (demandMetroBoardGroupMatchesFields(locationFields, areaPrefs.ncBoards)) return CHARLOTTE_METRO_BOARD_GROUP;
    const ordinaryBoards = areaPrefs.ncBoards.filter((value) => value !== CHARLOTTE_METRO_BOARD_GROUP);
    return matchedNcAbcBoardPreference(locationFields, ordinaryBoards) || locationName || stateLabel(state);
  }
  if (state === "GA" && areaPrefs.gaAreas.length && demandMetroAreaMatchesFields(state, locationFields, areaPrefs.gaAreas)) return "Atlanta Metro";
  if (state === "TN" && areaPrefs.tnAreas.length && demandMetroAreaMatchesFields(state, locationFields, areaPrefs.tnAreas)) return "Nashville Metro";
  if (state === "VA" && areaPrefs.vaCities.length) return matchedLocationFromOptions(candidate, areaPrefs.vaCities) || locationName || stateLabel(state);
  if (state === "OH" && areaPrefs.ohCities.length) return matchedLocationFromOptions(candidate, areaPrefs.ohCities) || locationName || stateLabel(state);
  if (state === "IA" && areaPrefs.iaCities.length) return matchedLocationFromOptions(candidate, areaPrefs.iaCities) || locationName || stateLabel(state);
  if (state === "ID" && areaPrefs.idCities.length) return matchedLocationFromOptions(candidate, areaPrefs.idCities) || locationName || stateLabel(state);
  if (state === "SC" && areaPrefs.scAreas.length) return matchedLocationFromOptions(candidate, areaPrefs.scAreas) || locationName || stateLabel(state);
  if (state === "CA" && areaPrefs.caAreas.length) return californiaAreaMatchesFields([locationName, asString(candidate.storeAddress), asString(candidate.storeCity)], areaPrefs.caAreas) ? "San Diego" : locationName || stateLabel(state);
  if (state === "NV" && areaPrefs.nvAreas.length) return areaPrefs.nvAreas.find((area) => nevadaAreaMatchesFields([locationName, asString(candidate.storeAddress), asString(candidate.storeCity)], [area])) || locationName || stateLabel(state);
  if (state === "NY" && areaPrefs.nyAreas.length) return matchedNewYorkArea(locationFields, areaPrefs.nyAreas) || locationName || stateLabel(state);
  if (state === "CO" && areaPrefs.coAreas.length) return coloradoAreaMatchesFields(locationFields, areaPrefs.coAreas) ? areaPrefs.coAreas[0] || LEGACY_DENVER_METRO_LABEL : locationName || stateLabel(state);
  if (state === "PA" && areaPrefs.paCounties.length) return matchedLocationFromOptions(candidate, areaPrefs.paCounties) || locationName || stateLabel(state);
  if (locationName) return locationName;
  return stateLabel(state);
}

function normalizeDeliveryMetadata(input: unknown): AlertDeliveryMetadata {
  const source = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const recent = Array.isArray(source.recent)
    ? source.recent
        .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
        .map((item) => ({
          dedupeKey: asString(item.dedupeKey),
          underlyingStableKeys: uniqueStrings(toStrings(item.underlyingStableKeys)),
          deliveredAt: asString(item.deliveredAt),
          channel: (item.channel === "sms" ? "sms" : "email") as "email" | "sms",
          emailMode: (item.emailMode === "all" ? "all" : "major_only") as EmailAlertMode,
          smsMode: (item.smsMode === "specific_bottles" ? "specific_bottles" : "major_only") as SmsAlertMode,
          messageId: asString(item.messageId) || null,
          status: asString(item.status) || null,
        }))
        .filter((item) => item.dedupeKey && item.deliveredAt)
    : [];
  return {
    dedupeIdentityVersion: source.dedupeIdentityVersion === 2 ? 2 : undefined,
    recent,
    onSiteBaselineDedupeKeys: uniqueStrings(toStrings(source.onSiteBaselineDedupeKeys)),
    emailBaselineDedupeKeys: uniqueStrings(toStrings(source.emailBaselineDedupeKeys)),
    smsBaselineDedupeKeys: uniqueStrings(toStrings(source.smsBaselineDedupeKeys)),
    lastOnSiteBaselineAt: asString(source.lastOnSiteBaselineAt) || undefined,
    lastEmailBaselineAt: asString(source.lastEmailBaselineAt) || undefined,
    lastSmsBaselineAt: asString(source.lastSmsBaselineAt) || undefined,
    lastRunAt: asString(source.lastRunAt) || undefined
  };
}

function deliveryDedupeToken(dedupeKey: string, channel: "email" | "sms") {
  return `${dedupeKey}:${channel}`;
}

function recentDeliverySet(metadata: AlertDeliveryMetadata, channel: "email" | "sms") {
  return new Set((metadata.recent || [])
    .filter((record) => (record.channel || "email") === channel)
    .map((record) => deliveryDedupeToken(record.dedupeKey, channel)));
}

function recentUnderlyingDeliverySet(metadata: AlertDeliveryMetadata, channel: "email" | "sms") {
  return new Set((metadata.recent || [])
    .filter((record) => (record.channel || "email") === channel)
    .flatMap((record) => record.underlyingStableKeys || []));
}

function normalizeMemberAlertRecord(input: unknown): MemberAlertRecord | null {
  if (!input || typeof input !== "object") return null;
  const source = input as Record<string, unknown>;
  const id = asString(source.id);
  const userId = asString(source.userId);
  const dedupeKey = asString(source.dedupeKey);
  const bottleName = asString(source.bottleName);
  const createdAt = asString(source.createdAt);
  if (!id || !userId || !dedupeKey || !bottleName || !createdAt) return null;
  return {
    id,
    userId,
    dedupeKey,
    bottleName,
    bottleNames: Array.isArray(source.bottleNames) ? uniqueStrings(source.bottleNames.map((value) => asString(value))) : undefined,
    underlyingStableKeys: uniqueStrings(toStrings(source.underlyingStableKeys)),
    state: asString(source.state),
    storeLabel: asString(source.storeLabel, "Tracked location"),
    matchedArea: asString(source.matchedArea, asString(source.state)),
    eventType: asString(source.eventType, "signal"),
    rarityTier: asString(source.rarityTier) || null,
    quantity: typeof source.quantity === "number" && Number.isFinite(source.quantity) ? source.quantity : null,
    score: asNumber(source.score),
    priorityClass: source.priorityClass === "major" ? "major" : "standard",
    signalAt: asString(source.signalAt) || undefined,
    freshnessLimitHours: Number.isFinite(Number(source.freshnessLimitHours)) ? Number(source.freshnessLimitHours) : undefined,
    sourceType: source.sourceType === "community" ? "community" : "engine",
    sourceLabel: asString(source.sourceLabel) || undefined,
    createdAt,
    readAt: asString(source.readAt) || null,
    archivedAt: asString(source.archivedAt) || null,
    emailDeliveredAt: asString(source.emailDeliveredAt) || null,
    emailModeAtSend: source.emailModeAtSend === "all" || source.emailModeAtSend === "major_only" ? source.emailModeAtSend : null,
  };
}

export function normalizeAlertInboxMetadata(input: unknown): AlertInboxMetadata {
  const source = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const recent = Array.isArray(source.recent)
    ? source.recent.map(normalizeMemberAlertRecord).filter((alert): alert is MemberAlertRecord => Boolean(alert))
    : [];
  return { recent, lastSyncedAt: asString(source.lastSyncedAt) || undefined };
}

export function candidateToMemberAlert(userId: string, candidate: CandidateAlert, createdAt: string, areaPrefs?: AreaPreferences): MemberAlertRecord {
  const dedupeKey = asString(candidate.dedupeKey, asString(candidate.id));
  return {
    id: buildAlertId(userId, dedupeKey, createdAt),
    userId,
    dedupeKey,
    bottleName: asString(candidate.bottle, "Bottle signal"),
    bottleNames: candidateBottleNames(candidate),
    underlyingStableKeys: underlyingStableKeys(candidate),
    state: asString(candidate.state).toUpperCase(),
    storeLabel: candidateStoreLabel(candidate),
    matchedArea: areaPrefs ? candidateMatchedArea(candidate, areaPrefs) : asString(candidate.locationName) || asString(candidate.state),
    eventType: asString(candidate.eventType, asString(candidate.action, "signal")),
    rarityTier: normalizeAlertRarityTier(candidate.tier ?? candidate.rarityTier),
    quantity: asNumber(candidate.quantity) || asNumber(candidate.warehouseQty) || null,
    score: asNumber(candidate.reliabilityScore, asNumber(candidate.score)),
    priorityClass: candidate.priorityClass === "major" ? "major" : "standard",
    signalAt: asString(candidate.signalAt),
    freshnessLimitHours: freshnessPolicyHours(candidate, "onSite", ALERT_EMAIL_MAX_FRESHNESS_HOURS),
    sourceType: asString(candidate.sourceType) === "community" ? "community" : "engine",
    sourceLabel: candidateSourceLabel(candidate) || (asString(candidate.sourceType) === "community" ? "Community sighting" : "Bourbon Signal"),
    createdAt,
    readAt: null,
    archivedAt: null,
    emailDeliveredAt: null,
    emailModeAtSend: null,
  };
}

function memberAlertPassesFinalFreshness(alert: MemberAlertRecord, now: string = new Date().toISOString()) {
  return alertFreshnessIsDeliverable(
    signalFreshnessHoursAt(alert.signalAt, now),
    alert.freshnessLimitHours,
  );
}

function deliveryAuthorized(req: Request) {
  const expectedSecrets = [process.env.ALERT_DELIVERY_SECRET, process.env.CRON_SECRET].filter(Boolean);
  if (!expectedSecrets.length) return process.env.NODE_ENV !== "production";
  const auth = req.headers.get("authorization") || "";
  const headerSecret = req.headers.get("x-alert-delivery-secret") || "";
  return expectedSecrets.some((expected) => auth === `Bearer ${expected}` || headerSecret === expected);
}

export function assertAlertDeliveryAuthorized(req: Request) {
  if (!deliveryAuthorized(req)) {
    throw new Error("Unauthorized alert delivery request");
  }
}

async function getUsersPage(client: Awaited<ReturnType<typeof clerkClient>>, offset: number) {
  const usersApi = client.users as unknown as {
    getUserList: (params: { limit: number; offset: number }) => Promise<{ data?: unknown[]; totalCount?: number } | unknown[]>;
  };
  const result = await usersApi.getUserList({ limit: 100, offset });
  if (Array.isArray(result)) return { data: result, totalCount: result.length };
  return { data: Array.isArray(result.data) ? result.data : [], totalCount: Number(result.totalCount || 0) || 0 };
}

function primaryEmailForUser(user: Record<string, unknown>) {
  const emails = Array.isArray(user.emailAddresses) ? user.emailAddresses as Array<Record<string, unknown>> : [];
  const primaryId = asString(user.primaryEmailAddressId);
  const primary = emails.find((email) => asString(email.id) === primaryId) || emails[0];
  return asString(primary?.emailAddress);
}

function emailRecipientAllowed(email: string) {
  if (!ALERT_EMAIL_ALLOWED_RECIPIENTS.length) return true;
  return ALERT_EMAIL_ALLOWED_RECIPIENTS.includes(email.toLowerCase());
}

function smsRecipientAllowed(phone: string) {
  if (!ALERT_SMS_ALLOWED_RECIPIENTS.length) return true;
  return ALERT_SMS_ALLOWED_RECIPIENTS.includes(phone);
}

function candidateEvidenceLabel(candidate: CandidateAlert) {
  return asString(candidate.evidence) || asString(candidate.reason) || null;
}

function candidateSourceLabel(candidate: CandidateAlert) {
  return asString(candidate.source) || null;
}

function candidateSourceUrl(candidate: CandidateAlert) {
  const url = asString(candidate.sourceUrl);
  return /^https?:\/\//.test(url) ? url : null;
}

function maskPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "configured phone";
  return `***${digits.slice(-4)}`;
}

function smsBodyForCandidate(candidate: CandidateAlert, storeLabel: string) {
  const storeLevel = candidateIsStoreLevel(candidate);
  const quantity = storeLevel ? candidateQuantityLabel(candidate) : null;
  const timestamp = candidateTimestampLabel(candidate);
  const sourceCaveat = storeLevel
    ? "Verify before driving."
    : "Board-level signal; check source before driving.";
  return formatSmsAlert({
    bottleNames: candidateBottleNames(candidate),
    storeLabel: storeLevel ? storeLabel : candidateSubjectLocationLabel(candidate),
    state: asString(candidate.state).toUpperCase(),
    locationScope: storeLevel ? "store" : "board",
    quantityLabel: quantity || undefined,
    timestampLabel: timestamp,
    sourceCaveat,
  });
}

class DefinitiveSmsSendError extends Error {}

async function sendTwilioSms(to: string, body: string) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID || "";
  const authToken = process.env.TWILIO_AUTH_TOKEN || "";
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID || "";
  const from = process.env.TWILIO_FROM_NUMBER || "";
  if (!accountSid || !authToken) throw new DefinitiveSmsSendError("Twilio credentials are not configured.");
  if (!messagingServiceSid && !from) throw new DefinitiveSmsSendError("Set TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM_NUMBER before enabling SMS alerts.");

  const bodyParams = new URLSearchParams({ To: to, Body: body });
  if (messagingServiceSid) bodyParams.set("MessagingServiceSid", messagingServiceSid);
  else bodyParams.set("From", from);

  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: bodyParams,
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new DefinitiveSmsSendError(asString(payload.message, `Twilio SMS send failed with HTTP ${response.status}`));
  return { sid: asString(payload.sid) || null, status: asString(payload.status) || null };
}

function maskEmail(email: string) {
  const [name, domain] = email.split("@");
  if (!name || !domain) return "configured recipient";
  return `${name.slice(0, 2)}***@${domain}`;
}

function operationalTestRecipient() {
  const explicit = asString(process.env.ALERT_EMAIL_TEST_RECIPIENT).trim().toLowerCase();
  if (explicit) return explicit;
  const allowlisted = ALERT_EMAIL_ALLOWED_RECIPIENTS[0];
  return allowlisted ? allowlisted.trim().toLowerCase() : "";
}

export async function sendOperationalTestAlertEmail(req: Request) {
  assertAlertDeliveryAuthorized(req);

  const recipient = operationalTestRecipient();
  if (!recipient || !recipient.includes("@")) {
    throw new Error("Set ALERT_EMAIL_TEST_RECIPIENT or ALERT_EMAIL_ALLOWED_RECIPIENTS before sending an operational test email.");
  }

  const resend = getResendClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.bourbonsignal.com";
  const sentAt = new Date().toISOString();
  const result = await resend.emails.send({
    from: ALERT_FROM,
    to: [recipient],
    replyTo: ALERT_REPLY_TO,
    subject: "[Test] Bourbon Signal alert delivery check",
    react: PaidDropAlertEmail({
      firstName: "Bourbon Signal tester",
      bottleName: "Bourbon Signal alert pipeline test",
      storeLabel: "Operational readiness check",
      matchedArea: "Production delivery route",
      state: "TEST",
      timestampLabel: "test generated now",
      quantityLabel: "No bottle availability implied",
      evidenceLabel: "Operational test only. This verifies the production delivery route, Resend provider, sender domain, and email template rendering; it is not a real bourbon availability alert.",
      sourceLabel: "Bourbon Signal ops test",
      dashboardUrl: `${appUrl}/dashboard`,
    }),
    headers: {
      "X-Entity-Ref-ID": `ops-email-test-${Date.now()}`,
    },
  });

  if (result.error) throw new Error(result.error.message);

  return {
    ok: true,
    testEmail: true,
    provider: "resend",
    messageId: result.data?.id || null,
    recipient: maskEmail(recipient),
    sentAt,
  };
}

export async function deliverPreferenceAlerts(req: Request, options: {
  dryRun?: boolean;
  baselineOnSiteOnly?: boolean;
  baselineEmailOnly?: boolean;
  baselineSmsOnly?: boolean;
  queueMode?: "off" | AlertQueueMode;
} = {}) {
  assertAlertDeliveryAuthorized(req);

  const requestedQueueMode = options.queueMode || "off";
  // Shadow mode is observational by definition. Force the entire delivery path into dry-run
  // even if an environment toggle is accidentally changed, so it can only persist queue intents.
  const dryRun = options.dryRun === true || requestedQueueMode === "shadow";
  const queueMode = dryRun && requestedQueueMode === "active" ? "shadow" : requestedQueueMode;
  const baselineOnSiteOnly = options.baselineOnSiteOnly === true;
  const baselineEmailOnly = options.baselineEmailOnly === true;
  const baselineSmsOnly = options.baselineSmsOnly === true;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.bourbonsignal.com";
  const now = new Date().toISOString();
  const batch = await readAlertCandidateBatch();
  const allCandidates = batch.candidates;
  const snapshotSafety = evaluateAlertSnapshotSafety({
    generatedAt: batch.snapshot.generatedAt,
    now,
    maxAgeMinutes: Number(process.env.ALERT_SNAPSHOT_MAX_AGE_MINUTES || 45),
  });
  await loadSiteLocationLookupRecords();
  const rawEligibleCandidateCount = allCandidates
    .filter((candidate) => asBoolean(candidate.eligibleForDelivery))
    .filter(candidateCanUseOnSite).length;
  const candidates = (snapshotSafety.safe ? allCandidates : allCandidates.filter((candidate) => asString(candidate.sourceType) === "community"))
    .filter((candidate) => asBoolean(candidate.eligibleForDelivery))
    .filter(candidateCanUseOnSite)
    .filter((candidate) => candidatePassesFreshOnSiteGuardrails(candidate))
    .sort((a, b) => asNumber(b.reliabilityScore) - asNumber(a.reliabilityScore));

  const summary = {
    ok: true,
    dryRun,
    deliveryEnabled: ALERT_DELIVERY_ENABLED,
    onSiteDeliveryEnabled: ALERT_ONSITE_DELIVERY_ENABLED,
    emailDeliveryEnabled: ALERT_EMAIL_DELIVERY_ENABLED,
    smsDeliveryEnabled: ALERT_SMS_DELIVERY_ENABLED,
    emailClientConfigured: Boolean(process.env.RESEND_API_KEY),
    smsClientConfigured: Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && (process.env.TWILIO_MESSAGING_SERVICE_SID || process.env.TWILIO_FROM_NUMBER)),
    snapshotId: batch.snapshot.snapshotId,
    snapshotSource: batch.snapshot.source,
    snapshotGeneratedAt: batch.snapshot.generatedAt,
    snapshotFresh: snapshotSafety.safe,
    snapshotAgeMinutes: snapshotSafety.ageMinutes,
    snapshotFreshnessReason: snapshotSafety.reason,
    rawEligibleCandidateCount,
    candidateCount: candidates.length,
    skippedSafetyGuardrail: rawEligibleCandidateCount - candidates.length,
    usersConsidered: 0,
    paidUsersConsidered: 0,
    skippedFreeUsers: 0,
    skippedNoAreaPreferences: 0,
    usersWithOnSiteEnabled: 0,
    usersWithPushEnabled: 0,
    usersWithEmailEnabled: 0,
    usersWithSmsEnabled: 0,
    usersMatched: 0,
    onSiteAlertsCreated: 0,
    pushNotificationsSent: 0,
    pushNotificationsWouldSend: 0,
    emailsSent: 0,
    emailsWouldSend: 0,
    smsSent: 0,
    smsWouldSend: 0,
    skippedEmailDeliveryDisabled: 0,
    skippedSmsDeliveryDisabled: 0,
    skippedEmailRecipientNotAllowed: 0,
    skippedSmsRecipientNotAllowed: 0,
    skippedEmailBaseline: 0,
    skippedSmsBaseline: 0,
    onSiteBaselinesCreated: 0,
    emailBaselinesCreated: 0,
    smsBaselinesCreated: 0,

    skippedNoEmail: 0,
    skippedDedupe: 0,
    skippedOnSiteDedupe: 0,
    skippedFinalOnSiteFreshness: 0,
    skippedFinalEmailFreshness: 0,
    skippedFinalSmsFreshness: 0,
    skippedSpecificBottlePrefs: 0,
    queueMode,
    queueIntentsObserved: 0,
    queueClaimsGranted: 0,
    queueSuppressed: 0,
    queueDuplicatesSkipped: 0,
    queueFailures: 0,
    queueStaleClaimsRecovered: 0,
    dedupeIdentityMigrations: 0,
    dedupeIdentityMigrationFailures: 0,
    errors: [] as Array<{ userId?: string; email?: string; message: string }>,
  };

  const queueRepository = queueMode === "off" ? null : createProductionAlertQueueRepository();
  const memberLeaseRepository = queueRepository || (alertQueueDatabaseConfigured() ? createProductionAlertQueueRepository() : null);
  const queueSnapshotId = batch.snapshot.snapshotId || `bundled-${createHash("sha256")
    .update(`${batch.snapshot.generatedAt || "unknown"}:${batch.snapshot.source}`)
    .digest("hex")
    .slice(0, 24)}`;
  const queueWorkerId = `${process.env.VERCEL_DEPLOYMENT_ID || "local"}:${randomUUID()}`;
  if (queueRepository) {
    await queueRepository.registerSnapshot({
      snapshotId: queueSnapshotId,
      appCommit: batch.snapshot.appCommit || process.env.VERCEL_GIT_COMMIT_SHA || "bundled",
      engineCommit: batch.snapshot.engineCommit || "bundled",
      collectionRunId: batch.snapshot.collectionRunId || batch.snapshot.generatedAt || "unknown",
      generatedAt: batch.snapshot.generatedAt || now,
      activatedAt: batch.snapshot.snapshotActivatedAt || undefined,
      manifest: {
        source: batch.snapshot.source,
        snapshotUploadedAt: batch.snapshot.snapshotUploadedAt || null,
        snapshotActivatedAt: batch.snapshot.snapshotActivatedAt || null,
      },
    });
    if (queueMode === "active") {
      const staleBefore = new Date(Date.parse(now) - 10 * 60_000).toISOString();
      summary.queueStaleClaimsRecovered = await queueRepository.recoverStaleClaims(staleBefore);
    }
  }

  async function reserveQueuedGroup(
    userId: string,
    channel: AlertChannel,
    candidate: CandidateAlert,
    payload: (child: CandidateAlert) => Record<string, unknown>,
  ) {
    const children = enumerateUnderlyingAlertChildren(candidate);
    if (!queueRepository) return { candidate, queueCandidates: [] as AlertCandidateRecord[] };
    const reservation = await reserveAlertDeliveryBatch(queueRepository, {
      snapshotId: queueSnapshotId,
      userId,
      channel,
      locationKey: candidateLocationGroupKey(candidate),
      alertWindow: "stable-v2",
      createdAt: now,
      children: children.map((child) => ({
        stableMatchKey: stableUnderlyingAlertKey(child),
        payload: payload(child),
      })),
    }, { mode: queueMode as AlertQueueMode, workerId: queueWorkerId, now });
    summary.queueIntentsObserved += children.length;
    summary.queueClaimsGranted += reservation.claimed.length;
    if (queueMode === "active") summary.queueDuplicatesSkipped += children.length - reservation.claimed.length;
    if (queueMode === "shadow") return { candidate, queueCandidates: [] as AlertCandidateRecord[] };
    const claimedKeys = new Set(reservation.claimed.map((row) => row.stableMatchKey));
    const claimedCandidate = candidateWithUnderlyingChildren(
      candidate,
      children.filter((child) => claimedKeys.has(stableUnderlyingAlertKey(child))),
    );
    return claimedCandidate ? { candidate: claimedCandidate, queueCandidates: reservation.claimed } : null;
  }

  async function failQueuedIntents(candidates: AlertCandidateRecord[], error: unknown) {
    if (!queueRepository || !candidates.length || queueMode !== "active") return;
    const attemptCount = Math.max(...candidates.map((candidate) => candidate.attemptCount || 0));
    const retryAt = attemptCount < 2 ? new Date(Date.parse(now) + (attemptCount + 1) * 5 * 60_000).toISOString() : undefined;
    await queueRepository.markBatchFailed(
      candidates.map((candidate) => candidate.id),
      createHash("sha256").update(error instanceof Error ? error.message : String(error)).digest("hex").slice(0, 16),
      now,
      retryAt,
    );
    summary.queueFailures += 1;
  }

  async function suppressStaleQueuedIntents(candidates: AlertCandidateRecord[]) {
    if (!queueRepository || !candidates.length || queueMode !== "active") return;
    await queueRepository.markBatchFailed(
      candidates.map((candidate) => candidate.id),
      createHash("sha256").update("stale_at_final_delivery_boundary").digest("hex").slice(0, 16),
      new Date().toISOString(),
      undefined,
    );
    summary.queueFailures += 1;
  }

  if (!dryRun && !baselineOnSiteOnly && !baselineEmailOnly && !baselineSmsOnly && queueMode === "off" && !ALERT_ONSITE_DELIVERY_ENABLED && !ALERT_EMAIL_DELIVERY_ENABLED && !ALERT_SMS_DELIVERY_ENABLED) {
    return {
      ...summary,
      deliveryDisabled: true,
      reason: "Set ALERT_ONSITE_DELIVERY_ENABLED=1 for on-site inbox sync, ALERT_EMAIL_DELIVERY_ENABLED=1 for live email delivery, and/or ALERT_SMS_DELIVERY_ENABLED=1 for live SMS delivery. ALERT_DELIVERY_ENABLED=1 enables on-site/email legacy full-delivery mode.",
    };
  }

  const resend = !dryRun && ALERT_EMAIL_DELIVERY_ENABLED ? getResendClient() : null;
  const client = await clerkClient();

  let offset = 0;
  let globalEmailCount = 0;
  while (summary.usersConsidered < MAX_DELIVERY_USERS) {
    const page = await getUsersPage(client, offset);
    if (!page.data.length) break;

    for (const rawUser of page.data) {
      if (summary.usersConsidered >= MAX_DELIVERY_USERS) break;
      let user = rawUser as Record<string, unknown>;
      const userId = asString(user.id);
      summary.usersConsidered += 1;

      const initialPublicMetadata = (user.publicMetadata && typeof user.publicMetadata === "object" ? user.publicMetadata : {}) as Record<string, unknown>;
      const initialEntitlements = await getServerEntitlements(initialPublicMetadata);
      if (initialEntitlements.tier === "free") {
        summary.skippedFreeUsers += 1;
        continue;
      }
      summary.paidUsersConsidered += 1;

      const memberLeaseKey = `member:${userId}`;
      let memberLeaseAcquired = false;
      if (memberLeaseRepository) {
        try {
          memberLeaseAcquired = await memberLeaseRepository.acquireLease(
            memberLeaseKey,
            queueWorkerId,
            now,
            new Date(Date.parse(now) + 10 * 60_000).toISOString(),
          );
        } catch (error) {
          summary.queueFailures += 1;
          summary.errors.push({ userId, message: `member delivery lease failed: ${error instanceof Error ? error.message : String(error)}` });
          continue;
        }
        if (!memberLeaseAcquired) {
          summary.queueDuplicatesSkipped += 1;
          continue;
        }
      }

      try {
      if (memberLeaseAcquired) {
        user = await client.users.getUser(userId) as unknown as Record<string, unknown>;
      }
      const publicMetadata = (user.publicMetadata && typeof user.publicMetadata === "object" ? user.publicMetadata : {}) as Record<string, unknown>;
      const privateMetadata = (user.privateMetadata && typeof user.privateMetadata === "object" ? user.privateMetadata : {}) as Record<string, unknown>;
      const entitlements = await getServerEntitlements(publicMetadata);
      if (entitlements.tier === "free") {
        summary.skippedFreeUsers += 1;
        continue;
      }
      const notificationPrefs = normalizeNotificationPreferences(publicMetadata.notificationPreferences);
      const areaPrefs = normalizeAreaPrefs(publicMetadata.areaPreferences, publicMetadata.monitoringScopes);
      if (!hasSavedAreaPreferences(areaPrefs)) {
        summary.skippedNoAreaPreferences += 1;
        continue;
      }

      const bottlePrefs = normalizeBottleAlertPreferences(publicMetadata.bottleAlertPreferences);
      const alertMode = publicMetadata.alertMode;
      const deliveryMetadata = normalizeDeliveryMetadata(privateMetadata.alertDelivery);
      const allMatchingPreferenceCandidates = groupCandidatesByLocation(candidates
        .filter((candidate) => asString(candidate.sourceType) !== "community" || (entitlements.canReceiveSightingsAlerts && notificationPrefs.sightings.enabled))
        .filter((candidate) => alertRarityIsSelected(candidate.tier ?? candidate.rarityTier, notificationPrefs.rarityTiers))
        .filter((candidate) => candidateMatchesArea(candidate, areaPrefs))
        .filter((candidate) => {
          const matches = candidateMatchesBottlePrefs(candidate, alertMode, bottlePrefs);
          if (!matches && alertMode === "specific_bottles") summary.skippedSpecificBottlePrefs += 1;
          return matches;
        })
        .sort(sortCandidatesForMember));
      const matchingPreferenceCandidates = allMatchingPreferenceCandidates
        .slice(0, Math.max(1, CANDIDATE_POOL_PER_USER));

      if (!dryRun && deliveryMetadata.dedupeIdentityVersion !== 2) {
        const enabledChannels: AlertChannel[] = [];
        if (notificationPrefs.onSite.enabled || notificationPrefs.push.enabled) enabledChannels.push("onSite");
        if (notificationPrefs.email.enabled) enabledChannels.push("email");
        if (notificationPrefs.sms.enabled) enabledChannels.push("sms");
        const migration = await ensureAlertDeliveryIdentityV2({
          userId,
          alertDelivery: privateMetadata.alertDelivery,
          enabledChannels,
          currentStableKeys: {
            onSite: flattenUnderlyingStableKeys(allMatchingPreferenceCandidates.filter((candidate) => candidatePassesFreshOnSiteGuardrails(candidate))),
            email: flattenUnderlyingStableKeys(allMatchingPreferenceCandidates
              .filter((candidate) => candidatePassesFreshEmailGuardrails(candidate))
              .filter((candidate) => candidateMatchesEmailMode(candidate, notificationPrefs.email.mode))),
            sms: flattenUnderlyingStableKeys(allMatchingPreferenceCandidates
              .filter((candidate) => candidatePassesFreshSmsGuardrails(candidate))
              .filter((candidate) => candidateMatchesSmsMode(candidate, notificationPrefs.sms.mode, bottlePrefs))),
          },
          createdAt: now,
          baseline: async (baseline) => {
            if (queueRepository) await queueRepository.baseline(baseline);
          },
          persist: async (alertDelivery) => {
            await client.users.updateUserMetadata(userId, { privateMetadata: { alertDelivery } });
          },
        });
        if (migration.error) {
          summary.dedupeIdentityMigrationFailures += 1;
          summary.errors.push({ userId, message: `alert delivery identity migration failed: ${migration.error instanceof Error ? migration.error.message : String(migration.error)}` });
        } else if (migration.migrated) {
          summary.dedupeIdentityMigrations += 1;
        }
        if (!migration.sendCurrentPass) continue;
      }

      if (matchingPreferenceCandidates.length) {
        summary.usersMatched += 1;
      }

      let newOnSiteAlerts: MemberAlertRecord[] = [];
      let onSiteQueueGroups: Array<{ alertId: string; candidates: AlertCandidateRecord[] }> = [];
      const pruneStaleOnSiteAlerts = async () => {
        const freshAlerts = newOnSiteAlerts.filter((alert) => memberAlertPassesFinalFreshness(alert));
        const freshAlertIds = new Set(freshAlerts.map((alert) => alert.id));
        const staleQueueGroups = onSiteQueueGroups.filter((group) => !freshAlertIds.has(group.alertId));
        for (const group of staleQueueGroups) await suppressStaleQueuedIntents(group.candidates);
        summary.skippedFinalOnSiteFreshness += newOnSiteAlerts.length - freshAlerts.length;
        newOnSiteAlerts = freshAlerts;
        onSiteQueueGroups = onSiteQueueGroups.filter((group) => freshAlertIds.has(group.alertId));
      };
      const alertInbox = normalizeAlertInboxMetadata(privateMetadata.alertInbox);
      if (baselineOnSiteOnly) {
        const baselineDedupeKeys = flattenUnderlyingStableKeys(matchingPreferenceCandidates);
        summary.onSiteBaselinesCreated += baselineDedupeKeys.length;
        if (!dryRun && baselineDedupeKeys.length) {
          await client.users.updateUserMetadata(userId, {
            privateMetadata: {
              alertDelivery: {
                dedupeIdentityVersion: 2,
                recent: deliveryMetadata.recent || [],
                onSiteBaselineDedupeKeys: uniqueStrings([...baselineDedupeKeys, ...(deliveryMetadata.onSiteBaselineDedupeKeys || [])]),
                emailBaselineDedupeKeys: deliveryMetadata.emailBaselineDedupeKeys || [],
                smsBaselineDedupeKeys: deliveryMetadata.smsBaselineDedupeKeys || [],
                lastOnSiteBaselineAt: now,
                lastEmailBaselineAt: deliveryMetadata.lastEmailBaselineAt,
                lastSmsBaselineAt: deliveryMetadata.lastSmsBaselineAt,
                lastRunAt: deliveryMetadata.lastRunAt,
              },
            },
          });
        }
        continue;
      }

      if (notificationPrefs.onSite.enabled) {
        summary.usersWithOnSiteEnabled += 1;
      }
      if (notificationPrefs.push.enabled) summary.usersWithPushEnabled += 1;

      if ((notificationPrefs.onSite.enabled || notificationPrefs.push.enabled) && !baselineEmailOnly && !baselineSmsOnly && (dryRun || ALERT_ONSITE_DELIVERY_ENABLED)) {
        const existingOnSiteDedupe = new Set((alertInbox.recent || []).map((alert) => alert.dedupeKey));
        const existingOnSiteUnderlying = new Set((alertInbox.recent || []).flatMap((alert) => alert.underlyingStableKeys || []));
        const onSiteBaseline = new Set(deliveryMetadata.onSiteBaselineDedupeKeys || []);
        const draftOnSiteAlerts = matchingPreferenceCandidates
          .filter((candidate) => candidatePassesFreshOnSiteGuardrails(candidate))
          .map((candidate) => {
            const selected = selectUnseenCandidate(
              candidate,
              new Set([...existingOnSiteUnderlying, ...onSiteBaseline]),
              new Set([...existingOnSiteDedupe, ...onSiteBaseline]),
            );
            if (!selected) summary.skippedOnSiteDedupe += 1;
            return selected;
          })
          .filter((candidate): candidate is CandidateAlert => Boolean(candidate))
          .slice(0, Math.max(1, MAX_ONSITE_ALERTS_PER_USER));

        for (const candidate of draftOnSiteAlerts) {
          const storeLabel = candidateStoreLabel(candidate);
          const reservation = await reserveQueuedGroup(userId, "onSite", candidate, (child) => ({
            bottle: asString(child.bottle, "Bottle signal"),
            state: asString(child.state).toUpperCase(),
            location: storeLabel,
            eventType: asString(child.eventType, asString(child.action, "signal")),
          }));
          if (!reservation) continue;
          const alert = candidateToMemberAlert(userId, reservation.candidate, now, areaPrefs);
          newOnSiteAlerts.push(alert);
          if (reservation.queueCandidates.length) onSiteQueueGroups.push({ alertId: alert.id, candidates: reservation.queueCandidates });
        }

        if (newOnSiteAlerts.length) summary.onSiteAlertsCreated += newOnSiteAlerts.length;
        if (dryRun && notificationPrefs.push.enabled) {
          summary.pushNotificationsWouldSend += newOnSiteAlerts.flatMap((alert) => buildExpoPushMessages(enabledPushTokens(privateMetadata.pushDevices), alert)).length;
        }
      }

      let newRecords: DeliveryRecord[] = [];
      if (notificationPrefs.email.enabled) {
        summary.usersWithEmailEnabled += 1;
      }

      if (notificationPrefs.email.enabled && !baselineEmailOnly && !dryRun && !ALERT_EMAIL_DELIVERY_ENABLED) {
        summary.skippedEmailDeliveryDisabled += matchingPreferenceCandidates.length;
      } else if (notificationPrefs.email.enabled) {
        const email = primaryEmailForUser(user);
        if (!email) {
          summary.skippedNoEmail += 1;
        } else if (!emailRecipientAllowed(email)) {
          summary.skippedEmailRecipientNotAllowed += matchingPreferenceCandidates.length;
        } else {
          const emailModeCandidates = matchingPreferenceCandidates.filter((candidate) => candidatePassesFreshEmailGuardrails(candidate)).filter((candidate) => candidateMatchesEmailMode(candidate, notificationPrefs.email.mode));
          if (baselineEmailOnly) {
            const baselineDedupeKeys = flattenUnderlyingStableKeys(emailModeCandidates);
            summary.emailBaselinesCreated += baselineDedupeKeys.length;
            if (!dryRun && baselineDedupeKeys.length) {
              await client.users.updateUserMetadata(userId, {
                privateMetadata: {
                  alertDelivery: {
                    dedupeIdentityVersion: 2,
                    recent: deliveryMetadata.recent || [],
                    onSiteBaselineDedupeKeys: deliveryMetadata.onSiteBaselineDedupeKeys || [],
                    emailBaselineDedupeKeys: uniqueStrings([...baselineDedupeKeys, ...(deliveryMetadata.emailBaselineDedupeKeys || [])]),
                    smsBaselineDedupeKeys: deliveryMetadata.smsBaselineDedupeKeys || [],
                    lastOnSiteBaselineAt: deliveryMetadata.lastOnSiteBaselineAt,
                    lastEmailBaselineAt: now,
                    lastSmsBaselineAt: deliveryMetadata.lastSmsBaselineAt,
                    lastRunAt: deliveryMetadata.lastRunAt,
                  },
                },
              });
            }
            continue;
          }

          const delivered = recentDeliverySet(deliveryMetadata, "email");
          const deliveredUnderlying = recentUnderlyingDeliverySet(deliveryMetadata, "email");
          const emailBaseline = new Set(deliveryMetadata.emailBaselineDedupeKeys || []);
          const matchedCandidates = emailModeCandidates
            .map((candidate) => {
              const dedupeKey = asString(candidate.dedupeKey, asString(candidate.id));
              const baselineDuplicate = emailBaseline.has(dedupeKey);
              const selected = selectUnseenCandidate(
                candidate,
                new Set([...deliveredUnderlying, ...emailBaseline]),
                new Set([
                  ...Array.from(delivered).map((token) => token.slice(0, -":email".length)),
                  ...emailBaseline,
                ]),
              );
              if (!selected && baselineDuplicate) summary.skippedEmailBaseline += 1;
              else if (!selected) summary.skippedDedupe += 1;
              return selected;
            })
            .filter((candidate): candidate is CandidateAlert => Boolean(candidate))
            .slice(0, Math.max(1, MAX_EMAILS_PER_USER));

          for (const selectedCandidate of matchedCandidates) {
            if (globalEmailCount >= MAX_EMAILS_PER_RUN) break;
            const selectedStoreLabel = candidateStoreLabel(selectedCandidate);
            const reservation = await reserveQueuedGroup(userId, "email", selectedCandidate, (child) => ({
              bottle: asString(child.bottle, "Bottle signal"),
              state: asString(child.state).toUpperCase(),
              location: selectedStoreLabel,
              emailMode: notificationPrefs.email.mode,
              source: candidateSourceLabel(child),
            }));
            if (!reservation) continue;
            const candidate = reservation.candidate;
            const queuedCandidates = reservation.queueCandidates;
            const dedupeKey = asString(candidate.dedupeKey, asString(candidate.id));
            const bottleName = asString(candidate.bottle, "Bottle signal");
            const storeLabel = candidateStoreLabel(candidate);
            const matchedArea = candidateMatchedArea(candidate, areaPrefs);
            const state = asString(candidate.state).toUpperCase();
            if (!candidatePassesFreshEmailGuardrails(candidate)) {
              summary.skippedFinalEmailFreshness += 1;
              await suppressStaleQueuedIntents(queuedCandidates);
              continue;
            }

            const claimedChildCandidateIds = queuedCandidates.map((queuedCandidate) => queuedCandidate.id).sort();
            try {
              let messageId: string | null = null;
              if (!dryRun && resend) {
                const result = await resend.emails.send({
                  from: ALERT_FROM,
                  to: [email],
                  replyTo: ALERT_REPLY_TO,
                  subject: `${ALERT_SAFE_SUBJECT_PREFIX.replace(/^./, (char) => char.toUpperCase())}: ${bottleName} at ${candidateSubjectLocationLabel(candidate)}`,
                  react: PaidDropAlertEmail({
                    firstName: asString(user.firstName) || null,
                    bottleName,
                    storeLabel,
                    matchedArea,
                    state,
                    timestampLabel: candidateTimestampLabel(candidate),
                    quantityLabel: candidateQuantityLabel(candidate),
                    evidenceLabel: candidateEvidenceLabel(candidate),
                    sourceLabel: candidateSourceLabel(candidate),
                    sourceUrl: candidateSourceUrl(candidate),
                    dashboardUrl: `${appUrl}/dashboard`,
                  }),
                  headers: {
                    "X-Entity-Ref-ID": `alert-${userId}-${dedupeKey}`.slice(0, 190),
                  },
                }, {
                  idempotencyKey: claimedChildCandidateIds.length
                    ? `alert-group-${createHash("sha256").update(claimedChildCandidateIds.join(":"), "utf8").digest("hex")}`
                    : `alert-${createHash("sha256").update(`${userId}:${underlyingStableKeys(candidate).sort().join(":")}`).digest("hex")}`,
                });
                if (result.error) throw new Error(result.error.message);
                messageId = result.data?.id || null;
              }

              if (dryRun) {
                summary.emailsWouldSend += 1;
              } else {
                if (queuedCandidates.length && queueRepository) {
                  await queueRepository.markBatchDelivered(
                    queuedCandidates.map((queuedCandidate) => queuedCandidate.id),
                    messageId || `resend:${claimedChildCandidateIds.join(":")}`,
                    now,
                  );
                }
                newRecords.push({ dedupeKey, underlyingStableKeys: underlyingStableKeys(candidate), deliveredAt: now, channel: "email", emailMode: notificationPrefs.email.mode, messageId });
                newOnSiteAlerts = newOnSiteAlerts.map((alert) => alert.dedupeKey === dedupeKey
                  ? { ...alert, emailDeliveredAt: now, emailModeAtSend: notificationPrefs.email.mode }
                  : alert);
                summary.emailsSent += 1;
              }
              globalEmailCount += 1;
            } catch (error) {
              await failQueuedIntents(queuedCandidates, error);
              summary.errors.push({ userId, email, message: error instanceof Error ? error.message : String(error) });
            }
          }
        }
      }



      if (notificationPrefs.sms.enabled) {
        summary.usersWithSmsEnabled += 1;
      }

      if (notificationPrefs.sms.enabled && !notificationPrefs.sms.verified) {
        summary.skippedSmsDeliveryDisabled += matchingPreferenceCandidates.length;
      } else if (notificationPrefs.sms.enabled && !baselineEmailOnly) {
        const phone = normalizePhoneNumber(notificationPrefs.sms.phone || "");
        const smsCandidates = matchingPreferenceCandidates
          .filter((candidate) => candidatePassesFreshSmsGuardrails(candidate))
          .filter((candidate) => candidateMatchesSmsMode(candidate, notificationPrefs.sms.mode, bottlePrefs));

        if (!phone) {
          summary.skippedSmsRecipientNotAllowed += smsCandidates.length;
        } else if (!smsRecipientAllowed(phone)) {
          summary.skippedSmsRecipientNotAllowed += smsCandidates.length;
        } else if (baselineSmsOnly) {
          const baselineDedupeKeys = flattenUnderlyingStableKeys(smsCandidates);
          summary.smsBaselinesCreated += baselineDedupeKeys.length;
          if (!dryRun && baselineDedupeKeys.length) {
            await client.users.updateUserMetadata(userId, {
              privateMetadata: {
                alertDelivery: {
                  dedupeIdentityVersion: 2,
                  recent: deliveryMetadata.recent || [],
                  onSiteBaselineDedupeKeys: deliveryMetadata.onSiteBaselineDedupeKeys || [],
                  emailBaselineDedupeKeys: deliveryMetadata.emailBaselineDedupeKeys || [],
                  smsBaselineDedupeKeys: uniqueStrings([...baselineDedupeKeys, ...(deliveryMetadata.smsBaselineDedupeKeys || [])]),
                  lastOnSiteBaselineAt: deliveryMetadata.lastOnSiteBaselineAt,
                  lastEmailBaselineAt: deliveryMetadata.lastEmailBaselineAt,
                  lastSmsBaselineAt: now,
                  lastRunAt: deliveryMetadata.lastRunAt,
                },
              },
            });
          }
          continue;
        } else if (!dryRun && !ALERT_SMS_DELIVERY_ENABLED) {
          summary.skippedSmsDeliveryDisabled += smsCandidates.length;
        } else {
          const delivered = recentDeliverySet(deliveryMetadata, "sms");
          const deliveredUnderlying = recentUnderlyingDeliverySet(deliveryMetadata, "sms");
          const smsBaseline = new Set(deliveryMetadata.smsBaselineDedupeKeys || []);
          const matchedSmsCandidates = smsCandidates
            .map((candidate) => {
              const dedupeKey = asString(candidate.dedupeKey, asString(candidate.id));
              const baselineDuplicate = smsBaseline.has(dedupeKey);
              const selected = selectUnseenCandidate(
                candidate,
                new Set([...deliveredUnderlying, ...smsBaseline]),
                new Set([
                  ...Array.from(delivered).map((token) => token.slice(0, -":sms".length)),
                  ...smsBaseline,
                ]),
              );
              if (!selected && baselineDuplicate) summary.skippedSmsBaseline += 1;
              else if (!selected) summary.skippedDedupe += 1;
              return selected;
            })
            .filter((candidate): candidate is CandidateAlert => Boolean(candidate))
            .slice(0, Math.max(1, MAX_SMS_PER_USER));

          for (const selectedCandidate of matchedSmsCandidates) {
            if (summary.smsSent + summary.smsWouldSend >= MAX_SMS_PER_RUN) break;
            const selectedStoreLabel = candidateStoreLabel(selectedCandidate);
            const reservation = await reserveQueuedGroup(userId, "sms", selectedCandidate, (child) => ({
              bottle: asString(child.bottle, "Bottle signal"),
              state: asString(child.state).toUpperCase(),
              location: selectedStoreLabel,
              smsMode: notificationPrefs.sms.mode,
              source: candidateSourceLabel(child),
            }));
            if (!reservation) continue;
            const candidate = reservation.candidate;
            const queuedCandidates = reservation.queueCandidates;
            const dedupeKey = asString(candidate.dedupeKey, asString(candidate.id));
            const storeLabel = candidateStoreLabel(candidate);
            if (!candidatePassesFreshSmsGuardrails(candidate)) {
              summary.skippedFinalSmsFreshness += 1;
              await suppressStaleQueuedIntents(queuedCandidates);
              continue;
            }
            let smsProviderAttempted = false;
            try {
              let messageId: string | null = null;
              let status: string | null = null;
              if (!dryRun) {
                smsProviderAttempted = true;
                const result = await sendTwilioSms(phone, smsBodyForCandidate(candidate, storeLabel));
                messageId = result.sid;
                status = result.status;
              }
              if (dryRun) {
                summary.smsWouldSend += 1;
              } else {
                if (queuedCandidates.length && queueRepository) {
                  await queueRepository.markBatchDelivered(
                    queuedCandidates.map((queuedCandidate) => queuedCandidate.id),
                    messageId || `twilio:${queuedCandidates.map((queuedCandidate) => queuedCandidate.id).sort().join(":")}`,
                    now,
                  );
                }
                newRecords.push({ dedupeKey, underlyingStableKeys: underlyingStableKeys(candidate), deliveredAt: now, channel: "sms", smsMode: notificationPrefs.sms.mode, messageId, status });
                summary.smsSent += 1;
              }
            } catch (error) {
              if (!smsProviderAttempted || error instanceof DefinitiveSmsSendError) await failQueuedIntents(queuedCandidates, error);
              summary.errors.push({ userId, email: maskPhone(phone), message: error instanceof Error ? error.message : String(error) });
            }
          }
        }
      }

      await pruneStaleOnSiteAlerts();
      if ((newRecords.length || newOnSiteAlerts.length) && !dryRun) {
        const nextRecent = [...newRecords, ...(deliveryMetadata.recent || [])]
          .filter((record, index, rows) => rows.findIndex((item) => item.dedupeKey === record.dedupeKey && (item.channel || "email") === (record.channel || "email")) === index)
          .slice(0, MAX_RECENT_DELIVERIES_PER_USER);
        const newOnSiteDedupeKeys = uniqueStrings(newOnSiteAlerts.flatMap((alert) => alert.underlyingStableKeys || []));
        const newEmailDedupeKeys = uniqueStrings(newRecords
          .filter((record) => (record.channel || "email") === "email")
          .flatMap((record) => record.underlyingStableKeys || []));
        const newSmsDedupeKeys = uniqueStrings(newRecords
          .filter((record) => record.channel === "sms")
          .flatMap((record) => record.underlyingStableKeys || []));
        const nextAlertDelivery = {
          dedupeIdentityVersion: 2,
          recent: nextRecent,
          onSiteBaselineDedupeKeys: deliveryMetadata.onSiteBaselineDedupeKeys || [],
          emailBaselineDedupeKeys: uniqueStrings([...newEmailDedupeKeys, ...(deliveryMetadata.emailBaselineDedupeKeys || [])]),
          smsBaselineDedupeKeys: uniqueStrings([...newSmsDedupeKeys, ...(deliveryMetadata.smsBaselineDedupeKeys || [])]),
          lastOnSiteBaselineAt: deliveryMetadata.lastOnSiteBaselineAt,
          lastEmailBaselineAt: newEmailDedupeKeys.length ? now : deliveryMetadata.lastEmailBaselineAt,
          lastSmsBaselineAt: newSmsDedupeKeys.length ? now : deliveryMetadata.lastSmsBaselineAt,
          lastRunAt: now,
        };
        try {
          await client.users.updateUserMetadata(userId, {
            privateMetadata: {
              alertDelivery: nextAlertDelivery,
            },
          });
        } catch (error) {
          const primaryError = error instanceof Error ? error.message : String(error);
          try {
            // If a long-lived member accumulated oversized legacy private metadata, do not let
            // that block current delivery bookkeeping. Retain fresh records plus durable baseline
            // keys so dedupe still protects the member from duplicate sends after compaction.
            await client.users.updateUserMetadata(userId, {
              privateMetadata: {
                alertDelivery: {
                  ...nextAlertDelivery,
                  recent: nextRecent.slice(0, Math.max(newRecords.length, 50)),
                },
              },
            });
          } catch (retryError) {
            summary.errors.push({
              userId,
              email: primaryEmailForUser(user),
              message: `alertDelivery metadata update failed after send: ${primaryError}; retry: ${retryError instanceof Error ? retryError.message : String(retryError)}`,
            });
          }
        }

        let createdRealAlert = newRecords.length > 0;
        await pruneStaleOnSiteAlerts();
        if (newOnSiteAlerts.length) {
          let onSiteInboxWritten = false;
          const nextOnSiteAlerts = [...newOnSiteAlerts, ...(alertInbox.recent || [])]
            .filter((alert, index, rows) => rows.findIndex((item) => item.dedupeKey === alert.dedupeKey) === index)
            .slice(0, MAX_RECENT_ONSITE_ALERTS_PER_USER);
          try {
            await client.users.updateUserMetadata(userId, {
              privateMetadata: {
                alertInbox: {
                  recent: nextOnSiteAlerts,
                  lastSyncedAt: now,
                },
                alertDelivery: {
                  ...nextAlertDelivery,
                  onSiteBaselineDedupeKeys: uniqueStrings([...newOnSiteDedupeKeys, ...(deliveryMetadata.onSiteBaselineDedupeKeys || [])]).slice(0, 1000),
                  lastOnSiteBaselineAt: newOnSiteDedupeKeys.length ? now : deliveryMetadata.lastOnSiteBaselineAt,
                },
                // Record first_alert_created only in the same successful write that commits a real on-site alert.
                activation: firstAlertCreatedMetadata(privateMetadata, true, now).activation,
              },
            });
            onSiteInboxWritten = true;
          } catch (error) {
            const primaryError = error instanceof Error ? error.message : String(error);
            try {
              await pruneStaleOnSiteAlerts();
              if (!newOnSiteAlerts.length) throw new Error("all on-site alerts became stale before compaction retry");
              // Clerk rejects oversized/legacy-shaped private metadata with 422s. Do not let a stale
              // historical inbox block the current alert; retry with a compact inbox containing only
              // freshly-created records, still deduped by the candidate key.
              await client.users.updateUserMetadata(userId, {
                privateMetadata: {
                  alertInbox: {
                    recent: newOnSiteAlerts.slice(0, Math.max(1, MAX_ONSITE_ALERTS_PER_USER)),
                    lastSyncedAt: now,
                    compactionReason: "onsite_alert_metadata_retry",
                  },
                  alertDelivery: {
                  ...nextAlertDelivery,
                  onSiteBaselineDedupeKeys: uniqueStrings([...newOnSiteDedupeKeys, ...(deliveryMetadata.onSiteBaselineDedupeKeys || [])]).slice(0, 1000),
                  lastOnSiteBaselineAt: newOnSiteDedupeKeys.length ? now : deliveryMetadata.lastOnSiteBaselineAt,
                },
                // Record first_alert_created only in the same successful write that commits a real on-site alert.
                activation: firstAlertCreatedMetadata(privateMetadata, true, now).activation,
                },
              });
              onSiteInboxWritten = true;
            } catch (retryError) {
              summary.errors.push({ userId, message: `On-site alert metadata update failed after compaction retry: ${primaryError}; retry: ${retryError instanceof Error ? retryError.message : String(retryError)}` });
            }
          }
          if (onSiteInboxWritten) createdRealAlert = true;
          if (onSiteInboxWritten && notificationPrefs.push.enabled && pushPreferenceProjectionAllowsDelivery(privateMetadata.pushPreferenceProjection)) {
            const messages = newOnSiteAlerts.flatMap((alert) => buildExpoPushMessages(enabledPushTokens(privateMetadata.pushDevices), alert));
            if (messages.length) {
              try {
                const result = await sendExpoPushMessages(messages);
                summary.pushNotificationsSent += result.accepted;
              } catch (error) {
                summary.errors.push({ userId, message: `push delivery failed: ${error instanceof Error ? error.message : String(error)}` });
              }
            }
          }
          for (const group of onSiteQueueGroups) {
            if (onSiteInboxWritten && queueRepository) {
              await queueRepository.markBatchDelivered(
                group.candidates.map((candidate) => candidate.id),
                `clerk:${userId}:${group.alertId}`,
                now,
              );
            } else {
              await failQueuedIntents(group.candidates, new Error("Clerk on-site inbox write failed"));
            }
          }
        }
        if (createdRealAlert) {
          try {
            await client.users.updateUserMetadata(userId, {
              privateMetadata: { activation: firstAlertCreatedMetadata(privateMetadata, true, now).activation },
            });
          } catch (error) {
            summary.errors.push({ userId, message: `first_alert_created milestone update failed after delivery: ${error instanceof Error ? error.message : String(error)}` });
          }
        }
      }
      } finally {
        if (memberLeaseAcquired && memberLeaseRepository) {
          try {
            await memberLeaseRepository.releaseLease(memberLeaseKey, queueWorkerId);
          } catch (error) {
            summary.queueFailures += 1;
            summary.errors.push({ userId, message: `member delivery lease release failed: ${error instanceof Error ? error.message : String(error)}` });
          }
        }
      }
    }

    offset += page.data.length;
    if (!page.totalCount || offset >= page.totalCount) break;
  }

  return summary;
}
