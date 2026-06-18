import { getActiveEngineStateName } from "@/lib/activeStates";

export interface DropEvent {
  timestamp: string;
  event_type: string;
  bottle_id?: string;
  canonical_id?: string;
  canonical_name?: string;
  canonical_key?: string;
  raw_name?: string;
  aliases?: string[];
  brand_name: string;
  tracked_brand_name?: string;
  board_name?: string;
  store_address?: string;
  store_city?: string;
  store_county?: string;
  store_name?: string;
  store_id?: string;
  store_zip?: string;
  stores_in_stock?: number;
  quantity_shipped?: number;
  quantity_in_stock?: number;
  quantity?: number;
  rarity_tier: string;
  retail_price?: number | null;
  state?: string;
  state_code?: string;
  source?: string;
  sourceUrl?: string;
  observed_at?: string;
  event_at?: string;
  first_seen_at?: string;
  last_confirmed_at?: string;
  timestamp_basis?: "source_event_at" | "first_seen_at" | "last_confirmed_at" | string;
  evidence?: string | null;
  inventorySemantics?: string | null;
  canAlertAsWatch?: boolean;
  exact_store?: boolean;
  availability_scope?: "exact" | "page" | "online" | string;
  confidence_tier?: "exact_store" | "online_positive" | "listing_only" | string;
  location_precision?: string;
  can_alert_as_inventory?: boolean;
  signal_label?: string;
  signal_category?: string;
  display_state?: string;
  display_location?: string;
  is_user_facing_drop?: boolean;
  online_orderable_quantity?: number | null;
  online_in_stock_quantity?: number | null;
  online_stock_status?: string | null;
  stores?: { store_address?: string; store_id?: string; city?: string; quantity?: number; qty?: number }[];
  store_details?: { id: string; name?: string; city?: string; county?: string; qty: number }[];
}

export interface DropLocation {
  label: string;
  city?: string;
  address?: string;
  boardName?: string;
  quantity?: number;
}

export interface GroupedDrop {
  displayName: string;
  event_type: string;
  rarity_tier: string;
  timestamp: string;
  counties: string[];
  board_name?: string;
  store_address?: string;
  retail_price?: number | null;
  quantity_shipped?: number;
  quantity_in_stock?: number;
  state?: string;
  id: string;
  signalLabel?: string;
  confidenceTier?: "exact_store" | "online_positive" | "listing_only" | string;
  availabilityScope?: "exact" | "page" | "online" | string;
  exactStore?: boolean;
  onlineInStockQuantity?: number | null;
  locationPrecision?: string;
  canAlertAsInventory?: boolean;
  signalCategory?: string;
  displayState?: string;
  timestampBasis?: string;
  eventAt?: string;
  firstSeenAt?: string;
  lastConfirmedAt?: string;
  locations: DropLocation[];
}

export function isRealDropEvent(event: DropEvent): boolean {
  const eventType = (event.event_type || '').toLowerCase();
  const locationPrecision = (event.location_precision || event.availability_scope || '').toLowerCase();
  const quantity = event.quantity_in_stock ?? event.quantity ?? 0;
  const hasLocation = !!(
    event.store_address ||
    event.store_city ||
    event.store_county ||
    event.store_name ||
    event.board_name ||
    (event.stores && event.stores.length > 0) ||
    (event.store_details && event.store_details.length > 0)
  );

  if (!hasLocation) return false;
  if (event.is_user_facing_drop === false) return false;
  if (eventType.includes('out_of_stock')) return false;
  if (eventType.includes('lottery')) return false;
  if (eventType.includes('county_allocated')) return false;
  if (eventType.includes('allocated_release')) return false;
  if (eventType === 'nc_board_shipment_snapshot') return quantity > 0;
  if (eventType === 'nc_statewide_warehouse_stock') return quantity > 0;
  if (locationPrecision === 'board_county' || locationPrecision === 'statewide_catalog' || locationPrecision === 'statewide_policy') return false;
  if (eventType === 'new_allocation') return false;
  if (eventType === 'allocation_assigned') return false;
  if (eventType === 'store_inventory_result' && quantity <= 0 && !event.can_alert_as_inventory) return false;
  return true;
}

export function cleanBrandName(name: string): string {
  if (!name) return "Unknown";
  if (/^\d+$/.test(name)) return "";

  let cleaned = name
    .replace(/\b(700ML|750ML|1\.00L|1\.75L|375ML|50ML)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  const half = Math.floor(cleaned.length / 2);
  if (cleaned.length > 6) {
    const firstHalf = cleaned.substring(0, half).trim();
    const secondHalf = cleaned.substring(half).trim();
    if (firstHalf === secondHalf) {
      cleaned = firstHalf;
    } else {
      const words = cleaned.split(/\s+/);
      if (words.length >= 4 && words.length % 2 === 0) {
        const mid = words.length / 2;
        const first = words.slice(0, mid).join(" ");
        const second = words.slice(mid).join(" ");
        if (first === second) {
          cleaned = first;
        }
      }
    }
  }

  return toTitleCase(cleaned);
}

function toTitleCase(str: string): string {
  const preserveUppercase = new Set(["E.H.", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XV", "XX", "XXV", "EH", "VSOP", "XO", "VS"]);
  return str
    .split(/\s+/)
    .map((word) => {
      if (preserveUppercase.has(word.toUpperCase())) return word.toUpperCase();
      if (/^[A-Z]{1,2}\.$/.test(word)) return word.toUpperCase(); // E.H. style initials
      if (word.length === 0) return word;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

export function getDisplayName(event: DropEvent): string {
  if (event.canonical_name) return cleanBrandName(event.canonical_name);
  const cleaned = cleanBrandName(event.brand_name);
  if (!cleaned && event.tracked_brand_name) {
    return cleanBrandName(event.tracked_brand_name);
  }
  if (event.tracked_brand_name) {
    const trackedClean = cleanBrandName(event.tracked_brand_name);
    if (trackedClean.length > cleaned.length) return trackedClean;
  }
  return cleaned || "Unknown Bottle";
}

export function formatRelativeTime(timestamp: string): string {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay === 1) return "1d ago";
  return `${diffDay}d ago`;
}

export function formatDropTime(drop: Pick<DropEvent | GroupedDrop, "timestamp" | "event_type"> & {
  timestamp_basis?: string;
  timestampBasis?: string;
  event_at?: string;
  eventAt?: string;
  first_seen_at?: string;
  firstSeenAt?: string;
  last_confirmed_at?: string;
  lastConfirmedAt?: string;
}): string {
  const basis = drop.timestamp_basis || drop.timestampBasis || "last_confirmed_at";
  const eventAt = drop.event_at || drop.eventAt;
  const firstSeenAt = drop.first_seen_at || drop.firstSeenAt;
  const lastConfirmedAt = drop.last_confirmed_at || drop.lastConfirmedAt;

  const latestSignalAt = lastConfirmedAt || (basis === "source_event_at" ? eventAt : undefined) || firstSeenAt || drop.timestamp;
  return `Reported ${formatRelativeTime(latestSignalAt)}`;
}

export function cleanCountyName(board: string): string {
  if (!board || board === "__EMPTY") return "";
  return board
    .replace(/\bABC\b/gi, "")
    .replace(/\bBoard\b/gi, "")
    .replace(/\bCounty\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function formatStateLabel(state?: string): string {
  if (!state) return "";
  return getActiveEngineStateName(state);
}

function getPublicSignalLabel(event: DropEvent): string | undefined {
  if (event.signal_label) return event.signal_label;
  const eventType = (event.event_type || "").toLowerCase();
  if (eventType.includes("limited_supply")) return "Limited supply reported";
  if (eventType === "nc_board_shipment_snapshot") return "Board shipment";
  if (eventType === "nc_statewide_warehouse_stock") return "Warehouse radar";
  if (eventType.includes("in_stock")) return "Availability reported";
  if (eventType === "store_delivery_snapshot") return "Store delivery";
  if (eventType === "store_inventory_result") return "Store availability reported";
  if (eventType === "new_shipment") return "Shipment";
  if (eventType === "store_stock_increase") return "Stock increase";
  return undefined;
}

export function groupDrops(drops: DropEvent[], limit: number = 20): GroupedDrop[] {
  const SIX_HOURS = 6 * 60 * 60 * 1000;
  const groups: Map<string, GroupedDrop> = new Map();

  const getLocation = (ev: DropEvent): DropLocation[] => {
    const locations: DropLocation[] = [];
    const boardName = cleanCountyName(ev.display_location || ev.board_name || "");
    const singleQuantity = ev.quantity_in_stock ?? ev.quantity_shipped ?? ev.quantity;

    if (ev.store_details?.length) {
      for (const detail of ev.store_details) {
        const city = detail.city?.trim();
        const county = detail.county?.trim();
        const label = detail.name?.trim() || (city ? (county ? `${city} (${county} Co.)` : city) : undefined);
        if (!label) continue;
        locations.push({
          label,
          city,
          boardName: boardName || undefined,
          quantity: detail.qty > 0 ? detail.qty : undefined,
        });
      }
    }

    if (ev.stores?.length) {
      for (const store of ev.stores) {
        const address = store.store_address?.trim();
        const city = store.city?.trim();
        const label = city || address;
        if (!label) continue;
        const qty = store.quantity ?? store.qty;
        locations.push({
          label,
          city,
          address,
          boardName: boardName || undefined,
          quantity: qty && qty > 0 ? qty : undefined,
        });
      }
    }

    const city = ev.store_city?.trim();
    const address = ev.store_address?.trim();
    const primaryLabel = ev.display_location || (city
      ? (ev.store_county ? `${city} (${ev.store_county} Co.)` : city)
      : boardName || address);

    if (primaryLabel) {
      locations.push({
        label: primaryLabel,
        city,
        address,
        boardName: boardName || ev.board_name,
        quantity: singleQuantity && singleQuantity > 0 ? singleQuantity : undefined,
      });
    }

    const deduped: DropLocation[] = [];
    for (const location of locations) {
      if (!deduped.some((loc) => loc.label === location.label && loc.address === location.address && loc.quantity === location.quantity)) {
        deduped.push(location);
      }
    }
    return deduped;
  };

  for (const event of drops) {
    if (!isRealDropEvent(event)) continue;
    const displayName = getDisplayName(event);
    if (displayName === "Unknown Bottle") continue;

    const ts = new Date(event.timestamp).getTime();
    const bucket = Math.floor(ts / SIX_HOURS);
    const groupKey = `${displayName.toLowerCase()}|${event.event_type}|${bucket}`;

    const existing = groups.get(groupKey);
    const locations = getLocation(event);

    if (existing) {
      for (const location of locations) {
        if (!existing.locations.some((loc) => loc.label === location.label && loc.address === location.address && loc.quantity === location.quantity)) {
          existing.locations.push(location);
        }
        if (!existing.counties.includes(location.label)) {
          existing.counties.push(location.label);
        }
      }
      if (event.timestamp > existing.timestamp) {
        existing.timestamp = event.timestamp;
      }
      if (event.quantity_shipped) {
        existing.quantity_shipped = (existing.quantity_shipped || 0) + event.quantity_shipped;
      }
      if (event.quantity_in_stock) {
        existing.quantity_in_stock = (existing.quantity_in_stock || 0) + event.quantity_in_stock;
      }
      const rarityOrder: Record<string, number> = { unicorn: 3, allocated: 2, limited: 1 };
      if ((rarityOrder[event.rarity_tier] || 0) > (rarityOrder[existing.rarity_tier] || 0)) {
        existing.rarity_tier = event.rarity_tier;
      }
      if (event.retail_price && !existing.retail_price) {
        existing.retail_price = event.retail_price;
      }
      if (!existing.confidenceTier && event.confidence_tier) {
        existing.confidenceTier = event.confidence_tier;
      }
      if (!existing.signalLabel) {
        existing.signalLabel = getPublicSignalLabel(event);
      }
      if (!existing.availabilityScope && event.availability_scope) {
        existing.availabilityScope = event.availability_scope;
      }
      if (!existing.exactStore && event.exact_store) {
        existing.exactStore = event.exact_store;
      }
      if (!existing.canAlertAsInventory && event.can_alert_as_inventory) {
        existing.canAlertAsInventory = event.can_alert_as_inventory;
      }
      if (!existing.eventAt && event.event_at) existing.eventAt = event.event_at;
      if (!existing.firstSeenAt || (event.first_seen_at && event.first_seen_at < existing.firstSeenAt)) existing.firstSeenAt = event.first_seen_at;
      if (!existing.lastConfirmedAt || (event.last_confirmed_at && event.last_confirmed_at > existing.lastConfirmedAt)) existing.lastConfirmedAt = event.last_confirmed_at;
      if (event.timestamp_basis === "source_event_at") existing.timestampBasis = event.timestamp_basis;
      if ((existing.onlineInStockQuantity == null || existing.onlineInStockQuantity === 0) && event.online_in_stock_quantity != null) {
        existing.onlineInStockQuantity = event.online_in_stock_quantity;
      }
    } else {
      groups.set(groupKey, {
        displayName,
        event_type: event.event_type,
        rarity_tier: event.rarity_tier,
        timestamp: event.timestamp,
        counties: locations.map((location) => location.label),
        board_name: event.board_name || event.store_city,
        store_address: event.store_address,
        retail_price: event.retail_price,
        quantity_shipped: event.quantity_shipped ?? event.quantity,
        quantity_in_stock: event.quantity_in_stock,
        state: event.state || event.state_code,
        id: groupKey,
        signalLabel: getPublicSignalLabel(event),
        confidenceTier: event.confidence_tier,
        availabilityScope: event.availability_scope,
        exactStore: event.exact_store,
        onlineInStockQuantity: event.online_in_stock_quantity ?? null,
        locationPrecision: event.location_precision,
        canAlertAsInventory: event.can_alert_as_inventory,
        signalCategory: event.signal_category,
        displayState: event.display_state || formatStateLabel(event.state || event.state_code),
        timestampBasis: event.timestamp_basis,
        eventAt: event.event_at,
        firstSeenAt: event.first_seen_at,
        lastConfirmedAt: event.last_confirmed_at,
        locations,
      });
    }
  }

  const rarityOrder: Record<string, number> = { unicorn: 3, allocated: 2, limited: 1 };
  const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

  return Array.from(groups.values())
    .sort((a, b) => {
      const tA = new Date(a.timestamp).getTime();
      const tB = new Date(b.timestamp).getTime();
      const bucketA = Math.floor(tA / SIX_HOURS_MS);
      const bucketB = Math.floor(tB / SIX_HOURS_MS);
      // Primary: newest bucket first
      if (bucketA !== bucketB) return bucketB - bucketA;
      // Secondary within same bucket: higher rarity first
      const rA = rarityOrder[a.rarity_tier] || 0;
      const rB = rarityOrder[b.rarity_tier] || 0;
      if (rA !== rB) return rB - rA;
      // Tertiary: newest timestamp first
      return tB - tA;
    })
    .slice(0, limit);
}

export function getEventDescription(drop: GroupedDrop): string {
  if (drop.signalLabel) {
    if (drop.locations.length > 1) return `${drop.signalLabel} · ${drop.locations.length} locations`;
    const location = drop.locations[0]?.label || drop.board_name || "";
    return `${drop.signalLabel}${location ? ` · ${location}` : ""}`;
  }
  switch (drop.event_type) {
    case "new_shipment": {
      if (drop.counties.length > 1) {
        return `\u2192 ${drop.counties.length} locations`;
      }
      if (drop.counties.length === 1) {
        return `\u2192 ${drop.counties[0]}`;
      }
      return "\u2192 Shipped";
    }
    case "in_store": {
      const loc = cleanCountyName(drop.store_address || drop.board_name || "");
      return `In store${loc ? ` \u00B7 ${loc}` : ""}`;
    }
    case "store_stock_increase": {
      const loc = cleanCountyName(drop.store_address || drop.board_name || "");
      return `Restocked${loc ? ` \u00B7 ${loc}` : ""}`;
    }
    case "allocation_assigned": {
      return "Allocated to a location";
    }
    case "in_stock": {
      // PA store-level event
      if (drop.counties.length > 1) {
        return `\u2192 ${drop.counties.length} PA stores`;
      }
      if (drop.counties.length === 1) {
        return `\u2192 ${drop.counties[0]}, PA`;
      }
      return "\u2192 PA stores";
    }
    case "new_allocation": {
      return "New allocation posted";
    }
    case "restock": {
      const loc = drop.counties[0] || (drop.board_name ?? "");
      return `Restocked${loc ? ` \u00B7 ${loc}` : ""}`;
    }
    default:
      return drop.event_type;
  }
}

export const TIER_CONFIG: Record<string, { label: string; borderColor: string; pillStyle: React.CSSProperties }> = {
  unicorn: {
    label: "UNICORN",
    borderColor: "#C4943A",
    pillStyle: {
      background: "linear-gradient(135deg, #C4943A 0%, #E8C97A 50%, #C4943A 100%)",
      backgroundSize: "200% 200%",
      animation: "shimmer 2s ease infinite",
      color: "#0D0B07",
      fontFamily: "var(--font-dm-sans)",
      fontSize: "9px",
      fontWeight: 700,
      textTransform: "uppercase" as const,
      letterSpacing: "0.1em",
      padding: "3px 10px",
      borderRadius: "12px",
      whiteSpace: "nowrap" as const,
    },
  },
  allocated: {
    label: "ALLOCATED",
    borderColor: "#B87333",
    pillStyle: {
      background: "rgba(184,115,51,0.15)",
      border: "1px solid rgba(184,115,51,0.3)",
      color: "#B87333",
      fontFamily: "var(--font-dm-sans)",
      fontSize: "9px",
      fontWeight: 700,
      textTransform: "uppercase" as const,
      letterSpacing: "0.1em",
      padding: "3px 10px",
      borderRadius: "12px",
      whiteSpace: "nowrap" as const,
    },
  },
  limited: {
    label: "LIMITED",
    borderColor: "#8A8A8A",
    pillStyle: {
      background: "rgba(138,138,138,0.12)",
      border: "1px solid rgba(138,138,138,0.25)",
      color: "#8A8A8A",
      fontFamily: "var(--font-dm-sans)",
      fontSize: "9px",
      fontWeight: 700,
      textTransform: "uppercase" as const,
      letterSpacing: "0.1em",
      padding: "3px 10px",
      borderRadius: "12px",
      whiteSpace: "nowrap" as const,
    },
  },
};

export const MULTIPLIER_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  unicorn: { bg: "rgba(196,148,58,0.15)", color: "#C4943A", border: "rgba(196,148,58,0.3)" },
  allocated: { bg: "rgba(184,115,51,0.15)", color: "#B87333", border: "rgba(184,115,51,0.3)" },
  limited: { bg: "rgba(138,138,138,0.12)", color: "#8A8A8A", border: "rgba(138,138,138,0.25)" },
};

export function lookupPricing(
  displayName: string,
  apiRetailPrice?: number
): { msrp?: number; secondary?: string; multiplier?: number } {
  // Lazy import to avoid circular dependencies at module level
  const { BOTTLE_PRICING } = require("@/data/bottles");
  const normalized = displayName.toLowerCase().trim();

  let match: { msrp: number; secondary?: string; secondaryLow?: number } | undefined;
  if (BOTTLE_PRICING[normalized]) {
    match = BOTTLE_PRICING[normalized];
  } else {
    for (const [key, value] of Object.entries(BOTTLE_PRICING)) {
      if (normalized.includes(key) || key.includes(normalized)) {
        match = value as typeof match;
        break;
      }
    }
  }

  const msrp = match?.msrp || (apiRetailPrice && apiRetailPrice > 0 ? apiRetailPrice : undefined);
  const secondary = match?.secondary;
  let multiplier: number | undefined;

  if (match?.secondaryLow && msrp && msrp > 0) {
    const mult = Math.round(match.secondaryLow / msrp);
    if (mult >= 2) multiplier = mult;
  }

  return { msrp, secondary, multiplier };
}

/** Generate a URL-safe bottle ID from a display name for cross-page linking */
export function bottleIdFromName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
