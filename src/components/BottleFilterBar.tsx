"use client";

import { useState, useEffect, useRef } from "react";
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
}: BottleFilterBarProps) {
  const [localQuery, setLocalQuery] = useState(searchQuery);
  const [sortOpen, setSortOpen] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const sortRef = useRef<HTMLDivElement>(null);

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
    <div
      className="sticky z-40"
      style={{
        top: "64px",
        background: "var(--color-glass)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        borderBottom: "1px solid rgba(212, 146, 11, 0.08)",
        padding: "16px 0",
      }}
    >
      <div className="max-w-7xl mx-auto px-6 md:px-8">
        {/* Search Input */}
        <div className="relative" style={{ marginBottom: "14px" }}>
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: "var(--color-text-tertiary)" }}
          />
          <input
            type="text"
            placeholder="Search bottles..."
            value={localQuery}
            onChange={(e) => setLocalQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-lg outline-none"
            style={{
              fontFamily: "var(--font-dm-sans)",
              fontSize: "14px",
              color: "var(--color-text-primary)",
              background: "rgba(36, 30, 25, 0.6)",
              border: "1px solid rgba(212, 146, 11, 0.1)",
              transition: "border-color 300ms ease",
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = "var(--color-accent-amber)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "rgba(212, 146, 11, 0.1)";
            }}
          />
        </div>

        {/* Tier Pills + Sort */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          {/* Tier Pills */}
          <div className="flex items-center gap-2 flex-wrap">
            {tiers.map((tier) => {
              const isActive = activeTier === tier.key;
              return (
                <button
                  key={tier.key}
                  onClick={() => onTierChange(tier.key)}
                  className="px-3 py-1.5 rounded-full cursor-pointer transition-all duration-200"
                  style={{
                    fontFamily: "var(--font-dm-sans)",
                    fontSize: "12px",
                    fontWeight: 600,
                    background: isActive
                      ? "var(--color-accent-amber)"
                      : "transparent",
                    color: isActive ? "#0D0B07" : "var(--color-text-secondary)",
                    border: isActive
                      ? "1px solid var(--color-accent-amber)"
                      : "1px solid rgba(212, 146, 11, 0.15)",
                  }}
                >
                  {tier.label} ({tierCounts[tier.key as keyof typeof tierCounts]})
                </button>
              );
            })}
          </div>

          {/* Sort Dropdown */}
          <div className="relative" ref={sortRef}>
            <button
              onClick={() => setSortOpen(!sortOpen)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer"
              style={{
                fontFamily: "var(--font-dm-sans)",
                fontSize: "12px",
                color: "var(--color-text-secondary)",
                background: "rgba(36, 30, 25, 0.6)",
                border: "1px solid rgba(212, 146, 11, 0.1)",
              }}
            >
              {currentSort?.label || "Sort"}
              <ChevronDown size={14} />
            </button>

            {sortOpen && (
              <div
                className="absolute right-0 mt-2 rounded-lg overflow-hidden z-50"
                style={{
                  width: "220px",
                  background: "var(--color-bg-secondary)",
                  border: "1px solid var(--color-card-border)",
                  boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4)",
                }}
              >
                {sortOptions.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => {
                      onSortChange(opt.value);
                      setSortOpen(false);
                    }}
                    className="w-full text-left px-4 py-2.5 cursor-pointer"
                    style={{
                      fontFamily: "var(--font-dm-sans)",
                      fontSize: "13px",
                      color:
                        sortBy === opt.value
                          ? "var(--color-accent-amber)"
                          : "var(--color-text-secondary)",
                      background:
                        sortBy === opt.value
                          ? "rgba(196, 135, 10, 0.08)"
                          : "transparent",
                      border: "none",
                      transition: "background 150ms ease",
                    }}
                    onMouseEnter={(e) => {
                      if (sortBy !== opt.value) {
                        e.currentTarget.style.background = "rgba(255,255,255,0.03)";
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
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
