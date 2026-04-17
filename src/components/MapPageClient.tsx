"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Search, Radar, MapPin, Clock3, Sparkles, Warehouse, ChevronRight } from "lucide-react";
import { useStores } from "@/hooks/useStores";
import { useBottles } from "@/hooks/useBottles";
import { useDrops } from "@/hooks/useDrops";
import type { Bottle } from "@/data/bottles";
import type { Store } from "@/hooks/useStores";
import type { DropEvent } from "@/lib/drops";
import { formatRelativeTime, getDisplayName } from "@/lib/drops";
import { candidateBottleKeys, dropMatchesBottle } from "@/lib/bottleIdentity";

type FinderMode = "bottle" | "store";
type FinderState = "ALL" | "NC" | "VA" | "PA";

const STATE_OPTIONS: FinderState[] = ["ALL", "NC", "VA", "PA"];

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

function bottleMatchesQuery(candidate: string, selectedBottle: Bottle) {
  const candidateNorm = stripBottleName(candidate);
  const aliases = candidateBottleKeys(selectedBottle.name);
  return aliases.some((alias) => alias && (candidateNorm.includes(alias) || alias.includes(candidateNorm)));
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
  if (drop.store_address) return { label: "Exact store", score: 3 };
  if (drop.stores && drop.stores.some((entry) => entry.store_address)) return { label: "Multi-store inventory", score: 3 };
  if (drop.board_name) return { label: "Board shipment lead", score: 2 };
  return { label: "Weak signal", score: 1 };
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
          <div className="finder-stat">{bottle.state ?? "Multi"}</div>
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
  const { drops, loading: dropsLoading } = useDrops();

  const [mode, setMode] = useState<FinderMode>("bottle");
  const [stateFilter, setStateFilter] = useState<FinderState>("ALL");
  const [query, setQuery] = useState("");
  const [selectedBottleId, setSelectedBottleId] = useState<string | null>(null);
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const ready = useMemo(
    () => !storesLoading && !bottlesLoading && !dropsLoading,
    [storesLoading, bottlesLoading, dropsLoading]
  );

  const filteredBottles = useMemo(() => {
    const q = normalize(query);
    return bottles
      .filter((bottle) => stateFilter === "ALL" || bottle.state === stateFilter)
      .filter((bottle) => {
        if (!q) return true;
        return [bottle.name, bottle.distillery, bottle.tier, bottle.state]
          .filter(Boolean)
          .some((value) => normalize(String(value)).includes(q));
      })
      .sort((a, b) => {
        const aScore = (a.drop_count_30d ?? 0) + (a.tier === "unicorn" ? 50 : a.tier === "allocated" ? 25 : 10);
        const bScore = (b.drop_count_30d ?? 0) + (b.tier === "unicorn" ? 50 : b.tier === "allocated" ? 25 : 10);
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

  const bottleSuggestions = useMemo(() => {
    if (mode !== "bottle") return [] as Bottle[];
    const q = normalize(query);
    if (!q) return filteredBottles.slice(0, 8);
    return filteredBottles
      .filter((bottle) => stripBottleName(bottle.name).includes(stripBottleName(q)) || stripBottleName(q).includes(stripBottleName(bottle.name)))
      .slice(0, 8);
  }, [filteredBottles, mode, query]);

  const bottleDrops = useMemo(() => {
    if (!selectedBottle) return [];
    return drops
      .filter((drop) => (stateFilter === "ALL" ? true : (drop.state || drop.state_code) === stateFilter))
      .filter((drop) => isWithinLastDays(drop.timestamp, 30))
      .filter((drop) => dropMatchesBottle(drop, selectedBottle) || bottleMatchesQuery(getDisplayName(drop), selectedBottle))
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
    };
  }, [filteredBottles.length, filteredStores.length, drops.length]);

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
            <h1>{mode === "bottle" ? "Search a bottle. See where it is moving." : "Search a board. See what is actually hitting."}</h1>
            <p>
              {mode === "bottle"
                ? "Pick a bottle, narrow the state, and we’ll show the boards and stores where it has actually moved recently."
                : "Pick your board or store, then see the bottles, drops, and recent movement tied to that location."}
            </p>

            <div className="finder-tool-shell">
              <div className="finder-lens-row">
                <button
                  type="button"
                  className={`finder-lens ${mode === "bottle" ? "active" : ""}`}
                  onClick={() => setMode("bottle")}
                >
                  <Sparkles size={15} />
                  Find a Bottle
                </button>
                <button
                  type="button"
                  className={`finder-lens ${mode === "store" ? "active" : ""}`}
                  onClick={() => setMode("store")}
                >
                  <Warehouse size={15} />
                  Scan a Board
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
                      if (mode === "bottle") setShowSuggestions(true);
                    }}
                    placeholder={mode === "bottle" ? "Search bottle, distillery, or tier" : "Search board, store, city, or county"}
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
                        <span className="finder-row-pill">{bottle.drop_count_30d ?? 0} hits</span>
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

          <div className="finder-summary-grid">
            <div className="finder-summary-card">
              <span className="finder-eyebrow">Boards / stores</span>
              <strong>{summary.stores}</strong>
              <span>live searchable locations</span>
            </div>
            <div className="finder-summary-card">
              <span className="finder-eyebrow">Tracked bottles</span>
              <strong>{summary.bottles}</strong>
              <span>ranked by signal density</span>
            </div>
            <div className="finder-summary-card">
              <span className="finder-eyebrow">Live signals</span>
              <strong>{summary.liveSignals}</strong>
              <span>recent shipment and in-store events</span>
            </div>
          </div>
        </motion.div>
      </div>

      <div className="finder-main-grid">
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, x: -18 }}
          animate={reduceMotion ? undefined : { opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
          className="finder-panel finder-controls"
        >
          <div className="finder-section-label">
            {mode === "bottle" ? "Bottle matches" : "Board matches"}
          </div>

          <div className="finder-card-stack">
            {ready ? (
              mode === "bottle" ? (
                filteredBottles.slice(0, 8).map((bottle) => (
                  <FinderBottleCard
                    key={bottle.id}
                    bottle={bottle}
                    active={(selectedBottle?.id ?? filteredBottles[0]?.id) === bottle.id}
                    onClick={() => setSelectedBottleId(bottle.id)}
                    reduceMotion={!!reduceMotion}
                  />
                ))
              ) : (
                filteredStores.slice(0, 8).map((store) => (
                  <FinderStoreCard
                    key={store.id}
                    store={store}
                    active={(selectedStore?.id ?? filteredStores[0]?.id) === store.id}
                    onClick={() => setSelectedStoreId(store.id)}
                    reduceMotion={!!reduceMotion}
                  />
                ))
              )
            ) : (
              <div className="finder-empty-card">Loading live finder data…</div>
            )}

            {ready && ((mode === "bottle" && filteredBottles.length === 0) || (mode === "store" && filteredStores.length === 0)) ? (
              <div className="finder-empty-card">No matches. Try a looser search or change the state lens.</div>
            ) : null}
          </div>
        </motion.div>

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
                    <div className="finder-result-hero bottle">
                      <div>
                        <div className="finder-mode-pill">Bottle lens active</div>
                        <h2>{selectedBottle.name}</h2>
                        <p>
                          Search by bottle when the mission is specific. We separate raw activity from huntable intel, so the page tells you how much motion exists and how much of it is actually actionable.
                        </p>
                      </div>
                      <div className="finder-highlight-orb">
                        <div>
                          <span className="finder-eyebrow">Actionable intel</span>
                          <strong>{bottleLocationInsights.actionableCount}</strong>
                          <span>{bottleLocationInsights.signalVolume} total signals / 30d</span>
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                        gap: 12,
                        marginBottom: 18,
                      }}
                    >
                      <div className="finder-summary-card">
                        <span className="finder-eyebrow">Signal volume</span>
                        <strong>{bottleLocationInsights.signalVolume}</strong>
                        <span>total tracked activity</span>
                      </div>
                      <div className="finder-summary-card">
                        <span className="finder-eyebrow">Actionable intel</span>
                        <strong>{bottleLocationInsights.actionableCount}</strong>
                        <span>huntable location leads</span>
                      </div>
                      <div className="finder-summary-card">
                        <span className="finder-eyebrow">Exact store hits</span>
                        <strong>{bottleLocationInsights.exactStoreMatches}</strong>
                        <span>precise store-level evidence</span>
                      </div>
                      <div className="finder-summary-card">
                        <span className="finder-eyebrow">Board leads</span>
                        <strong>{bottleLocationInsights.boardMatches}</strong>
                        <span>shipment / board signals</span>
                      </div>
                    </div>

                    <div className="finder-dual-columns">
                      <div className="finder-subpanel">
                        <div className="finder-subpanel-head">
                          <div>
                            <span className="finder-eyebrow">Likely locations</span>
                            <h3>Boards and stores with recent movement</h3>
                          </div>
                          <MapPin size={16} color="var(--color-accent-amber)" />
                        </div>
                        <div className="finder-list">
                          {matchingStoresForBottle.length > 0 ? (
                            matchingStoresForBottle.map((store) => (
                              <div key={store.id} className="finder-list-row">
                                <div>
                                  <strong>{store.displayLabel}</strong>
                                  <span>
                                    {[store.city, store.state].filter(Boolean).join(", ")}
                                    {store.address ? ` · ${store.address}` : ""}
                                    {store.lastSeen ? ` · ${formatRelativeTime(store.lastSeen)}` : ""}
                                  </span>
                                </div>
                                <span className="finder-row-pill">{store.precision === "board" ? `${store.hitCount} board hits` : `${store.hitCount} store hits`}</span>
                              </div>
                            ))
                          ) : (
                            <div className="finder-empty-card small">No direct board or store match yet. The bottle is tracked, but recent location linkage is thin.</div>
                          )}
                        </div>
                        {matchingStoresForBottle.length > 0 ? (
                          <p className="finder-footnote">
                            {bottleLocationInsights.exactStoreMatches > 0
                              ? `${bottleLocationInsights.exactStoreMatches} exact store hits and ${bottleLocationInsights.boardMatches} board shipment leads in the last 30 days.`
                              : `${bottleLocationInsights.boardMatches} board shipment leads in the last 30 days. Exact store precision is thinner right now.`}
                          </p>
                        ) : null}
                      </div>

                      <div className="finder-subpanel">
                        <div className="finder-subpanel-head">
                          <div>
                            <span className="finder-eyebrow">Recent bottle signals</span>
                            <h3>Latest shipments and in-store hits</h3>
                          </div>
                          <Clock3 size={16} color="var(--color-accent-amber)" />
                        </div>
                        <div className="finder-list">
                          {bottleDrops.length > 0 ? (
                            bottleDrops.map((drop, index) => (
                              <div key={`${drop.timestamp}-${index}`} className="finder-list-row">
                                <div>
                                  <strong>{drop.board_name || drop.store_city || drop.store_name || "Location signal"}</strong>
                                  <span>
                                    {drop.store_address || drop.store_city || drop.store_county || getDropLocations(drop)[0]?.detail || "Signal captured"}
                                  </span>
                                </div>
                                <span className="finder-row-pill">{getSignalQuality(drop).label} · {formatRelativeTime(drop.timestamp)}</span>
                              </div>
                            ))
                          ) : (
                            <div className="finder-empty-card small">No recent signal events for this bottle in the current state lens.</div>
                          )}
                        </div>
                        {bottleDrops.length > 0 ? (
                          <p className="finder-footnote">Showing up to 30 days of drop history for this bottle so the page proves the signal exists, even when the freshest hit is a little older.</p>
                        ) : null}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="finder-empty-card">No bottles found in this lens yet.</div>
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
                        <div className="finder-mode-pill">Board lens active</div>
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
                          {storeDrops.length > 0 ? (
                            storeDrops.map((drop, index) => (
                              <div key={`${drop.timestamp}-${drop.brand_name}-${index}`} className="finder-list-row">
                                <div>
                                  <strong>{getDisplayName(drop)}</strong>
                                  <span>{drop.event_type.replaceAll("_", " ")}</span>
                                </div>
                                <span className="finder-row-pill">{formatRelativeTime(drop.timestamp)}</span>
                              </div>
                            ))
                          ) : (
                            <div className="finder-empty-card small">No recent live drops tied to this location in the current state lens.</div>
                          )}
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="finder-empty-card">No boards or stores found in this lens yet.</div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </section>
  );
}
