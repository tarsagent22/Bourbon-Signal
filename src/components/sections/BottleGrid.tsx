"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Bottle } from "@/data/bottles";
import BottleCard from "@/components/BottleCard";
import BottleDetail from "@/components/BottleDetail";
import BottleFilterBar from "@/components/BottleFilterBar";
import { useAuth } from "@/lib/auth";
import dropsData from "@/data/drops.json";
import { getDisplayName } from "@/lib/drops";
import type { DropEvent } from "@/lib/drops";

const FREE_VISIBLE_COUNT = 6;

// Build a lookup: normalized bottle name → most recent matching drop
function buildLastSeenLookup(drops: DropEvent[]): Map<string, { timestamp: string; location: string }> {
  const map = new Map<string, { timestamp: string; location: string }>();
  for (const event of drops) {
    const name = getDisplayName(event).toLowerCase().trim();
    if (!name || name === "unknown bottle") continue;
    const existing = map.get(name);
    if (!existing || event.timestamp > existing.timestamp) {
      // Build location string
      let location = "";
      if (event.stores && event.stores.length > 0 && event.stores[0].city) {
        location = `${event.stores[0].city.replace(/\b\w/g, (c) => c.toUpperCase())}, ${event.state || ""}`.trim().replace(/,$/, "");
      } else if (event.state) {
        location = event.state;
      }
      map.set(name, { timestamp: event.timestamp, location });
    }
  }
  return map;
}

// Custom stagger for 0.08s between cards
const cardStagger = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
  },
};

function sortBottles(list: Bottle[], sortBy: string): Bottle[] {
  const sorted = [...list];
  switch (sortBy) {
    case "name":
      return sorted.sort((a, b) => a.name.localeCompare(b.name));
    case "secondary":
      return sorted.sort(
        (a, b) => (b.secondaryLow || 0) - (a.secondaryLow || 0)
      );
    case "markup": {
      const getMarkup = (b: Bottle) =>
        b.secondaryLow && b.msrp > 0 ? b.secondaryLow / b.msrp : 0;
      return sorted.sort((a, b) => getMarkup(b) - getMarkup(a));
    }
    case "recent":
      return sorted.sort((a, b) => {
        if (!a.lastSeen) return 1;
        if (!b.lastSeen) return -1;
        return (
          new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime()
        );
      });
    default:
      return sorted;
  }
}

function getBlurAmount(index: number): number {
  // Progressive blur for cards beyond the free limit
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
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTier, setActiveTier] = useState("all");
  const [activeDistillery, setActiveDistillery] = useState("all");
  const [sortBy, setSortBy] = useState("secondary");
  const [selectedBottle, setSelectedBottle] = useState<Bottle | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);

  // Build last-seen lookup from static drops data
  const lastSeenLookup = useMemo(
    () => buildLastSeenLookup((dropsData as { drops: DropEvent[] }).drops),
    []
  );

  // Sync URL search params on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tier = params.get("tier");
    const sort = params.get("sort");
    const highlight = params.get("highlight");
    if (tier && ["all", "unicorn", "allocated", "limited"].includes(tier)) {
      setActiveTier(tier);
    }
    if (sort && ["name", "secondary", "markup", "recent"].includes(sort)) {
      setSortBy(sort);
    }
    if (highlight) {
      setHighlightId(highlight);
      // Scroll to the highlighted card after render
      requestAnimationFrame(() => {
        const el = document.getElementById(`bottle-${highlight}`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      });
      // Clear highlight after 2s
      setTimeout(() => setHighlightId(null), 2000);
    }
  }, []);

  // Update URL when filters change
  useEffect(() => {
    const params = new URLSearchParams();
    if (activeTier !== "all") params.set("tier", activeTier);
    if (sortBy !== "secondary") params.set("sort", sortBy);
    const qs = params.toString();
    const newUrl = qs
      ? `${window.location.pathname}?${qs}`
      : window.location.pathname;
    window.history.replaceState(null, "", newUrl);
  }, [activeTier, sortBy]);

  const handleSearchChange = useCallback((query: string) => {
    setSearchQuery(query);
  }, []);

  const filteredBottles = useMemo(() => {
    let result = propBottles;

    if (activeTier !== "all") {
      result = result.filter((b) => b.tier === activeTier);
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
  }, [propBottles, activeTier, searchQuery, sortBy, activeDistillery]);

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
        activeTier={activeTier}
        onTierChange={setActiveTier}
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
              No bottles match your search
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
                setActiveTier("all");
                setActiveDistillery("all");
                setSortBy("secondary");
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
              variants={cardStagger}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-50px" }}
            >
              {filteredBottles.map((bottle, index) => {
                const isBlurred =
                  IS_FREE_USER && index >= FREE_VISIBLE_COUNT;
                const blurAmount = IS_FREE_USER
                  ? getBlurAmount(index)
                  : 0;

                // Find last-seen from drops data using partial name match
                const bottleNameNorm = bottle.name.toLowerCase().trim();
                let lastSeenInfo: { timestamp: string; location: string } | undefined;
                // Try exact match first
                lastSeenInfo = lastSeenLookup.get(bottleNameNorm);
                // If no exact match, try partial match
                if (!lastSeenInfo) {
                  for (const [key, val] of lastSeenLookup) {
                    if (bottleNameNorm.includes(key) || key.includes(bottleNameNorm)) {
                      lastSeenInfo = val;
                      break;
                    }
                  }
                }

                return (
                  <BottleCard
                    key={bottle.id}
                    bottle={bottle}
                    onClick={() => setSelectedBottle(bottle)}
                    isBlurred={isBlurred}
                    blurAmount={blurAmount}
                    isFreeUser={IS_FREE_USER}
                    isHighlighted={highlightId === bottle.id}
                    lastSeenTimestamp={lastSeenInfo?.timestamp}
                    lastSeenLocation={lastSeenInfo?.location}
                  />
                );
              })}
            </motion.div>

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
                  Access secondary market data, drop history, and watchlists
                  for {propBottles.length}+ bottles
                </p>
                <div className="flex items-center justify-center gap-4 flex-wrap">
                  <a
                    href="/#pricing"
                    className="inline-block rounded-lg"
                    style={{
                      fontFamily: "var(--font-dm-sans)",
                      fontSize: "15px",
                      fontWeight: 600,
                      color: "var(--color-accent-amber)",
                      background: "transparent",
                      border: "2px solid var(--color-accent-amber)",
                      padding: "12px 24px",
                      textDecoration: "none",
                      borderRadius: "8px",
                      transition: "all 200ms ease",
                    }}
                  >
                    Start Hunting — $10/mo
                  </a>
                  <a
                    href="/#pricing"
                    className="inline-block rounded-lg"
                    style={{
                      fontFamily: "var(--font-dm-sans)",
                      fontSize: "15px",
                      fontWeight: 600,
                      color: "#1A1510",
                      background:
                        "linear-gradient(135deg, #C4943A 0%, #D4A44A 100%)",
                      padding: "14px 28px",
                      textDecoration: "none",
                      borderRadius: "8px",
                      transition: "all 200ms ease",
                    }}
                  >
                    Claim Your Spot — $69
                  </a>
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
