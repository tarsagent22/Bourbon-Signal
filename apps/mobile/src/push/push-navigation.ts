export function radarRouteForNotificationData(input: unknown) {
  const data = input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : null;
  if (data?.screen !== "radar") return null;
  const alertId = typeof data.alertId === "string" ? data.alertId.trim() : "";
  if (!/^[a-zA-Z0-9_-]{1,160}$/.test(alertId)) return null;
  return {
    pathname: "/(app)/(tabs)/radar" as const,
    params: { section: "matches", request: alertId },
  };
}
