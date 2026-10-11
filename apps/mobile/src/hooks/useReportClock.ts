import { useEffect, useState } from "react";
import { AppState } from "react-native";

// One clock for visible cards, instead of a timer for each row. Stop work while
// the app is backgrounded and update immediately when it returns.
let current = new Date();
const listeners = new Set<(now: Date) => void>();
let timer: ReturnType<typeof setInterval> | undefined;
let subscription: ReturnType<typeof AppState.addEventListener> | undefined;
function tick() { current = new Date(); for (const listener of listeners) listener(current); }
function stopTimer() { if (timer) clearInterval(timer); timer = undefined; }
function startTimer() { stopTimer(); if (AppState.currentState === "active") timer = setInterval(tick, 60_000); }
export function useReportClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    listeners.add(setNow);
    if (listeners.size === 1) {
      tick(); startTimer();
      subscription = AppState.addEventListener("change", state => { stopTimer(); if (state === "active") { tick(); startTimer(); } });
    } else setNow(current);
    return () => { listeners.delete(setNow); if (!listeners.size) { stopTimer(); subscription?.remove(); subscription = undefined; } };
  }, []);
  return now;
}
