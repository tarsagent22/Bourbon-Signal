import { useAuth } from "@clerk/expo";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { configureRadarNotifications, flushPendingPushRevocation } from "./push-registration";
import { createPendingPushNavigation } from "./push-navigation";

export function PushMaintenance() {
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      if (!active) return;
      configureRadarNotifications();
      void flushPendingPushRevocation().catch(() => false);
    }, 0);
    return () => { active = false; clearTimeout(timer); };
  }, []);
  return null;
}

export function PushResponseHandler() {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();
  const queue = useRef(createPendingPushNavigation());
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    let subscription: Notifications.Subscription | null = null;
    const open = (response: Notifications.NotificationResponse | null) => {
      if (!active || !response) return;
      try {
        const request = response.notification?.request;
        if (!request) return;
        queue.current.receive(request.identifier, request.content.data);
        setRevision((value) => value + 1);
      } catch {
        // Malformed notification data must never escape the authenticated app.
      }
    };
    const timer = setTimeout(() => {
      if (!active) return;
      try {
        const getLastResponse = Notifications.getLastNotificationResponseAsync;
        if (typeof getLastResponse === "function") {
          void getLastResponse().then(open).catch(() => {});
        }
      } catch {
        // Notification response lookup is optional on older native runtimes.
      }
      try {
        const addResponseListener = Notifications.addNotificationResponseReceivedListener;
        if (typeof addResponseListener === "function") subscription = addResponseListener(open);
      } catch {
        subscription = null;
      }
    }, 0);
    return () => {
      active = false;
      clearTimeout(timer);
      try { subscription?.remove(); } catch { /* native listener cleanup is best effort */ }
    };
  }, []);

  useEffect(() => {
    const route = queue.current.take(isLoaded && !!isSignedIn, true);
    if (!route) return;
    try { router.push(route); } catch { /* navigation may still be mounting */ }
    try {
      const clearLastResponse = Notifications.clearLastNotificationResponseAsync;
      if (typeof clearLastResponse === "function") void clearLastResponse().catch(() => {});
    } catch {
      // Clearing is best effort and must never affect app startup.
    }
  }, [isLoaded, isSignedIn, revision, router]);

  return null;
}
