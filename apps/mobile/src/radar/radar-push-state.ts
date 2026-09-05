import type { PushDeviceStatus } from "../api/types";

export type PushRecoveryAction = "enable" | "retry-enable" | "retry-disable" | "retry-status" | "settings";

export function radarPushState({ status, permission, preferenceEnabled, error = "", statusLoadFailed = false, failedAction }: {
  status: PushDeviceStatus | null;
  permission: string;
  preferenceEnabled: boolean;
  error?: string;
  statusLoadFailed?: boolean;
  failedAction?: "enable" | "disable" | null;
}) {
  if (statusLoadFailed) return { readiness: "Setup needed" as const, action: "retry-status" as const };
  if (status && !status.enabled && !preferenceEnabled && !error && !status.warning && !failedAction) {
    return { readiness: "Off" as const, action: "enable" as const };
  }
  if (permission === "denied") return { readiness: "Setup needed" as const, action: "settings" as const };
  if (error || status?.warning) return {
    readiness: "Setup needed" as const,
    action: failedAction === "disable" ? "retry-disable" as const : "retry-enable" as const,
  };
  if (status?.enabled && status.currentDeviceRegistered !== false && permission === "granted") {
    return { readiness: "On" as const, action: "enable" as const };
  }
  if (preferenceEnabled) return { readiness: "Setup needed" as const, action: "retry-enable" as const };
  return { readiness: "Off" as const, action: "enable" as const };
}
