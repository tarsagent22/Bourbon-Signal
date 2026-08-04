"use client";

import { useEffect } from "react";
import { useUser } from "@clerk/nextjs";

const MAX_ATTEMPTS = 3;

export default function LifecycleTimeZoneCapture() {
  const { isLoaded, isSignedIn, user } = useUser();

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !user?.id) return;
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!timeZone) return;
    const storageKey = `bourbon-signal:lifecycle-time-zone:${user.id}:${timeZone}`;
    try {
      if (sessionStorage.getItem(storageKey) === "saved") return;
    } catch {
      // Storage can be unavailable in privacy modes; the API call remains safe and idempotent.
    }

    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;

    const persist = async (attempt: number) => {
      try {
        const response = await fetch("/api/user/time-zone", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ timeZone }),
          signal: controller.signal,
        });
        if (response.ok) {
          try { sessionStorage.setItem(storageKey, "saved"); } catch { /* best effort */ }
          return;
        }
      } catch {
        if (controller.signal.aborted) return;
      }
      if (attempt < MAX_ATTEMPTS && !controller.signal.aborted) {
        timer = setTimeout(() => void persist(attempt + 1), attempt * 1_000);
      }
    };

    void persist(1);
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [isLoaded, isSignedIn, user?.id]);

  return null;
}
