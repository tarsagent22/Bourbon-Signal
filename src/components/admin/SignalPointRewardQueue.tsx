"use client";

import { useCallback, useEffect, useState } from "react";

type ShippingAddress = {
  recipientName: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  stateCode: string;
  postalCode: string;
  countryCode: "US";
  phone: string;
};
type QueueItem = {
  id: string;
  accountEmail: string;
  itemSnapshot: Record<string, unknown>;
  details: Record<string, unknown>;
  pointsSpent: number;
  status: string;
  fulfillmentType: string;
  createdAt: string;
  carrier: string | null;
  trackingNumber: string | null;
  shippingAddress: ShippingAddress | null;
};

export default function SignalPointRewardQueue() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState("");
  const [shipment, setShipment] = useState<Record<string, { carrier: string; trackingNumber: string }>>({});
  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/signal-points", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Queue unavailable");
      setQueue(body.queue || []); setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Queue unavailable"); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function transition(id: string, status: string) {
    setSaving(id); setError("");
    try {
      const tracking = shipment[id] || { carrier: "", trackingNumber: "" };
      const response = await fetch("/api/admin/signal-points", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ redemptionId: id, status, ...tracking }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Transition failed");
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Transition failed"); }
    finally { setSaving(""); }
  }
  const choices = (item: QueueItem) => item.status === "submitted" ? ["approved", "canceled"]
    : item.status === "approved" ? [item.fulfillmentType === "digital" ? "digital_fulfillment" : "packed", "canceled"]
      : item.status === "packed" ? ["shipped"]
        : item.status === "shipped" || item.status === "digital_fulfillment" ? ["delivered"] : [];

  return <section className="mt-8 border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-5">
    <h2 className="font-serif text-xl font-semibold">Signal Points reward queue</h2>
    <p className="mt-2 text-sm text-[var(--color-text-secondary)]">Physical rewards use the address snapshot captured when points were redeemed. Carrier and tracking are required before marking one shipped.</p>
    {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}
    <div className="mt-4 grid gap-3">{queue.length ? queue.map((item) => {
      const tracking = shipment[item.id] || { carrier: item.carrier || "", trackingNumber: item.trackingNumber || "" };
      const canShip = tracking.carrier.trim() !== "" && tracking.trackingNumber.trim() !== "";
      return <article key={item.id} className="grid gap-2 border border-[var(--color-border)] p-3 md:grid-cols-[1fr_auto]">
        <div><strong>{String(item.itemSnapshot.name || "Reward")}</strong>
          <p className="text-sm text-[var(--color-text-secondary)]">{item.accountEmail} · {item.pointsSpent} pts · {item.status.replaceAll("_", " ")}</p>
          {item.shippingAddress ? <p className="text-sm text-[var(--color-text-secondary)]">{item.shippingAddress.recipientName} · {item.shippingAddress.addressLine1}{item.shippingAddress.addressLine2 ? ` · ${item.shippingAddress.addressLine2}` : ""} · {item.shippingAddress.city}, {item.shippingAddress.stateCode} {item.shippingAddress.postalCode} · {item.shippingAddress.countryCode} · {item.shippingAddress.phone}</p> : null}
          <p className="font-mono text-xs text-[var(--color-text-tertiary)]">{JSON.stringify(item.details)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {item.status === "packed" ? <>
            <input aria-label="Carrier" placeholder="Carrier" value={tracking.carrier} onChange={(event) => setShipment((current) => ({ ...current, [item.id]: { ...tracking, carrier: event.target.value } }))} className="border border-[var(--color-border)] bg-transparent px-2 py-2 text-xs" />
            <input aria-label="Tracking number" placeholder="Tracking number" value={tracking.trackingNumber} onChange={(event) => setShipment((current) => ({ ...current, [item.id]: { ...tracking, trackingNumber: event.target.value } }))} className="border border-[var(--color-border)] bg-transparent px-2 py-2 text-xs" />
          </> : null}
          {choices(item).map((status) => <button key={status} disabled={saving === item.id || (status === "shipped" && !canShip)} className="border border-amber-700/50 px-3 py-2 text-xs text-amber-100" onClick={() => void transition(item.id, status)}>{status.replaceAll("_", " ")}</button>)}
        </div>
      </article>;
    }) : <p className="text-sm text-[var(--color-text-secondary)]">No open reward redemptions.</p>}</div>
  </section>;
}
