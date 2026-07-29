import { aggregateMemberDemand, type DemandBottleCatalogItem } from "./demand-intelligence.ts";
import {
  EXPERIMENT_REGISTRY,
  aggregateExperimentTelemetry,
  getActiveExperiment,
  type ExperimentDefinition,
  type ExperimentTelemetryEvent,
} from "./growth-experiments.ts";
import { readExperimentParticipation } from "./experiment-participation.ts";
import { canonicalTrackedAcquisitionCampaign } from "./growth-events.ts";

type MembershipTier = "free" | "standard" | "barrel" | "bottled-in-bond";
type BillingPlanId = "standard_monthly" | "standard_annual" | "barrel_monthly" | "barrel_annual" | "bib_lifetime";

function normalizeBillingPlan(value: unknown): BillingPlanId | null {
  if (value === "standard_monthly" || value === "standard_annual" || value === "barrel_monthly" || value === "barrel_annual" || value === "bib_lifetime") return value;
  return null;
}

function normalizeMembershipStatus(value: unknown) {
  if (value === "active" || value === "trialing" || value === "past_due" || value === "canceled" || value === "incomplete" || value === "incomplete_expired" || value === "unpaid" || value === "paused" || value === "lifetime") return value;
  return "free";
}

function normalizedTier(value: unknown): MembershipTier {
  if (value === "standard" || value === "monthly" || value === "annual") return "standard";
  if (value === "barrel") return "barrel";
  if (value === "bottled-in-bond" || value === "founder" || value === "lifetime") return "bottled-in-bond";
  return "free";
}

function effectiveTierForMetadata(metadata: Metadata): MembershipTier {
  const tier = normalizedTier(metadata.tier ?? metadata.membershipTier);
  const status = normalizeMembershipStatus(metadata.membershipStatus);
  const plan = normalizeBillingPlan(metadata.billingPlan ?? metadata.plan);
  if (tier === "free") return "free";
  if (status === "active" || status === "trialing" || status === "lifetime") return tier;
  if (tier === "bottled-in-bond" && plan === "bib_lifetime" && !["canceled", "unpaid", "past_due", "incomplete_expired"].includes(status)) return tier;
  return "free";
}

const OWNER_EMAILS = new Set([
  "chandler@bourbonsignal.com",
  "chandlertodd22@gmail.com",
]);

const RETAILER_ROLES = new Set(["retailer", "vendor"]);

const PLAN_PRICES_CENTS: Record<BillingPlanId, { amount: number; interval: "month" | "year" | "lifetime" }> = {
  standard_monthly: { amount: 299, interval: "month" },
  standard_annual: { amount: 2499, interval: "year" },
  barrel_monthly: { amount: 499, interval: "month" },
  barrel_annual: { amount: 4999, interval: "year" },
  bib_lifetime: { amount: 4999, interval: "lifetime" },
};

type Metadata = Record<string, unknown>;

export interface CompanyMemberUser {
  id?: string;
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
  primaryEmailAddressId?: string | null;
  emailAddresses?: Array<{ id?: string; emailAddress?: string }>;
  publicMetadata?: Metadata;
  privateMetadata?: Metadata;
  unsafeMetadata?: Metadata;
  createdAt?: string | number | Date;
}

export interface GrowthFunnelWindow {
  accounts: number;
  signupStarted: number;
  registrationCompleted: number;
  onboardingStateSelected: number;
  freeValueReached: number;
  pricingViewed: number;
  checkoutStarted: number;
  membershipActivated: number;
  paidActivationCompleted: number;
  firstAlertCreated: number;
  unknownAttribution: number;
  bySource: Record<string, number>;
}

function emptyGrowthWindow(): GrowthFunnelWindow {
  return { accounts: 0, signupStarted: 0, registrationCompleted: 0, onboardingStateSelected: 0, freeValueReached: 0, pricingViewed: 0, checkoutStarted: 0, membershipActivated: 0, paidActivationCompleted: 0, firstAlertCreated: 0, unknownAttribution: 0, bySource: {} };
}

export function aggregateGrowthFunnels(users: CompanyMemberUser[], now = new Date()) {
  const nowMs = now.getTime();
  const collect = (days: number) => {
    const window = emptyGrowthWindow();
    const cutoff = nowMs - days * 86_400_000;
    for (const user of users) {
      const member = classifyCompanyMember(user);
      if (member.isOwner || member.isRetailer) continue;
      const createdAt = new Date(user.createdAt as string | number | Date).getTime();
      if (!Number.isFinite(createdAt) || createdAt < cutoff || createdAt > nowMs) continue;
      window.accounts += 1;
      const metadata = user.privateMetadata || {};
      const touch = metadata.firstTouch && typeof metadata.firstTouch === "object" ? metadata.firstTouch as Metadata : {};
      const source = typeof touch.surface === "string" && touch.surface ? touch.surface : "unknown";
      window.bySource[source] = (window.bySource[source] || 0) + 1;
      if (source === "unknown") window.unknownAttribution += 1;
      const milestones = metadata.activation && typeof metadata.activation === "object" ? metadata.activation as Metadata : {};
      if (milestones.signup_started) window.signupStarted += 1;
      if (milestones.registration_completed) window.registrationCompleted += 1;
      if (milestones.onboarding_state_selected) window.onboardingStateSelected += 1;
      if (milestones.free_value_reached) window.freeValueReached += 1;
      if (milestones.pricing_viewed) window.pricingViewed += 1;
      if (milestones.checkout_started) window.checkoutStarted += 1;
      if (milestones.membership_activated) window.membershipActivated += 1;
      if (milestones.paid_activation_completed) window.paidActivationCompleted += 1;
      if (milestones.first_alert_created) window.firstAlertCreated += 1;
    }
    return window;
  };
  return { days7: collect(7), days30: collect(30) };
}

export interface CampaignFunnelWindow {
  campaign: string;
  accounts: number;
  signupStarted: number;
  registrationCompleted: number;
  onboardingStateSelected: number;
  freeValueReached: number;
  pricingViewed: number;
  checkoutStarted: number;
  membershipActivated: number;
  paidActivationCompleted: number;
  firstAlertCreated: number;
}

export function aggregateCampaignFunnels(
  users: CompanyMemberUser[],
  now = new Date(),
  since?: Date,
) {
  const cutoffDate = since ? new Date(since) : new Date(now);
  if (!since) {
    cutoffDate.setUTCHours(0, 0, 0, 0);
    cutoffDate.setUTCDate(cutoffDate.getUTCDate() - 30);
  }
  const cutoff = cutoffDate.getTime();
  const campaigns = new Map<string, CampaignFunnelWindow>();
  const ensure = (campaign: string) => {
    let entry = campaigns.get(campaign);
    if (!entry) {
      entry = {
        campaign,
        accounts: 0,
        signupStarted: 0,
        registrationCompleted: 0,
        onboardingStateSelected: 0,
        freeValueReached: 0,
        pricingViewed: 0,
        checkoutStarted: 0,
        membershipActivated: 0,
        paidActivationCompleted: 0,
        firstAlertCreated: 0,
      };
      campaigns.set(campaign, entry);
    }
    return entry;
  };

  for (const user of users) {
    const member = classifyCompanyMember(user);
    if (member.isOwner || member.isRetailer) continue;
    const createdAt = new Date(user.createdAt as string | number | Date).getTime();
    if (!Number.isFinite(createdAt) || createdAt < cutoff || createdAt > now.getTime()) continue;
    const metadata = user.privateMetadata || {};
    const touch = metadata.firstTouch && typeof metadata.firstTouch === "object" ? metadata.firstTouch as Metadata : {};
    const campaign = canonicalTrackedAcquisitionCampaign(touch.campaign);
    if (!campaign) continue;
    const entry = ensure(campaign);
    entry.accounts += 1;
    const milestones = metadata.activation && typeof metadata.activation === "object" ? metadata.activation as Metadata : {};
    if (milestones.signup_started) entry.signupStarted += 1;
    if (milestones.registration_completed) entry.registrationCompleted += 1;
    if (milestones.onboarding_state_selected) entry.onboardingStateSelected += 1;
    if (milestones.free_value_reached) entry.freeValueReached += 1;
    if (milestones.pricing_viewed) entry.pricingViewed += 1;
    if (milestones.checkout_started) entry.checkoutStarted += 1;
    if (milestones.membership_activated) entry.membershipActivated += 1;
    if (milestones.paid_activation_completed) entry.paidActivationCompleted += 1;
    if (milestones.first_alert_created) entry.firstAlertCreated += 1;
  }

  return [...campaigns.values()].sort((a, b) =>
    b.accounts - a.accounts || a.campaign.localeCompare(b.campaign));
}

export function aggregateLifecycleCohorts(users: CompanyMemberUser[]) {
  const cohorts = {
    freeNoValue: 0,
    freeValueNoPricing: 0,
    checkoutNotActivated: 0,
    paidSetupIncomplete: 0,
    activatedNoFirstAlert: 0,
  };
  for (const user of users) {
    const member = classifyCompanyMember(user);
    if (member.isOwner || member.isRetailer) continue;
    const privateMetadata = user.privateMetadata || {};
    const milestones = privateMetadata.activation && typeof privateMetadata.activation === "object"
      ? privateMetadata.activation as Metadata
      : {};
    if (!member.isPaid && !milestones.free_value_reached) cohorts.freeNoValue += 1;
    if (!member.isPaid && milestones.free_value_reached && !milestones.pricing_viewed) cohorts.freeValueNoPricing += 1;
    if (milestones.checkout_started && !milestones.membership_activated) cohorts.checkoutNotActivated += 1;
    if (member.isPaid && !milestones.paid_activation_completed) cohorts.paidSetupIncomplete += 1;
    if (milestones.paid_activation_completed && !milestones.first_alert_created) cohorts.activatedNoFirstAlert += 1;
  }
  return cohorts;
}

export function aggregateCompanyDemand(
  users: readonly CompanyMemberUser[],
  catalog: readonly DemandBottleCatalogItem[],
  approvedStateCodes: readonly string[],
) {
  const eligible = users.filter((user) => {
    const member = classifyCompanyMember(user);
    return !member.isOwner && !member.isRetailer;
  });
  return aggregateMemberDemand(eligible, { catalog, approvedStateCodes });
}

export function buildOwnerExperimentAggregate(
  users: readonly CompanyMemberUser[] = [],
  registry: readonly ExperimentDefinition[] = EXPERIMENT_REGISTRY,
  killSwitchEnabled = false,
) {
  const active = getActiveExperiment(registry);
  return {
    activeExperiment: active?.id || null,
    activeDefinition: active ? {
      baseline: active.baseline,
      hypothesis: active.hypothesis,
      primaryMetric: active.primaryMetric,
      minSampleSizePerVariant: active.minSampleSizePerVariant,
      stopRule: active.stopRule,
      rollbackRule: active.rollbackRule,
    } : null,
    registryCount: registry.length,
    killSwitchEnabled,
    aggregate: aggregateExperimentTelemetry(buildEligibleExperimentTelemetry(users, registry), registry),
  };
}

export function buildEligibleExperimentTelemetry(
  users: readonly CompanyMemberUser[],
  registry: readonly ExperimentDefinition[] = EXPERIMENT_REGISTRY,
): ExperimentTelemetryEvent[] {
  const events: ExperimentTelemetryEvent[] = [];
  const seenSubjects = new Set<string>();
  for (const user of users) {
    const subjectKey = typeof user.id === "string" ? user.id.trim() : "";
    if (!subjectKey || seenSubjects.has(subjectKey)) continue;
    seenSubjects.add(subjectKey);
    const member = classifyCompanyMember(user);
    if (member.isOwner || member.isRetailer) continue;
    for (const experiment of registry) {
      const participation = readExperimentParticipation(user.privateMetadata || {}, experiment);
      if (!participation) continue;
      const properties = {
        experiment: experiment.id,
        variant: participation.variant,
        surface: experiment.surface,
      };
      events.push({ name: "experiment_exposure", properties });
      if (participation.converted) {
        events.push({
          name: "experiment_metric",
          properties: { ...properties, metric: experiment.primaryMetric },
        });
      }
    }
  }
  return events;
}

export interface ClassifiedCompanyMember {
  email: string;
  effectiveTier: MembershipTier;
  isPaid: boolean;
  billingPlan: BillingPlanId | null;
  status: string;
  isRetailer: boolean;
  isOwner: boolean;
  isCampaignEligibleFreeMember: boolean;
}

function normalizedEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function memberMetadata(user: CompanyMemberUser) {
  return {
    ...(user.unsafeMetadata || {}),
    ...(user.privateMetadata || {}),
    ...(user.publicMetadata || {}),
  };
}

export function companyMemberPrimaryEmail(user: CompanyMemberUser) {
  const addresses = Array.isArray(user.emailAddresses) ? user.emailAddresses : [];
  const primary = addresses.find((address) => address.id === user.primaryEmailAddressId) || addresses[0];
  return normalizedEmail(primary?.emailAddress);
}

export function isCompanyControlRoomOwnerEmail(value: unknown) {
  return OWNER_EMAILS.has(normalizedEmail(value));
}

export function classifyCompanyMember(user: CompanyMemberUser): ClassifiedCompanyMember {
  const metadata = memberMetadata(user);
  const email = companyMemberPrimaryEmail(user);
  const effectiveTier = effectiveTierForMetadata(metadata);
  const billingPlan = normalizeBillingPlan(metadata.billingPlan ?? metadata.plan);
  const status = normalizeMembershipStatus(metadata.membershipStatus);
  const role = String(metadata.role ?? metadata.accountType ?? metadata.userType ?? "member").trim().toLowerCase();
  const isRetailer = RETAILER_ROLES.has(role);
  const isOwner = isCompanyControlRoomOwnerEmail(email);
  const isPaid = effectiveTier !== "free";

  return {
    email,
    effectiveTier,
    isPaid,
    billingPlan,
    status,
    isRetailer,
    isOwner,
    isCampaignEligibleFreeMember: Boolean(email) && !isPaid && !isRetailer && !isOwner,
  };
}

function finiteMetric(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function extractEngineControlRoomMetrics(stats: Record<string, unknown> | null) {
  const coverage = stats?.stateCoverage && typeof stats.stateCoverage === "object"
    ? stats.stateCoverage as Record<string, unknown>
    : null;
  const coverageCounts = coverage?.counts && typeof coverage.counts === "object"
    ? coverage.counts as Record<string, unknown>
    : null;
  return {
    activeStates: finiteMetric(stats?.stateCount ?? stats?.states_covered),
    inventoryStates: finiteMetric(coverageCounts?.live_store_inventory),
    stores: finiteMetric(stats?.storeCount ?? stats?.total_stores),
    signals: finiteMetric(stats?.signalCount),
    alertCandidates: finiteMetric(stats?.alertCandidateCount),
  };
}

export function summarizeMemberships(users: CompanyMemberUser[]) {
  const members = users.map(classifyCompanyMember);
  const counts = {
    total: members.length,
    free: 0,
    paid: 0,
    standard: 0,
    barrel: 0,
    founder: 0,
    retailer: 0,
    owner: 0,
    pastDue: 0,
    campaignEligibleFree: 0,
  };
  let estimatedMonthlyRecurringCents = 0;
  let estimatedAnnualRecurringCents = 0;
  let estimatedLifetimeGrossCents = 0;

  for (const member of members) {
    if (member.isPaid) counts.paid += 1;
    else counts.free += 1;
    if (member.effectiveTier === "standard") counts.standard += 1;
    if (member.effectiveTier === "barrel") counts.barrel += 1;
    if (member.effectiveTier === "bottled-in-bond") counts.founder += 1;
    if (member.isRetailer) counts.retailer += 1;
    if (member.isOwner) counts.owner += 1;
    if (member.status === "past_due") counts.pastDue += 1;
    if (member.isCampaignEligibleFreeMember) counts.campaignEligibleFree += 1;

    if (!member.isPaid || !member.billingPlan) continue;
    const price = PLAN_PRICES_CENTS[member.billingPlan];
    if (price.interval === "month") {
      estimatedMonthlyRecurringCents += price.amount;
      estimatedAnnualRecurringCents += price.amount * 12;
    } else if (price.interval === "year") {
      estimatedMonthlyRecurringCents += Math.round(price.amount / 12);
      estimatedAnnualRecurringCents += price.amount;
    } else {
      estimatedLifetimeGrossCents += price.amount;
    }
  }

  return {
    counts,
    estimatedMonthlyRecurringCents,
    estimatedAnnualRecurringCents,
    estimatedLifetimeGrossCents,
  };
}

type ScorecardStatus = "healthy" | "watch" | "critical" | "unknown";

interface ScorecardSection {
  status: ScorecardStatus;
  headline: string;
  metrics: Record<string, string | number | boolean | null>;
  attention?: string[];
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function scorecardNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableScorecardNumber(value: unknown) {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function scorecardString(value: unknown, fallback = "unknown") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function healthStatus(value: unknown): ScorecardStatus {
  const normalized = scorecardString(value).toLowerCase();
  if (["healthy", "ok", "current", "ready"].includes(normalized)) return "healthy";
  if (["failed", "critical", "error", "unhealthy"].includes(normalized)) return "critical";
  if (["degraded", "stale", "warning", "watch", "delayed"].includes(normalized)) return "watch";
  return "unknown";
}

/**
 * Produces an aggregate-only operating record. It intentionally selects known
 * counters instead of serializing the source snapshot, which keeps member and
 * provider identifiers out of machine-readable operator artifacts.
 */
export function buildCompanyScorecard(snapshot: Record<string, unknown>, generatedAt?: string) {
  const memberships = record(snapshot.memberships);
  const memberCounts = record(memberships.counts);
  const revenue = record(snapshot.revenue);
  const audience = record(snapshot.audience);
  const growth = record(snapshot.growth);
  const days7 = record(growth.days7);
  const days30 = record(growth.days30);
  const lifecycle = record(snapshot.lifecycle);
  const retailer = record(snapshot.retailer);
  const engine = record(snapshot.engine);
  const alerts = record(snapshot.alerts);
  const release = record(snapshot.release);
  const automation = record(snapshot.automation);
  const automationTotals = record(automation.totals);

  const pastDue = scorecardNumber(memberCounts.pastDue);
  const freeNoValue = scorecardNumber(lifecycle.freeNoValue);
  const activatedNoFirstAlert = scorecardNumber(lifecycle.activatedNoFirstAlert);
  const engineFailed = scorecardNumber(engine.failedStates);
  const engineDegraded = scorecardNumber(engine.degradedStates);
  const engineStale = scorecardNumber(engine.staleStates);
  const alertStatus = healthStatus(alerts.status);
  const releaseStatus = healthStatus(release.status);
  const engineBaseStatus = healthStatus(engine.status);
  const attention: string[] = [];
  if (pastDue > 0) attention.push(`${pastDue} paid membership account(s) are past due.`);
  if (freeNoValue > 0) attention.push(`${freeNoValue} free member(s) have not reached first value.`);
  if (activatedNoFirstAlert > 0) attention.push(`${activatedNoFirstAlert} activated member(s) have not created a first alert.`);
  if (engineFailed > 0) attention.push(`${engineFailed} engine state(s) are failed.`);
  if (engineDegraded > 0 || engineStale > 0) attention.push(`${engineDegraded} engine state(s) are degraded and ${engineStale} are stale.`);
  if (alertStatus !== "healthy") attention.push(`Alert execution status is ${alertStatus}.`);
  if (releaseStatus !== "healthy") attention.push(`Release status is ${releaseStatus}.`);

  const companyStatus: ScorecardStatus = revenue.source !== "stripe" ? "unknown" : pastDue > 0 ? "watch" : "healthy";
  const productStatus: ScorecardStatus = freeNoValue > 0 || activatedNoFirstAlert > 0 ? "watch" : "healthy";
  const dataStatus: ScorecardStatus = engineFailed > 0 || engineBaseStatus === "critical"
    ? "critical"
    : engineDegraded > 0 || engineStale > 0 || engineBaseStatus === "watch" ? "watch" : engineBaseStatus;
  const shippingStatus: ScorecardStatus = alertStatus === "critical" || releaseStatus === "critical"
    ? "critical"
    : alertStatus === "watch" || releaseStatus === "watch" ? "watch"
      : alertStatus === "healthy" && releaseStatus === "healthy" ? "healthy" : "unknown";

  const sections: Record<"company" | "product" | "data" | "shipping" | "decision", ScorecardSection> = {
    company: {
      status: companyStatus,
      headline: companyStatus === "healthy" ? "Company aggregates are within their operating guardrails." : "Company aggregates need review.",
      metrics: {
        members: scorecardNumber(memberCounts.total),
        paidMembers: scorecardNumber(memberCounts.paid),
        pastDueMembers: pastDue,
        monthlyRecurringCents: nullableScorecardNumber(revenue.monthlyRecurringCents ?? memberships.estimatedMonthlyRecurringCents),
        collectedLast30DaysCents: nullableScorecardNumber(revenue.collectedLast30DaysCents),
        reachableFreeMembers: nullableScorecardNumber(audience.reachableFreeMembers),
      },
    },
    product: {
      status: productStatus,
      headline: productStatus === "healthy" ? "Activation flow has no flagged aggregate cohort." : "Activation cohorts contain measurable friction.",
      metrics: {
        accounts7d: scorecardNumber(days7.accounts),
        freeValueReached7d: scorecardNumber(days7.freeValueReached),
        paidActivationCompleted7d: scorecardNumber(days7.paidActivationCompleted),
        firstAlerts7d: scorecardNumber(days7.firstAlertCreated),
        accounts30d: scorecardNumber(days30.accounts),
        freeNoValue,
        activatedNoFirstAlert,
      },
    },
    data: {
      status: dataStatus,
      headline: dataStatus === "healthy" ? "Engine data is current and healthy." : "Engine data health needs attention.",
      metrics: {
        activeStates: scorecardNumber(engine.activeStates),
        inventoryStates: scorecardNumber(engine.inventoryStates),
        stores: scorecardNumber(engine.stores),
        signals: scorecardNumber(engine.signals),
        alertCandidates: scorecardNumber(engine.alertCandidates),
        ageMinutes: nullableScorecardNumber(engine.ageMinutes),
        failedStates: engineFailed,
        degradedStates: engineDegraded,
        staleStates: engineStale,
        automationDeterministicRuns: scorecardNumber(automationTotals.deterministicRuns),
        automationAgentRuns: scorecardNumber(automationTotals.agentRuns),
        automationFailedRuns: scorecardNumber(automationTotals.failedRuns),
        automationBraveQueries: scorecardNumber(automationTotals.braveQueries),
        automationDirectHttpProbes: scorecardNumber(automationTotals.directHttpProbes),
        automationHeadlessBrowserPages: scorecardNumber(automationTotals.headlessBrowserPages),
        automationSourcesDiscovered: scorecardNumber(automationTotals.sourcesDiscovered),
        automationSourcesPromoted: scorecardNumber(automationTotals.sourcesPromoted),
        automationTokens: scorecardNumber(automationTotals.tokens),
        automationCoverageDelta: scorecardNumber(automationTotals.customerCoverageDelta),
      },
    },
    shipping: {
      status: shippingStatus,
      headline: shippingStatus === "healthy" ? "Alert and release execution are healthy." : "Execution health needs review before shipping changes.",
      metrics: {
        alertStatus: scorecardString(alerts.status),
        alertAgeMinutes: nullableScorecardNumber(alerts.ageMinutes),
        onSiteEnabled: alerts.onSiteEnabled === true,
        emailEnabled: alerts.emailEnabled === true,
        smsEnabled: alerts.smsEnabled === true,
        releaseStatus: scorecardString(release.status),
        retailerLiveSignals: nullableScorecardNumber(retailer.liveSignals),
        verifiedRetailerStores: nullableScorecardNumber(retailer.verifiedStores),
      },
    },
    decision: {
      status: attention.some((item) => /failed|critical/.test(item)) ? "critical" : attention.length ? "watch" : "healthy",
      headline: attention[0] || "No aggregate operating constraint requires a decision.",
      metrics: {
        attentionCount: attention.length,
        primaryConstraint: attention[0] || "none",
      },
      attention: attention.slice(0, 8),
    },
  };

  return {
    contractVersion: "bourbon-signal/company-scorecard@1" as const,
    generatedAt: generatedAt || scorecardString(snapshot.checkedAt, new Date(0).toISOString()),
    sections,
  };
}
