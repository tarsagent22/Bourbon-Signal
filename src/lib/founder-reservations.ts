import "server-only";
import { founderNumberFromMetadata, isFounderMembershipMetadata, type FounderAllocationUser } from "@/lib/founder-allocation";
import { createGiftRepository } from "@/lib/gift-repository";

export async function reconcileFounderReservationAuthority(users: FounderAllocationUser[]) {
  const repository = createGiftRepository();
  for (const user of users) {
    if (!isFounderMembershipMetadata(user.publicMetadata)) continue;
    const number = founderNumberFromMetadata(user.publicMetadata);
    if (!number) throw new Error("An existing Founder is missing a durable number.");
    await repository.reconcileExistingFounder(user.id, number);
  }
  await repository.markFounderReconciliationReady(users.length);
  return repository.founderAvailability();
}

type ClerkUserPager = {
  users: {
    getUserList(input: { limit: number; offset: number }): Promise<unknown>;
  };
};

export async function reconcileAllFounderReservationAuthority(client: ClerkUserPager) {
  const pageSize = 100;
  const users: FounderAllocationUser[] = [];
  const seenUserIds = new Set<string>();
  let offset = 0;
  for (;;) {
    const result = await client.users.getUserList({ limit: pageSize, offset }) as {
      data?: FounderAllocationUser[];
      totalCount?: number;
      total_count?: number;
    } | FounderAllocationUser[];
    const page = (Array.isArray(result) ? result : result.data) || [];
    if (page.some((user) => seenUserIds.has(user.id))) throw new Error("Full Founder authority reconciliation returned a repeated page.");
    page.forEach((user) => seenUserIds.add(user.id));
    users.push(...page);
    const total = Array.isArray(result) ? null : Number(result.totalCount ?? result.total_count);
    offset += page.length;
    if (Number.isFinite(total) && offset >= Number(total)) break;
    if (page.length < pageSize) break;
    if (page.length === 0 || offset > 1_000_000) throw new Error("Full Founder authority reconciliation could not complete.");
  }
  return { users, availability: await reconcileFounderReservationAuthority(users) };
}
