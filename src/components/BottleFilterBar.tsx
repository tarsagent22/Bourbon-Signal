"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, ChevronDown } from "lucide-react";
import type { Bottle } from "@/data/bottles";

interface BottleFilterBarProps {
  bottles: Bottle[];
  searchQuery: string;
  onSearchChange: (query: string) => void;
  activeTier: string;
  onTierChange: (tier: string) => void;
  sortBy: string;
  onSortChange: (sort: string) => void;
  activeDistillery?: string;
  onDistilleryChange?: (distillery: string) => void;
}

const sortOptions = [
  { value: "secondary", label: "Highest Secondary Value" },
  { value: "name", label: "Name A\u2013Z" },
  { value: "markup", label: "Biggest Markup" },
  { value: "recent", label: "Recently Dropped" },
];

export default function BottleFilterBar({
  bottles,
  searchQuery,
  onSearchChange,
  activeTier,
  onTierChange,
  sortBy,
  onSortChange,
  activeDistillery = "all",
  onDistilleryChange,
}: BottleFilterBarProps) {
  const [localQuery, setLocalQuery] = useState(searchQuery);
  const [sortOpen, setSortOpen] = useState(false);
  const [isStuck, setIsStuck] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const sortRef = useRef<HTMLDivElement>(null);
  const stickyRef = useRef<HTMLDivElement>(null);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onSearchChange(localQuery);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [localQuery, onSearchChange]);

  // Sync external query changes
  useEffect(() => {
    setLocalQuery(searchQuery);
  }, [searchQuery]);

  // Close sort dropdown on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) {
        setSortOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Detect sticky state
  useEffect(() => {
    const el = stickyRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setIsStuck(!entry.isIntersecting),
      { threshold: [1], rootMargin: "-65px 0px 0px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Build sorted unique distillery list
  const distilleries = Array.from(new Set(bottles.map((b) => b.distillery).filter(Boolean))).sort();

  const tierCounts = {
    all: bottles.length,
    unicorn: bottles.filter((b) => b.tier === "unicorn").length,
    allocated: bottles.filter((b) => b.tier === "allocated").length,
    limited: bottles.filter((b) => b.tier === "limited").length,
  };

  const tiers = [
    { key: "all", label: "All" },
    { key: "unicorn", label: "Unicorn" },
    { key: "allocated", label: "Allocated" },
    { key: "limited", label: "Limited" },
  ];

  const currentSort = sortOptions.find((s) => s.value === sortBy);

  return (
    <>
      {/* Sentinel for sticky detection */}
      <div ref={stickyRef} style={{ height: "1px", marginBottom: "-1px" }} />

      <div
        className="sticky z-40"
        style={{
          top: "64px",
          background: "var(--color-glass)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          borderBottom: isStuck
            ? "1px solid var(--color-card-border)"
            : "1px solid transparent",
          padding: "16px 0",
          transition: "border-color 300ms ease",
        }}
      >
        <div
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            padding: "0 clamp(20px, 5vw, 48px)",
          }}
        >
          {/* Search Input */}
          <div className="relative" style={{ marginBottom: "14px" }}>
            <Search
              size={16}
              className="absolute top-1/2 -translate-y-1/2"
              style={{
                color: searchFocused
                  ? "var(--color-amber-rich)"
                  : "var(--color-text-tertiary)",
                left: "14px",
                transition: "color 200ms ease",
              }}
            />
            <input
              type="text"
              placeholder="Search bottles, distilleries, flavors..."
              value={localQuery}
              onChange={(e) => setLocalQuery(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              className="w-full outline-none"
              style={{
                fontFamily: "var(--font-dm-sans)",
                fontSize: "14px",
                color: "var(--color-text-primary)",
                background: "var(--color-card-bg)",
                border: searchFocused
                  ? "1px solid var(--color-amber-rich)"
                  : "1px solid var(--color-card-border)",
                borderRadius: "10px",
                padding: "12px 16px 12px 40px",
                boxShadow: searchFocused
                  ? "0 0 20px rgba(196, 148, 58, 0.1)"
                  : "none",
                transition: "border-color 200ms ease, box-shadow 200ms ease",
              }}
            />
          </div>

          {/* Tier Pills + Distillery + Sort */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            {/* Tier Pills */}
            <div className="flex items-center gap-2 flex-wrap">
              {tiers.map((tier) => {
                const isActive = activeTier === tier.key;
                return (
                  <motion.button
                    key={tier.key}
                    onClick={() => onTierChange(tier.key)}
                    className="cursor-pointer"
                    style={{
                      fontFamily: "var(--font-dm-sans)",
                      fontSize: "12px",
                      fontWeight: 600,
                      background: isActive ? "#C4943A" : "transparent",
                      color: isActive ? "#1A1510" : "var(--color-text-secondary)",
                      border: isActive
                        ? "1px solid #C4943A"
                        : "1px solid rgba(255, 255, 255, 0.08)",
                      borderRadius: "20px",
                      padding: "6px 14px",
                      outline: "none",
                    }}
                    layout
                    transition={{ type: "spring", stiffness: 400, damping: 25 }}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    {tier.label} ({tierCounts[tier.key as keyof typeof tierCounts]})
                  </motion.button>
                );
              })}
            </div>

            {/* Distillery Dropdown + Sort */}
            <div className="flex items-center gap-2">
              {onDistilleryChange && distilleries.length > 0 && (
                <select
                  value={activeDistillery}
                  onChange={(e) => onDistilleryChange(e.target.value)}
                  style={{
                    fontFamily: "var(--font-dm-sans)",
                    fontSize: "12px",
                    fontWeight: 500,
                    color: activeDistillery !== "all" ? "var(--color-accent-amber)" : "var(--color-text-secondary)",
                    background: "rgba(36, 30, 25, 0.6)",
                    border: activeDistillery !== "all"
                      ? "1px solid rgba(196,148,58,0.4)"
                      : "1px solid rgba(255, 255, 255, 0.08)",
                    borderRadius: "20px",
                    padding: "6px 14px",
                    outline: "none",
                    cursor: "pointer",
                    maxWidth: "180px",
                  }}
                >
                  <option value="all">All Distilleries</option>
                  {distilleries.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              )}

            {/* Sort Dropdown */}
            <div className="relative" ref={sortRef}>
              <motion.button
                onClick={() => setSortOpen(!sortOpen)}
                className="flex items-center gap-2 cursor-pointer"
                style={{
                  fontFamily: "var(--font-dm-sans)",
                  fontSize: "12px",
                  fontWeight: 500,
                  color: "var(--color-text-secondary)",
                  background: "rgba(36, 30, 25, 0.6)",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  borderRadius: "20px",
                  padding: "6px 14px",
                  outline: "none",
                }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                {currentSort?.label || "Sort"}
                <motion.div
                  animate={{ rotate: sortOpen ? 180 : 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <ChevronDown size={14} />
                </motion.div>
              </motion.button>

              <AnimatePresence>
                {sortOpen && (
                  <motion.div
                    className="absolute right-0 mt-2 z-50 overflow-hidden"
                    style={{
                      width: "220px",
                      background: "var(--color-bg-secondary)",
                      border: "1px solid var(--color-amber-rich)",
                      borderRadius: "10px",
                      boxShadow: "0 12px 40px rgba(0, 0, 0, 0.5)",
                    }}
                    initial={{ opacity: 0, scale: 0.95, y: -4 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -4 }}
                    transition={{ duration: 0.2 }}
                  >
                    {sortOptions.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => {
                          onSortChange(opt.value);
                          setSortOpen(false);
                        }}
                        className="w-full text-left cursor-pointer"
                        style={{
                          fontFamily: "var(--font-dm-sans)",
                          fontSize: "13px",
                          color:
                            sortBy === opt.value
                              ? "var(--color-amber-rich)"
                              : "var(--color-text-secondary)",
                          background:
                            sortBy === opt.value
                              ? "rgba(196, 148, 58, 0.08)"
                              : "transparent",
                          border: "none",
                          padding: "10px 16px",
                          transition: "background 150ms ease",
                          outline: "none",
                        }}
                        onMouseEnter={(e) => {
                          if (sortBy !== opt.value) {
                            e.currentTarget.style.background =
                              "rgba(196, 148, 58, 0.05)";
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (sortBy !== opt.value) {
                            e.currentTarget.style.background = "transparent";
                          }
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            </div>{/* end Distillery + Sort flex wrapper */}
          </div>
        </div>
      </div>
    </>
  );
}
