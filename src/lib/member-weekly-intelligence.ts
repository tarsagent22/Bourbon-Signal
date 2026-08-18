export type MemberWeeklySectionKind = "alerts" | "coverage" | "setup";

export interface MemberWeeklySavedArea {
  stateCode: string;
  labels: string[];
}

export interface MemberWeeklyTrackedBottle {
  key: string;
  name: string;
}


export interface MemberWeeklyProfile {
  id: string;
  firstName?: string | null;
  savedAreas: MemberWeeklySavedArea[];
  trackedBottles: MemberWeeklyTrackedBottle[];
  alertMode: "specific_bottles" | "anything_notable";

}

export interface MemberWeeklyAlertCandidate {
  id: string;
  dedupeKey: string;
  bottleName: string;
  stateCode: string;
  locationLabel: string;
  deliveryAreaMatched?: boolean;
  deliveryMatchFields?: string[];
  freshnessHours: number;
  freshnessPolicyHours: number;
  eligibleForDelivery: boolean;
  eligibleForEmail: boolean;
  priority: "major" | "standard";
  rarityTier?: string;
  score: number;
  href: string;
  detail?: string;
}


export interface MemberWeeklyCoverageCandidate {
  stateCode: string;
  label: string;
  status: string;
  summary: string;
  sourceLabel: string;
  notable: boolean;
}

export interface MemberWeeklyIntelligenceInput {
  member: MemberWeeklyProfile;
  now: string;
  alerts: MemberWeeklyAlertCandidate[];

  coverage: MemberWeeklyCoverageCandidate[];
}

export interface MemberWeeklySectionItem {
  id: string;
  title: string;
  summary: string;
  meta: string;
}

export interface MemberWeeklySection {
  kind: MemberWeeklySectionKind;
  title: string;
  items: MemberWeeklySectionItem[];
}

export interface MemberWeeklyPrimaryAction {
  kind: MemberWeeklySectionKind;
  label: string;
  href: string;
}

export interface MemberWeeklyIntelligence {
  memberId: string;
  weekKey: string;
  generatedAt: string;
  eyebrow: string;
  headline: string;
  introduction: string;
  sections: MemberWeeklySection[];
  primaryAction: MemberWeeklyPrimaryAction | null;
  isEmpty: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const MAX_SECTION_ITEMS = 3;

function normalizedText(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizedState(value: string) {
  return value.trim().toUpperCase();
}


function parsedTime(value: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : Number.NaN;
}

export function memberWeekKey(value: string | Date) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid member week date");
  const day = date.getUTCDay();
  const daysSinceMonday = (day + 6) % 7;
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - daysSinceMonday);
  return date.toISOString().slice(0, 10);
}

function savedAreaForState(member: MemberWeeklyProfile, stateCode: string) {
  const state = normalizedState(stateCode);
  return member.savedAreas.find((area) => normalizedState(area.stateCode) === state);
}

function alertMatchesSavedArea(alert: MemberWeeklyAlertCandidate, member: MemberWeeklyProfile) {
  const area = savedAreaForState(member, alert.stateCode);
  if (!area) return false;
  if (!area.labels.length) return true;
  if (alert.deliveryAreaMatched === true) return true;
  const locations = [alert.locationLabel, ...(alert.deliveryMatchFields || [])].map(normalizedText).filter(Boolean);
  return area.labels.some((label) => {
    const wanted = normalizedText(label);
    return Boolean(wanted) && locations.some((location) => location.includes(wanted) || wanted.includes(location));
  });
}

function alertMatchesBottle(alert: MemberWeeklyAlertCandidate, member: MemberWeeklyProfile) {
  if (member.alertMode === "anything_notable") return true;
  const candidate = normalizedText(alert.bottleName);
  return member.trackedBottles.some((bottle) => {
    const wanted = normalizedText(bottle.key || bottle.name);
    return Boolean(wanted) && (candidate === wanted || candidate.includes(wanted) || wanted.includes(candidate));
  });
}

function alertMatchesTrackedBottle(alert: MemberWeeklyAlertCandidate, member: MemberWeeklyProfile) {
  const candidate = normalizedText(alert.bottleName);
  return member.trackedBottles.some((bottle) => {
    const wanted = normalizedText(bottle.key || bottle.name);
    return Boolean(wanted) && (candidate === wanted || candidate.includes(wanted) || wanted.includes(candidate));
  });
}

function preserveBottleLocationRepeats(alert: MemberWeeklyAlertCandidate, member: MemberWeeklyProfile) {
  const tier = normalizedText(alert.rarityTier || "");
  return tier === "unicorn" || tier === "allocated" || alertMatchesTrackedBottle(alert, member);
}

function eligibleAlerts(input: MemberWeeklyIntelligenceInput) {
  const ranked = input.alerts
    .filter((alert) => alert.eligibleForDelivery && alert.eligibleForEmail)
    .filter((alert) => Number.isFinite(alert.freshnessHours) && Number.isFinite(alert.freshnessPolicyHours))
    .filter((alert) => alert.freshnessHours >= 0 && alert.freshnessHours <= alert.freshnessPolicyHours)
    .filter((alert) => alertMatchesSavedArea(alert, input.member))
    .filter((alert) => alertMatchesBottle(alert, input.member))
    .sort((left, right) => {
      const priority = Number(right.priority === "major") - Number(left.priority === "major");
      return priority || right.score - left.score || left.dedupeKey.localeCompare(right.dedupeKey) || left.id.localeCompare(right.id);
    });
  const seenRoutineBottles = new Set<string>();
  return ranked.filter((alert) => {
    if (preserveBottleLocationRepeats(alert, input.member)) return true;
    const bottleKey = normalizedText(alert.bottleName);
    if (!bottleKey || seenRoutineBottles.has(bottleKey)) return false;
    seenRoutineBottles.add(bottleKey);
    return true;
  }).slice(0, MAX_SECTION_ITEMS);
}


function relevantCoverage(input: MemberWeeklyIntelligenceInput) {
  const savedStates = new Set(input.member.savedAreas.map((area) => normalizedState(area.stateCode)));
  return input.coverage
    .filter((item) => item.notable && savedStates.has(normalizedState(item.stateCode)))
    .sort((left, right) => normalizedState(left.stateCode).localeCompare(normalizedState(right.stateCode)))
    .slice(0, MAX_SECTION_ITEMS);
}

function alertSection(alerts: MemberWeeklyAlertCandidate[]): MemberWeeklySection {
  return {
    kind: "alerts",
    title: "Fresh matches",
    items: alerts.map((alert) => ({
      id: alert.id,
      title: alert.bottleName,
      summary: alert.detail || alert.locationLabel,
      meta: `${alert.stateCode.toUpperCase()} · ${alert.freshnessHours < 1 ? "Within the hour" : `${Math.round(alert.freshnessHours)}h old`}`,
    })),
  };
}


function coverageSection(coverage: MemberWeeklyCoverageCandidate[]): MemberWeeklySection {
  return {
    kind: "coverage",
    title: "Coverage notes",
    items: coverage.map((item) => ({
      id: `coverage-${normalizedState(item.stateCode)}`,
      title: item.label,
      summary: item.summary,
      meta: item.sourceLabel,
    })),
  };
}

function setupSection(member: MemberWeeklyProfile): MemberWeeklySection {
  const markets = member.savedAreas.map((area) => area.labels.length ? `${area.stateCode} · ${area.labels.join(", ")}` : area.stateCode).join("; ");
  const specific = member.alertMode === "specific_bottles";
  const watchlist = specific
    ? `${member.trackedBottles.length} exact bottle${member.trackedBottles.length === 1 ? "" : "s"}`
    : "all notable drops";
  return {
    kind: "setup",
    title: "Your alert setup this week",
    items: [{
      id: "setup-status",
      title: !member.savedAreas.length ? "Choose where you want Bourbon Signal to watch"
        : specific && !member.trackedBottles.length ? "Add bottles or choose all notable drops"
          : "No exact match was ready to send",
      summary: !member.savedAreas.length
        ? "Your paid membership is active, but no market is saved yet. Add the state and local areas you want watched so alerts can match your hunt."
        : specific && !member.trackedBottles.length
          ? `Your saved markets are active across ${markets}, but an exact-bottle watchlist needs at least one bottle. Add bottles or choose all notable drops for broader coverage.`
          : specific
            ? `Your alerts stayed active across ${markets} for ${watchlist}. Exact-bottle watchlists can be quiet between verified matches; add more bottles or choose all notable drops for broader coverage.`
            : `Your alerts stayed active across ${markets} for ${watchlist}. No eligible fresh match was ready for this brief.`,
      meta: `${member.savedAreas.length} saved market${member.savedAreas.length === 1 ? "" : "s"} · ${watchlist}`,
    }],
  };
}

function primaryActionFor(input: MemberWeeklyIntelligenceInput, sections: MemberWeeklySection[]): MemberWeeklyPrimaryAction | null {
  const first = sections[0];
  if (!first) return null;
  if (first.kind === "alerts") {
    const firstAlert = eligibleAlerts(input)[0];
    return { kind: "alerts", label: "Review the fresh signal", href: firstAlert?.href || "/dashboard?section=alerts" };
  }
  if (first.kind === "setup") return { kind: "setup", label: "Improve your alert setup", href: "/dashboard?section=alerts" };
  return { kind: "coverage", label: "Review your saved markets", href: "/dashboard?section=alerts" };
}

export function buildMemberWeeklyIntelligence(input: MemberWeeklyIntelligenceInput): MemberWeeklyIntelligence {
  const alerts = eligibleAlerts(input);

  const coverage = relevantCoverage(input);
  const sections: MemberWeeklySection[] = [];
  if (alerts.length) sections.push(alertSection(alerts));

  if (coverage.length) sections.push(coverageSection(coverage));
  if (!sections.length) {
    sections.push(setupSection(input.member));
  }
  const itemCount = sections.reduce((total, section) => total + section.items.length, 0);

  return {
    memberId: input.member.id,
    weekKey: memberWeekKey(input.now),
    generatedAt: input.now,
    eyebrow: "Your weekly intelligence",
    headline: sections[0]?.kind === "setup"
      ? "Your alerts stayed active this week"
      : itemCount ? `${itemCount} signal${itemCount === 1 ? "" : "s"} worth your attention` : "No new signal this week",
    introduction: input.member.firstName?.trim()
      ? `${input.member.firstName.trim()}, this brief is built from your saved markets and bottles.`
      : "This brief is built from your saved markets and bottles.",
    sections,
    primaryAction: primaryActionFor(input, sections),
    isEmpty: sections.length === 0,
  };
}
