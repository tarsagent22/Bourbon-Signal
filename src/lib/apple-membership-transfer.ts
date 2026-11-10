import { AppleMembershipError, type AppleMembershipRecord, type AppleMembershipSnapshot, type AppleMembershipRepository } from './apple-membership.ts';

// Called only after the target's provider lookup and signed Apple transaction
// have succeeded. A caller-supplied user ID or webhook transfer list is not proof.
export function createVerifiedMembershipTransfer(deps: {
  repository: AppleMembershipRepository;
  identityExists(userId: string): Promise<boolean>;
  fetchCurrentSubscriber(userId: string): Promise<AppleMembershipSnapshot | null>;
  projectMembership(record: AppleMembershipRecord): Promise<unknown>;
  reconcileRemaining(userId: string): Promise<unknown>;
  now?: () => string;
}) {
  return async (previous: AppleMembershipRecord, incoming: AppleMembershipSnapshot) => {
    if (previous.originalTransactionId !== incoming.originalTransactionId || previous.environment !== incoming.environment
      || previous.clerkUserId === incoming.clerkUserId || !deps.repository.reassignVerifiedOwner) return false;
    const exists = await deps.identityExists(previous.clerkUserId); // Only a confirmed 404 means absent.
    let remaining: AppleMembershipSnapshot | null = null;
    if (exists) {
      try { remaining = await deps.fetchCurrentSubscriber(previous.clerkUserId); }
      catch (error) { if (!(error instanceof AppleMembershipError) || error.code !== 'NO_APPLE_SUBSCRIPTION') throw error; }
      // Aliases may share a provider profile; never give one receipt to two live identities.
      if (remaining?.originalTransactionId === incoming.originalTransactionId) return false;
      if (remaining) {
        const owner = await deps.repository.readByOriginalTransactionId(remaining.originalTransactionId);
        if (owner?.clerkUserId !== previous.clerkUserId) return false;
        await deps.reconcileRemaining(previous.clerkUserId);
      } else {
        const now = deps.now?.() || new Date().toISOString();
        // Remove only this store overlay. The projector preserves Founder, gift,
        // Stripe and the other native store. Do this before granting the receiver.
        await deps.projectMembership({ ...previous, status: 'revoked', expiresAt: now, updatedAt: now });
      }
    }
    return deps.repository.reassignVerifiedOwner(previous, incoming.clerkUserId, deps.now?.() || new Date().toISOString());
  };
}
