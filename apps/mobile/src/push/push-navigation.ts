const ALERT_TOKEN = /^[a-zA-Z0-9_-]{1,160}$/;
const SIGNAL_ID = /^[a-zA-Z0-9._:-]{1,260}$/;

type RadarNotificationRoute = {
  pathname: "/(app)/(tabs)/radar";
  params: { section: "matches"; alert: string; request?: string };
};

export function radarRouteForNotificationData(input: unknown): RadarNotificationRoute | null {
  const data = input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : null;
  if (data?.screen !== "radar") return null;
  // The opaque, member-bound alert id is resolved only after authenticated inbox
  // refresh. Notification data never contains bottle, store, or area details.
  const alertId = typeof data.alertId === "string" ? data.alertId.trim() : "";
  if (!ALERT_TOKEN.test(alertId)) return null;
  return {
    pathname: "/(app)/(tabs)/radar" as const,
    params: { section: "matches", alert: alertId },
  };
}

export function signalRouteForRequestedAlert(
  alerts: Array<{ id: string; signalId?: string }>,
  requestedAlertId: string | undefined,
) {
  const alertId = requestedAlertId?.trim() || "";
  if (!ALERT_TOKEN.test(alertId)) return null;
  const signalId = alerts.find((alert) => alert.id === alertId)?.signalId?.trim() || "";
  if (!SIGNAL_ID.test(signalId)) return null;
  return {
    pathname: "/(app)/signal/[id]" as const,
    params: { id: signalId },
  };
}

// Latest tap wins while locked; OS request IDs distinguish repeated alerts.
export function createPendingPushNavigation() {
  let pending: { id: string; route: NonNullable<ReturnType<typeof radarRouteForNotificationData>> } | null = null;
  const consumed = new Set<string>();
  return {
    receive(id: string, data: unknown) {
      const route = radarRouteForNotificationData(data);
      if (route && /^[a-zA-Z0-9_:-]{1,200}$/.test(id) && !consumed.has(id)) {
        pending = { id, route: { ...route, params: { ...route.params, request: id } } };
      }
    },
    take(signedIn: boolean, navigationReady: boolean) {
      if (!signedIn || !navigationReady || !pending) return null;
      const next = pending;
      pending = null;
      consumed.add(next.id);
      if (consumed.size > 64) consumed.delete(consumed.values().next().value!);
      return next.route;
    },
  };
}
