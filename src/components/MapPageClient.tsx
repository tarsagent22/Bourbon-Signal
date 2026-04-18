"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Search, MapPin, Clock3, Warehouse } from "lucide-react";
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

function normalize(value?: string | null) {
  return (value || "").toLowerCase().trim();
}

function stripBottleName(value?: string | null) {
  return normalize(value).replace(/\s+/g, " ").trim();
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
  return [store.name, store.displayLabel, store.district, store.city, store.county, store.address]
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

function getDropSummary(drop: DropEvent) {
  const exactLabel = drop.store_name || drop.store_address || [drop.store_city, drop.state || drop.state_code].filter(Boolean).join(", ");
  if (exactLabel) {
    return {
      title: exactLabel,
      detail: [drop.store_address, [drop.store_city, drop.store_county, drop.state || drop.state_code].filter(Boolean).join(", ")]
        .filter(Boolean)
        .join(" · "),
      exact: true,
      timestamp: drop.timestamp,
      quantity: drop.quantity_in_stock ?? drop.quantity_shipped ?? drop.quantity,
    };
  }

  const boardLabel = drop.board_name || [drop.store_city, drop.state || drop.state_code].filter(Boolean).join(", ");
  return {
    title: boardLabel || "Recent movement",
    detail: [drop.store_city, drop.store_county, drop.state || drop.state_code].filter(Boolean).join(", "),
    exact: false,
    timestamp: drop.timestamp,
    quantity: drop.quantity_in_stock ?? drop.quantity_shipped ?? drop.quantity,
  };
}

function ResultRow({
  title,
  detail,
  meta,
}: {
  title: string;
  detail?: string;
  meta?: string;
}) {
  return (
    <div
      style={{
        padding: "14px 0",
        borderBottom: "1px solid rgba(245,237,214,0.08)",
      }}
    >
      <div style={{ color: "var(--color-cream)", fontWeight: 600, fontFamily: "var(--font-dm-sans)", fontSize: 15 }}>{title}</div>
      {detail ? (
        <div style={{ color: "rgba(245,237,214,0.58)", marginTop: 4, fontSize: 13, fontFamily: "var(--font-dm-sans)" }}>{detail}</div>
      ) : null}
      {meta ? (
        <div style={{ color: "rgba(245,237,214,0.35)", marginTop: 6, fontSize: 12, fontFamily: "var(--font-dm-sans)" }}>{meta}</div>
      ) : null}
    </div>
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

  const ready = useMemo(() => !storesLoading && !bottlesLoading && !dropsLoading, [storesLoading, bottlesLoading, dropsLoading]);

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
      .sort((a, b) => (b.actionable_count_30d ?? 0) - (a.actionable_count_30d ?? 0));
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
    return filteredBottles.find((bottle) => bottle.id === selectedBottleId) ?? null;
  }, [filteredBottles, selectedBottleId]);

  const selectedStore = useMemo(() => {
    if (!filteredStores.length) return null;
    return filteredStores.find((store) => store.id === selectedStoreId) ?? null;
  }, [filteredStores, selectedStoreId]);

  const bottleSuggestions = useMemo(() => {
    if (mode !== "bottle") return [] as Bottle[];
    const q = normalize(query);
    if (!q) return filteredBottles.slice(0, 8);
    return filteredBottles.slice(0, 12);
  }, [filteredBottles, mode, query]);

  const storeSuggestions = useMemo(() => {
    if (mode !== "store") return [] as Store[];
    if (!query.trim()) return filteredStores.slice(0, 8);
    return filteredStores.slice(0, 12);
  }, [filteredStores, mode, query]);

  const bottleDrops = useMemo(() => {
    if (!selectedBottle) return [];
    return drops
      .filter((drop) => (stateFilter === "ALL" ? true : (drop.state || drop.state_code) === stateFilter))
      .filter((drop) => isWithinLastDays(drop.timestamp, 30))
      .filter((drop) => dropMatchesBottle(drop, selectedBottle) || bottleMatchesQuery(getDisplayName(drop), selectedBottle))
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [drops, selectedBottle, stateFilter]);

  const exactBottleDrops = useMemo(() => bottleDrops.filter((drop) => getDropSummary(drop).exact), [bottleDrops]);
  const broaderBottleDrops = useMemo(() => bottleDrops.filter((drop) => !getDropSummary(drop).exact), [bottleDrops]);

  const storeDrops = useMemo(() => {
    if (!selectedStore) return [];
    return drops
      .filter((drop) => (stateFilter === "ALL" ? true : (drop.state || drop.state_code) === stateFilter))
      .filter((drop) => matchesStore(drop, selectedStore))
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 20);
  }, [drops, selectedStore, stateFilter]);

  const topBottlesAtStore = useMemo(() => {
    const counts = new Map<string, { bottle: string; count: number; lastSeen: string }>();
    for (const drop of storeDrops) {
      const bottle = getDisplayName(drop);
      const existing = counts.get(bottle) ?? { bottle, count: 0, lastSeen: drop.timestamp };
      existing.count += 1;
      if (new Date(drop.timestamp).getTime() > new Date(existing.lastSeen).getTime()) existing.lastSeen = drop.timestamp;
      counts.set(bottle, existing);
    }
    return Array.from(counts.values()).sort((a, b) => b.count - a.count).slice(0, 10);
  }, [storeDrops]);

  useEffect(() => {
    if (mode === "bottle" && query.trim() === "") {
      setSelectedBottleId(null);
    }
    if (mode === "store" && query.trim() === "") {
      setSelectedStoreId(null);
    }
  }, [mode, query]);

  return (
    <section className="finder-shell" style={{ padding: "24px 16px 64px", maxWidth: 920, margin: "0 auto" }}>
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 16 }}
        animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        style={{ marginBottom: 20 }}
      >
        <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
          <button type="button" className={`finder-lens ${mode === "bottle" ? "active" : ""}`} onClick={() => { setMode("bottle"); setQuery(""); setShowSuggestions(false); }}>
            <Search size={15} /> Find a bottle
          </button>
          <button type="button" className={`finder-lens ${mode === "store" ? "active" : ""}`} onClick={() => { setMode("store"); setQuery(""); setShowSuggestions(false); }}>
            <Warehouse size={15} /> Scan a store / board
          </button>
        </div>

        <div className="finder-search-wrap hero-search">
          <Search size={16} color="var(--color-text-tertiary)" />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setShowSuggestions(true);
            }}
            onFocus={() => setShowSuggestions(true)}
            placeholder={mode === "bottle" ? "Search for a bottle" : "Search for a store, board, city, or county"}
            className="finder-search-input"
          />
        </div>

        <div className="finder-state-row hero-states" style={{ marginTop: 12 }}>
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

        {showSuggestions && ready && mode === "bottle" && !selectedBottle ? (
          <div className="finder-suggestions" style={{ marginTop: 10 }}>
            {bottleSuggestions.length > 0 ? bottleSuggestions.map((bottle) => (
              <button
                key={bottle.id}
                type="button"
                className="finder-suggestion"
                onClick={() => {
                  setSelectedBottleId(bottle.id);
                  setQuery(bottle.name);
                  setShowSuggestions(false);
                }}
              >
                <div>
                  <strong>{bottle.name}</strong>
                  <span>{bottle.distillery || bottle.state || "Tracked bottle"}</span>
                </div>
              </button>
            )) : <div className="finder-empty-card small">No bottles found.</div>}
          </div>
        ) : null}

        {showSuggestions && ready && mode === "store" && !selectedStore ? (
          <div className="finder-suggestions" style={{ marginTop: 10 }}>
            {storeSuggestions.length > 0 ? storeSuggestions.map((store) => (
              <button
                key={store.id}
                type="button"
                className="finder-suggestion"
                onClick={() => {
                  setSelectedStoreId(store.id);
                  setQuery(store.displayLabel);
                  setShowSuggestions(false);
                }}
              >
                <div>
                  <strong>{store.displayLabel}</strong>
                  <span>{[store.city, store.state].filter(Boolean).join(", ")}</span>
                </div>
              </button>
            )) : <div className="finder-empty-card small">No stores or boards found.</div>}
          </div>
        ) : null}
      </motion.div>

      {!ready ? <div className="finder-empty-card">Loading live finder data…</div> : null}

      {ready && mode === "bottle" && !selectedBottle ? (
        <div className="finder-empty-card">Search for a bottle to see where it was last seen.</div>
      ) : null}

      {ready && mode === "store" && !selectedStore ? (
        <div className="finder-empty-card">Search for a store or board to see what hit there recently.</div>
      ) : null}

      <AnimatePresence mode="wait">
        {ready && mode === "bottle" && selectedBottle ? (
          <motion.div key={`bottle-${selectedBottle.id}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}>
            <div className="finder-panel" style={{ padding: 22, marginBottom: 16 }}>
              <h2 style={{ fontFamily: "var(--font-fraunces)", fontSize: "clamp(1.6rem, 4vw, 2.3rem)", color: "var(--color-text-primary)", marginBottom: 10 }}>{selectedBottle.name}</h2>
              <p style={{ color: "rgba(245,237,214,0.7)", fontFamily: "var(--font-dm-sans)", fontSize: 15, marginBottom: 0 }}>
                {exactBottleDrops.length > 0
                  ? "Recent exact hits found below. Start with these locations."
                  : broaderBottleDrops.length > 0
                    ? "No exact location right now. These are the most recent areas where it moved."
                    : "No recent data found for this bottle in the current state view."}
              </p>
            </div>

            <div className="finder-panel" style={{ padding: 22, marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <MapPin size={16} color="var(--color-accent-amber)" />
                <h3 style={{ margin: 0, color: "var(--color-cream)", fontSize: 18, fontFamily: "var(--font-dm-sans)" }}>
                  {exactBottleDrops.length > 0 ? "Exact locations" : "Recent areas to watch"}
                </h3>
              </div>
              {(exactBottleDrops.length > 0 ? exactBottleDrops.slice(0, 10) : broaderBottleDrops.slice(0, 10)).map((drop, index) => {
                const summary = getDropSummary(drop);
                return (
                  <ResultRow
                    key={`${drop.timestamp}-${index}`}
                    title={summary.title}
                    detail={summary.detail}
                    meta={`${formatRelativeTime(summary.timestamp)}${summary.quantity ? ` · Qty ${summary.quantity}` : ""}`}
                  />
                );
              })}
              {exactBottleDrops.length === 0 && broaderBottleDrops.length === 0 ? <div className="finder-empty-card small">Nothing recent to show for this bottle yet.</div> : null}
            </div>

            <div className="finder-panel" style={{ padding: 22 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <Clock3 size={16} color="var(--color-accent-amber)" />
                <h3 style={{ margin: 0, color: "var(--color-cream)", fontSize: 18, fontFamily: "var(--font-dm-sans)" }}>Recent history</h3>
              </div>
              {bottleDrops.slice(0, 12).map((drop, index) => {
                const summary = getDropSummary(drop);
                return (
                  <ResultRow
                    key={`${drop.timestamp}-${drop.brand_name}-${index}`}
                    title={summary.title}
                    detail={getDisplayName(drop)}
                    meta={`${drop.event_type.replaceAll("_", " ")} · ${formatRelativeTime(drop.timestamp)}`}
                  />
                );
              })}
              {bottleDrops.length === 0 ? <div className="finder-empty-card small">No recent history for this bottle yet.</div> : null}
            </div>
          </motion.div>
        ) : null}

        {ready && mode === "store" && selectedStore ? (
          <motion.div key={`store-${selectedStore.id}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}>
            <div className="finder-panel" style={{ padding: 22, marginBottom: 16 }}>
              <h2 style={{ fontFamily: "var(--font-fraunces)", fontSize: "clamp(1.6rem, 4vw, 2.3rem)", color: "var(--color-text-primary)", marginBottom: 10 }}>{selectedStore.displayLabel}</h2>
              <p style={{ color: "rgba(245,237,214,0.7)", fontFamily: "var(--font-dm-sans)", fontSize: 15, marginBottom: 0 }}>
                Bottles and recent activity for this store or board.
              </p>
            </div>

            <div className="finder-panel" style={{ padding: 22, marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <Warehouse size={16} color="var(--color-accent-amber)" />
                <h3 style={{ margin: 0, color: "var(--color-cream)", fontSize: 18, fontFamily: "var(--font-dm-sans)" }}>What hit here recently</h3>
              </div>
              {topBottlesAtStore.map((item) => (
                <ResultRow key={item.bottle} title={item.bottle} meta={`${item.count} recent hits · last seen ${formatRelativeTime(item.lastSeen)}`} />
              ))}
              {topBottlesAtStore.length === 0 ? <div className="finder-empty-card small">No recent bottle activity found here.</div> : null}
            </div>

            <div className="finder-panel" style={{ padding: 22 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <Clock3 size={16} color="var(--color-accent-amber)" />
                <h3 style={{ margin: 0, color: "var(--color-cream)", fontSize: 18, fontFamily: "var(--font-dm-sans)" }}>Recent history</h3>
              </div>
              {storeDrops.map((drop, index) => (
                <ResultRow
                  key={`${drop.timestamp}-${drop.brand_name}-${index}`}
                  title={getDisplayName(drop)}
                  detail={getDropSummary(drop).title}
                  meta={`${drop.event_type.replaceAll("_", " ")} · ${formatRelativeTime(drop.timestamp)}`}
                />
              ))}
              {storeDrops.length === 0 ? <div className="finder-empty-card small">No recent history for this location yet.</div> : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}
