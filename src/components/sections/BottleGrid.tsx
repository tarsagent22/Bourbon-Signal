"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { staggerContainer } from "@/lib/animations";
import { Lock } from "lucide-react";
import { bottles as allBottles } from "@/data/bottles";
import type { Bottle } from "@/data/bottles";
import BottleCard from "@/components/BottleCard";
import BottleDetail from "@/components/BottleDetail";
import BottleFilterBar from "@/components/BottleFilterBar";

const IS_FREE_USER = true; // Simulated — toggle for paywall
const FREE_VISIBLE_COUNT = 6;

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
        b.secondaryLow && b.msrp > 0
          ? b.secondaryLow / b.msrp
          : 0;
      return sorted.sort((a, b) => getMarkup(b) - getMarkup(a));
    }
    case "recent":
      return sorted.sort((a, b) => {
        if (!a.lastSeen) return 1;
        if (!b.lastSeen) return -1;
        return new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime();
      });
    default:
      return sorted;
  }
}

export default function BottleGrid() {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTier, setActiveTier] = useState("all");
  const [sortBy, setSortBy] = useState("secondary");
  const [selectedBottle, setSelectedBottle] = useState<Bottle | null>(null);

  // Sync URL search params on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tier = params.get("tier");
    const sort = params.get("sort");
    if (tier && ["all", "unicorn", "allocated", "limited"].includes(tier)) {
      setActiveTier(tier);
    }
    if (sort && ["name", "secondary", "markup", "recent"].includes(sort)) {
      setSortBy(sort);
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
    let result = allBottles;

    // Filter by tier
    if (activeTier !== "all") {
      result = result.filter((b) => b.tier === activeTier);
    }

    // Filter by search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (b) =>
          b.name.toLowerCase().includes(q) ||
          b.distillery.toLowerCase().includes(q) ||
          (b.flavor && b.flavor.some((f) => f.toLowerCase().includes(q)))
      );
    }

    // Sort
    return sortBottles(result, sortBy);
  }, [activeTier, searchQuery, sortBy]);

  return (
    <>
      <BottleFilterBar
        bottles={allBottles}
        searchQuery={searchQuery}
        onSearchChange={handleSearchChange}
        activeTier={activeTier}
        onTierChange={setActiveTier}
        sortBy={sortBy}
        onSortChange={setSortBy}
      />

      <div className="max-w-7xl mx-auto px-6 md:px-8" style={{ paddingTop: "32px", paddingBottom: "40px" }}>
        {filteredBottles.length === 0 ? (
          <div className="text-center py-20">
            <p
              style={{
                fontFamily: "var(--font-dm-sans)",
                fontSize: "16px",
                color: "var(--color-text-tertiary)",
              }}
            >
              No bottles match your search.
            </p>
          </div>
        ) : (
          <>
            <motion.div
              className="grid gap-6"
              style={{
                gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
              }}
              variants={staggerContainer}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-50px" }}
            >
              {filteredBottles.map((bottle, index) => {
                const isBlurred =
                  IS_FREE_USER && index >= FREE_VISIBLE_COUNT;

                return (
                  <BottleCard
                    key={bottle.id}
                    bottle={bottle}
                    onClick={() => setSelectedBottle(bottle)}
                    isBlurred={isBlurred}
                    isFreeUser={IS_FREE_USER}
                  />
                );
              })}
            </motion.div>

            {/* Paywall CTA */}
            {IS_FREE_USER && filteredBottles.length > FREE_VISIBLE_COUNT && (
              <div
                className="relative mt-[-120px] pt-32 pb-16 text-center"
                style={{
                  background:
                    "linear-gradient(to bottom, transparent 0%, var(--color-bg-primary) 40%)",
                }}
              >
                <Lock
                  size={32}
                  style={{
                    color: "var(--color-accent-amber)",
                    margin: "0 auto 16px",
                    opacity: 0.6,
                  }}
                />
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
                    marginBottom: "8px",
                    maxWidth: "440px",
                    marginLeft: "auto",
                    marginRight: "auto",
                  }}
                >
                  Get secondary market pricing, multiplier data, and drop history
                  for every bottle we track.
                </p>
                <p
                  style={{
                    fontFamily: "var(--font-jetbrains)",
                    fontSize: "13px",
                    color: "var(--color-text-tertiary)",
                    marginBottom: "24px",
                  }}
                >
                  Starting at $9/mo with Standard Proof
                </p>
                <a
                  href="/#pricing"
                  className="inline-block px-8 py-3 rounded-lg"
                  style={{
                    fontFamily: "var(--font-dm-sans)",
                    fontSize: "15px",
                    fontWeight: 600,
                    color: "#0D0B0E",
                    background:
                      "linear-gradient(135deg, #C4943A 0%, #D4A44A 100%)",
                    textDecoration: "none",
                    transition: "opacity 300ms ease",
                  }}
                >
                  View Plans
                </a>
              </div>
            )}
          </>
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
