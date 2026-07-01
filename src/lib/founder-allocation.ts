import { FOUNDER_SPOT_LIMIT } from "@/lib/entitlements";

export type FounderAllocationMetadata = {
  tier?: unknown;
  membershipTier?: unknown;
  plan?: unknown;
  billingPlan?: unknown;
  founderNumber?: unknown;
  memberNumber?: unknown;
};

export type FounderAllocationUser = {
  id: string;
  publicMetadata?: FounderAllocationMetadata | null;
};

function stringValue(value: unknown) {
  return typeof value === "string" ? value : null;
}

function positiveInteger(value: unknown) {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isInteger(number) && number > 0 ? number : null;
}

export function isFounderMembershipMetadata(metadata: FounderAllocationMetadata | null | undefined) {
  const tier = stringValue(metadata?.tier) || stringValue(metadata?.membershipTier);
  const plan = stringValue(metadata?.plan) || stringValue(metadata?.billingPlan);
  return tier === "bottled-in-bond" || plan === "bib_lifetime";
}

export function founderNumberFromMetadata(metadata: FounderAllocationMetadata | null | undefined) {
  return positiveInteger(metadata?.founderNumber) || positiveInteger(metadata?.memberNumber);
}

export function nextFounderNumber(users: FounderAllocationUser[], currentUserId: string, limit = FOUNDER_SPOT_LIMIT) {
  const currentUser = users.find((user) => user.id === currentUserId);
  const existingCurrentNumber = founderNumberFromMetadata(currentUser?.publicMetadata);
  if (existingCurrentNumber && existingCurrentNumber <= limit) return existingCurrentNumber;

  const used = new Set<number>();
  for (const user of users) {
    if (user.id === currentUserId) continue;
    if (!isFounderMembershipMetadata(user.publicMetadata)) continue;
    const number = founderNumberFromMetadata(user.publicMetadata);
    if (number && number <= limit) used.add(number);
  }

  for (let candidate = 1; candidate <= limit; candidate += 1) {
    if (!used.has(candidate)) return candidate;
  }
  return null;
}

export function countFounderMemberships(users: FounderAllocationUser[]) {
  return users.filter((user) => isFounderMembershipMetadata(user.publicMetadata)).length;
}
