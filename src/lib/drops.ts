export interface DropEvent {
  timestamp: string;
  event_type: string;
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
  state?: string;
  id: string;
  locations: DropLocation[];
}

function isRealDropEvent(event: DropEvent): boolean {
  const eventType = (event.event_type || '').toLowerCase();
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
  if (eventType === 'new_allocation') return false;
  if (eventType === 'allocation_assigned') return false;
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

export function cleanCountyName(board: string): string {
  if (!board || board === "__EMPTY") return "";
  return board
    .replace(/\bABC\b/gi, "")
    .replace(/\bBoard\b/gi, "")
    .replace(/\bCounty\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function groupDrops(drops: DropEvent[], limit: number = 20): GroupedDrop[] {
  const SIX_HOURS = 6 * 60 * 60 * 1000;
  const groups: Map<string, GroupedDrop> = new Map();

  const getLocation = (ev: DropEvent): DropLocation | null => {
    const city = ev.store_city?.trim();
    const address = ev.store_address?.trim();
    const boardName = cleanCountyName(ev.board_name || "");
    const quantity = ev.quantity_in_stock ?? ev.quantity_shipped ?? ev.quantity;

    const primaryLabel = city
      ? (ev.store_county ? `${city} (${ev.store_county} Co.)` : city)
      : boardName || address;

    if (!primaryLabel) return null;

    return {
      label: primaryLabel,
      city,
      address,
      boardName: boardName || ev.board_name,
      quantity: quantity && quantity > 0 ? quantity : undefined,
    };
  };

  for (const event of drops) {
    if (!isRealDropEvent(event)) continue;
    const displayName = getDisplayName(event);
    if (displayName === "Unknown Bottle") continue;

    const ts = new Date(event.timestamp).getTime();
    const bucket = Math.floor(ts / SIX_HOURS);
    const groupKey = `${displayName.toLowerCase()}|${event.event_type}|${bucket}`;

    const existing = groups.get(groupKey);
    const location = getLocation(event);

    if (existing) {
      if (location && !existing.locations.some((loc) => loc.label === location.label && loc.address === location.address)) {
        existing.locations.push(location);
      }
      if (location && !existing.counties.includes(location.label)) {
        existing.counties.push(location.label);
      }
      if (event.timestamp > existing.timestamp) {
        existing.timestamp = event.timestamp;
      }
      if (event.quantity_shipped) {
        existing.quantity_shipped = (existing.quantity_shipped || 0) + event.quantity_shipped;
      }
      if (event.quantity_in_stock) {
        existing.quantity_shipped = (existing.quantity_shipped || 0) + event.quantity_in_stock;
      }
      const rarityOrder: Record<string, number> = { unicorn: 3, allocated: 2, limited: 1 };
      if ((rarityOrder[event.rarity_tier] || 0) > (rarityOrder[existing.rarity_tier] || 0)) {
        existing.rarity_tier = event.rarity_tier;
      }
      if (event.retail_price && !existing.retail_price) {
        existing.retail_price = event.retail_price;
      }
    } else {
      groups.set(groupKey, {
        displayName,
        event_type: event.event_type,
        rarity_tier: event.rarity_tier,
        timestamp: event.timestamp,
        counties: location ? [location.label] : [],
        board_name: event.board_name || event.store_city,
        store_address: event.store_address,
        retail_price: event.retail_price,
        quantity_shipped: event.quantity_shipped ?? event.quantity_in_stock,
        state: event.state || (event.state_code === 'PA' ? 'PA' : undefined),
        id: groupKey,
        locations: location ? [location] : [],
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
