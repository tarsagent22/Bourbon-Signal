export type MemberWeeklySectionKind = "alerts" | "radar" | "coverage";

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
  freshnessHours: number;
  freshnessPolicyHours: number;
  eligibleForDelivery: boolean;
  eligibleForEmail: boolean;
  priority: "major" | "standard";
  score: number;
  href: string;
  detail?: string;
}

export interface MemberWeeklyRadarCandidate {
  id: string;
  title: string;
  summary: string;
  stateCodes: string[];
  bottleKeys: string[];
  startDate: string;
  endDate?: string;
  href: string;
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
  radar: MemberWeeklyRadarCandidate[];
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
const RADAR_HORIZON_DAYS = 28;
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
  const location = normalizedText(alert.locationLabel);
  return area.labels.some((label) => {
    const wanted = normalizedText(label);
    return Boolean(wanted) && (location.includes(wanted) || wanted.includes(location));
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

function eligibleAlerts(input: MemberWeeklyIntelligenceInput) {
  return input.alerts
    .filter((alert) => alert.eligibleForDelivery && alert.eligibleForEmail)
    .filter((alert) => Number.isFinite(alert.freshnessHours) && Number.isFinite(alert.freshnessPolicyHours))
    .filter((alert) => alert.freshnessHours >= 0 && alert.freshnessHours <= alert.freshnessPolicyHours)
    .filter((alert) => alertMatchesSavedArea(alert, input.member))
    .filter((alert) => alertMatchesBottle(alert, input.member))
    .sort((left, right) => {
      const priority = Number(right.priority === "major") - Number(left.priority === "major");
      return priority || right.score - left.score || left.dedupeKey.localeCompare(right.dedupeKey) || left.id.localeCompare(right.id);
    })
    .slice(0, MAX_SECTION_ITEMS);
}

function radarMatchesMember(candidate: MemberWeeklyRadarCandidate, member: MemberWeeklyProfile) {
  const savedStates = new Set(member.savedAreas.map((area) => normalizedState(area.stateCode)));
  const stateMatch = candidate.stateCodes.some((state) => savedStates.has(normalizedState(state)));
  const candidateBottleKeys = candidate.bottleKeys.map(normalizedText).filter(Boolean);
  const title = normalizedText(candidate.title);
  const bottleMatch = member.trackedBottles.some((bottle) => {
    const wanted = normalizedText(bottle.key || bottle.name);
    return Boolean(wanted) && (candidateBottleKeys.some((key) => key === wanted || key.includes(wanted) || wanted.includes(key)) || title.includes(wanted));
  });
  return stateMatch || bottleMatch;
}

function relevantRadar(input: MemberWeeklyIntelligenceInput) {
  const weekStart = parsedTime(`${memberWeekKey(input.now)}T00:00:00.000Z`);
  const horizon = weekStart + RADAR_HORIZON_DAYS * DAY_MS;
  return input.radar
    .filter((candidate) => radarMatchesMember(candidate, input.member))
    .filter((candidate) => {
      const start = parsedTime(`${candidate.startDate}T00:00:00.000Z`);
      const end = parsedTime(`${candidate.endDate || candidate.startDate}T23:59:59.999Z`);
      return Number.isFinite(start) && Number.isFinite(end) && end >= weekStart && start <= horizon;
    })
    .sort((left, right) => left.startDate.localeCompare(right.startDate) || left.id.localeCompare(right.id))
    .slice(0, MAX_SECTION_ITEMS);
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

function radarSection(radar: MemberWeeklyRadarCandidate[]): MemberWeeklySection {
  return {
    kind: "radar",
    title: "On your Radar",
    items: radar.map((candidate) => ({
      id: candidate.id,
      title: candidate.title,
      summary: candidate.summary,
      meta: candidate.endDate && candidate.endDate !== candidate.startDate
        ? `${candidate.startDate}–${candidate.endDate}`
        : candidate.startDate,
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

function primaryActionFor(input: MemberWeeklyIntelligenceInput, sections: MemberWeeklySection[]): MemberWeeklyPrimaryAction | null {
  const first = sections[0];
  if (!first) return null;
  if (first.kind === "alerts") {
    const firstAlert = eligibleAlerts(input)[0];
    return { kind: "alerts", label: "Review the fresh signal", href: firstAlert?.href || "/dashboard?section=alerts" };
  }
  if (first.kind === "radar") {
    const firstRadar = relevantRadar(input)[0];
    return { kind: "radar", label: "Open this week’s Radar", href: firstRadar?.href || "/release-radar" };
  }
  return { kind: "coverage", label: "Review your saved markets", href: "/dashboard?section=alerts" };
}

export function buildMemberWeeklyIntelligence(input: MemberWeeklyIntelligenceInput): MemberWeeklyIntelligence {
  const alerts = eligibleAlerts(input);
  const radar = relevantRadar(input);
  const coverage = relevantCoverage(input);
  const sections: MemberWeeklySection[] = [];
  if (alerts.length) sections.push(alertSection(alerts));
  if (radar.length) sections.push(radarSection(radar));
  if (coverage.length) sections.push(coverageSection(coverage));
  const itemCount = sections.reduce((total, section) => total + section.items.length, 0);

  return {
    memberId: input.member.id,
    weekKey: memberWeekKey(input.now),
    generatedAt: input.now,
    eyebrow: "Your weekly intelligence",
    headline: itemCount ? `${itemCount} signal${itemCount === 1 ? "" : "s"} worth your attention` : "No new signal this week",
    introduction: input.member.firstName?.trim()
      ? `${input.member.firstName.trim()}, this brief is built from your saved markets and bottles.`
      : "This brief is built from your saved markets and bottles.",
    sections,
    primaryAction: primaryActionFor(input, sections),
    isEmpty: sections.length === 0,
  };
}
