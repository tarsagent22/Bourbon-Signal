import type { Signal } from "./types";

const statusLabels: Record<NonNullable<Signal["availability"]>["status"], string> = {
  available_now: "Available now",
  upcoming: "Upcoming",
  reported: "Reported",
  unknown: "Availability unknown",
};

export function presentSignal(signal: Signal) {
  const store = signal.location.store;
  const location = [store?.name || signal.location.label, store?.city, store?.state || signal.location.state].filter(Boolean).join(" · ");
  const address = [store?.address, store?.city, store?.state || signal.location.state, store?.zip].filter(Boolean).join(" · ");
  const price = typeof signal.availability?.price === "number" ? `$${signal.availability.price.toFixed(2)}` : "";
  const quantity = signal.availability?.quantityLabel
    || (typeof signal.availability?.quantity === "number" ? `${signal.availability.quantity} bottle${signal.availability.quantity === 1 ? "" : "s"}` : "");
  return {
    location,
    address,
    price,
    quantity,
    availability: signal.availability?.label || (signal.availability ? statusLabels[signal.availability.status] : ""),
    summary: signal.evidence.summary || "",
    caveat: signal.availability?.caveat || "",
    observed: signal.timing.displayAt,
  };
}
