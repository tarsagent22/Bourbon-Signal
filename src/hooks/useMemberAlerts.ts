"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import type { MemberAlertRecord } from "@/lib/notification-preferences";
import { useToastStore } from "@/lib/toast";

interface AlertsResponse {
  alerts: MemberAlertRecord[];
  unreadCount: number;
}

const EMPTY_RESPONSE: AlertsResponse = {
  alerts: [],
  unreadCount: 0,
};

export function useMemberAlerts(polling = false) {
  const { isSignedIn, memberTier } = useAuth();
  const [data, setData] = useState<AlertsResponse>(EMPTY_RESPONSE);
  const [loading, setLoading] = useState(false);
  const seenAlertIds = useRef<Set<string>>(new Set());
  const addToast = useToastStore((state) => state.addToast);

  const isEligible = isSignedIn && !!memberTier;

  const fetchAlerts = useCallback(async () => {
    if (!isEligible) {
      setData(EMPTY_RESPONSE);
      return EMPTY_RESPONSE;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/alerts", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load alerts");
      const payload = (await res.json()) as AlertsResponse;
      const nextUnreadIds = payload.alerts.filter((alert) => !alert.readAt && !alert.archivedAt).map((alert) => alert.id);
      if (polling) {
        const unseen = payload.alerts.filter((alert) => !alert.readAt && !alert.archivedAt && !seenAlertIds.current.has(alert.id));
        unseen.slice(0, 2).forEach((alert) => addToast(`${alert.bottleName} hit ${alert.storeLabel}`, "bell"));
      }
      seenAlertIds.current = new Set(nextUnreadIds);
      setData(payload);
      return payload;
    } finally {
      setLoading(false);
    }
  }, [isEligible]);

  useEffect(() => {
    fetchAlerts().catch(() => undefined);
  }, [fetchAlerts]);

  useEffect(() => {
    if (!polling || !isEligible) return;
    const timer = window.setInterval(() => {
      fetchAlerts().catch(() => undefined);
    }, 30000);
    return () => window.clearInterval(timer);
  }, [fetchAlerts, isEligible, polling]);

  const mutate = useCallback(async (action: "mark_read" | "mark_all_read" | "archive", alertId?: string) => {
    if (!isEligible) return EMPTY_RESPONSE;
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
    loading,
    isEligible,
    refresh: fetchAlerts,
    markRead: (alertId: string) => mutate("mark_read", alertId),
    markAllRead: () => mutate("mark_all_read"),
    archive: (alertId: string) => mutate("archive", alertId),
  }), [data, loading, isEligible, fetchAlerts, mutate]);
}
