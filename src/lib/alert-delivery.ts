import { clerkClient } from "@clerk/nextjs/server";
import { PaidDropAlertEmail } from "@/components/emails/PaidDropAlertEmail";
import { ALERT_FROM, ALERT_REPLY_TO, getResendClient } from "@/lib/email-alerts";
import { isPaidTier } from "@/lib/entitlements";
import { buildAlertId, normalizeNotificationPreferences, type EmailAlertMode, type MemberAlertRecord, type SmsAlertMode } from "@/lib/notification-preferences";
import { readSiteExport } from "@/lib/site-engine-contract";
import { ACTIVE_ENGINE_STATE_CODES, getActiveEngineStateName } from "@/lib/activeStates";
import { locationMatchesAny, normalizeStateCodeParam } from "@/lib/location-normalization";

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

export interface BottleAlertPreferences {
  bottleNames: string[];
  bottleKeys: string[];
}

type CandidateAlert = Record<string, unknown>;

type DeliveryRecord = {
  dedupeKey: string;
  deliveredAt: string;
  channel?: "email" | "sms";
  emailMode?: EmailAlertMode | null;
  smsMode?: SmsAlertMode | null;
  messageId: string | null;
  status?: string | null;
};

type AlertDeliveryMetadata = {
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
const DELIVERY_DEDUPE_WINDOW_HOURS = 24;
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
const ALERT_REALTIME_MAX_FRESHNESS_HOURS = Number(process.env.ALERT_REALTIME_MAX_FRESHNESS_HOURS || 2);
const ALERT_EMAIL_MAX_FRESHNESS_HOURS = Number(process.env.ALERT_EMAIL_MAX_FRESHNESS_HOURS || ALERT_REALTIME_MAX_FRESHNESS_HOURS);
const ALERT_SMS_MAX_FRESHNESS_HOURS = Number(process.env.ALERT_SMS_MAX_FRESHNESS_HOURS || ALERT_REALTIME_MAX_FRESHNESS_HOURS);
const ALERT_EMAIL_ALLOWED_RECIPIENTS = toStrings(process.env.ALERT_EMAIL_ALLOWED_RECIPIENTS?.split(",")).map((email) => email.toLowerCase());
const ALERT_SMS_ALLOWED_RECIPIENTS = toStrings(process.env.ALERT_SMS_ALLOWED_RECIPIENTS?.split(",")).map(normalizePhoneNumber).filter(Boolean);
const ALERT_SAFE_SUBJECT_PREFIX = "fresh signal detected";

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

export function normalizeAreaPrefs(input: unknown): AreaPreferences {
  const source = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const supportedStates = new Set<string>(ACTIVE_ENGINE_STATE_CODES);
  return {
    states: toStrings(source.states).map((state) => normalizeStateCodeParam(state)).filter((state): state is string => Boolean(state && supportedStates.has(state))),
    ncBoards: toStrings(source.ncBoards),
    vaCities: toStrings(source.vaCities),
    ohCities: toStrings(source.ohCities),
    iaCities: toStrings(source.iaCities),
    idCities: toStrings(source.idCities),
    paCounties: toStrings(source.paCounties),
    paStores: toStrings(source.paStores),
  };
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
  return getActiveEngineStateName(state) || state || "your area";
}

export function readAlertCandidates() {
  const engineAlertsPayload = readSiteExport("alerts");
  return Array.isArray(engineAlertsPayload?.alerts) ? (engineAlertsPayload.alerts as CandidateAlert[]) : [];
}

export function candidateMatchesArea(candidate: CandidateAlert, areaPrefs: AreaPreferences) {
  const state = normalizeStateCodeParam(asString(candidate.state));
  if (!state) return false;
  if (areaPrefs.states.length && !areaPrefs.states.includes(state)) return false;

  const locationFields = [
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

  if (state === "NC" && areaPrefs.ncBoards.length) return locationMatchesAny(locationFields, areaPrefs.ncBoards);
  if (state === "VA" && areaPrefs.vaCities.length) return locationMatchesAny(locationFields, areaPrefs.vaCities);
  if (state === "OH" && areaPrefs.ohCities.length) return locationMatchesAny(locationFields, areaPrefs.ohCities);
  if (state === "IA" && areaPrefs.iaCities.length) return locationMatchesAny(locationFields, areaPrefs.iaCities);
  if (state === "ID" && areaPrefs.idCities.length) return locationMatchesAny(locationFields, areaPrefs.idCities);
  if (state === "PA" && areaPrefs.paCounties.length) return locationMatchesAny(locationFields, areaPrefs.paCounties);
  if (state === "PA" && areaPrefs.paStores.length) return locationMatchesAny([asString(candidate.storeId), asString(candidate.store_id), ...locationFields], areaPrefs.paStores);
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
    areaPrefs.vaCities.length ||
    areaPrefs.ohCities.length ||
    areaPrefs.iaCities.length ||
    areaPrefs.idCities.length ||
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

export function candidatePassesFreshOnSiteGuardrails(candidate: CandidateAlert) {
  const blockers = candidateDeliveryBlockers(candidate);
  const cautions = candidateDeliveryCautions(candidate);
  const freshnessHours = asNumber(candidate.freshnessHours, Number.NaN);

  if (!candidateCanUseOnSite(candidate)) return false;
  if (asBoolean(candidate.bootstrap)) return false;
  if (blockers.includes("bootstrap_run_not_sendable")) return false;
  if (blockers.includes("manual_refresh_quarantine")) return false;
  if (blockers.includes("stale_observation")) return false;
  if (cautions.includes("unknown_freshness")) return false;
  if (!Number.isFinite(freshnessHours)) return false;
  return freshnessHours <= freshnessPolicyHours(candidate, "onSite", ALERT_EMAIL_MAX_FRESHNESS_HOURS);
}

export function candidatePassesFreshEmailGuardrails(candidate: CandidateAlert) {
  const blockers = candidateDeliveryBlockers(candidate);
  const cautions = candidateDeliveryCautions(candidate);
  const freshnessHours = asNumber(candidate.freshnessHours, Number.NaN);

  if (!candidateCanSendEmail(candidate)) return false;
  if (asBoolean(candidate.bootstrap)) return false;
  if (blockers.includes("bootstrap_run_not_sendable")) return false;
  if (blockers.includes("manual_refresh_quarantine")) return false;
  if (blockers.includes("stale_observation")) return false;
  if (cautions.includes("unknown_freshness")) return false;
  if (!Number.isFinite(freshnessHours)) return false;
  return freshnessHours <= freshnessPolicyHours(candidate, "email", ALERT_EMAIL_MAX_FRESHNESS_HOURS);
}

export function candidatePassesFreshSmsGuardrails(candidate: CandidateAlert) {
  if (!candidateCanSendSms(candidate)) return false;
  if (!candidatePassesFreshEmailGuardrails(candidate)) return false;
  const freshnessHours = asNumber(candidate.freshnessHours, Number.NaN);
  return Number.isFinite(freshnessHours) && freshnessHours <= freshnessPolicyHours(candidate, "sms", ALERT_SMS_MAX_FRESHNESS_HOURS);
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

function siteLocationLookupRecords() {
  if (locationLookupCache) return locationLookupCache;
  const records: LocationLookupRecord[] = [];
  for (const exportName of ["stores", "locations"] as const) {
    try {
      const payload = readSiteExport(exportName);
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
  const precision = candidateLocationPrecision(candidate);
  const actionability = asString(candidate.actionabilityClass).toLowerCase();
  const eventType = asString(candidate.eventType).toLowerCase();
  return precision === "store_level" || actionability === "store_inventory" || /store_inventory|store_allocation|store_delivery|in_stock/.test(eventType);
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
  const state = normalizeStateCodeParam(asString(candidate.state)) || asString(candidate.state).toUpperCase();
  const locationName = asString(candidate.locationName) || asString(candidate.storeName) || asString(candidate.storeAddress);
  if (state === "NC" && areaPrefs.ncBoards.length) return matchedLocationFromOptions(candidate, areaPrefs.ncBoards) || locationName || stateLabel(state);
  if (state === "VA" && areaPrefs.vaCities.length) return matchedLocationFromOptions(candidate, areaPrefs.vaCities) || locationName || stateLabel(state);
  if (state === "OH" && areaPrefs.ohCities.length) return matchedLocationFromOptions(candidate, areaPrefs.ohCities) || locationName || stateLabel(state);
  if (state === "IA" && areaPrefs.iaCities.length) return matchedLocationFromOptions(candidate, areaPrefs.iaCities) || locationName || stateLabel(state);
  if (state === "ID" && areaPrefs.idCities.length) return matchedLocationFromOptions(candidate, areaPrefs.idCities) || locationName || stateLabel(state);
  if (state === "PA" && areaPrefs.paStores.length) return matchedLocationFromOptions(candidate, areaPrefs.paStores) || locationName || stateLabel(state);
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
          deliveredAt: asString(item.deliveredAt),
          channel: (item.channel === "sms" ? "sms" : "email") as "email" | "sms",
          emailMode: (item.emailMode === "all" || item.emailMode === "daily_roundup" ? item.emailMode : "major_only") as EmailAlertMode,
          smsMode: (item.smsMode === "specific_bottles" ? "specific_bottles" : "major_only") as SmsAlertMode,
          messageId: asString(item.messageId) || null,
          status: asString(item.status) || null,
        }))
        .filter((item) => item.dedupeKey && item.deliveredAt)
    : [];
  return {
    recent,
    onSiteBaselineDedupeKeys: uniqueStrings(toStrings(source.onSiteBaselineDedupeKeys)).slice(0, 1000),
    emailBaselineDedupeKeys: uniqueStrings(toStrings(source.emailBaselineDedupeKeys)).slice(0, 1000),
    smsBaselineDedupeKeys: uniqueStrings(toStrings(source.smsBaselineDedupeKeys)).slice(0, 1000),
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
  const cutoff = Date.now() - DELIVERY_DEDUPE_WINDOW_HOURS * 60 * 60_000;
  return new Set((metadata.recent || [])
    .filter((record) => {
      const deliveredAt = new Date(record.deliveredAt).getTime();
      return Number.isFinite(deliveredAt) && deliveredAt >= cutoff;
    })
    .filter((record) => (record.channel || "email") === channel)
    .map((record) => deliveryDedupeToken(record.dedupeKey, channel)));
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
    state: asString(source.state),
    storeLabel: asString(source.storeLabel, "Tracked location"),
    matchedArea: asString(source.matchedArea, asString(source.state)),
    eventType: asString(source.eventType, "signal"),
    rarityTier: asString(source.rarityTier) || null,
    quantity: typeof source.quantity === "number" && Number.isFinite(source.quantity) ? source.quantity : null,
    score: asNumber(source.score),
    priorityClass: source.priorityClass === "major" ? "major" : "standard",
    createdAt,
    readAt: asString(source.readAt) || null,
    archivedAt: asString(source.archivedAt) || null,
    emailDeliveredAt: asString(source.emailDeliveredAt) || null,
    emailModeAtSend: source.emailModeAtSend === "all" || source.emailModeAtSend === "major_only" || source.emailModeAtSend === "daily_roundup" ? source.emailModeAtSend : null,
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
    state: asString(candidate.state).toUpperCase(),
    storeLabel: candidateStoreLabel(candidate),
    matchedArea: areaPrefs ? candidateMatchedArea(candidate, areaPrefs) : asString(candidate.locationName) || asString(candidate.state),
    eventType: asString(candidate.eventType, asString(candidate.action, "signal")),
    rarityTier: asString(candidate.tier) || null,
    quantity: asNumber(candidate.quantity) || asNumber(candidate.warehouseQty) || null,
    score: asNumber(candidate.reliabilityScore, asNumber(candidate.score)),
    priorityClass: candidate.priorityClass === "major" ? "major" : "standard",
    createdAt,
    readAt: null,
    archivedAt: null,
    emailDeliveredAt: null,
    emailModeAtSend: null,
  };
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
  const bottleName = asString(candidate.bottle, "Bottle signal");
  const state = asString(candidate.state).toUpperCase();
  const quantity = candidateQuantityLabel(candidate);
  const timestamp = candidateTimestampLabel(candidate);
  const detail = quantity ? `${quantity} ${timestamp}` : `reported ${timestamp}`;
  const sourceCaveat = candidateIsStoreLevel(candidate)
    ? "Verify before driving."
    : "Board-level signal; check source before driving.";
  const stateSuffix = state && !new RegExp(`\\b${state.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(storeLabel) ? `, ${state}` : "";
  return `Bourbon Signal alert: ${bottleName} at ${storeLabel}${stateSuffix}. ${detail}. ${sourceCaveat} Reply STOP to unsubscribe.`.slice(0, 320);
}

async function sendTwilioSms(to: string, body: string) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID || "";
  const authToken = process.env.TWILIO_AUTH_TOKEN || "";
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID || "";
  const from = process.env.TWILIO_FROM_NUMBER || "";
  if (!accountSid || !authToken) throw new Error("Twilio credentials are not configured.");
  if (!messagingServiceSid && !from) throw new Error("Set TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM_NUMBER before enabling SMS alerts.");

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
  if (!response.ok) throw new Error(asString(payload.message, `Twilio SMS send failed with HTTP ${response.status}`));
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
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://bourbonsignal.com";
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

export async function deliverPreferenceAlerts(req: Request, options: { dryRun?: boolean; baselineOnSiteOnly?: boolean; baselineEmailOnly?: boolean; baselineSmsOnly?: boolean } = {}) {
  assertAlertDeliveryAuthorized(req);

  const dryRun = options.dryRun === true;
  const baselineOnSiteOnly = options.baselineOnSiteOnly === true;
  const baselineEmailOnly = options.baselineEmailOnly === true;
  const baselineSmsOnly = options.baselineSmsOnly === true;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://bourbonsignal.com";
  const rawEligibleCandidateCount = readAlertCandidates()
    .filter((candidate) => asBoolean(candidate.eligibleForDelivery))
    .filter(candidateCanUseOnSite).length;
  const candidates = readAlertCandidates()
    .filter((candidate) => asBoolean(candidate.eligibleForDelivery))
    .filter(candidateCanUseOnSite)
    .filter(candidatePassesFreshOnSiteGuardrails)
    .sort((a, b) => asNumber(b.reliabilityScore) - asNumber(a.reliabilityScore));

  const now = new Date().toISOString();
  const summary = {
    ok: true,
    dryRun,
    deliveryEnabled: ALERT_DELIVERY_ENABLED,
    onSiteDeliveryEnabled: ALERT_ONSITE_DELIVERY_ENABLED,
    emailDeliveryEnabled: ALERT_EMAIL_DELIVERY_ENABLED,
    smsDeliveryEnabled: ALERT_SMS_DELIVERY_ENABLED,
    emailClientConfigured: Boolean(process.env.RESEND_API_KEY),
    smsClientConfigured: Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && (process.env.TWILIO_MESSAGING_SERVICE_SID || process.env.TWILIO_FROM_NUMBER)),
    rawEligibleCandidateCount,
    candidateCount: candidates.length,
    skippedSafetyGuardrail: rawEligibleCandidateCount - candidates.length,
    usersConsidered: 0,
    paidUsersConsidered: 0,
    skippedFreeUsers: 0,
    skippedNoAreaPreferences: 0,
    usersWithOnSiteEnabled: 0,
    usersWithEmailEnabled: 0,
    usersWithSmsEnabled: 0,
    usersMatched: 0,
    onSiteAlertsCreated: 0,
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
    skippedDailyRoundup: 0,
    skippedNoEmail: 0,
    skippedDedupe: 0,
    skippedOnSiteDedupe: 0,
    skippedSpecificBottlePrefs: 0,
    errors: [] as Array<{ userId?: string; email?: string; message: string }>,
  };

  if (!dryRun && !ALERT_ONSITE_DELIVERY_ENABLED && !ALERT_EMAIL_DELIVERY_ENABLED && !ALERT_SMS_DELIVERY_ENABLED) {
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
      const user = rawUser as Record<string, unknown>;
      const userId = asString(user.id);
      summary.usersConsidered += 1;

      const publicMetadata = (user.publicMetadata && typeof user.publicMetadata === "object" ? user.publicMetadata : {}) as Record<string, unknown>;
      const privateMetadata = (user.privateMetadata && typeof user.privateMetadata === "object" ? user.privateMetadata : {}) as Record<string, unknown>;
      if (!isPaidTier(publicMetadata)) {
        summary.skippedFreeUsers += 1;
        continue;
      }
      summary.paidUsersConsidered += 1;

      const notificationPrefs = normalizeNotificationPreferences(publicMetadata.notificationPreferences);
      const areaPrefs = normalizeAreaPrefs(publicMetadata.areaPreferences);
      if (!hasSavedAreaPreferences(areaPrefs)) {
        summary.skippedNoAreaPreferences += 1;
        continue;
      }

      const bottlePrefs = normalizeBottleAlertPreferences(publicMetadata.bottleAlertPreferences);
      const alertMode = publicMetadata.alertMode;
      const deliveryMetadata = normalizeDeliveryMetadata(privateMetadata.alertDelivery);
      const matchingPreferenceCandidates = candidates
        .filter((candidate) => candidateMatchesArea(candidate, areaPrefs))
        .filter((candidate) => {
          const matches = candidateMatchesBottlePrefs(candidate, alertMode, bottlePrefs);
          if (!matches && alertMode === "specific_bottles") summary.skippedSpecificBottlePrefs += 1;
          return matches;
        })
        .sort(sortCandidatesForMember)
        .slice(0, Math.max(1, CANDIDATE_POOL_PER_USER));

      if (matchingPreferenceCandidates.length) {
        summary.usersMatched += 1;
      }

      let newOnSiteAlerts: MemberAlertRecord[] = [];
      const alertInbox = normalizeAlertInboxMetadata(privateMetadata.alertInbox);
      if (baselineOnSiteOnly) {
        const baselineDedupeKeys = uniqueStrings(matchingPreferenceCandidates.map((candidate) => asString(candidate.dedupeKey, asString(candidate.id))).filter(Boolean));
        summary.onSiteBaselinesCreated += baselineDedupeKeys.length;
        if (!dryRun && baselineDedupeKeys.length) {
          await client.users.updateUserMetadata(userId, {
            privateMetadata: {
              alertDelivery: {
                recent: deliveryMetadata.recent || [],
                onSiteBaselineDedupeKeys: baselineDedupeKeys,
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

      if (notificationPrefs.onSite.enabled && !baselineEmailOnly && !baselineSmsOnly && (dryRun || ALERT_ONSITE_DELIVERY_ENABLED)) {
        const existingOnSiteDedupe = new Set((alertInbox.recent || []).map((alert) => alert.dedupeKey));
        const onSiteBaseline = new Set(deliveryMetadata.onSiteBaselineDedupeKeys || []);
        newOnSiteAlerts = matchingPreferenceCandidates
          .filter((candidate) => {
            const dedupeKey = asString(candidate.dedupeKey, asString(candidate.id));
            const duplicate = existingOnSiteDedupe.has(dedupeKey) || onSiteBaseline.has(dedupeKey);
            if (duplicate) summary.skippedOnSiteDedupe += 1;
            return !duplicate;
          })
          .slice(0, Math.max(1, MAX_ONSITE_ALERTS_PER_USER))
          .map((candidate) => candidateToMemberAlert(userId, candidate, now, areaPrefs));

        if (newOnSiteAlerts.length) summary.onSiteAlertsCreated += newOnSiteAlerts.length;
      }

      let newRecords: DeliveryRecord[] = [];
      if (notificationPrefs.email.enabled) {
        summary.usersWithEmailEnabled += 1;
      }

      if (notificationPrefs.email.enabled && notificationPrefs.email.mode === "daily_roundup") {
        summary.skippedDailyRoundup += 1;
      } else if (notificationPrefs.email.enabled && !baselineEmailOnly && !dryRun && !ALERT_EMAIL_DELIVERY_ENABLED) {
        summary.skippedEmailDeliveryDisabled += matchingPreferenceCandidates.length;
      } else if (notificationPrefs.email.enabled) {
        const email = primaryEmailForUser(user);
        if (!email) {
          summary.skippedNoEmail += 1;
        } else if (!emailRecipientAllowed(email)) {
          summary.skippedEmailRecipientNotAllowed += matchingPreferenceCandidates.length;
        } else {
          const emailModeCandidates = matchingPreferenceCandidates.filter(candidatePassesFreshEmailGuardrails).filter((candidate) => candidateMatchesEmailMode(candidate, notificationPrefs.email.mode));
          if (baselineEmailOnly) {
            const baselineDedupeKeys = uniqueStrings(emailModeCandidates.map((candidate) => asString(candidate.dedupeKey, asString(candidate.id))).filter(Boolean));
            summary.emailBaselinesCreated += baselineDedupeKeys.length;
            if (!dryRun && baselineDedupeKeys.length) {
              await client.users.updateUserMetadata(userId, {
                privateMetadata: {
                  alertDelivery: {
                    recent: deliveryMetadata.recent || [],
                    onSiteBaselineDedupeKeys: deliveryMetadata.onSiteBaselineDedupeKeys || [],
                    emailBaselineDedupeKeys: baselineDedupeKeys,
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
          const emailBaseline = new Set(deliveryMetadata.emailBaselineDedupeKeys || []);
          const matchedCandidates = emailModeCandidates
            .filter((candidate) => {
              const dedupeKey = asString(candidate.dedupeKey, asString(candidate.id));
              const baselineDuplicate = emailBaseline.has(dedupeKey);
              if (baselineDuplicate) summary.skippedEmailBaseline += 1;
              return !baselineDuplicate;
            })
            .filter((candidate) => {
              const dedupeKey = asString(candidate.dedupeKey, asString(candidate.id));
              const duplicate = delivered.has(deliveryDedupeToken(dedupeKey, "email"));
              if (duplicate) summary.skippedDedupe += 1;
              return !duplicate;
            })
            .slice(0, Math.max(1, MAX_EMAILS_PER_USER));

          for (const candidate of matchedCandidates) {
            if (globalEmailCount >= MAX_EMAILS_PER_RUN) break;
            const dedupeKey = asString(candidate.dedupeKey, asString(candidate.id));
            const bottleName = asString(candidate.bottle, "Bottle signal");
            const storeLabel = candidateStoreLabel(candidate);
            const matchedArea = candidateMatchedArea(candidate, areaPrefs);
            const state = asString(candidate.state).toUpperCase();

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
                });
                if (result.error) throw new Error(result.error.message);
                messageId = result.data?.id || null;
              }

              if (dryRun) {
                summary.emailsWouldSend += 1;
              } else {
                newRecords.push({ dedupeKey, deliveredAt: now, channel: "email", emailMode: notificationPrefs.email.mode, messageId });
                newOnSiteAlerts = newOnSiteAlerts.map((alert) => alert.dedupeKey === dedupeKey
                  ? { ...alert, emailDeliveredAt: now, emailModeAtSend: notificationPrefs.email.mode }
                  : alert);
                summary.emailsSent += 1;
              }
              globalEmailCount += 1;
            } catch (error) {
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
          .filter(candidatePassesFreshSmsGuardrails)
          .filter((candidate) => candidateMatchesSmsMode(candidate, notificationPrefs.sms.mode, bottlePrefs));

        if (!phone) {
          summary.skippedSmsRecipientNotAllowed += smsCandidates.length;
        } else if (!smsRecipientAllowed(phone)) {
          summary.skippedSmsRecipientNotAllowed += smsCandidates.length;
        } else if (baselineSmsOnly) {
          const baselineDedupeKeys = uniqueStrings(smsCandidates.map((candidate) => asString(candidate.dedupeKey, asString(candidate.id))).filter(Boolean));
          summary.smsBaselinesCreated += baselineDedupeKeys.length;
          if (!dryRun && baselineDedupeKeys.length) {
            await client.users.updateUserMetadata(userId, {
              privateMetadata: {
                alertDelivery: {
                  recent: deliveryMetadata.recent || [],
                  onSiteBaselineDedupeKeys: deliveryMetadata.onSiteBaselineDedupeKeys || [],
                  emailBaselineDedupeKeys: deliveryMetadata.emailBaselineDedupeKeys || [],
                  smsBaselineDedupeKeys: baselineDedupeKeys,
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
          const smsBaseline = new Set(deliveryMetadata.smsBaselineDedupeKeys || []);
          const matchedSmsCandidates = smsCandidates
            .filter((candidate) => {
              const dedupeKey = asString(candidate.dedupeKey, asString(candidate.id));
              const baselineDuplicate = smsBaseline.has(dedupeKey);
              if (baselineDuplicate) summary.skippedSmsBaseline += 1;
              return !baselineDuplicate;
            })
            .filter((candidate) => {
              const dedupeKey = asString(candidate.dedupeKey, asString(candidate.id));
              const duplicate = delivered.has(deliveryDedupeToken(dedupeKey, "sms"));
              if (duplicate) summary.skippedDedupe += 1;
              return !duplicate;
            })
            .slice(0, Math.max(1, MAX_SMS_PER_USER));

          for (const candidate of matchedSmsCandidates) {
            if (summary.smsSent + summary.smsWouldSend >= MAX_SMS_PER_RUN) break;
            const dedupeKey = asString(candidate.dedupeKey, asString(candidate.id));
            const storeLabel = candidateStoreLabel(candidate);
            try {
              let messageId: string | null = null;
              let status: string | null = null;
              if (!dryRun) {
                const result = await sendTwilioSms(phone, smsBodyForCandidate(candidate, storeLabel));
                messageId = result.sid;
                status = result.status;
              }
              if (dryRun) {
                summary.smsWouldSend += 1;
              } else {
                newRecords.push({ dedupeKey, deliveredAt: now, channel: "sms", smsMode: notificationPrefs.sms.mode, messageId, status });
                summary.smsSent += 1;
              }
            } catch (error) {
              summary.errors.push({ userId, email: maskPhone(phone), message: error instanceof Error ? error.message : String(error) });
            }
          }
        }
      }

      if ((newRecords.length || newOnSiteAlerts.length) && !dryRun) {
        if (newRecords.length) {
          const nextRecent = [...newRecords, ...(deliveryMetadata.recent || [])]
            .filter((record, index, rows) => rows.findIndex((item) => item.dedupeKey === record.dedupeKey && (item.channel || "email") === (record.channel || "email")) === index)
            .slice(0, MAX_RECENT_DELIVERIES_PER_USER);
          const nextAlertDelivery = {
            recent: nextRecent,
            onSiteBaselineDedupeKeys: deliveryMetadata.onSiteBaselineDedupeKeys || [],
            emailBaselineDedupeKeys: deliveryMetadata.emailBaselineDedupeKeys || [],
            smsBaselineDedupeKeys: deliveryMetadata.smsBaselineDedupeKeys || [],
            lastOnSiteBaselineAt: deliveryMetadata.lastOnSiteBaselineAt,
            lastEmailBaselineAt: deliveryMetadata.lastEmailBaselineAt,
            lastSmsBaselineAt: deliveryMetadata.lastSmsBaselineAt,
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
              // that block current delivery bookkeeping. Retain the freshly-sent records plus a
              // compact tail so dedupe still protects the member from immediate duplicate sends.
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
        }

        if (newOnSiteAlerts.length) {
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
              },
            });
          } catch (error) {
            const primaryError = error instanceof Error ? error.message : String(error);
            try {
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
                },
              });
            } catch (retryError) {
              summary.errors.push({ userId, message: `On-site alert metadata update failed after compaction retry: ${primaryError}; retry: ${retryError instanceof Error ? retryError.message : String(retryError)}` });
            }
          }
        }
      }
    }

    offset += page.data.length;
    if (!page.totalCount || offset >= page.totalCount) break;
  }

  return summary;
}
