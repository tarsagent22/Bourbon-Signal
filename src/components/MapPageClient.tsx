"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Search, MapPin, Sparkles, Warehouse, ChevronRight } from "lucide-react";
import { useStores } from "@/hooks/useStores";
import { useBottles } from "@/hooks/useBottles";
import { useDrops } from "@/hooks/useDrops";
import { useWatchlistStore } from "@/lib/watchlist";
import type { Bottle } from "@/data/bottles";
import type { Store } from "@/hooks/useStores";
import type { DropEvent } from "@/lib/drops";
import { formatRelativeTime, getDisplayName } from "@/lib/drops";
import { canonicalBottleKey, candidateBottleKeys, dropMatchesBottle } from "@/lib/bottleIdentity";
import { getRotatingBottleSuggestions } from "@/lib/bottleSuggestions";
import { AVAILABLE_STATES, ENGINE_COVERED_STATE_CODES } from "@/lib/statePreferences";

type FinderMode = "bottle" | "store";
type FinderState = string;

const FINDER_MARKET_CODES = new Set<string>(ENGINE_COVERED_STATE_CODES);
const FINDER_MARKET_PRIORITY = ["NC", "VA", "PA", "OH", "IA", "IN", "AL"];

const tierStyles: Record<string, { label: string; color: string; glow: string }> = {
  unicorn: {
    label: "Unicorn",
    color: "#F2C14E",
    glow: "rgba(242, 193, 78, 0.22)",
  },
  allocated: {
    label: "Allocated",
    color: "#D4920B",
    glow: "rgba(212, 146, 11, 0.2)",
  },
  limited: {
    label: "Limited",
    color: "#8A8078",
    glow: "rgba(138, 128, 120, 0.16)",
  },
};

function formatPrice(value?: number | null) {
  if (!value || Number.isNaN(value)) return "MSRP unavailable";
  return `$${Math.round(value)}`;
}

function normalize(value?: string | null) {
  return (value || "").toLowerCase().trim();
}

function stripBottleName(value?: string | null) {
  return normalize(value)
    .replace(/\s+/g, " ")
    .trim();
}

function isWithinLastDays(timestamp?: string, days: number = 30) {
  if (!timestamp) return false;
  const ts = new Date(timestamp).getTime();
  if (Number.isNaN(ts)) return false;
  return Date.now() - ts <= days * 24 * 60 * 60 * 1000;
}

function getBottleCanonicalKeys(selectedBottle: Bottle) {
  const values = [
    selectedBottle.name,
    selectedBottle.canonical_name,
    selectedBottle.canonical_id,
    selectedBottle.canonical_key,
    ...(selectedBottle.aliases || []),
    ...(selectedBottle.search_aliases || []),
    ...Object.values(selectedBottle.state_aliases || {}).flat(),
  ].filter(Boolean);

  if (selectedBottle.name === "Blanton's") {
    values.push("Blanton's Bourbon", "Blanton's Single Barrel");
  }

  if (selectedBottle.name === "Buffalo Trace") {
    values.push("Buffalo Trace Bourbon", "Buffalo Trace Bourbon Whiskey", "Buffalo Trace Liter", "Buffalo Trace 1L");
  }

  if (selectedBottle.name === "Eagle Rare") {
    values.push("Eagle Rare 10 Year", "Eagle Rare 10Y");
  }

  if (selectedBottle.name === "E.H. Taylor Small Batch") {
    values.push("EH Taylor Small Batch", "E.H. Taylor Small Batch Bourbon");
  }

  return Array.from(
    new Set(
      values.flatMap((value) => {
        const raw = String(value);
        return [canonicalBottleKey(raw), ...candidateBottleKeys(raw)].filter(Boolean);
      })
    )
  );
}

function bottleMatchesQuery(candidate: string, selectedBottle: Bottle) {
  const candidateNorm = stripBottleName(candidate);
  const aliases = getBottleCanonicalKeys(selectedBottle);
  return aliases.some((alias) => alias && (candidateNorm.includes(alias) || alias.includes(candidateNorm)));
}

function dropMatchesCanonicalBottle(drop: DropEvent, selectedBottle: Bottle) {
  const dropValues = [drop.brand_name, drop.tracked_brand_name, getDisplayName(drop)].filter(Boolean);
  const dropKeys = new Set(
    dropValues.flatMap((value) => {
      const raw = String(value);
      return [canonicalBottleKey(raw), ...candidateBottleKeys(raw)].filter(Boolean);
    })
  );
  const bottleKeys = new Set(getBottleCanonicalKeys(selectedBottle));
  for (const key of dropKeys) {
    if (bottleKeys.has(key)) return true;
  }
  return false;
}

function getStoreLookupKeys(store: Store) {
  return [
    store.name,
    store.displayLabel,
    store.district,
    store.city,
    store.county,
    store.address,
  ]
    .filter(Boolean)
    .map((value) => normalize(value));
}

function normalizeLocationFingerprint(value?: string | null) {
  return normalize(value).replace(/[^a-z0-9]+/g, "");
}

function storeNumber(value?: string | null) {
  return normalize(value).match(/(?:store|#)\s*(\d{2,5})/)?.[1] || null;
}

function dropMatchesExactSelectedStore(drop: DropEvent, store: Store) {
  if (store.precision === "board") return matchesStore(drop, store);

  const selectedAddress = normalizeLocationFingerprint(store.address);
  const selectedName = normalizeLocationFingerprint(store.name || store.displayLabel);
  const selectedNumber = storeNumber(store.name || store.displayLabel);
  const dropAddresses = [drop.store_address, ...(drop.stores || []).map((entry) => entry.store_address)].map(normalizeLocationFingerprint).filter(Boolean);
  const dropNames = [drop.store_name].map(normalizeLocationFingerprint).filter(Boolean);
  const dropNumbers = [drop.store_name].map(storeNumber).filter(Boolean);

  if (selectedAddress && dropAddresses.some((candidate) => candidate === selectedAddress || candidate.includes(selectedAddress) || selectedAddress.includes(candidate))) return true;
  if (selectedNumber && dropNumbers.includes(selectedNumber)) return true;
  if (selectedName && dropNames.some((candidate) => candidate === selectedName || candidate.includes(selectedName) || selectedName.includes(candidate))) return true;

  return false;
}

function matchesStore(drop: DropEvent, store: Store) {
  const boardName = normalize(drop.board_name);
  const storeName = normalize(drop.store_name);
  const storeAddress = normalize(drop.store_address);
  const storeCity = normalize(drop.store_city);
  const storeCounty = normalize(drop.store_county);
  const nestedAddresses = (drop.stores || []).map((entry) => normalize(entry.store_address));
  const nestedCities = (drop.stores || []).map((entry) => normalize(entry.city));
  const keys = getStoreLookupKeys(store);

  return keys.some((key) =>
    key &&
    [boardName, storeName, storeAddress, storeCity, storeCounty, ...nestedAddresses, ...nestedCities].some((candidate) =>
      candidate ? candidate.includes(key) || key.includes(candidate) : false
    )
  );
}

function getDropLocations(drop: DropEvent) {
  const locations: Array<{ label: string; detail: string; precision: "store" | "board"; confidence: number }> = [];

  if (drop.board_name) {
    const boardLead = drop.board_name;
    locations.push({
      label: boardLead,
      detail: `Board shipment lead${drop.state ? ` · ${drop.state}` : ""}`,
      precision: "board",
      confidence: 2,
    });
  }

  if (drop.store_name || drop.store_address || drop.store_city) {
    locations.push({
      label: drop.store_name || drop.store_city || "Store drop",
      detail: drop.store_address || [drop.store_city, drop.store_county].filter(Boolean).join(", ") || "Store-level bottle drop",
      precision: "store",
      confidence: drop.store_address ? 4 : 3,
    });
  }

  for (const entry of drop.stores || []) {
    const label = entry.store_address || entry.city;
    if (!label) continue;
    locations.push({
      label,
      detail: entry.store_address ? `${entry.city || "Store"} bottle drop` : `${entry.city || "Board"} shipment lead`,
      precision: entry.store_address ? "store" : "board",
      confidence: entry.store_address ? 5 : 2,
    });
  }

  return locations;
}

function getSignalQuality(drop: DropEvent) {
  if (drop.can_alert_as_inventory || drop.exact_store || drop.location_precision === "store_level" || drop.availability_scope === "exact") {
    return { label: "Store-level source report", score: 4 };
  }
  if (drop.state === "KY" || drop.state_code === "KY") {
    const scope = String(drop.availability_scope || "");
    const confidence = String(drop.confidence_tier || "");
    if (confidence === "exact_today_distillery") return { label: "Official distillery today", score: 3 };
    if (confidence === "official_release_live") return { label: "Official release live", score: 3 };
    if (confidence === "official_window_open" || scope === "release_window") return { label: "Official pickup window", score: 2 };
    if (confidence === "official_announcement") return { label: "Official announcement", score: 2 };
    return { label: "Distillery release", score: 2 };
  }
  if (drop.store_address) return { label: "Store-level source report", score: 3 };
  if (drop.stores && drop.stores.some((entry) => entry.store_address)) return { label: "Multi-store source report", score: 3 };
  if (drop.board_name) return { label: "Board shipment lead", score: 2 };
  return { label: "Bottle movement", score: 1 };
}

function getTrustBadge(drop?: DropEvent | null) {
  if (!drop) return { label: "Verifying", detail: "No current evidence yet", tone: "muted" as const };
  if (drop.can_alert_as_inventory || drop.exact_store || drop.location_precision === "store_level" || drop.availability_scope === "exact") {
    return { label: "Source-reported", detail: "Store-level source signal — verify before driving", tone: "exact" as const };
  }
  if (drop.state === "KY" || drop.state_code === "KY" || String(drop.confidence_tier || "").startsWith("official")) {
    return { label: "Official", detail: "Source-confirmed bottle release", tone: "official" as const };
  }
  return { label: "Positive", detail: "Bottle drop or shipment evidence", tone: "positive" as const };
}

function formatFreshness(timestamp?: string | null) {
  if (!timestamp) return "No recent drops";
  return `Last reported ${formatRelativeTime(timestamp)}`;
}

function getDropKey(drop: DropEvent, index: number = 0) {
  return [drop.brand_name, drop.tracked_brand_name, drop.timestamp, drop.store_name, drop.store_address, drop.board_name, index].filter(Boolean).join("|");
}

function getStateName(code?: string | null) {
  return AVAILABLE_STATES.find((state) => state.code === code)?.name || code || "State";
}

function getBottleAmount(drop: DropEvent) {
  const quantity = drop.quantity_shipped ?? drop.quantity_in_stock ?? drop.quantity;
  if (typeof quantity !== "number" || !Number.isFinite(quantity) || quantity <= 0) return "Bottle drop";
  return `${quantity} bottle${quantity === 1 ? "" : "s"}`;
}

function getShortLocation(drop: DropEvent, fallback: string) {
  const city = drop.store_city || drop.store_county || drop.board_name;
  const state = drop.state || drop.state_code;
  return [city, state].filter(Boolean).join(", ") || fallback;
}

function getHumanSignalDetail(drop: DropEvent) {
  const state = drop.state || drop.state_code;
  const amount = getBottleAmount(drop);

  if (state === "VA") {
    return `${amount} shown in Virginia ABC inventory.`;
  }

  if (state === "IA") {
    return `${amount} in Iowa store delivery data.`;
  }

  if (state === "PA") {
    return `${amount} matched in Pennsylvania availability data.`;
  }

  if (state === "KY") {
    return "Official Kentucky bottle release.";
  }

  if (drop.can_alert_as_inventory || drop.exact_store || drop.location_precision === "store_level" || drop.availability_scope === "exact") {
    return `${amount} matched at this location.`;
  }

  return "Recent bottle shipment or drop for this area.";
}

function formatFinderStoreAddress(store?: Pick<Store, "address" | "city" | "state" | "zip" | "precision"> | null) {
  if (!store || store.precision === "board") return null;
  const address = store.address?.trim();
  const cityState = [store.city, store.state].filter(Boolean).join(", ");
  if (!address) return cityState || null;
  if (cityState && !address.toLowerCase().includes(cityState.toLowerCase())) return `${address} · ${cityState}`;
  return address;
}

function isStoreLocatorOnly(store: Pick<Store, "inventoryCapability" | "collectorAttached" | "hasSignals" | "bottle_count" | "signalCount">) {
  const capability = normalize(store.inventoryCapability);
  const signalCount = store.signalCount ?? store.bottle_count ?? 0;
  return capability.includes("locator_only") && !store.collectorAttached && !store.hasSignals && signalCount <= 0;
}

function shouldShowInFinderLocationSearch(store: Store) {
  const signalCount = store.signalCount ?? store.bottle_count ?? 0;
  if (store.hasSignals || signalCount > 0) return true;
  if (isStoreLocatorOnly(store)) return false;
  return store.precision === "store" && store.collectorAttached === true;
}

function getLocationSuggestionStatus(store: Store) {
  const signalCount = store.signalCount ?? store.bottle_count ?? 0;
  if (store.precision === "board" && signalCount > 0) {
    return `${signalCount} board shipment${signalCount === 1 ? "" : "s"}`;
  }
  if (store.hasSignals || signalCount > 0) {
    return `${signalCount} bottle drop${signalCount === 1 ? "" : "s"}`;
  }
  if (store.precision === "board") return "no recent shipments";
  return "no recent drops";
}

function getLocationCoverageCopy(store: Store, bestSignal?: DropEvent | null) {
  const signalCount = store.signalCount ?? store.bottle_count ?? 0;
  if (store.precision === "board") {
    return store.hasSignals || signalCount > 0
      ? "Board-level bottle shipments are available here. Individual ABC-store bottle drops are not currently tracked on this board."
      : "No recent bottle shipments are available for this board yet.";
  }

  if (store.hasSignals || bestSignal) {
    return "This view ranks recent bottle drops or shipments tied to this store.";
  }

  return "No recent bottle drops are available for this location yet.";
}

function extractStoreAddressParts(address?: string | null) {
  if (!address) return { line1: null as string | null, locality: null as string | null };
  const trimmed = address.trim().replace(/\s+/g, " ");
  const zipMatch = trimmed.match(/^(.*?)([A-Za-z .'-]+,\s*[A-Z]{2}\s*\d{5})$/);
  if (zipMatch) {
    return {
      line1: zipMatch[1].trim().replace(/\s+(?=[A-Za-z])/g, " "),
      locality: zipMatch[2].trim(),
    };
  }
  const parts = trimmed.split(",");
  if (parts.length >= 2) {
    return {
      line1: parts[0].trim(),
      locality: parts.slice(1).join(",").trim(),
    };
  }
  return { line1: trimmed, locality: null };
}

function summarizeDropLocation(drop: DropEvent) {
  const nestedStore = (drop.stores || []).find((entry) => entry.store_address || entry.city);

  if (drop.state === "KY" || drop.state_code === "KY") {
    const venue = drop.store_name || drop.store_city || "Kentucky distillery";
    const scope = String(drop.availability_scope || "");
    const program = (drop as any).program_name as string | undefined;
    const detail = [
      program,
      scope === "release_window"
        ? "Pickup or entry window"
        : scope === "distillery"
          ? "Available at distillery"
          : scope === "announcement"
            ? "Official release notice"
            : scope === "venue"
              ? "Venue notice"
              : "Kentucky bottle release",
      drop.state || drop.state_code,
    ].filter(Boolean).join(" · ");
    return {
      title: venue,
      detail,
    };
  }

  if (drop.store_name || drop.store_address || drop.store_city) {
    const addressParts = extractStoreAddressParts(drop.store_address);
    return {
      title: drop.store_name || addressParts.line1 || drop.store_city || "Store inventory hit",
      detail:
        drop.store_address ||
        [addressParts.locality, drop.store_city, drop.state || drop.state_code]
          .filter(Boolean)
          .join(" · ") || "Store-level bottle drop",
    };
  }

  if (nestedStore?.store_address) {
    const addressParts = extractStoreAddressParts(nestedStore.store_address);
    return {
      title: addressParts.line1 || (nestedStore.city ? `${nestedStore.city} store cluster` : "Store inventory hit"),
      detail:
        nestedStore.store_address ||
        [addressParts.locality, nestedStore.city, drop.state || drop.state_code]
          .filter(Boolean)
          .join(" · "),
    };
  }

  if (drop.board_name) {
    return {
      title: drop.board_name,
      detail: `Board shipment lead${drop.state || drop.state_code ? ` · ${drop.state || drop.state_code}` : ""}`,
    };
  }

  return {
    title: getDisplayName(drop),
    detail: drop.event_type.replaceAll("_", " "),
  };
}

function FinderBottleCard({
  bottle,
  active,
  onClick,
  reduceMotion,
}: {
  bottle: Bottle;
  active: boolean;
  onClick: () => void;
  reduceMotion: boolean;
}) {
  const tier = tierStyles[bottle.tier] ?? tierStyles.limited;

  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={reduceMotion ? undefined : { y: -3, scale: 1.01 }}
      whileTap={reduceMotion ? undefined : { scale: 0.99 }}
      style={{
        textAlign: "left",
        width: "100%",
        padding: "18px 18px 16px",
        borderRadius: 24,
        border: active
          ? `1px solid ${tier.color}`
          : "1px solid rgba(247, 240, 224, 0.08)",
        background: active
          ? `linear-gradient(180deg, rgba(34, 24, 15, 0.96) 0%, rgba(24, 18, 11, 0.98) 100%)`
          : "linear-gradient(180deg, rgba(24, 18, 11, 0.92) 0%, rgba(17, 13, 8, 0.96) 100%)",
        boxShadow: active
          ? `0 0 0 1px ${tier.glow}, 0 24px 60px rgba(0,0,0,0.34)`
          : "0 14px 36px rgba(0,0,0,0.26)",
        cursor: "pointer",
        transition: "border-color 220ms ease, box-shadow 220ms ease, transform 220ms ease",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
        <div>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 10px",
              borderRadius: 999,
              background: tier.glow,
              border: `1px solid ${tier.glow}`,
              color: tier.color,
              fontFamily: "var(--font-dm-sans)",
              fontSize: 11,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              marginBottom: 12,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: 999,
                background: tier.color,
                boxShadow: `0 0 12px ${tier.glow}`,
              }}
            />
            {tier.label}
          </div>
          <h3
            style={{
              fontFamily: "var(--font-playfair)",
              fontSize: "clamp(1.05rem, 2vw, 1.35rem)",
              lineHeight: 1.1,
              color: "var(--color-text-primary)",
            }}
          >
            {bottle.name}
          </h3>
          <p
            style={{
              marginTop: 6,
              color: "var(--color-text-secondary)",
              fontFamily: "var(--font-dm-sans)",
              fontSize: 14,
            }}
          >
            {bottle.distillery || "Distillery unavailable"}
          </p>
        </div>
        <ChevronRight size={18} color={active ? tier.color : "var(--color-text-tertiary)"} />
      </div>

      <div
        style={{
          marginTop: 16,
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: 10,
        }}
      >
        <div>
          <div className="finder-eyebrow">MSRP</div>
          <div className="finder-stat">{formatPrice(bottle.msrp)}</div>
        </div>
        <div>
          <div className="finder-eyebrow">Drops</div>
          <div className="finder-stat">{bottle.actionable_count_30d ?? 0}/30d</div>
        </div>
        <div>
          <div className="finder-eyebrow">State</div>
          <div className="finder-stat">{bottle.states?.join(", ") || bottle.state || "Multi"}</div>
        </div>
      </div>
    </motion.button>
  );
}

function FinderStoreCard({
  store,
  active,
  onClick,
  reduceMotion,
}: {
  store: Store;
  active: boolean;
  onClick: () => void;
  reduceMotion: boolean;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={reduceMotion ? undefined : { y: -3, scale: 1.01 }}
      whileTap={reduceMotion ? undefined : { scale: 0.99 }}
      style={{
        textAlign: "left",
        width: "100%",
        padding: "18px 18px 16px",
        borderRadius: 24,
        border: active
          ? "1px solid rgba(212, 146, 11, 0.8)"
          : "1px solid rgba(247, 240, 224, 0.08)",
        background: active
          ? "linear-gradient(180deg, rgba(34, 24, 15, 0.96) 0%, rgba(24, 18, 11, 0.98) 100%)"
          : "linear-gradient(180deg, rgba(24, 18, 11, 0.92) 0%, rgba(17, 13, 8, 0.96) 100%)",
        boxShadow: active
          ? "0 0 0 1px rgba(212,146,11,0.18), 0 24px 60px rgba(0,0,0,0.34)"
          : "0 14px 36px rgba(0,0,0,0.26)",
        cursor: "pointer",
        transition: "border-color 220ms ease, box-shadow 220ms ease, transform 220ms ease",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
        <div>
          <div className="finder-mode-pill">{store.precision === "board" ? "Board view" : "Store view"}</div>
          <h3
            style={{
              marginTop: 12,
              fontFamily: "var(--font-playfair)",
              fontSize: "clamp(1rem, 2vw, 1.25rem)",
              lineHeight: 1.15,
              color: "var(--color-text-primary)",
            }}
          >
            {store.displayLabel}
          </h3>
          <p
            style={{
              marginTop: 8,
              color: "var(--color-text-secondary)",
              fontFamily: "var(--font-dm-sans)",
              fontSize: 14,
            }}
          >
            {store.precision === "board"
              ? [store.county || store.city, store.state].filter(Boolean).join(", ")
              : [store.city, store.state].filter(Boolean).join(", ")}
            {store.precision !== "board" && store.address ? ` · ${store.address}` : ""}
          </p>
        </div>
        <ChevronRight size={18} color={active ? "var(--color-accent-amber)" : "var(--color-text-tertiary)"} />
      </div>

      <div
        style={{
          marginTop: 16,
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: 10,
        }}
      >
        <div>
          <div className="finder-eyebrow">State</div>
          <div className="finder-stat">{store.state}</div>
        </div>
        <div>
          <div className="finder-eyebrow">Drops/shipments</div>
          <div className="finder-stat">{store.bottle_count ?? 0}</div>
        </div>
      </div>
    </motion.button>
  );
}

export default function MapPageClient() {
  const reduceMotion = useReducedMotion();
  const { stores, loading: storesLoading } = useStores();
  const { bottles, loading: bottlesLoading } = useBottles();
  const { drops, loading: dropsLoading } = useDrops({ limit: 120 });
  const watchlist = useWatchlistStore((state) => state.watchedBottles);
  const huntTargets = useWatchlistStore((state) => state.huntTargets);
  const addBottle = useWatchlistStore((state) => state.addBottle);
  const removeBottle = useWatchlistStore((state) => state.removeBottle);
  const [mode, setMode] = useState<FinderMode>("bottle");
  const [stateFilter, setStateFilter] = useState<FinderState>("ALL");
  const [query, setQuery] = useState("");
  const [selectedBottleId, setSelectedBottleId] = useState<string | null>(null);
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionSeed, setSuggestionSeed] = useState(() => Math.floor(Date.now() / (1000 * 60 * 30)));
  const [historyOffset, setHistoryOffset] = useState(0);
  const [historyQuery, setHistoryQuery] = useState<{ bottle?: string; store?: string; state?: string }>({});
  const [selectedSignalKey, setSelectedSignalKey] = useState<string | null>(null);
  const searchRegionRef = useRef<HTMLDivElement | null>(null);

  const {
    drops: historyDrops,
    loading: historyLoading,
    total: historyTotal,
    hasMore: historyHasMore,
  } = useDrops({
    limit: 200,
    offset: historyOffset,
    bottle: historyQuery.bottle,
    store: historyQuery.store,
    state: historyQuery.state,
  });

  const ready = useMemo(
    () => !storesLoading && !bottlesLoading && !dropsLoading,
    [storesLoading, bottlesLoading, dropsLoading]
  );

  const stateOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const drop of drops) {
      const state = drop.state || drop.state_code;
      if (state) counts.set(state, (counts.get(state) || 0) + 1);
    }
    for (const bottle of bottles) for (const state of bottle.states || (bottle.state ? [bottle.state] : [])) counts.set(state, counts.get(state) || 0);
    for (const store of stores) if (store.state) counts.set(store.state, (counts.get(store.state) || 0) + 1);

    const activeStates = AVAILABLE_STATES
      .filter((state) => state.active && FINDER_MARKET_CODES.has(state.code))
      .map((state) => ({ code: state.code, name: state.name, count: counts.get(state.code) || 0 }))
      .sort((a, b) => {
        const priorityDelta = FINDER_MARKET_PRIORITY.indexOf(a.code) - FINDER_MARKET_PRIORITY.indexOf(b.code);
        if (priorityDelta !== 0) return priorityDelta;
        return (b.count - a.count) || a.name.localeCompare(b.name);
      });

    return [
      { code: "ALL", name: "All covered states", count: drops.length },
      ...activeStates,
    ];
  }, [bottles, drops, stores]);

  const filteredBottles = useMemo(() => {
    const q = normalize(query);
    return bottles
      .filter((bottle) => stateFilter === "ALL" || bottle.state === stateFilter || bottle.states?.includes(stateFilter))
      .filter((bottle) => {
        if (!q) return true;
        return [
          bottle.name,
          bottle.canonical_name,
          bottle.distillery,
          bottle.tier,
          bottle.state,
          ...(bottle.search_aliases || []),
          ...Object.values(bottle.state_aliases || {}).flat(),
          ...getBottleCanonicalKeys(bottle),
        ]
          .filter(Boolean)
          .some((value) => normalize(String(value)).includes(q));
      })
      .sort((a, b) => {
        const aScore = (a.actionable_count_30d ?? 0) * 3 + (a.drop_count_30d ?? 0) + (a.tier === "unicorn" ? 50 : a.tier === "allocated" ? 25 : 10);
        const bScore = (b.actionable_count_30d ?? 0) * 3 + (b.drop_count_30d ?? 0) + (b.tier === "unicorn" ? 50 : b.tier === "allocated" ? 25 : 10);
        return bScore - aScore;
      });
  }, [bottles, query, stateFilter]);

  const filteredStores = useMemo(() => {
    const q = normalize(query);
    return stores
      .filter((store) => stateFilter === "ALL" || store.state === stateFilter)
      .filter((store) => {
        if (!q) return true;
        return getStoreLookupKeys(store).some((value) => value.includes(q));
      })
      .sort((a, b) => (b.bottle_count ?? 0) - (a.bottle_count ?? 0));
  }, [stores, query, stateFilter]);

  const finderLocations = useMemo(
    () => filteredStores.filter((store) => shouldShowInFinderLocationSearch(store)),
    [filteredStores]
  );

  const selectedBottle = useMemo(() => {
    if (!filteredBottles.length) return null;
    return filteredBottles.find((bottle) => bottle.id === selectedBottleId) ?? filteredBottles[0];
  }, [filteredBottles, selectedBottleId]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const bottleParam = params.get("bottle") || "";
    const stateParam = params.get("state")?.toUpperCase();
    if (bottleParam) {
      setMode("bottle");
      setQuery(bottleParam);
      setShowSuggestions(false);
    }
    if (stateParam && (stateParam === "ALL" || FINDER_MARKET_CODES.has(stateParam))) {
      setStateFilter(stateParam as FinderState);
    }
  }, []);

  useEffect(() => {
    if (!stateOptions.length) return;
    if (stateFilter === "ALL") return;
    if (stateOptions.some((option) => option.code === stateFilter)) return;
    setStateFilter("ALL");
  }, [stateFilter, stateOptions]);

  useEffect(() => {
    if (mode !== "bottle") return;
    const q = normalize(query);
    if (q) {
      const match = filteredBottles.find((bottle) => {
        const haystack = [bottle.name, bottle.canonical_name, ...(bottle.search_aliases || [])]
          .filter(Boolean)
          .map((value) => normalize(String(value)));
        return haystack.some((value) => value.includes(q) || q.includes(value));
      });
      if (match && selectedBottleId !== match.id) setSelectedBottleId(match.id);
      return;
    }
    if (!selectedBottleId && filteredBottles[0]) {
      setSelectedBottleId(filteredBottles[0].id);
    }
  }, [mode, filteredBottles, query, selectedBottleId]);

  const selectedStore = useMemo(() => {
    if (!selectedStoreId) return null;
    return finderLocations.find((store) => store.id === selectedStoreId) ?? null;
  }, [finderLocations, selectedStoreId]);

  useEffect(() => {
    setSelectedSignalKey(null);
    setHistoryOffset(0);
    if (selectedStoreId && selectedStore && stateFilter !== "ALL" && selectedStore.state !== stateFilter) {
      setSelectedStoreId(null);
      setQuery("");
    }
  }, [selectedStore?.state, selectedStoreId, stateFilter]);

  useEffect(() => {
    if (mode === "bottle" && selectedBottle) {
      setHistoryOffset(0);
      setHistoryQuery({
        bottle: selectedBottle.name,
        state: stateFilter === "ALL" ? undefined : stateFilter,
      });
    }
  }, [mode, selectedBottle, stateFilter]);

  useEffect(() => {
    if (mode === "store" && selectedStore) {
      setHistoryOffset(0);
      setHistoryQuery({
        store:
          selectedStore.precision === "board"
            ? selectedStore.displayLabel || selectedStore.name || selectedStore.county || selectedStore.city
            : selectedStore.address || selectedStore.displayLabel || selectedStore.name || selectedStore.city,
        state: stateFilter === "ALL" ? undefined : stateFilter,
      });
    }
  }, [mode, selectedStore, stateFilter]);

  const recommendedBottles = useMemo(() => {
    const pool = filteredBottles.filter((bottle) => {
      if (stateFilter === "ALL") return true;
      return bottle.state ? bottle.state === stateFilter : (bottle.states || []).includes(stateFilter);
    });

    const watched = pool.filter((bottle) => watchlist.includes(bottle.id));
    const hunted = pool.filter((bottle) => huntTargets.some((target) => target.bottleId === bottle.id && !watchlist.includes(bottle.id)));
    const rotatingSource = pool.filter((bottle) => !watchlist.includes(bottle.id) && !huntTargets.some((target) => target.bottleId === bottle.id));
    const rotating = getRotatingBottleSuggestions(rotatingSource.length ? rotatingSource : pool, suggestionSeed, 6);

    return Array.from(new Map([...watched, ...hunted, ...rotating].map((bottle) => [bottle.id, bottle])).values()).slice(0, 6);
  }, [filteredBottles, huntTargets, stateFilter, suggestionSeed, watchlist]);

  const bottleSuggestions = useMemo(() => {
    if (mode !== "bottle") return [] as Bottle[];
    const q = normalize(query);
    if (!q) return recommendedBottles;
    return filteredBottles
      .filter((bottle) => {
        const needle = stripBottleName(q);
        const haystack = [
          bottle.name,
          bottle.canonical_name,
          bottle.distillery,
          ...(bottle.search_aliases || []),
          ...Object.values(bottle.state_aliases || {}).flat(),
        ]
          .filter(Boolean)
          .map((value) => stripBottleName(String(value)));
        return haystack.some((value) => value.includes(needle) || needle.includes(value));
      })
      .slice(0, 8);
  }, [filteredBottles, mode, query, recommendedBottles]);

  const locationSuggestions = useMemo(() => {
    if (mode !== "store") return [] as Store[];
    const q = normalize(query);
    const source = q
      ? finderLocations.filter((store) => getStoreLookupKeys(store).some((value) => value.includes(q) || q.includes(value)))
      : finderLocations;
    const unique = new Map<string, Store>();
    for (const store of source) {
      const key = normalize([store.displayLabel || store.name, store.state, store.precision].filter(Boolean).join("|"));
      const existing = unique.get(key);
      if (!existing || (store.bottle_count ?? 0) > (existing.bottle_count ?? 0)) unique.set(key, store);
    }

    return Array.from(unique.values())
      .sort((a, b) => {
        const signalDelta = Number(Boolean(b.hasSignals)) - Number(Boolean(a.hasSignals));
        if (signalDelta !== 0) return signalDelta;
        return (b.bottle_count ?? 0) - (a.bottle_count ?? 0);
      })
      .slice(0, q ? 8 : 4);
  }, [finderLocations, mode, query]);

  const bottleDrops = useMemo(() => {
    if (!selectedBottle) return [];
    const sourceDrops = historyQuery.bottle && historyDrops.length > 0 ? historyDrops : drops;
    return sourceDrops
      .filter((drop) => (stateFilter === "ALL" ? true : (drop.state || drop.state_code) === stateFilter))
      .filter((drop) => isWithinLastDays(drop.timestamp, 30))
      .filter((drop) => dropMatchesCanonicalBottle(drop, selectedBottle) || dropMatchesBottle(drop, selectedBottle) || bottleMatchesQuery(getDisplayName(drop), selectedBottle))
      .sort((a, b) => {
        const qa = getSignalQuality(a).score;
        const qb = getSignalQuality(b).score;
        if (qb !== qa) return qb - qa;
        return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
      })
      .slice(0, 40);
  }, [drops, historyDrops, historyQuery.bottle, selectedBottle, stateFilter]);

  const matchingStoresForBottle = useMemo(() => {
    if (!selectedBottle) return [] as Array<Store & { hitCount: number; lastSeen?: string; matchStrength: number }>;

    const scored = new Map<string, Store & { hitCount: number; lastSeen?: string; matchStrength: number }>();

    for (const store of finderLocations) {
      let hitCount = 0;
      let matchStrength = 0;
      let lastSeen: string | undefined;

      for (const drop of bottleDrops) {
        if (!matchesStore(drop, store)) continue;
        hitCount += 1;
        const locations = getDropLocations(drop);
        const localStrength = locations.reduce((best, location) => {
          const storeKeys = getStoreLookupKeys(store);
          const label = normalize(location.label);
          const detail = normalize(location.detail);
          const matched = storeKeys.some((key) => key && (label.includes(key) || key.includes(label) || detail.includes(key) || key.includes(detail)));
          return matched ? Math.max(best, location.confidence) : best;
        }, 1);
        matchStrength = Math.max(matchStrength, localStrength);
        if (!lastSeen || new Date(drop.timestamp).getTime() > new Date(lastSeen).getTime()) {
          lastSeen = drop.timestamp;
        }
      }

      if (hitCount > 0) {
        scored.set(store.id, {
          ...store,
          hitCount,
          lastSeen,
          matchStrength,
        });
      }
    }

    return Array.from(scored.values())
      .sort((a, b) => {
        if (b.matchStrength !== a.matchStrength) return b.matchStrength - a.matchStrength;
        if (b.hitCount !== a.hitCount) return b.hitCount - a.hitCount;
        return (b.bottle_count ?? 0) - (a.bottle_count ?? 0);
      })
      .slice(0, 8);
  }, [bottleDrops, finderLocations, selectedBottle]);

  const exactBottleSignals = useMemo(
    () => bottleDrops.filter((drop) => getSignalQuality(drop).score >= 3).slice(0, 3),
    [bottleDrops]
  );

  const broaderBottleSignals = useMemo(
    () => bottleDrops.filter((drop) => getSignalQuality(drop).score < 3).slice(0, 3),
    [bottleDrops]
  );

  const bottleLocationInsights = useMemo(() => {
    const exactStoreMatches = selectedBottle?.exact_store_hits_30d ?? matchingStoresForBottle.filter((store) => store.precision === "store").length;
    const boardMatches = selectedBottle?.board_leads_30d ?? matchingStoresForBottle.filter((store) => store.precision === "board").length;
    const actionableCount = selectedBottle?.actionable_count_30d ?? exactStoreMatches + boardMatches;
    const signalVolume = selectedBottle?.signal_volume_30d ?? bottleDrops.length;
    return {
      exactStoreMatches,
      boardMatches,
      actionableCount,
      signalVolume,
      freshestHit: bottleDrops[0]?.timestamp,
    };
  }, [matchingStoresForBottle, bottleDrops, selectedBottle]);

  const bestBottleSignal = bottleDrops[0] ?? null;
  const selectedBottleSignal = useMemo(() => {
    if (!bottleDrops.length) return null;
    if (selectedSignalKey) {
      const match = bottleDrops.find((drop, index) => getDropKey(drop, index) === selectedSignalKey);
      if (match) return match;
    }
    return bottleDrops[0];
  }, [bottleDrops, selectedSignalKey]);
  const selectedBottleSignalSummary = selectedBottleSignal ? summarizeDropLocation(selectedBottleSignal) : null;
  const bottleTrust = getTrustBadge(bestBottleSignal);

  const storeDrops = useMemo(() => {
    if (!selectedStore) return [];
    const sourceDrops = historyQuery.store && historyDrops.length > 0 ? historyDrops : drops;
    return sourceDrops
      .filter((drop) => (stateFilter === "ALL" ? true : (drop.state || drop.state_code) === stateFilter))
      .filter((drop) => dropMatchesExactSelectedStore(drop, selectedStore))
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, historyQuery.store ? 40 : 20);
  }, [drops, historyDrops, historyQuery.store, selectedStore, stateFilter]);

  const bestStoreSignal = storeDrops[0] ?? null;
  const storeTrust = getTrustBadge(bestStoreSignal);
  const selectedBottleWatched = selectedBottle ? watchlist.includes(selectedBottle.id) : false;
  const dashboardHref = "/dashboard";
  const selectedBottleSightingHref = selectedBottle ? `/sightings?bottle=${encodeURIComponent(selectedBottle.name)}&bottleId=${encodeURIComponent(selectedBottle.id)}${stateFilter !== "ALL" ? `&state=${encodeURIComponent(stateFilter)}` : ""}` : "/sightings";

  const summary = useMemo(() => {
    return {
      stores: filteredStores.length,
      bottles: filteredBottles.length,
      liveSignals: drops.length,
      watchlist: watchlist.length,
    };
  }, [filteredBottles.length, filteredStores.length, drops.length, watchlist.length]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!searchRegionRef.current?.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  const captureFinderSearch = (payload: { outcome: "matched" | "unmatched" | "selected"; matchedBottleId?: string | null; matchedBottleName?: string | null; resultCount?: number }) => {
    const trimmed = query.trim();
    if (trimmed.length < 2) return;
    fetch("/api/search-events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        surface: "finder",
        query: trimmed,
        state: stateFilter,
        mode,
        ...payload,
      }),
      keepalive: true,
    }).catch(() => {
      // Search capture is best-effort and should never affect Finder UX.
    });
  };

  const submitSearch = () => {
    if (mode === "bottle") {
      const match = bottleSuggestions[0] ?? filteredBottles[0];
      captureFinderSearch({
        outcome: match ? "matched" : "unmatched",
        matchedBottleId: match?.id ?? null,
        matchedBottleName: match?.name ?? null,
        resultCount: bottleSuggestions.length,
      });
      if (match) {
        setQuery(match.name);
        setSelectedBottleId(match.id);
      }
    } else {
      const match = locationSuggestions[0];
      captureFinderSearch({
        outcome: match ? "matched" : "unmatched",
        resultCount: locationSuggestions.length,
      });
      if (match) {
        setQuery(match.displayLabel ?? match.name ?? "");
        setSelectedStoreId(match.id);
      }
    }
    setShowSuggestions(false);
  };

  return (
    <section className="finder-shell">
      <div className="finder-hero-wrap">
        <motion.div
          initial={false}
          animate={{ opacity: 1, y: 0 }}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="finder-hero"
        >
          <div className="finder-hero-copy">
            <h1>Finder</h1>
            <p style={{ fontSize: "1.08rem", lineHeight: 1.7 }}>Choose your market, then search for a bottle or store. We’ll show what the signal means so you know whether it’s worth a trip, a call, or just keeping an eye on.</p>

            <div className="finder-tool-shell">
              <div className="finder-lens-row">
                <button
                  type="button"
                  className={`finder-lens ${mode === "bottle" ? "active" : ""}`}
                  onClick={() => {
                    setMode("bottle");
                    setQuery("");
                    setShowSuggestions(false);
                  }}
                >
                  <Sparkles size={15} />
                  Find a bottle
                </button>
                <button
                  type="button"
                  className={`finder-lens ${mode === "store" ? "active" : ""}`}
                  onClick={() => {
                    setMode("store");
                    setQuery("");
                    setSelectedStoreId(null);
                    setShowSuggestions(false);
                  }}
                >
                  <Warehouse size={15} />
                  Scan a location
                </button>
              </div>

              <div className="finder-search-region" ref={searchRegionRef}>
                <form
                  className="finder-search-wrap hero-search"
                  onSubmit={(e) => {
                    e.preventDefault();
                    submitSearch();
                  }}
                >
                  <Search size={16} color="var(--color-text-tertiary)" />
                  <input
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setShowSuggestions(true);
                    }}
                    onFocus={() => {
                      setSuggestionSeed((prev) => prev + 1);
                      setShowSuggestions(true);
                    }}
                    placeholder={mode === "bottle" ? "Search bottle or distiller" : "Search board, store, city, or county"}
                    className="finder-search-input"
                  />
                  {query ? (
                    <button
                      type="button"
                      className="finder-search-clear"
                      aria-label="Clear search"
                      onClick={() => {
                        setQuery("");
                        setSelectedBottleId(null);
                        setSelectedStoreId(null);
                        setSelectedSignalKey(null);
                        setShowSuggestions(true);
                      }}
                    >
                      ×
                    </button>
                  ) : null}
                  <button type="submit" className="finder-search-submit">
                    Search
                  </button>
                </form>

                {showSuggestions && mode === "bottle" && bottleSuggestions.length > 0 ? (
                  <div className="finder-suggestions">
                    {!normalize(query) ? <div className="finder-suggestion-label">Recommended bottles</div> : null}
                    {bottleSuggestions.map((bottle) => (
                      <button
                        key={bottle.id}
                        type="button"
                        className="finder-suggestion"
                        onClick={() => {
                          setQuery(bottle.name);
                          setSelectedBottleId(bottle.id);
                          setShowSuggestions(false);
                        }}
                      >
                        <div>
                          <strong>{bottle.name}</strong>
                          <span>{bottle.distillery || "Distillery unavailable"}</span>
                        </div>
                        <span className="finder-row-pill">Select</span>
                      </button>
                    ))}
                  </div>
                ) : null}

                {showSuggestions && mode === "store" && locationSuggestions.length > 0 ? (
                  <div className="finder-suggestions">
                    {!normalize(query) ? <div className="finder-suggestion-label">Recommended locations</div> : null}
                    {locationSuggestions.map((store) => (
                      <button
                        key={store.id}
                        type="button"
                        className="finder-suggestion"
                        onClick={() => {
                          setQuery(store.displayLabel ?? store.name ?? "");
                          setSelectedStoreId(store.id);
                          setShowSuggestions(false);
                        }}
                      >
                        <div>
                          <strong>{store.displayLabel || store.name}</strong>
                          <span>
                            {formatFinderStoreAddress(store) || (store.precision === "board"
                              ? [store.county || store.city, store.state].filter(Boolean).join(", ") || "Board"
                              : [store.city, store.state].filter(Boolean).join(", ") || store.address || "Location")}
                            {` · ${getLocationSuggestionStatus(store)}`}
                          </span>
                        </div>
                        <span className="finder-row-pill">Select</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <label className="finder-state-select-wrap">
                <span>Search area</span>
                <select
                  value={stateFilter}
                  onChange={(e) => setStateFilter(e.target.value)}
                  className="finder-state-select bourbon-select"
                >
                  {stateOptions.map((state) => (
                    <option key={state.code} value={state.code}>
                      {state.code === "ALL" ? "All covered states" : `${state.name} (${state.code})`}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

        </motion.div>
      </div>

      <div className="finder-main-grid finder-main-grid-single">
        <motion.div
          initial={false}
          animate={{ opacity: 1, x: 0 }}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="finder-panel finder-results"
        >
          <AnimatePresence mode="wait">
            {mode === "bottle" ? (
              <motion.div
                key={`bottle-${selectedBottle?.id ?? "empty"}`}
                initial={reduceMotion ? false : { opacity: 0, y: 16 }}
                animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
                exit={reduceMotion ? undefined : { opacity: 0, y: -10 }}
                transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
              >
                {selectedBottle ? (
                  <>
                    <div className="finder-overview-grid">
                      <div className="finder-result-hero bottle finder-result-hero-main simple">
                        <div>
                          <div className={`finder-trust-pill ${bottleTrust.tone}`}>
                            <span>{bottleTrust.label}</span>
                            <small>{formatFreshness(bestBottleSignal?.timestamp)}</small>
                          </div>
                          <h2>{selectedBottle.name}</h2>
                          <p>
                            {exactBottleSignals.length > 0
                              ? `Found ${exactBottleSignals.length} recent store hit${exactBottleSignals.length === 1 ? "" : "s"}.`
                              : broaderBottleSignals.length > 0
                                ? `No exact store hit yet. Showing ${broaderBottleSignals.length} area lead${broaderBottleSignals.length === 1 ? "" : "s"}.`
                                : "No current bottle drops or shipments in this search area."}
                          </p>
                          <div className="finder-action-row">
                            <button
                              type="button"
                              className="finder-primary-action"
                              onClick={() => selectedBottleWatched ? removeBottle(selectedBottle.id) : addBottle(selectedBottle.id)}
                            >
                              {selectedBottleWatched ? "Watching" : "Watch this bottle"}
                            </button>
                            <a className="finder-secondary-action" href={dashboardHref}>Alert setup</a>
                            <a className="finder-secondary-action" href={selectedBottleSightingHref}>Add sighting</a>
                          </div>
                        </div>
                      </div>

                      <div className="finder-where-panel simple">
                        <div className="finder-subpanel-head compact">
                          <div>
                            <span className="finder-eyebrow">Where to look</span>
                            <h3>{stateFilter === "ALL" ? "Best current leads" : getStateName(stateFilter)}</h3>
                          </div>
                          <MapPin size={16} color="var(--color-accent-amber)" />
                        </div>

                        {exactBottleSignals.length > 0 ? (
                          <div className="finder-where-section">
                            <div className="finder-where-list">
                              {exactBottleSignals.map((drop) => {
                                const location = summarizeDropLocation(drop);
                                const key = getDropKey(drop, bottleDrops.indexOf(drop));
                                const active = selectedSignalKey === key;
                                return (
                                  <button
                                    key={key}
                                    type="button"
                                    className={`finder-where-row clickable ${active ? "active" : ""}`}
                                    onClick={() => setSelectedSignalKey(active ? null : key)}
                                  >
                                    <div>
                                      <strong>{location.title}</strong>
                                      <span>{location.detail}</span>
                                      {active ? <em>{getHumanSignalDetail(drop)}</em> : null}
                                    </div>
                                    <small>{getBottleAmount(drop)} · {formatRelativeTime(drop.timestamp)}</small>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ) : null}

                        {broaderBottleSignals.length > 0 ? (
                          <div className="finder-where-section">
                            {exactBottleSignals.length > 0 ? <div className="finder-where-label">Area leads</div> : null}
                            <div className="finder-where-list">
                              {broaderBottleSignals.map((drop) => {
                                const location = summarizeDropLocation(drop);
                                const key = getDropKey(drop, bottleDrops.indexOf(drop));
                                const active = selectedSignalKey === key;
                                return (
                                  <button
                                    key={key}
                                    type="button"
                                    className={`finder-where-row clickable softer ${active ? "active" : ""}`}
                                    onClick={() => setSelectedSignalKey(active ? null : key)}
                                  >
                                    <div>
                                      <strong>{location.title}</strong>
                                      <span>{location.detail}</span>
                                      {active ? <em>{getHumanSignalDetail(drop)}</em> : null}
                                    </div>
                                    <small>{formatRelativeTime(drop.timestamp)}</small>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ) : null}

                        {exactBottleSignals.length === 0 && broaderBottleSignals.length === 0 ? (
                          <div className="finder-empty-card small">
                            No useful lead in {stateFilter === "ALL" ? "the covered states" : getStateName(stateFilter)} yet. Try another promoted market, search a broader bottle name, or switch to location scan.
                          </div>
                        ) : null}
                      </div>
                    </div>

                  </>
                ) : (
                  <div className="finder-empty-card">
                    No bottle match in {stateFilter === "ALL" ? "the covered states" : getStateName(stateFilter)}. Try a shorter name like “Weller”, “Stagg”, “Blanton”, or switch markets.
                  </div>
                )}
              </motion.div>
            ) : (
              <motion.div
                key={`store-${selectedStore?.id ?? "empty"}`}
                initial={reduceMotion ? false : { opacity: 0, y: 16 }}
                animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
                exit={reduceMotion ? undefined : { opacity: 0, y: -10 }}
                transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
              >
                {selectedStore ? (
                  <>
                    <div className="finder-result-hero store">
                      <div>
                        <div className={`finder-trust-pill ${storeTrust.tone}`}>
                          <span>{selectedStore.hasSignals ? storeTrust.label : "No recent drops"}</span>
                          <small>{selectedStore.hasSignals ? formatFreshness(bestStoreSignal?.timestamp) : "No bottle drops or shipments yet"}</small>
                        </div>
                        <h2>{selectedStore.displayLabel}</h2>
                        <p>
                          {getLocationCoverageCopy(selectedStore, bestStoreSignal)}
                        </p>
                        {formatFinderStoreAddress(selectedStore) ? (
                          <p className="finder-address-line">{formatFinderStoreAddress(selectedStore)}</p>
                        ) : null}
                        <p className="finder-evidence-line">
                          {bestStoreSignal
                            ? getHumanSignalDetail(bestStoreSignal)
                            : selectedStore.precision === "board"
                              ? "No recent board-level bottle shipments found here yet."
                              : "No recent bottle drops found for this location yet."}
                        </p>
                        <div className="finder-action-row">
                          <a className="finder-primary-action" href={dashboardHref}>Set alerts for this area</a>
                          <a className="finder-secondary-action" href={`/sightings?store=${encodeURIComponent(selectedStore.displayLabel || selectedStore.name || selectedStore.address || "")}`}>Add sighting</a>
                          {selectedStore.sourceUrl ? <a className="finder-secondary-action" href={selectedStore.sourceUrl} target="_blank" rel="noreferrer">Open source</a> : null}
                        </div>
                      </div>
                      <div className="finder-highlight-orb">
                        <div>
                          <span className="finder-eyebrow">Drops & shipments</span>
                          <strong>{selectedStore.bottle_count ?? 0}</strong>
                          <span>
                            {selectedStore.precision === "board"
                              ? selectedStore.hasSignals
                                ? "board-level bottle shipments tied to this ABC board"
                                : "no recent bottle shipments"
                              : selectedStore.hasSignals
                                ? "recent bottle drops tied to this store"
                                : "no recent bottle drops"}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="finder-subpanel finder-subpanel-full">
                      <div className="finder-subpanel-head">
                        <div>
                          <span className="finder-eyebrow">Inventory & shipments</span>
                          <h3>Location signal history</h3>
                        </div>
                        <Sparkles size={16} color="var(--color-accent-amber)" />
                      </div>
                      <div className="finder-list">
                        {storeDrops.length > 0 ? (
                          storeDrops.map((drop, index) => {
                            const location = summarizeDropLocation(drop);
                            const quality = getSignalQuality(drop);
                            return (
                              <div key={[drop.timestamp, drop.brand_name, drop.store_name || drop.board_name, index].filter(Boolean).join("-")} className="finder-list-row">
                                <div className="finder-list-row-copy">
                                  <strong>{getDisplayName(drop)}</strong>
                                  <span>{selectedStore.precision === "board" ? "Board shipment lead — exact store not known" : location.detail}</span>
                                  <em>{getHumanSignalDetail(drop)}</em>
                                </div>
                                <div className="finder-signal-meta">
                                  <span className="finder-row-pill">{quality.label}</span>
                                  <span className="finder-row-pill">{getBottleAmount(drop)}</span>
                                  <span className="finder-signal-time">{formatFreshness(drop.timestamp)}</span>
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          <div className="finder-empty-card small">
                            {historyLoading
                              ? "Loading location history…"
                              : selectedStore.hasSignals
                                ? "No recent or historical inventory, shipment, or drop signals tied to this location in the current state lens."
                                : selectedStore.precision === "board"
                                  ? "No recent board-level bottle shipments found here yet."
                                  : "No recent bottle drops found for this location yet."}
                          </div>
                        )}
                      </div>
                      {historyHasMore ? (
                        <button
                          type="button"
                          className="finder-load-more"
                          onClick={() => setHistoryOffset((prev) => prev + 20)}
                        >
                          Load older location history
                        </button>
                      ) : null}
                    </div>
                  </>
                ) : (
                  <div className="finder-empty-card finder-start-card">
                    <strong>Search a location to inspect it.</strong>
                    <span>{stateFilter === "NC" ? "Search a board or county. NC leads are board-level shipment clues unless a store is explicitly listed." : stateFilter === "VA" ? "Search a Virginia ABC store, city, or bottle-friendly area. VA can show exact store inventory." : "Search a store, city, county, or board in the selected market."}</span>
                    {locationSuggestions.length > 0 ? (
                      <div className="finder-empty-suggestions">
                        {locationSuggestions.slice(0, 4).map((store) => (
                          <button key={store.id} type="button" onClick={() => { setQuery(store.displayLabel ?? store.name ?? ""); setSelectedStoreId(store.id); }}>
                            {store.displayLabel || store.name}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </section>
  );
}
