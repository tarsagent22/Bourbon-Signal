import { useAuth } from "@clerk/expo";
import * as Notifications from "expo-notifications";
import { useRootNavigationState, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { useMobileApi } from "../hooks/useMobileApi";
import { configureRadarNotifications, flushPendingPushRevocation, refreshRadarPushIfEnabled, watchRadarPushToken } from "./push-registration";
import { createPendingPushNavigation } from "./push-navigation";

export function PushMaintenance() {
  const api = useMobileApi();
  useEffect(() => {
    let active = true;
    let attempts = 0;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const recover = async () => {
      clearTimeout(retry);
      let needsRetry = false;
      try {
        const status = await refreshRadarPushIfEnabled(api);
        needsRetry = Boolean(status?.warning || (status?.currentDeviceRegistered && !status.enabled));
      } catch { needsRetry = true; }
      if (active && needsRetry && attempts++ < 3) retry = setTimeout(() => void recover(), [5000, 30000, 120000][attempts - 1]);
    };
    const timer = setTimeout(() => {
      if (!active) return;
      configureRadarNotifications();
      void flushPendingPushRevocation().catch(() => false).then(() => { if (active) void recover(); });
    }, 0);
    const foreground = AppState.addEventListener("change", state => { if (state === "active" && active) { attempts = 0; void recover(); } });
    const tokens = watchRadarPushToken(api);
    return () => { active = false; clearTimeout(timer); clearTimeout(retry); foreground.remove(); tokens.remove(); };
  }, [api]);
  return null;
}

export function PushResponseHandler() {
  const router = useRouter();
  const navigationState = useRootNavigationState();
  const { isLoaded, isSignedIn } = useAuth();
  const queue = useRef(createPendingPushNavigation());
  const [revision, setRevision] = useState(0);
  const [foreground, setForeground] = useState(AppState.currentState === "active");
  const navigationAttempts = useRef(0);

  useEffect(() => {
    let active = true;
    let subscription: Notifications.Subscription | null = null;
    let responseSequence = 0;
    const open = (response: Notifications.NotificationResponse | null) => {
      if (!active || !response) return;
      try {
        const request = response.notification?.request;
        if (!request) return;
        queue.current.receive(request.identifier, request.content.data);
        navigationAttempts.current = 0;
        setRevision((value) => value + 1);
      } catch {
        // Malformed notification data must never escape the authenticated app.
      }
    };
    const readLastResponse = () => {
      const sequence = responseSequence;
      try {
        const getLastResponse = Notifications.getLastNotificationResponseAsync;
        if (typeof getLastResponse === "function") {
          void getLastResponse().then(response => { if (sequence === responseSequence) open(response); }).catch(() => {});
        }
      } catch {
        // Notification response lookup is optional on older native runtimes.
      }
    };
    const timer = setTimeout(() => {
      if (!active) return;
      try {
        const addResponseListener = Notifications.addNotificationResponseReceivedListener;
        if (typeof addResponseListener === "function") subscription = addResponseListener(response => { responseSequence += 1; open(response); });
      } catch {
        subscription = null;
      }
      readLastResponse();
    }, 0);
    const foregroundListener = AppState.addEventListener("change", state => {
      if (!active) return;
      setForeground(state === "active");
      if (state === "active") { navigationAttempts.current = 0; readLastResponse(); setRevision(value => value + 1); }
    });
    return () => {
      active = false;
      clearTimeout(timer);
      foregroundListener.remove();
      try { subscription?.remove(); } catch { /* native listener cleanup is best effort */ }
    };
  }, []);

  useEffect(() => {
    const route = queue.current.take(isLoaded && !!isSignedIn, Boolean(navigationState?.key) && foreground);
    if (!route) return;
    try { router.push(route); } catch {
      // Keep the destination pending if the navigator is still mounting.
      if (navigationAttempts.current++ < 3) {
        const retry = setTimeout(() => setRevision(value => value + 1), 250);
        return () => clearTimeout(retry);
      }
      return;
    }
    queue.current.acknowledge(route.params.request!);
    try {
      const clearLastResponse = Notifications.clearLastNotificationResponseAsync;
      if (typeof clearLastResponse === "function") void clearLastResponse().catch(() => {});
    } catch {
      // Clearing is best effort and must never affect app startup.
    }
  }, [isLoaded, isSignedIn, revision, router, navigationState?.key, foreground]);

  return null;
}
