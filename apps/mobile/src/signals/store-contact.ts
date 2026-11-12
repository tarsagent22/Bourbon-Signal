import type { Signal } from "../api/types";

export function signalStoreContact(signal: Signal | null) {
  const store = signal?.location.scope === "exact_store" && !signal.shipment ? signal.location.store : undefined;
  if (!store) return { address: "", destination: "", phone: "" };

  const parts = [store.address, store.city, store.state || signal?.location.state, store.zip]
    .flatMap(part => (part || "").split(","))
    .map(part => part.trim()).filter(Boolean);
  const unique = new Map<string, string>();
  for (const part of parts) {
    const key = part.toLowerCase();
    if (unique.has(key)) continue;
    const stateZip = key.match(/^([a-z]{2}) (\d{5}(?:-\d{4})?)$/);
    if (stateZip) {
      unique.delete(stateZip[1]);
      unique.delete(stateZip[2]);
    } else if ([...unique.keys()].some(existing => /^[a-z]{2} \d{5}(?:-\d{4})?$/.test(existing) && existing.split(" ").includes(key))) {
      continue;
    }
    unique.set(key, part);
  }
  const address = [...unique.values()].join(", ");
  const street = parts[0] || "";
  const hasStreet = !/^p\.?\s*o\.?\s*box\b/i.test(street)
    && /[a-z]/i.test(street)
    && (/\d/.test(street) || /\b(?:street|st|road|rd|highway|hwy|route|avenue|ave|drive|dr|boulevard|blvd|lane|ln)\b/i.test(street))
    && !/^(?:[a-z .'-]+,?\s+)?[A-Z]{2}\s*(?:\d{5}(?:-\d{4})?)?$/i.test(street);
  const digits = store.phone?.replace(/\D/g, "") || "";
  const phone = /^(?:1)?[2-9]\d{9}$/.test(digits) ? digits : "";
  return {
    address,
    destination: hasStreet && (store.city || store.zip || /\d{5}/.test(address)) ? [store.name, address].filter(Boolean).join(", ") : "",
    phone,
  };
}

export function reportDateTime(value: string | undefined) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : "";
}
