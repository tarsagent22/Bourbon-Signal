"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import type { MemberAlertRecord } from "@/lib/notification-preferences";
import { useToastStore } from "@/lib/toast";

interface AlertsResponse {
  alerts: MemberAlertRecord[];
  unreadCount: number;
  candidateAlerts?: Array<Record<string, unknown>>;
  candidateAlertCount?: number;
  reliabilitySummary?: {
    total: number;
    eligibleForDelivery: number;
    reviewOnly: number;
    major: number;
    standard: number;
    averageReliability: number;
    topBlockers: Array<{ label: string; count: number }>;
    topCautions: Array<{ label: string; count: number }>;
  };
  alertDeliveryEnabled?: boolean;
  alertPolicyNote?: string;
}

const EMPTY_RESPONSE: AlertsResponse = {
  alerts: [],
  unreadCount: 0,
};

const TOASTED_ALERT_STORAGE_KEY = "bourbon-signal:toasted-alert-ids";

function getToastedAlertIds() {
  if (typeof window === "undefined") return new Set<string>();
  try {
    const raw = window.sessionStorage.getItem(TOASTED_ALERT_STORAGE_KEY);
    if (!raw) return new Set<string>();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : []);
  } catch {
    return new Set<string>();
  }
}

function persistToastedAlertIds(ids: Set<string>) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(TOASTED_ALERT_STORAGE_KEY, JSON.stringify(Array.from(ids)));
}

export function useMemberAlerts(polling = false) {
  const pathname = usePathname();
  const { isSignedIn, memberTier } = useAuth();
  const [data, setData] = useState<AlertsResponse>(EMPTY_RESPONSE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seenAlertIds = useRef<Set<string>>(new Set());
  const hasLoadedRef = useRef(false);
  const inFlightRef = useRef(false);
  const addToast = useToastStore((state) => state.addToast);

  const isEligible = isSignedIn && memberTier !== "free";
  const isPaidOrTester = isEligible;

  const fetchAlerts = useCallback(async (options: { background?: boolean } = {}) => {
    if (!isPaidOrTester) {
      setData(EMPTY_RESPONSE);
      setError(null);
      hasLoadedRef.current = false;
      return EMPTY_RESPONSE;
    }
    if (inFlightRef.current) return EMPTY_RESPONSE;

    const background = options.background === true || hasLoadedRef.current;
    inFlightRef.current = true;
    if (!background) setLoading(true);
    try {
      const res = await fetch("/api/alerts", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load alerts");
      const payload = (await res.json()) as AlertsResponse;
      const unreadAlerts = payload.alerts.filter((alert) => !alert.readAt && !alert.archivedAt);
      const nextUnreadIds = unreadAlerts.map((alert) => alert.id);

      if (polling) {
        const toastedIds = getToastedAlertIds();
        const unseen = unreadAlerts.filter((alert) => !seenAlertIds.current.has(alert.id) && !toastedIds.has(alert.id));
        const shouldToastOnBoot = pathname === "/dashboard" && seenAlertIds.current.size === 0 && toastedIds.size === 0;
        const toastTargets = shouldToastOnBoot ? unreadAlerts.slice(0, 1) : unseen.slice(0, 2);

        toastTargets.forEach((alert) => {
          addToast(`${alert.bottleName} hit ${alert.storeLabel}`, "bell");
          toastedIds.add(alert.id);
        });

        persistToastedAlertIds(toastedIds);
      }

      seenAlertIds.current = new Set(nextUnreadIds);
      hasLoadedRef.current = true;
      setData(payload);
      setError(null);
      return payload;
    } catch (cause) {
      setError("Alerts could not be loaded.");
      throw cause;
    } finally {
      inFlightRef.current = false;
      if (!background) setLoading(false);
    }
  }, [addToast, isPaidOrTester, pathname, polling]);

  useEffect(() => {
    fetchAlerts().catch(() => undefined);
  }, [fetchAlerts]);

  useEffect(() => {
    if (!polling || !isPaidOrTester) return;
    const timer = window.setInterval(() => {
      fetchAlerts({ background: true }).catch(() => undefined);
    }, 60000);
    return () => window.clearInterval(timer);
  }, [fetchAlerts, isPaidOrTester, polling]);

  const mutate = useCallback(async (action: "mark_read" | "mark_all_read" | "archive", alertId?: string) => {
    if (!isEligible) return EMPTY_RESPONSE;
    const optimisticAt = new Date().toISOString();
    setData((prev) => {
      const alerts = prev.alerts.map((alert) => {
        if (action === "mark_all_read") return alert.readAt || alert.archivedAt ? alert : { ...alert, readAt: optimisticAt };
        if (!alertId || alert.id !== alertId) return alert;
        if (action === "mark_read") return alert.readAt ? alert : { ...alert, readAt: optimisticAt };
        if (action === "archive") return { ...alert, archivedAt: optimisticAt, readAt: alert.readAt ?? optimisticAt };
        return alert;
      });
      return { ...prev, alerts, unreadCount: alerts.filter((alert) => !alert.readAt && !alert.archivedAt).length };
    });
    const res = await fetch("/api/alerts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, alertId }),
    });
    if (!res.ok) throw new Error("Failed to update alerts");
    const payload = (await res.json()) as AlertsResponse;
    setData(payload);
    return payload;
  }, [isEligible]);

  return useMemo(() => ({
    alerts: data.alerts,
    unreadCount: data.unreadCount,
    candidateAlerts: data.candidateAlerts || [],
    candidateAlertCount: data.candidateAlertCount || 0,
    reliabilitySummary: data.reliabilitySummary,
    alertDeliveryEnabled: data.alertDeliveryEnabled === true,
    alertPolicyNote: data.alertPolicyNote || "",
    loading,
    error,
    isEligible,
    refresh: fetchAlerts,
    markRead: (alertId: string) => mutate("mark_read", alertId),
    markAllRead: () => mutate("mark_all_read"),
    archive: (alertId: string) => mutate("archive", alertId),
  }), [data, loading, error, isEligible, fetchAlerts, mutate]);
}
