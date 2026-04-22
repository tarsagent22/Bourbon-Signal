"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
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
      setData(payload);
      return payload;
    } finally {
      setLoading(false);
    }
  }, [addToast, isEligible, pathname, polling]);

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
