"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth as useClerkAuth } from "@clerk/nextjs";
import { motion, AnimatePresence } from "framer-motion";
import type { Bottle } from "@/data/bottles";
import BottleCard from "@/components/BottleCard";
import BottleDetail from "@/components/BottleDetail";
import BottleFilterBar from "@/components/BottleFilterBar";
import { useAuth } from "@/lib/auth";
import { useStatePreferences } from "@/lib/statePreferences";
import { useWatchlistStore } from "@/lib/watchlist";
import { isInStockNow, isSeenThisWeek } from "@/lib/availability";
import { canonicalBottleKey, dropMatchesBottle } from "@/lib/bottleIdentity";

const FREE_VISIBLE_COUNT = 6;
const TESTER_MODE = true;

function sortBottles(list: Bottle[], sortBy: string): Bottle[] {
  const sorted = [...list];
  switch (sortBy) {
    case "name":
      return sorted.sort((a, b) => a.name.localeCompare(b.name));
    case "secondary":
      return sorted.sort(
        (a, b) => (b.secondaryLow || 0) - (a.secondaryLow || 0)
      );
    case "recent":
      return sorted.sort((a, b) => {
        // Bottles with last_drop first, sorted by recency
        const aDate = a.last_drop ? new Date(a.last_drop).getTime() : 0;
        const bDate = b.last_drop ? new Date(b.last_drop).getTime() : 0;
        if (!aDate && !bDate) return 0;
        if (!aDate) return 1;
        if (!bDate) return -1;
        return bDate - aDate;
      });
    default:
      return sorted;
  }
}

function getBlurAmount(index: number): number {
  const offset = index - FREE_VISIBLE_COUNT;
  if (offset <= 0) return 0;
  if (offset === 1) return 2;
  if (offset === 2) return 4;
  return 6;
}

interface BottleGridProps {
  bottles: Bottle[];
  loading?: boolean;
}

export default function BottleGrid({ bottles: propBottles, loading = false }: BottleGridProps) {
  const { isSignedIn } = useAuth();
  const IS_FREE_USER = !isSignedIn;
  const router = useRouter();
  const { isSignedIn: clerkSignedIn } = useClerkAuth();

  const handleCheckout = async (plan: "monthly" | "annual" | "founder") => {
    if (TESTER_MODE) {
      router.push("/dashboard");
      return;
    }
    if (!clerkSignedIn) {
      router.push(`/sign-up?redirect_url=/dashboard`);
      return;
    }
    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan }),
    });
    const data = await res.json();
    if (data.url) window.location.href = data.url;
  };

  const { selectedStates, hasSelectedStates } = useStatePreferences();
  const { watchedBottles } = useWatchlistStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [activeDistillery, setActiveDistillery] = useState("all");
  const [sortBy, setSortBy] = useState("recent");
  const [selectedBottle, setSelectedBottle] = useState<Bottle | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const ITEMS_PER_PAGE = 24;

  // Sync URL search params on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const filter = params.get("filter");
    const sort = params.get("sort");
    const highlight = params.get("highlight");
    if (filter && ["all", "in-stock", "seen-week", "my-states"].includes(filter)) {
      setActiveFilter(filter);
    }
    if (sort && ["name", "secondary", "recent"].includes(sort)) {
      setSortBy(sort);
    }
    if (highlight) {
      setHighlightId(highlight);
      requestAnimationFrame(() => {
        const el = document.getElementById(`bottle-${highlight}`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      });
      setTimeout(() => setHighlightId(null), 2000);
    }
  }, []);

  // Update URL when filters change
  useEffect(() => {
    const params = new URLSearchParams();
    if (activeFilter !== "all") params.set("filter", activeFilter);
    if (sortBy !== "recent") params.set("sort", sortBy);
    const qs = params.toString();
    const newUrl = qs
      ? `${window.location.pathname}?${qs}`
      : window.location.pathname;
    window.history.replaceState(null, "", newUrl);
  }, [activeFilter, sortBy]);

  // Reset to page 1 whenever filters/search change
  useEffect(() => {
    setPage(1);
  }, [searchQuery, activeFilter, activeDistillery]);

  const handleSearchChange = useCallback((query: string) => {
    setSearchQuery(query);
  }, []);

  // Filter bottles by state preferences first
  const stateFilteredBottles = useMemo(() => {
    if (!hasSelectedStates || selectedStates.length === 0) return propBottles;
    return propBottles.filter((b) => {
      const bottleStates = Array.isArray(b.states) && b.states.length > 0 ? b.states : (b.state ? [b.state] : []);
      if (bottleStates.length === 0) return true;
      return bottleStates.some((state) => selectedStates.includes(state));
    });
  }, [propBottles, selectedStates, hasSelectedStates]);

  const filteredBottles = useMemo(() => {
    let result = stateFilteredBottles;

    // Apply availability filter
    switch (activeFilter) {
      case "in-stock":
        result = result.filter((b) => isInStockNow(b));
        break;
      case "seen-week":
        result = result.filter((b) => isSeenThisWeek(b));
        break;
      case "my-states":
        if (hasSelectedStates && selectedStates.length > 0) {
          result = result.filter((b) => {
            const bottleStates = Array.isArray(b.states) && b.states.length > 0 ? b.states : (b.state ? [b.state] : []);
            return bottleStates.some((state) => selectedStates.includes(state));
          });
        }
        break;
    }

    if (activeDistillery !== "all") {
      result = result.filter((b) => b.distillery === activeDistillery);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (b) =>
          b.name.toLowerCase().includes(q) ||
          b.distillery.toLowerCase().includes(q) ||
          (b.flavor && b.flavor.some((f) => f.toLowerCase().includes(q)))
      );
    }

    return sortBottles(result, sortBy);
  }, [stateFilteredBottles, activeFilter, searchQuery, sortBy, activeDistillery, hasSelectedStates, selectedStates]);

  // Pagination
  const totalPages = Math.ceil(filteredBottles.length / ITEMS_PER_PAGE);
  const startIdx = (page - 1) * ITEMS_PER_PAGE;
  const endIdx = startIdx + ITEMS_PER_PAGE;
  const paginatedBottles = filteredBottles.slice(startIdx, endIdx);

  // Loading state
  if (loading) {
    return (
      <div
        style={{
          padding: "120px 0",
          textAlign: "center",
        }}
      >
        <p
          style={{
            fontFamily: "var(--font-dm-sans)",
            fontSize: "15px",
            color: "var(--color-text-tertiary)",
          }}
        >
          Loading bottles...
        </p>
      </div>
    );
  }

  return (
    <>
      <BottleFilterBar
        bottles={propBottles}
        searchQuery={searchQuery}
        onSearchChange={handleSearchChange}
        activeFilter={activeFilter}
        onFilterChange={setActiveFilter}
        sortBy={sortBy}
        onSortChange={setSortBy}
        activeDistillery={activeDistillery}
        onDistilleryChange={setActiveDistillery}
      />

      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: "32px clamp(20px, 5vw, 48px) 40px",
        }}
      >
        {/* State filter indicator */}
        {hasSelectedStates && selectedStates.length > 0 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              marginBottom: "20px",
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-dm-sans)",
                fontSize: "12px",
                color: "var(--color-text-tertiary)",
              }}
            >
              Showing bottles from
            </span>
            {selectedStates.map((s) => (
              <span
                key={s}
                style={{
                  fontFamily: "var(--font-jetbrains)",
                  fontSize: "11px",
                  fontWeight: 700,
                  letterSpacing: "0.05em",
                  color: "var(--color-accent-amber)",
                  background: "rgba(196, 148, 58, 0.1)",
                  border: "1px solid rgba(196, 148, 58, 0.2)",
                  padding: "2px 8px",
                  borderRadius: "4px",
                }}
              >
                {s}
              </span>
            ))}
          </div>
        )}

        {filteredBottles.length === 0 ? (
          <div style={{ padding: "80px 0", textAlign: "center" }}>
            <p
              style={{
                fontFamily: "var(--font-playfair)",
                fontSize: "18px",
                color: "var(--color-cream)",
                marginBottom: "8px",
              }}
            >
              No bottles match your filters
            </p>
            <p
              style={{
                fontFamily: "var(--font-dm-sans)",
                fontSize: "13px",
                color: "var(--color-text-tertiary)",
                marginBottom: "20px",
              }}
            >
              Try adjusting your filters or search term
            </p>
            <button
              onClick={() => {
                setSearchQuery("");
                setActiveFilter("all");
                setActiveDistillery("all");
                setSortBy("recent");
              }}
              style={{
                fontFamily: "var(--font-dm-sans)",
                fontSize: "13px",
                fontWeight: 600,
                color: "var(--color-accent-amber)",
                background: "transparent",
                border: "1px solid rgba(196,148,58,0.3)",
                borderRadius: "8px",
                padding: "10px 20px",
                cursor: "pointer",
                transition: "all 200ms ease",
              }}
            >
              Clear filters
            </button>
          </div>
        ) : (
          <div className="relative">
            <motion.div
              className="grid"
              style={{
                gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
                gap: "24px",
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
            >
              {paginatedBottles.map((bottle, index) => {
                const globalIndex = startIdx + index;
                const isBlurred =
                  IS_FREE_USER && globalIndex >= FREE_VISIBLE_COUNT;
                const blurAmount = IS_FREE_USER
                  ? getBlurAmount(globalIndex)
                  : 0;

                return (
                  <BottleCard
                    key={bottle.id}
                    bottle={bottle}
                    onClick={() => setSelectedBottle(bottle)}
                    isBlurred={isBlurred}
                    blurAmount={blurAmount}
                    isFreeUser={IS_FREE_USER}
                    isHighlighted={highlightId === bottle.id}
                    lastSeenTimestamp={bottle.last_drop || bottle.lastSeen}
                    lastSeenLocation={bottle.state || bottle.states?.[0]}
                  />
                );
              })}
            </motion.div>

            {/* Pagination Controls */}
            {totalPages > 1 && !(IS_FREE_USER && filteredBottles.length > FREE_VISIBLE_COUNT) && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "16px",
                  marginTop: "40px",
                  paddingBottom: "8px",
                }}
              >
                <button
                  onClick={() => {
                    setPage((p) => Math.max(1, p - 1));
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  disabled={page === 1}
                  style={{
                    fontFamily: "var(--font-dm-sans)",
                    fontSize: "13px",
                    fontWeight: 600,
                    color: page === 1 ? "var(--color-text-tertiary)" : "var(--color-accent-amber)",
                    background: "transparent",
                    border: `1px solid ${page === 1 ? "rgba(255,255,255,0.08)" : "rgba(196,148,58,0.3)"}`,
                    borderRadius: "8px",
                    padding: "8px 18px",
                    cursor: page === 1 ? "not-allowed" : "pointer",
                    opacity: page === 1 ? 0.4 : 1,
                    transition: "all 200ms ease",
                  }}
                >
                  ← Previous
                </button>
                <span
                  style={{
                    fontFamily: "var(--font-dm-sans)",
                    fontSize: "13px",
                    color: "var(--color-text-secondary)",
                  }}
                >
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => {
                    setPage((p) => Math.min(totalPages, p + 1));
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  disabled={page === totalPages}
                  style={{
                    fontFamily: "var(--font-dm-sans)",
                    fontSize: "13px",
                    fontWeight: 600,
                    color: page === totalPages ? "var(--color-text-tertiary)" : "var(--color-accent-amber)",
                    background: "transparent",
                    border: `1px solid ${page === totalPages ? "rgba(255,255,255,0.08)" : "rgba(196,148,58,0.3)"}`,
                    borderRadius: "8px",
                    padding: "8px 18px",
                    cursor: page === totalPages ? "not-allowed" : "pointer",
                    opacity: page === totalPages ? 0.4 : 1,
                    transition: "all 200ms ease",
                  }}
                >
                  Next →
                </button>
              </div>
            )}

            {/* Blur Wall CTA */}
            {IS_FREE_USER && filteredBottles.length > FREE_VISIBLE_COUNT && (
              <div
                className="relative"
                style={{
                  marginTop: "-160px",
                  paddingTop: "80px",
                  paddingBottom: "60px",
                  background:
                    "linear-gradient(to bottom, transparent 0%, var(--color-bg-primary) 50%)",
                  textAlign: "center",
                }}
              >
                <h3
                  style={{
                    fontFamily: "var(--font-playfair)",
                    fontSize: "28px",
                    fontWeight: 700,
                    color: "var(--color-cream)",
                    marginBottom: "12px",
                  }}
                >
                  Unlock the full library
                </h3>
                <p
                  style={{
                    fontFamily: "var(--font-dm-sans)",
                    fontSize: "15px",
                    color: "var(--color-text-secondary)",
                    marginBottom: "28px",
                    maxWidth: "480px",
                    marginLeft: "auto",
                    marginRight: "auto",
                    lineHeight: 1.6,
                  }}
                >
              Access drop history, bottle alerts, and watchlists
                  for {propBottles.length}+ bottles
                </p>
                <div className="flex items-center justify-center gap-4 flex-wrap">
                  <button
                    onClick={() => handleCheckout("monthly")}
                    className="inline-block rounded-lg"
                    style={{
                      fontFamily: "var(--font-dm-sans)",
                      fontSize: "15px",
                      fontWeight: 600,
                      color: "var(--color-accent-amber)",
                      background: "transparent",
                      border: "2px solid var(--color-accent-amber)",
                      padding: "12px 24px",
                      borderRadius: "8px",
                      cursor: "pointer",
                      transition: "all 200ms ease",
                    }}
                  >
                    Open beta dashboard
                  </button>
                  <button
                    onClick={() => handleCheckout("founder")}
                    className="inline-block rounded-lg"
                    style={{
                      fontFamily: "var(--font-dm-sans)",
                      fontSize: "15px",
                      fontWeight: 600,
                      color: "#1A1510",
                      background:
                        "linear-gradient(135deg, #C4943A 0%, #D4A44A 100%)",
                      padding: "14px 28px",
                      borderRadius: "8px",
                      cursor: "pointer",
                      border: "none",
                      transition: "all 200ms ease",
                    }}
                  >
                    Join tester flow
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Detail Panel */}
      <AnimatePresence>
        {selectedBottle && (
          <BottleDetail
            bottle={selectedBottle}
            onClose={() => setSelectedBottle(null)}
            isFreeUser={IS_FREE_USER}
          />
        )}
      </AnimatePresence>
    </>
  );
}
