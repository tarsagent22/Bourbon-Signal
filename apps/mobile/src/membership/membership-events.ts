const listeners = new Set<(userId: string) => void>();

export function notifyMembershipChanged(userId: string) {
  for (const listener of listeners) listener(userId);
}

export function subscribeMembershipChanges(listener: (userId: string) => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
