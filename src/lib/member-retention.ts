import { classifyCompanyMember, companyMemberPrimaryEmail, type CompanyMemberUser } from "./company-control-room";
import { normalizeNotificationPreferences } from "./notification-preferences";

export type PaidMemberRetentionStage = "setup_incomplete" | "awaiting_first_value" | "rescue_due" | "healthy";
export type RetentionFeedbackReason = "too_few_alerts" | "local_coverage" | "price" | "temporary_break" | "technical_issue" | "other";
export type RetentionFeedbackNextStep = "manage_alerts" | "lower_cost_plan" | "billing_portal" | "stay";

type UnknownRecord = Record<string, unknown>;

export interface PaidMemberRetentionRow {
  memberId: string;
  email: string;
  name: string;
  tier: "standard" | "barrel";
  billingPlan: string;
  stage: PaidMemberRetentionStage;
  activatedAt: string | null;
  setupCompletedAt: string | null;
  firstAlertAt: string | null;
  lastSignInAt: string | null;
  membershipAgeHours: number | null;
  savedStateCount: number;
  trackedBottleCount: number;
  enabledChannelCount: number;
  recommendedAction: string;
}

function record(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {};
}

function strings(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [];
}

function timestamp(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number" && !(value instanceof Date)) return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function hoursBetween(start: string | null, end: string) {
  if (!start) return null;
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return null;
  return Math.floor((endMs - startMs) / 3_600_000);
}

function enabledChannelCount(publicMetadata: UnknownRecord) {
  const preferences = normalizeNotificationPreferences(publicMetadata.notificationPreferences);
  return [preferences.onSite.enabled, preferences.email.enabled, preferences.sms.enabled && preferences.sms.verified].filter(Boolean).length;
}

function actualSetup(publicMetadata: UnknownRecord) {
  const areas = record(publicMetadata.areaPreferences);
  const bottles = record(publicMetadata.bottleAlertPreferences);
  const states = strings(areas.states);
  const bottleNames = strings(bottles.bottleNames);
  const bottleKeys = strings(bottles.bottleKeys);
  const alertMode = publicMetadata.alertMode === "specific_bottles" ? "specific_bottles" : "anything_notable";
  const channels = enabledChannelCount(publicMetadata);
  return {
    states,
    trackedBottleCount: Math.max(bottleNames.length, bottleKeys.length),
    enabledChannelCount: channels,
    complete: states.length > 0 && channels > 0 && (alertMode === "anything_notable" || bottleNames.length > 0 || bottleKeys.length > 0),
  };
}

function memberName(user: CompanyMemberUser) {
  return [user.firstName, user.lastName].filter((value): value is string => typeof value === "string" && Boolean(value.trim())).join(" ").trim()
    || companyMemberPrimaryEmail(user)
    || "Paid member";
}

function recommendedAction(stage: PaidMemberRetentionStage) {
  if (stage === "setup_incomplete") return "Help the member finish a market, alert criteria, and at least one delivery channel.";
  if (stage === "rescue_due") return "Review coverage and watchlist; the member has waited more than 72 hours without a first alert.";
  if (stage === "awaiting_first_value") return "Monitor time to first alert; no intervention is due yet.";
  return "No retention intervention is currently due.";
}

export function classifyPaidMemberRetention(user: CompanyMemberUser, now: string): PaidMemberRetentionRow | null {
  const member = classifyCompanyMember(user);
  if (!member.isPaid || member.isOwner || member.isRetailer) return null;
  if (member.effectiveTier !== "standard" && member.effectiveTier !== "barrel") return null;
  if (member.status !== "active" && member.status !== "trialing") return null;
  if (!member.billingPlan || member.billingPlan === "bib_lifetime") return null;

  const publicMetadata = record(user.publicMetadata);
  const privateMetadata = record(user.privateMetadata);
  const activation = record(privateMetadata.activation);
  const setup = actualSetup(publicMetadata);
  const activatedAt = timestamp(activation.membership_activated) || timestamp(publicMetadata.membershipUpdatedAt);
  const setupCompletedAt = timestamp(activation.paid_activation_completed);
  const firstAlertAt = timestamp(activation.first_alert_created);
  const membershipAgeHours = hoursBetween(activatedAt, now);
  let stage: PaidMemberRetentionStage = "healthy";
  if (!setup.complete) stage = "setup_incomplete";
  else if (!firstAlertAt && (membershipAgeHours === null || membershipAgeHours < 72)) stage = "awaiting_first_value";
  else if (!firstAlertAt) stage = "rescue_due";

  return {
    memberId: String(user.id || ""),
    email: member.email,
    name: memberName(user),
    tier: member.effectiveTier,
    billingPlan: member.billingPlan,
    stage,
    activatedAt,
    setupCompletedAt,
    firstAlertAt,
    lastSignInAt: timestamp(user.lastSignInAt),
    membershipAgeHours,
    savedStateCount: setup.states.length,
    trackedBottleCount: setup.trackedBottleCount,
    enabledChannelCount: setup.enabledChannelCount,
    recommendedAction: recommendedAction(stage),
  };
}

export function buildPaidMemberRetentionSnapshot(users: readonly CompanyMemberUser[], now = new Date().toISOString()) {
  const members = users.flatMap((user) => {
    const row = classifyPaidMemberRetention(user, now);
    return row ? [row] : [];
  });
  const counts = {
    recurringPaid: members.length,
    healthy: members.filter((member) => member.stage === "healthy").length,
    firstValueReached: members.filter((member) => Boolean(member.firstAlertAt)).length,
    setupIncomplete: members.filter((member) => member.stage === "setup_incomplete").length,
    awaitingFirstValue: members.filter((member) => member.stage === "awaiting_first_value").length,
    rescueDue: members.filter((member) => member.stage === "rescue_due").length,
  };
  const priority: Record<PaidMemberRetentionStage, number> = { rescue_due: 0, setup_incomplete: 1, awaiting_first_value: 2, healthy: 3 };
  const attention = members
    .filter((member) => member.stage === "rescue_due" || (member.stage === "setup_incomplete" && (member.membershipAgeHours || 0) >= 24))
    .sort((left, right) => priority[left.stage] - priority[right.stage]
      || (right.membershipAgeHours || 0) - (left.membershipAgeHours || 0)
      || left.email.localeCompare(right.email));
  return { counts, members, attention };
}

export { buildAlertSetupGuidance } from "./alert-setup-guidance";

export function paidMemberRescueEligible(member: PaidMemberRetentionRow, notificationPreferences: unknown) {
  if (member.stage !== "rescue_due" && !(member.stage === "setup_incomplete" && !member.setupCompletedAt && (member.membershipAgeHours || 0) >= 72)) return false;
  const weekly = record(record(notificationPreferences).weeklyIntelligence);
  const optedInAt = timestamp(weekly.optedInAt);
  const unsubscribedAt = timestamp(weekly.unsubscribedAt);
  return weekly.emailEnabled === true && Boolean(optedInAt) && (!unsubscribedAt || Date.parse(optedInAt!) > Date.parse(unsubscribedAt));
}

const FEEDBACK_REASONS = new Set<RetentionFeedbackReason>(["too_few_alerts", "local_coverage", "price", "temporary_break", "technical_issue", "other"]);
const FEEDBACK_NEXT_STEPS = new Set<RetentionFeedbackNextStep>(["manage_alerts", "lower_cost_plan", "billing_portal", "stay"]);

export function normalizeRetentionFeedback(input: unknown) {
  const source = record(input);
  const reasonValue = typeof source.reason === "string" ? source.reason.trim() : "";
  const nextStepValue = typeof source.nextStep === "string" ? source.nextStep.trim() : "";
  if (!FEEDBACK_REASONS.has(reasonValue as RetentionFeedbackReason)) throw new Error("Choose a valid reason.");
  if (!FEEDBACK_NEXT_STEPS.has(nextStepValue as RetentionFeedbackNextStep)) throw new Error("Choose a valid next step.");
  const reason = reasonValue as RetentionFeedbackReason;
  const nextStep = nextStepValue as RetentionFeedbackNextStep;
  const details = typeof source.details === "string" ? source.details.replace(/\s+/g, " ").trim().slice(0, 300) : "";
  return { reason, details, nextStep };
}
