export function radarRouteForNotificationData(input: unknown) {
  const data = input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : null;
  if (data?.screen !== "radar") return null;
  // New payloads contain only a generic route. Accept old valid IDs for queued
  // pre-cutover taps, but never use notification data as member detail content.
  const alertId = data.alertId === undefined ? "radar" : typeof data.alertId === "string" ? data.alertId.trim() : "";
  if (!/^[a-zA-Z0-9_-]{1,160}$/.test(alertId)) return null;
  return {
    pathname: "/(app)/(tabs)/radar" as const,
    params: { section: "matches", request: alertId },
  };
}

// Latest tap wins while locked; OS request IDs distinguish repeated alerts.
export function createPendingPushNavigation() {
  let pending: { id: string; route: NonNullable<ReturnType<typeof radarRouteForNotificationData>> } | null = null;
  const consumed = new Set<string>();
  return {
    receive(id: string, data: unknown) {
      const route = radarRouteForNotificationData(data);
      if (route && /^[a-zA-Z0-9_:-]{1,200}$/.test(id) && !consumed.has(id)) pending = { id, route: { ...route, params: { ...route.params, request: id } } };
    },
    take(signedIn: boolean, navigationReady: boolean) {
      if (!signedIn || !navigationReady || !pending) return null;
      const next = pending; pending = null; consumed.add(next.id);
      if (consumed.size > 64) consumed.delete(consumed.values().next().value!);
      return next.route;
    },
  };
}
