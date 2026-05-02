"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Search, Radar, MapPin, Clock3, Sparkles, Warehouse, ChevronRight } from "lucide-react";
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

type FinderMode = "bottle" | "store";
type FinderState = "ALL" | "NC" | "VA" | "PA" | "IN" | "KY";

const STATE_OPTIONS: FinderState[] = ["ALL", "NC", "VA", "PA", "IN", "KY"];

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
      label: drop.store_name || drop.store_city || "Store signal",
      detail: drop.store_address || [drop.store_city, drop.store_county].filter(Boolean).join(", ") || "Store-level signal",
      precision: "store",
      confidence: drop.store_address ? 4 : 3,
    });
  }

  for (const entry of drop.stores || []) {
    const label = entry.store_address || entry.city;
    if (!label) continue;
    locations.push({
      label,
      detail: entry.store_address ? `${entry.city || "Store"} inventory signal` : `${entry.city || "Board"} inventory lead`,
      precision: entry.store_address ? "store" : "board",
      confidence: entry.store_address ? 5 : 2,
    });
  }

  return locations;
}

function getSignalQuality(drop: DropEvent) {
  if (drop.state === "KY" || drop.state_code === "KY") {
    const scope = String(drop.availability_scope || "");
    const confidence = String(drop.confidence_tier || "");
    if (confidence === "exact_today_distillery") return { label: "Official distillery today", score: 3 };
    if (confidence === "official_release_live") return { label: "Official release live", score: 3 };
    if (confidence === "official_window_open" || scope === "release_window") return { label: "Official pickup window", score: 2 };
    if (confidence === "official_announcement") return { label: "Official announcement", score: 2 };
    return { label: "Distillery signal", score: 2 };
  }
  if (drop.store_address) return { label: "Exact store", score: 3 };
  if (drop.stores && drop.stores.some((entry) => entry.store_address)) return { label: "Multi-store inventory", score: 3 };
  if (drop.board_name) return { label: "Board shipment lead", score: 2 };
  return { label: "Weak signal", score: 1 };
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
              : "Kentucky signal",
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
        [addressParts.locality, drop.store_city, drop.state || drop.state_code]
          .filter(Boolean)
          .join(" · ") || drop.store_address || "Store-level inventory signal",
    };
  }

  if (nestedStore?.store_address) {
    const addressParts = extractStoreAddressParts(nestedStore.store_address);
    return {
      title: addressParts.line1 || (nestedStore.city ? `${nestedStore.city} store cluster` : "Store inventory hit"),
      detail:
        [addressParts.locality, nestedStore.city, drop.state || drop.state_code]
          .filter(Boolean)
          .join(" · ") || nestedStore.store_address,
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
              fontFamily: "var(--font-fraunces)",
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
          <div className="finder-eyebrow">Intel</div>
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
              fontFamily: "var(--font-fraunces)",
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
            {[store.city, store.state].filter(Boolean).join(", ")}
            {store.address ? ` · ${store.address}` : ""}
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
          <div className="finder-eyebrow">Coverage</div>
          <div className="finder-stat">{store.state}</div>
        </div>
        <div>
          <div className="finder-eyebrow">Signals</div>
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

  const [mode, setMode] = useState<FinderMode>("bottle");
  const [stateFilter, setStateFilter] = useState<FinderState>("ALL");
  const [query, setQuery] = useState("");
  const [selectedBottleId, setSelectedBottleId] = useState<string | null>(null);
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionSeed, setSuggestionSeed] = useState(() => Math.floor(Date.now() / (1000 * 60 * 30)));
  const [historyOffset, setHistoryOffset] = useState(0);
  const [historyQuery, setHistoryQuery] = useState<{ bottle?: string; store?: string; state?: string }>({});

  const {
    drops: historyDrops,
    loading: historyLoading,
    total: historyTotal,
    hasMore: historyHasMore,
  } = useDrops({
    limit: 20,
    offset: historyOffset,
    bottle: historyQuery.bottle,
    store: historyQuery.store,
    state: historyQuery.state,
  });

  const ready = useMemo(
    () => !storesLoading && !bottlesLoading && !dropsLoading,
    [storesLoading, bottlesLoading, dropsLoading]
  );

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

  const selectedBottle = useMemo(() => {
    if (!filteredBottles.length) return null;
    return filteredBottles.find((bottle) => bottle.id === selectedBottleId) ?? filteredBottles[0];
  }, [filteredBottles, selectedBottleId]);

  useEffect(() => {
    if (mode === "bottle" && !selectedBottleId && filteredBottles[0]) {
      setSelectedBottleId(filteredBottles[0].id);
    }
    if (mode === "store" && !selectedStoreId && filteredStores[0]) {
      setSelectedStoreId(filteredStores[0].id);
    }
  }, [mode, filteredBottles, filteredStores, selectedBottleId, selectedStoreId]);

  const selectedStore = useMemo(() => {
    if (!filteredStores.length) return null;
    return filteredStores.find((store) => store.id === selectedStoreId) ?? filteredStores[0];
  }, [filteredStores, selectedStoreId]);

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
        store: selectedStore.city || selectedStore.displayLabel || selectedStore.name,
        state: stateFilter === "ALL" ? undefined : stateFilter,
      });
    }
  }, [mode, selectedStore, stateFilter]);

  const bottleSuggestions = useMemo(() => {
    if (mode !== "bottle") return [] as Bottle[];
    const q = normalize(query);
    if (!q) return getRotatingBottleSuggestions(filteredBottles, suggestionSeed, 5);
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
  }, [filteredBottles, mode, query, suggestionSeed]);

  const bottleDrops = useMemo(() => {
    if (!selectedBottle) return [];
    return drops
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
  }, [drops, selectedBottle, stateFilter]);

  const matchingStoresForBottle = useMemo(() => {
    if (!selectedBottle) return [] as Array<Store & { hitCount: number; lastSeen?: string; matchStrength: number }>;

    const scored = new Map<string, Store & { hitCount: number; lastSeen?: string; matchStrength: number }>();

    for (const store of filteredStores) {
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
  }, [bottleDrops, filteredStores, selectedBottle]);

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

  const storeDrops = useMemo(() => {
    if (!selectedStore) return [];
    return drops
      .filter((drop) => (stateFilter === "ALL" ? true : (drop.state || drop.state_code) === stateFilter))
      .filter((drop) => matchesStore(drop, selectedStore))
      .slice(0, 12);
  }, [drops, selectedStore, stateFilter]);

  const topBottlesAtStore = useMemo(() => {
    const counts = new Map<string, { bottle: string; count: number; rarity: string }>();
    for (const drop of storeDrops) {
      const bottle = getDisplayName(drop);
      const existing = counts.get(bottle) ?? { bottle, count: 0, rarity: drop.rarity_tier };
      existing.count += 1;
      const rarityRank = { unicorn: 3, allocated: 2, limited: 1 } as Record<string, number>;
      if ((rarityRank[drop.rarity_tier] ?? 0) > (rarityRank[existing.rarity] ?? 0)) existing.rarity = drop.rarity_tier;
      counts.set(bottle, existing);
    }

    return Array.from(counts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [storeDrops]);

  const summary = useMemo(() => {
    return {
      stores: filteredStores.length,
      bottles: filteredBottles.length,
      liveSignals: drops.length,
      watchlist: watchlist.length,
    };
  }, [filteredBottles.length, filteredStores.length, drops.length, watchlist.length]);

  return (
    <section className="finder-shell">
      <div className="finder-hero-wrap">
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 24 }}
          animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          className="finder-hero"
        >
          <div className="finder-hero-copy">
            <div className="finder-kicker">
              <Radar size={14} />
              Finder
            </div>
            <h1>Bottle Finder</h1>
            <p>Pick a bottle or a location and we'll give you the most precise data available to help you find what you're looking for</p>

            <div className="finder-tool-shell">
              <div className="finder-lens-row">
                <button
                  type="button"
                  className={`finder-lens ${mode === "bottle" ? "active" : ""}`}
                  onClick={() => setMode("bottle")}
                >
                  <Sparkles size={15} />
                  Find a bottle
                </button>
                <button
                  type="button"
                  className={`finder-lens ${mode === "store" ? "active" : ""}`}
                  onClick={() => setMode("store")}
                >
                  <Warehouse size={15} />
                  Scan a location
                </button>
              </div>

              <div className="finder-search-region">
                <div className="finder-search-wrap hero-search">
                  <Search size={16} color="var(--color-text-tertiary)" />
                  <input
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      if (mode === "bottle") setShowSuggestions(true);
                    }}
                    onFocus={() => {
                      if (mode === "bottle") {
                        setSuggestionSeed((prev) => prev + 1);
                        setShowSuggestions(true);
                      }
                    }}
                    placeholder={mode === "bottle" ? "Search bottle or distiller" : "Search board, store, city, or county"}
                    className="finder-search-input"
                  />
                </div>

                {mode === "bottle" && showSuggestions && bottleSuggestions.length > 0 ? (
                  <div className="finder-suggestions">
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
              </div>

              <div className="finder-state-row hero-states">
                {STATE_OPTIONS.map((state) => (
                  <button
                    key={state}
                    type="button"
                    className={`finder-state-chip ${stateFilter === state ? "active" : ""}`}
                    onClick={() => setStateFilter(state)}
                  >
                    {state === "ALL" ? "All states" : state}
                  </button>
                ))}
              </div>
            </div>
          </div>

        </motion.div>
      </div>

      <div className="finder-main-grid finder-main-grid-single">
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, x: 18 }}
          animate={reduceMotion ? undefined : { opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.14, ease: [0.22, 1, 0.36, 1] }}
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
                      <div className="finder-result-hero bottle finder-result-hero-main">
                        <div>
                          <h2>{selectedBottle.name}</h2>
                          <p>
                            {bottleLocationInsights.exactStoreMatches > 0
                              ? "We found recent exact locations for this bottle. Start with the freshest store hits below."
                              : bottleLocationInsights.boardMatches > 0
                                ? "No exact store hit yet. These are the most recent boards or areas where this bottle moved, so they’re your best places to watch."
                                : "We don’t have a recent exact location for this bottle yet. Check back after the next live scan."}
                          </p>
                        </div>
                        <div className="finder-highlight-orb finder-highlight-orb-main">
                          <div>
                            <span className="finder-eyebrow">Where to look</span>
                            <strong>{bottleLocationInsights.exactStoreMatches > 0 ? bottleLocationInsights.exactStoreMatches : bottleLocationInsights.boardMatches}</strong>
                            <span>{bottleLocationInsights.exactStoreMatches > 0 ? "recent exact locations" : "recent areas to watch"}</span>
                          </div>
                        </div>
                      </div>

                      <div className="finder-overview-stats">
                        <div className="finder-stat-card">
                          <span className="finder-eyebrow">Exact store hits</span>
                          <strong>{bottleLocationInsights.exactStoreMatches}</strong>
                          <span>fresh store-level matches in the current lens</span>
                        </div>
                        <div className="finder-stat-card">
                          <span className="finder-eyebrow">Board leads</span>
                          <strong>{bottleLocationInsights.boardMatches}</strong>
                          <span>broader movements worth watching</span>
                        </div>
                        <div className="finder-stat-card">
                          <span className="finder-eyebrow">Signal volume</span>
                          <strong>{bottleLocationInsights.signalVolume}</strong>
                          <span>signals captured in the last 30 days</span>
                        </div>
                        <div className="finder-stat-card">
                          <span className="finder-eyebrow">History loaded</span>
                          <strong>{historyTotal}</strong>
                          <span>historical matches available for this bottle</span>
                        </div>
                      </div>
                    </div>

                    <div className="finder-dual-columns finder-dual-columns-balanced finder-bottle-sections">
                      <div className="finder-subpanel finder-subpanel-secondary">
                        <div className="finder-subpanel-head">
                          <div>
                            <span className="finder-eyebrow">Historical movement</span>
                            <h3>Older drop history</h3>
                          </div>
                          <Clock3 size={16} color="var(--color-accent-amber)" />
                        </div>
                        <div className="finder-list">
                          {historyDrops.length > 0 ? (
                            historyDrops.map((drop, index) => {
                              const location = summarizeDropLocation(drop);
                              return (
                                <div key={`${drop.timestamp}-${drop.brand_name}-${index}`} className="finder-list-row">
                                  <div className="finder-list-row-copy">
                                    <strong>{getDisplayName(drop)}</strong>
                                    <span>{location.title} · {location.detail}</span>
                                  </div>
                                  <div className="finder-signal-meta">
                                    <span className="finder-row-pill">{drop.state || drop.state_code || 'NC'}</span>
                                    <span className="finder-signal-time">{formatRelativeTime(drop.timestamp)}</span>
                                  </div>
                                </div>
                              );
                            })
                          ) : (
                            <div className="finder-empty-card small">{historyLoading ? 'Loading bottle history…' : 'No historical matches yet for this bottle.'}</div>
                          )}
                        </div>
                        {historyHasMore ? (
                          <button
                            type="button"
                            className="finder-load-more"
                            onClick={() => setHistoryOffset((prev) => prev + 20)}
                          >
                            Load older bottle history
                          </button>
                        ) : null}
                      </div>
                      <div className="finder-subpanel finder-subpanel-primary">
                        <div className="finder-subpanel-head">
                          <div>
                            <span className="finder-eyebrow">Exact store intel</span>
                            <h3>Precise store-level evidence</h3>
                          </div>
                          <MapPin size={16} color="var(--color-accent-amber)" />
                        </div>
                        <div className="finder-list">
                          {matchingStoresForBottle.filter((store) => store.precision === "store").length > 0 ? (
                            matchingStoresForBottle
                              .filter((store) => store.precision === "store")
                              .map((store) => (
                                <div key={store.id} className="finder-list-row">
                                  <div>
                                    <strong>{store.displayLabel}</strong>
                                    <span>
                                      {[store.city, store.state].filter(Boolean).join(", ")}
                                      {store.address ? ` · ${store.address}` : ""}
                                      {store.lastSeen ? ` · ${formatRelativeTime(store.lastSeen)}` : ""}
                                    </span>
                                  </div>
                                  <span className="finder-row-pill">{store.hitCount} store hits</span>
                                </div>
                              ))
                          ) : (
                            <div className="finder-empty-card small">No exact store intel yet for this bottle in the current lens.</div>
                          )}
                        </div>
                        <p className="finder-footnote">
                          {bottleLocationInsights.exactStoreMatches > 0
                            ? "These are the freshest exact places this bottle was seen."
                            : "No exact store location yet for this bottle in the current lens."}
                        </p>
                      </div>

                      <div className="finder-subpanel finder-subpanel-secondary">
                        <div className="finder-subpanel-head">
                          <div>
                            <span className="finder-eyebrow">Board shipment leads</span>
                            <h3>Broader movement worth watching</h3>
                          </div>
                          <MapPin size={16} color="var(--color-accent-amber)" />
                        </div>
                        <div className="finder-list">
                          {matchingStoresForBottle.filter((store) => store.precision === "board").length > 0 ? (
                            matchingStoresForBottle
                              .filter((store) => store.precision === "board")
                              .map((store) => (
                                <div key={store.id} className="finder-list-row">
                                  <div>
                                    <strong>{store.displayLabel}</strong>
                                    <span>
                                      {[store.city, store.state].filter(Boolean).join(", ")}
                                      {store.address ? ` · ${store.address}` : ""}
                                      {store.lastSeen ? ` · ${formatRelativeTime(store.lastSeen)}` : ""}
                                    </span>
                                  </div>
                                  <span className="finder-row-pill">{store.hitCount} board hits</span>
                                </div>
                              ))
                          ) : (
                            <div className="finder-empty-card small">No board shipment leads surfaced for this bottle in the current lens.</div>
                          )}
                        </div>
                        <p className="finder-footnote">
                          {bottleLocationInsights.boardMatches > 0
                            ? "These are the most recent broader locations where the bottle moved, even if we do not have a precise store hit yet."
                            : "No broader movement leads surfaced in the current lens."}
                        </p>
                      </div>

                      <div className="finder-subpanel finder-subpanel-full">
                        <div className="finder-subpanel-head">
                          <div>
                            <span className="finder-eyebrow">Recent bottle signals</span>
                            <h3>Latest shipments and in-store hits</h3>
                          </div>
                          <Clock3 size={16} color="var(--color-accent-amber)" />
                        </div>
                        <div className="finder-list">
                          {bottleDrops.length > 0 ? (
                            bottleDrops.slice(0, 6).map((drop, index) => {
                              const summary = summarizeDropLocation(drop);
                              return (
                                <div key={`${drop.timestamp}-${index}`} className="finder-list-row finder-list-row-signal">
                                  <div className="finder-list-row-copy">
                                    <strong>{summary.title}</strong>
                                    <span>{summary.detail}</span>
                                  </div>
                                  <div className="finder-signal-meta">
                                    <span className="finder-row-pill">{getSignalQuality(drop).label}</span>
                                    <span className="finder-signal-time">{formatRelativeTime(drop.timestamp)}</span>
                                  </div>
                                </div>
                              );
                            })
                          ) : (
                            <div className="finder-empty-card small">No recent signal events for this bottle in the current state lens.</div>
                          )}
                        </div>
                        {bottleDrops.length > 0 ? (
                          <p className="finder-footnote">Showing the most recent useful bottle signals first, with location context that actually helps you decide where to look next.</p>
                        ) : null}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="finder-empty-card">No bottle matches in this state yet. Try Weller, Stagg, Blanton's, or Buffalo Trace, or switch to All states.</div>
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
                        <h2>{selectedStore.displayLabel}</h2>
                        <p>
                          Search by board or store when you want to monitor your territory. This view shows what is actually moving through that location,
                          not just where a pin happened to land.
                        </p>
                      </div>
                      <div className="finder-highlight-orb">
                        <div>
                          <span className="finder-eyebrow">Signal density</span>
                          <strong>{selectedStore.bottle_count ?? 0}</strong>
                          <span>events tied to this location</span>
                        </div>
                      </div>
                    </div>

                    <div className="finder-dual-columns">
                      <div className="finder-subpanel">
                        <div className="finder-subpanel-head">
                          <div>
                            <span className="finder-eyebrow">Bottle movement</span>
                            <h3>Most active bottles here</h3>
                          </div>
                          <Sparkles size={16} color="var(--color-accent-amber)" />
                        </div>
                        <div className="finder-list">
                          {topBottlesAtStore.length > 0 ? (
                            topBottlesAtStore.map((item) => (
                              <div key={item.bottle} className="finder-list-row">
                                <div>
                                  <strong>{item.bottle}</strong>
                                  <span>Repeated signal activity at this location</span>
                                </div>
                                <span className="finder-row-pill">{item.count} hits</span>
                              </div>
                            ))
                          ) : (
                            <div className="finder-empty-card small">Not enough recent structured activity to rank bottles here yet.</div>
                          )}
                        </div>
                      </div>

                      <div className="finder-subpanel">
                        <div className="finder-subpanel-head">
                          <div>
                            <span className="finder-eyebrow">Recent location signals</span>
                            <h3>Latest drops tied to this board or store</h3>
                          </div>
                          <Clock3 size={16} color="var(--color-accent-amber)" />
                        </div>
                        <div className="finder-list">
                          {historyDrops.length > 0 ? (
                            historyDrops.map((drop, index) => (
                              <div key={`${drop.timestamp}-${drop.brand_name}-${index}`} className="finder-list-row">
                                <div className="finder-list-row-copy">
                                  <strong>{getDisplayName(drop)}</strong>
                                  <span>{summarizeDropLocation(drop).detail}</span>
                                </div>
                                <div className="finder-signal-meta">
                                  <span className="finder-row-pill">{drop.event_type.replaceAll("_", " ")}</span>
                                  <span className="finder-signal-time">{formatRelativeTime(drop.timestamp)}</span>
                                </div>
                              </div>
                            ))
                          ) : (
                            <div className="finder-empty-card small">{historyLoading ? 'Loading store history…' : 'No recent or historical drops tied to this location in the current state lens.'}</div>
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
                    </div>
                  </>
                ) : (
                  <div className="finder-empty-card">No location matches in this state yet. Search a board, county, city, or store name, or switch to All states.</div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </section>
  );
}
