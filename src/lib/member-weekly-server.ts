import "server-only";
import {
  candidateMatchesArea,
  candidateMatchesBottlePrefs,
  candidatePassesFreshEmailGuardrails,
} from "@/lib/alert-delivery";
import { evaluateAlertSnapshotSafety } from "@/lib/alert-run-safety";
import { ACTIVE_ENGINE_STATE_NAMES } from "@/lib/activeStates";
import {
  buildMemberWeeklyIntelligence,
  type MemberWeeklyAlertCandidate,
  type MemberWeeklyCoverageCandidate,
  type MemberWeeklyRadarCandidate,
  type MemberWeeklySavedArea,
  type MemberWeeklyTrackedBottle,
} from "@/lib/member-weekly-intelligence";
import {
  buildWeeklyIntelligenceDryRun,
  weeklyIntelligenceEmailKillSwitchActive,
  weeklyIntelligenceUnsubscribeUrl,
} from "@/lib/member-weekly-email";
import { normalizeMemberWeeklyDeliveryLedger } from "@/lib/member-weekly-delivery";
import { normalizeNotificationPreferences } from "@/lib/notification-preferences";
import { radarEntries, radarPath } from "@/lib/release-radar";
import { readSiteExportResults } from "@/lib/site-engine-contract";

type UnknownRecord = Record<string, unknown>;

export interface MemberWeeklyServerUser {
  id: string;
  firstName?: string | null;
  primaryEmailAddressId?: string | null;
  emailAddresses?: Array<{ id: string; emailAddress: string }>;
  publicMetadata?: UnknownRecord | null;
  privateMetadata?: UnknownRecord | null;
}

function record(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {};
}

function strings(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [];
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizedBottleKey(value: string) {
  return value.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function savedAreasFromMetadata(publicMetadata: UnknownRecord): MemberWeeklySavedArea[] {
  const areas = record(publicMetadata.areaPreferences);
  const labelsByState: Record<string, string[]> = {
    NC: strings(areas.ncBoards),
    VA: strings(areas.vaCities),
    OH: strings(areas.ohCities),
    IA: strings(areas.iaCities),
    ID: strings(areas.idCities),
    SC: strings(areas.scAreas),
    CA: strings(areas.caAreas),
    NV: strings(areas.nvAreas),
    PA: [...strings(areas.paCounties), ...strings(areas.paStores)],
  };
  return strings(areas.states)
    .map((stateCode) => stateCode.toUpperCase())
    .sort()
    .map((stateCode) => ({ stateCode, labels: labelsByState[stateCode] || [] }));
}

function trackedBottlesFromMetadata(publicMetadata: UnknownRecord): MemberWeeklyTrackedBottle[] {
  const preferences = record(publicMetadata.bottleAlertPreferences);
  const keys = strings(preferences.bottleKeys);
  const names = strings(preferences.bottleNames);
  const count = Math.max(keys.length, names.length);
  const bottles = Array.from({ length: count }, (_, index) => {
    const name = names[index] || keys[index] || "";
    const key = keys[index] || normalizedBottleKey(name);
    return { key, name };
  }).filter((bottle) => Boolean(bottle.key));
  return bottles.sort((left, right) => left.key.localeCompare(right.key));
}

function areaPreferencesFromMetadata(publicMetadata: UnknownRecord) {
  const source = record(publicMetadata.areaPreferences);
  return {
    states: strings(source.states).map((state) => state.toUpperCase()),
    ncBoards: strings(source.ncBoards),
    vaCities: strings(source.vaCities),
    ohCities: strings(source.ohCities),
    iaCities: strings(source.iaCities),
    idCities: strings(source.idCities),
    scAreas: strings(source.scAreas),
    caAreas: strings(source.caAreas),
    nvAreas: strings(source.nvAreas),
    paCounties: strings(source.paCounties),
    paStores: strings(source.paStores),
  };
}

function bottlePreferencesFromMetadata(publicMetadata: UnknownRecord) {
  const source = record(publicMetadata.bottleAlertPreferences);
  return { bottleNames: strings(source.bottleNames), bottleKeys: strings(source.bottleKeys) };
}

function locationLabel(candidate: UnknownRecord) {
  return text(candidate.storeName)
    || text(candidate.locationName)
    || text(candidate.storeAddress)
    || text(candidate.boardName)
    || text(candidate.displayLocation)
    || `${text(candidate.state, "Saved market")} signal`;
}

function deliveryMatchFields(candidate: UnknownRecord) {
  return [
    candidate.locationName,
    candidate.displayLocation,
    candidate.storeName,
    candidate.storeAddress,
    candidate.storeCity,
    candidate.storeCounty,
    candidate.boardName,
    candidate.storeId,
    candidate.location_name,
    candidate.display_location,
    candidate.store_name,
    candidate.store_address,
    candidate.store_city,
    candidate.store_county,
    candidate.board_name,
    candidate.store_id,
  ].filter((value): value is string => typeof value === "string" && Boolean(value.trim()));
}

function adaptAlertCandidates(input: {
  candidates: UnknownRecord[];
  publicMetadata: UnknownRecord;
  snapshotSafe: boolean;
}): MemberWeeklyAlertCandidate[] {
  if (!input.snapshotSafe) return [];
  const areaPreferences = areaPreferencesFromMetadata(input.publicMetadata);
  const bottlePreferences = bottlePreferencesFromMetadata(input.publicMetadata);
  const alertMode = input.publicMetadata.alertMode === "specific_bottles" ? "specific_bottles" : "anything_notable";

  return input.candidates
    .filter((candidate) => candidate.eligibleForDelivery === true)
    .filter((candidate) => candidateMatchesArea(candidate, areaPreferences))
    .filter((candidate) => candidateMatchesBottlePrefs(candidate, alertMode, bottlePreferences))
    .filter(candidatePassesFreshEmailGuardrails)
    .map((candidate) => {
      const policy = record(candidate.freshnessPolicyHours);
      const freshnessHours = numberValue(candidate.freshnessHours, Number.NaN);
      return {
        id: text(candidate.id, text(candidate.dedupeKey)),
        dedupeKey: text(candidate.dedupeKey, text(candidate.id)),
        bottleName: text(candidate.bottle, text(candidate.canonicalName, text(candidate.rawName, "Bottle signal"))),
        stateCode: text(candidate.state).toUpperCase(),
        locationLabel: locationLabel(candidate),
        deliveryAreaMatched: true,
        deliveryMatchFields: deliveryMatchFields(candidate),
        freshnessHours,
        freshnessPolicyHours: numberValue(policy.email, freshnessHours),
        eligibleForDelivery: candidate.eligibleForDelivery === true,
        eligibleForEmail: candidate.eligibleForEmail !== false,
        priority: candidate.priorityClass === "major" ? "major" : "standard",
        score: numberValue(candidate.reliabilityScore, numberValue(candidate.score)),
        href: "/dashboard?section=alerts",
        detail: text(candidate.evidence, text(candidate.reason, locationLabel(candidate))),
      } satisfies MemberWeeklyAlertCandidate;
    });
}

const STATE_CODE_BY_NAME = new Map(
  Object.entries(ACTIVE_ENGINE_STATE_NAMES).map(([code, name]) => [name.toLowerCase(), code])
);

function radarStateCode(value: string) {
  if (value.toLowerCase() === "nationwide") return "NATIONWIDE";
  return STATE_CODE_BY_NAME.get(value.toLowerCase()) || value.toUpperCase();
}

function adaptRadarCandidates(): MemberWeeklyRadarCandidate[] {
  return radarEntries.map((entry) => ({
    id: `${entry.kind}-${entry.slug}`,
    title: entry.title,
    summary: entry.summary,
    stateCodes: entry.states.map(radarStateCode),
    bottleKeys: entry.bottle ? [normalizedBottleKey(entry.bottle)] : [],
    startDate: entry.startDate,
    endDate: entry.endDate,
    href: radarPath(entry),
  }));
}

function adaptCoverageCandidates(statsPayload: UnknownRecord | null): MemberWeeklyCoverageCandidate[] {
  const stateCoverage = record(statsPayload?.stateCoverage);
  const states = Array.isArray(stateCoverage.states) ? stateCoverage.states.map(record) : [];
  return states.map((state) => {
    const status = text(state.status, text(state.publicStatus, "unknown"));
    return {
      stateCode: text(state.state).toUpperCase(),
      label: text(state.label, ACTIVE_ENGINE_STATE_NAMES[text(state.state).toUpperCase()] || text(state.state)),
      status,
      summary: text(state.customerSummary, "Coverage status changed for this saved market."),
      sourceLabel: text(state.sourceLabel, "Bourbon Signal coverage"),
      notable: !["active", "healthy", "useful"].includes(status.toLowerCase()) || text(state.publicStatus).toLowerCase() !== "active",
    };
  });
}

function primaryEmail(user: MemberWeeklyServerUser) {
  const addresses = user.emailAddresses || [];
  return addresses.find((address) => address.id === user.primaryEmailAddressId)?.emailAddress || addresses[0]?.emailAddress || "";
}

function suppressionFromMetadata(privateMetadata: UnknownRecord) {
  const delivery = record(privateMetadata.weeklyIntelligenceDelivery);
  const legacyDeliveredMemberWeeks = Array.isArray(delivery.deliveredMemberWeeks)
    ? delivery.deliveredMemberWeeks.flatMap((item) => {
      if (typeof item === "string") return [item];
      const dedupeKey = text(record(item).dedupeKey);
      return dedupeKey ? [dedupeKey] : [];
    })
    : [];
  const ledgerMemberWeeks = normalizeMemberWeeklyDeliveryLedger(delivery).map((entry) => entry.dedupeKey);
  return {
    suppressed: delivery.suppressed === true || Boolean(text(delivery.suppressedAt)),
    deliveredMemberWeeks: Array.from(new Set([...legacyDeliveredMemberWeeks, ...ledgerMemberWeeks])),
  };
}

export interface MemberWeeklySourceBundle {
  alertPayload: UnknownRecord | null;
  statsPayload: UnknownRecord | null;
  snapshotId: string | null;
  alertsFresh: boolean;
  alertsFreshnessReason: string | null;
  alertsGeneratedAt: string | null;
  statsGeneratedAt: string | null;
}

export async function loadMemberWeeklySourceBundle(now: string): Promise<MemberWeeklySourceBundle> {
  const [alertResult, statsResult] = await readSiteExportResults(["alerts", "stats"]);
  const snapshotSafety = evaluateAlertSnapshotSafety({
    generatedAt: alertResult.generatedAt,
    now,
    maxAgeMinutes: Number(process.env.WEEKLY_INTELLIGENCE_ALERT_SNAPSHOT_MAX_AGE_MINUTES || 45),
  });
  return {
    alertPayload: alertResult.payload,
    statsPayload: statsResult.payload,
    snapshotId: alertResult.snapshotId,
    alertsFresh: snapshotSafety.safe,
    alertsFreshnessReason: snapshotSafety.reason,
    alertsGeneratedAt: alertResult.generatedAt,
    statsGeneratedAt: statsResult.generatedAt,
  };
}

export function buildWeeklyIntelligencePreviewFromSources(input: {
  user: MemberWeeklyServerUser;
  sources: MemberWeeklySourceBundle;
  now: string;
  appUrl?: string;
}) {
  const publicMetadata = record(input.user.publicMetadata);
  const privateMetadata = record(input.user.privateMetadata);
  const candidates = Array.isArray(input.sources.alertPayload?.alerts) ? input.sources.alertPayload.alerts.map(record) : [];
  const notificationPreferences = normalizeNotificationPreferences(publicMetadata.notificationPreferences);
  const report = buildMemberWeeklyIntelligence({
    member: {
      id: input.user.id,
      firstName: input.user.firstName,
      savedAreas: savedAreasFromMetadata(publicMetadata),
      trackedBottles: trackedBottlesFromMetadata(publicMetadata),
      alertMode: publicMetadata.alertMode === "specific_bottles" ? "specific_bottles" : "anything_notable",
    },
    now: input.now,
    alerts: adaptAlertCandidates({ candidates, publicMetadata, snapshotSafe: input.sources.alertsFresh }),
    radar: adaptRadarCandidates(),
    coverage: adaptCoverageCandidates(input.sources.statsPayload),
  });
  const recipient = primaryEmail(input.user);
  const dryRun = buildWeeklyIntelligenceDryRun({
    memberId: input.user.id,
    recipient,
    report,
    preferences: notificationPreferences.weeklyIntelligence,
    suppression: suppressionFromMetadata(privateMetadata),
    killSwitchActive: weeklyIntelligenceEmailKillSwitchActive(),
  });

  return {
    report,
    dryRun,
    recipient,
    unsubscribeUrl: weeklyIntelligenceUnsubscribeUrl({ memberId: input.user.id, baseUrl: input.appUrl, now: input.now }),
    source: {
      snapshotId: input.sources.snapshotId,
      alertsFresh: input.sources.alertsFresh,
      alertsFreshnessReason: input.sources.alertsFreshnessReason,
      alertsGeneratedAt: input.sources.alertsGeneratedAt,
      statsGeneratedAt: input.sources.statsGeneratedAt,
    },
  };
}

export async function buildWeeklyIntelligencePreview(input: {
  user: MemberWeeklyServerUser;
  now?: string;
  appUrl?: string;
}) {
  const now = input.now || new Date().toISOString();
  const sources = await loadMemberWeeklySourceBundle(now);
  return buildWeeklyIntelligencePreviewFromSources({ ...input, now, sources });
}
