import { clerkClient } from "@clerk/nextjs/server";
import { PaidDropAlertEmail } from "@/components/emails/PaidDropAlertEmail";
import { ALERT_FROM, ALERT_REPLY_TO, getResendClient } from "@/lib/email-alerts";
import { normalizeNotificationPreferences, type EmailAlertMode } from "@/lib/notification-preferences";
import { readSiteExport } from "@/lib/site-engine-contract";
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

export interface BottleAlertPreferences {
  bottleNames: string[];
  bottleKeys: string[];
}

type CandidateAlert = Record<string, unknown>;

type DeliveryRecord = {
  dedupeKey: string;
  deliveredAt: string;
  emailMode: EmailAlertMode;
  messageId: string | null;
};

type AlertDeliveryMetadata = {
  recent?: DeliveryRecord[];
  lastRunAt?: string;
};

const MAX_RECENT_DELIVERIES_PER_USER = 250;
const DELIVERY_DEDUPE_WINDOW_HOURS = 24;
const MAX_DELIVERY_USERS = Number(process.env.ALERT_DELIVERY_MAX_USERS || 500);
const MAX_EMAILS_PER_RUN = Number(process.env.ALERT_DELIVERY_MAX_EMAILS_PER_RUN || 250);
const MAX_EMAILS_PER_USER = Number(process.env.ALERT_DELIVERY_MAX_EMAILS_PER_USER || 5);

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
    states: toStrings(source.states).map((state) => state.toUpperCase()).filter((state) => supportedStates.has(state)),
    ncBoards: toStrings(source.ncBoards),
    vaCities: toStrings(source.vaCities),
    ohCities: toStrings(source.ohCities),
    iaCities: toStrings(source.iaCities),
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

function normalizeBottleKey(value: string) {
  return value.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeLocationText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function stateLabel(state: string) {
  const labels: Record<string, string> = {
    AL: "Alabama",
    FL: "Florida",
    GA: "Georgia",
    IA: "Iowa",
    IL: "Illinois",
    IN: "Indiana",
    KY: "Kentucky",
    NC: "North Carolina",
    OH: "Ohio",
    PA: "Pennsylvania",
    TN: "Tennessee",
    TX: "Texas",
    VA: "Virginia",
    "MD-MONTGOMERY": "Montgomery County, MD",
  };
  return labels[state] || state || "your area";
}

export function readAlertCandidates() {
  const engineAlertsPayload = readSiteExport("alerts");
  return Array.isArray(engineAlertsPayload?.alerts) ? (engineAlertsPayload.alerts as CandidateAlert[]) : [];
}

export function candidateMatchesArea(candidate: CandidateAlert, areaPrefs: AreaPreferences) {
  const state = asString(candidate.state).toUpperCase();
  if (!state) return false;
  if (areaPrefs.states.length && !areaPrefs.states.includes(state)) return false;

  const location = normalizeLocationText([
    asString(candidate.locationName),
    asString(candidate.storeName),
    asString(candidate.storeAddress),
  ].join(" "));

  if (state === "NC" && areaPrefs.ncBoards.length) return areaPrefs.ncBoards.some((board) => location.includes(normalizeLocationText(board)));
  if (state === "VA" && areaPrefs.vaCities.length) return areaPrefs.vaCities.some((city) => location.includes(normalizeLocationText(city)));
  if (state === "OH" && areaPrefs.ohCities.length) return areaPrefs.ohCities.some((city) => location.includes(normalizeLocationText(city)));
  if (state === "IA" && areaPrefs.iaCities.length) return areaPrefs.iaCities.some((city) => location.includes(normalizeLocationText(city)));
  if (state === "PA" && areaPrefs.paCounties.length) return areaPrefs.paCounties.some((county) => location.includes(normalizeLocationText(county)));
  if (state === "PA" && areaPrefs.paStores.length) return areaPrefs.paStores.some((store) => location.includes(normalizeLocationText(store)));
  return true;
}

function candidateMatchesBottlePrefs(candidate: CandidateAlert, alertMode: unknown, bottlePrefs: BottleAlertPreferences) {
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

function candidateCanSendEmail(candidate: CandidateAlert) {
  const deliveryChannel = asString(candidate.deliveryChannel);
  const eventType = asString(candidate.eventType).toLowerCase();
  const locationPrecision = asString(candidate.locationPrecision).toLowerCase();
  const quantity = asNumber(candidate.quantity) || asNumber(candidate.warehouseQty);
  const status = `${asString(candidate.availabilityStatus)} ${asString(candidate.availabilityLabel)}`.toLowerCase();

  if (deliveryChannel === "watch_candidate") return false;
  if (eventType.includes("release_surface") || eventType.includes("release-watch")) return false;
  if (eventType.includes("policy") || eventType.includes("license")) return false;
  if (eventType.includes("raffle") || eventType.includes("tasting")) return false;
  if (locationPrecision === "store_level") return true;
  if (quantity > 0) return true;
  return /in_stock|limited|available|on_hand/.test(status);
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

function candidateStoreLabel(candidate: CandidateAlert) {
  return asString(candidate.storeName) || asString(candidate.locationName) || asString(candidate.storeAddress) || stateLabel(asString(candidate.state));
}

function matchedLocationFromOptions(candidate: CandidateAlert, options: string[]) {
  const location = normalizeLocationText([
    asString(candidate.locationName),
    asString(candidate.storeName),
    asString(candidate.storeAddress),
  ].join(" "));
  return options.find((option) => location.includes(normalizeLocationText(option)) || normalizeLocationText(option).includes(location));
}

function candidateMatchedArea(candidate: CandidateAlert, areaPrefs: AreaPreferences) {
  const state = asString(candidate.state).toUpperCase();
  const locationName = asString(candidate.locationName) || asString(candidate.storeName) || asString(candidate.storeAddress);
  if (state === "NC" && areaPrefs.ncBoards.length) return matchedLocationFromOptions(candidate, areaPrefs.ncBoards) || locationName || stateLabel(state);
  if (state === "VA" && areaPrefs.vaCities.length) return matchedLocationFromOptions(candidate, areaPrefs.vaCities) || locationName || stateLabel(state);
  if (state === "OH" && areaPrefs.ohCities.length) return matchedLocationFromOptions(candidate, areaPrefs.ohCities) || locationName || stateLabel(state);
  if (state === "IA" && areaPrefs.iaCities.length) return matchedLocationFromOptions(candidate, areaPrefs.iaCities) || locationName || stateLabel(state);
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
          emailMode: (item.emailMode === "all" || item.emailMode === "daily_roundup" ? item.emailMode : "major_only") as EmailAlertMode,
          messageId: asString(item.messageId) || null,
        }))
        .filter((item) => item.dedupeKey && item.deliveredAt)
    : [];
  return { recent, lastRunAt: asString(source.lastRunAt) || undefined };
}

function recentDeliverySet(metadata: AlertDeliveryMetadata) {
  const cutoff = Date.now() - DELIVERY_DEDUPE_WINDOW_HOURS * 60 * 60_000;
  return new Set((metadata.recent || [])
    .filter((record) => {
      const deliveredAt = new Date(record.deliveredAt).getTime();
      return Number.isFinite(deliveredAt) && deliveredAt >= cutoff;
    })
    .map((record) => record.dedupeKey));
}

function deliveryAuthorized(req: Request) {
  const expected = process.env.ALERT_DELIVERY_SECRET || process.env.CRON_SECRET;
  if (!expected) return process.env.NODE_ENV !== "production";
  const auth = req.headers.get("authorization") || "";
  const headerSecret = req.headers.get("x-alert-delivery-secret") || "";
  return auth === `Bearer ${expected}` || headerSecret === expected;
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

export async function deliverPreferenceAlerts(req: Request, options: { dryRun?: boolean } = {}) {
  assertAlertDeliveryAuthorized(req);

  const dryRun = options.dryRun === true;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://bourbonsignal.com";
  const candidates = readAlertCandidates()
    .filter((candidate) => asBoolean(candidate.eligibleForDelivery))
    .filter(candidateCanSendEmail)
    .sort((a, b) => asNumber(b.reliabilityScore) - asNumber(a.reliabilityScore));

  const resend = dryRun ? null : getResendClient();
  const client = await clerkClient();
  const now = new Date().toISOString();
  const summary = {
    ok: true,
    dryRun,
    candidateCount: candidates.length,
    usersConsidered: 0,
    usersWithEmailEnabled: 0,
    usersMatched: 0,
    emailsSent: 0,
    skippedDailyRoundup: 0,
    skippedNoEmail: 0,
    skippedDedupe: 0,
    skippedSpecificBottlePrefs: 0,
    errors: [] as Array<{ userId?: string; email?: string; message: string }>,
  };

  let offset = 0;
  let globalEmailCount = 0;
  while (summary.usersConsidered < MAX_DELIVERY_USERS) {
    const page = await getUsersPage(client, offset);
    if (!page.data.length) break;

    for (const rawUser of page.data) {
      if (summary.usersConsidered >= MAX_DELIVERY_USERS || globalEmailCount >= MAX_EMAILS_PER_RUN) break;
      const user = rawUser as Record<string, unknown>;
      const userId = asString(user.id);
      summary.usersConsidered += 1;

      const publicMetadata = (user.publicMetadata && typeof user.publicMetadata === "object" ? user.publicMetadata : {}) as Record<string, unknown>;
      const privateMetadata = (user.privateMetadata && typeof user.privateMetadata === "object" ? user.privateMetadata : {}) as Record<string, unknown>;
      const notificationPrefs = normalizeNotificationPreferences(publicMetadata.notificationPreferences);
      if (!notificationPrefs.email.enabled) continue;
      summary.usersWithEmailEnabled += 1;
      if (notificationPrefs.email.mode === "daily_roundup") {
        summary.skippedDailyRoundup += 1;
        continue;
      }

      const email = primaryEmailForUser(user);
      if (!email) {
        summary.skippedNoEmail += 1;
        continue;
      }

      const areaPrefs = normalizeAreaPrefs(publicMetadata.areaPreferences);
      const bottlePrefs = normalizeBottleAlertPreferences(publicMetadata.bottleAlertPreferences);
      const alertMode = publicMetadata.alertMode;
      const deliveryMetadata = normalizeDeliveryMetadata(privateMetadata.alertDelivery);
      const delivered = recentDeliverySet(deliveryMetadata);
      const matchedCandidates = candidates
        .filter((candidate) => candidateMatchesArea(candidate, areaPrefs))
        .filter((candidate) => {
          const matches = candidateMatchesBottlePrefs(candidate, alertMode, bottlePrefs);
          if (!matches && alertMode === "specific_bottles") summary.skippedSpecificBottlePrefs += 1;
          return matches;
        })
        .filter((candidate) => candidateMatchesEmailMode(candidate, notificationPrefs.email.mode))
        .filter((candidate) => {
          const dedupeKey = asString(candidate.dedupeKey, asString(candidate.id));
          const duplicate = delivered.has(dedupeKey);
          if (duplicate) summary.skippedDedupe += 1;
          return !duplicate;
        })
        .slice(0, Math.max(1, MAX_EMAILS_PER_USER));

      if (!matchedCandidates.length) continue;
      summary.usersMatched += 1;

      const newRecords: DeliveryRecord[] = [];
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
              subject: `${bottleName} just hit ${storeLabel}`,
              react: PaidDropAlertEmail({
                firstName: asString(user.firstName) || null,
                bottleName,
                storeLabel,
                matchedArea,
                state,
                timestampLabel: candidateTimestampLabel(candidate),
                quantityLabel: candidateQuantityLabel(candidate),
                dashboardUrl: `${appUrl}/dashboard`,
              }),
              headers: {
                "X-Entity-Ref-ID": `alert-${userId}-${dedupeKey}`.slice(0, 190),
              },
            });
            if (result.error) throw new Error(result.error.message);
            messageId = result.data?.id || null;
          }

          newRecords.push({ dedupeKey, deliveredAt: now, emailMode: notificationPrefs.email.mode, messageId });
          globalEmailCount += 1;
          summary.emailsSent += 1;
        } catch (error) {
          summary.errors.push({ userId, email, message: error instanceof Error ? error.message : String(error) });
        }
      }

      if (newRecords.length && !dryRun) {
        const nextRecent = [...newRecords, ...(deliveryMetadata.recent || [])]
          .filter((record, index, rows) => rows.findIndex((item) => item.dedupeKey === record.dedupeKey) === index)
          .slice(0, MAX_RECENT_DELIVERIES_PER_USER);
        await client.users.updateUserMetadata(userId, {
          privateMetadata: {
            ...privateMetadata,
            alertDelivery: {
              recent: nextRecent,
              lastRunAt: now,
            },
          },
        });
      }
    }

    offset += page.data.length;
    if (!page.totalCount || offset >= page.totalCount || globalEmailCount >= MAX_EMAILS_PER_RUN) break;
  }

  return summary;
}
