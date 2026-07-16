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
  primaryEmailAddressId?: string | null;
  emailAddresses?: Array<{ id?: string; emailAddress?: string }>;
  publicMetadata?: Metadata;
  privateMetadata?: Metadata;
  unsafeMetadata?: Metadata;
  createdAt?: string | number | Date;
}

export interface GrowthFunnelWindow {
  accounts: number;
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
  return { accounts: 0, freeValueReached: 0, pricingViewed: 0, checkoutStarted: 0, membershipActivated: 0, paidActivationCompleted: 0, firstAlertCreated: 0, unknownAttribution: 0, bySource: {} };
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
