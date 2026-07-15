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
