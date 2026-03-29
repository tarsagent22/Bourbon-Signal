"use client";

import { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import type { Bottle } from "@/data/bottles";
import type { DropEvent } from "@/lib/drops";
import { getDisplayName, formatRelativeTime, cleanCountyName, TIER_CONFIG } from "@/lib/drops";
import { useUserPreferences } from "@/hooks/useUserPreferences";

interface DropHistoryModalProps {
  bottle: Bottle;
  isOpen: boolean;
  onClose: () => void;
}

/** Derive a short location label from a drop event */
function getDropLocation(drop: DropEvent): string {
  if (drop.state === "VA" && drop.stores && drop.stores.length > 0) {
    const firstStore = drop.stores[0];
    const city = firstStore.city
      ? firstStore.city.replace(/\b\w/g, (c) => c.toUpperCase())
      : null;
    return city ? `${city}, VA` : "VA";
  }
  if (drop.board_name) {
    const county = cleanCountyName(drop.board_name);
    return county ? `${county}, NC` : "NC";
  }
  return drop.state || "";
}

/** Derive a store/board display name from a drop event */
function getStoreName(drop: DropEvent): string {
  // PA store-level events
  if (drop.state_code === "PA" || drop.state === "PA") {
    if (drop.store_name) return drop.store_name;
    if (drop.store_city) return `PA — ${drop.store_city}`;
    if ((drop as any).stores_in_stock) return `${(drop as any).stores_in_stock} PA stores`;
    return "Pennsylvania ABC Store";
  }
  // VA events
  if ((drop.state === "VA" || (drop as any).state_code === "VA") && drop.stores && drop.stores.length > 0) {
    const count = drop.stores.length;
    if (count === 1) {
      const city = drop.stores[0].city;
      return city ? `VA ABC — ${city.replace(/\b\w/g, (c) => c.toUpperCase())}` : "VA ABC Store";
    }
    return `${count} VA ABC stores`;
  }
  // NC events — board_name is the county/board
  if (drop.board_name) {
    const county = cleanCountyName(drop.board_name);
    if (county) return `${county} ABC Board`;
    // board_name might be a store name for some scrapers
    if (drop.board_name.length < 60) return drop.board_name;
  }
  // NC warehouse/price events — these aren't store-level, show NC distribution
  if (!drop.state || drop.state === "NC") {
    const types: Record<string, string> = {
      new_shipment: "NC ABC Warehouse",
      allocation_assigned: "NC ABC Distribution",
      price_change: "NC ABC Price List",
      in_store: "NC ABC Store",
    };
    return types[drop.event_type] || "NC ABC";
  }
  return "State ABC Store";
}

export default function DropHistoryModal({ bottle, isOpen, onClose }: DropHistoryModalProps) {
  // TODO: When preferences are wired (Clerk profile / auth store), this hook
  // will return actual states/stores/boards so the filter below activates.
  const preferences = useUserPreferences();

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  // Lock body scroll while modal is open
  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const [allDrops, setAllDrops] = useState<DropEvent[]>([]);

  // Fetch drops from live API instead of static file
  useEffect(() => {
    if (!isOpen) return;
    fetch("/api/drops")
      .then((r) => r.json())
      .then((data) => setAllDrops(data.drops || []))
      .catch(() => setAllDrops([]));
  }, [isOpen]);

  const recentDrops = useMemo(() => {
    // Match drops by name — use fuzzy matching (contains) to handle name variants
    const bottleName = bottle.name.toLowerCase().replace(/['']/g, "").trim();
    let filtered = allDrops.filter((d) => {
      const dropName = getDisplayName(d).toLowerCase().replace(/['']/g, "").trim();
      // Exact match or significant substring match
      return dropName === bottleName || 
        dropName.includes(bottleName) || 
        bottleName.includes(dropName);
    });

    // TODO: When preferences.states is populated (user has set area preferences),
    // this filter will narrow results to their preferred states.
    if (preferences.states.length > 0) {
      filtered = filtered.filter((d) => {
        const dropState = d.state || "NC"; // NC drops don't have explicit state field
        return preferences.states.includes(dropState);
      });
    }

    // TODO: When preferences.boards is populated, filter to preferred NC boards.
    if (preferences.boards.length > 0) {
      filtered = filtered.filter((d) => {
        if (!d.board_name) return true; // not a board-based event, keep it
        return preferences.boards.some((b) =>
          d.board_name!.toLowerCase().includes(b.toLowerCase())
        );
      });
    }

    // Sort newest first, take top 5
    return [...filtered]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 5);
  }, [bottle.name, preferences]);

  if (!isOpen) return null;

  const hasPreferences = preferences.states.length > 0 || preferences.boards.length > 0;

  // Use a portal to render at document.body — prevents parent transforms/overflow from breaking fixed positioning
  const modalContent = (
    /* Backdrop */
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{
        zIndex: 1000,
        background: "rgba(0, 0, 0, 0.72)",
        backdropFilter: "blur(4px)",
        padding: "clamp(16px, 4vw, 32px)",
      }}
      onClick={onClose}
    >
      {/* Modal card — stop propagation so inner clicks don't close */}
      <div
        className="relative w-full flex flex-col"
        style={{
          maxWidth: "500px",
          background: "var(--color-bg-secondary)",
          border: "1px solid var(--color-card-border)",
          borderTop: "2px solid var(--color-accent-amber)",
          borderRadius: "12px",
          overflow: "hidden",
          maxHeight: "85vh",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-start justify-between"
          style={{
            padding: "20px 20px 16px",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            flexShrink: 0,
          }}
        >
          <div>
            <p
              style={{
                fontFamily: "var(--font-dm-sans)",
                fontSize: "10px",
                fontWeight: 600,
                letterSpacing: "0.12em",
                color: "var(--color-accent-amber)",
                textTransform: "uppercase",
                marginBottom: "4px",
              }}
            >
              Drop History
            </p>
            <h2
              style={{
                fontFamily: "var(--font-playfair)",
                fontSize: "16px",
                fontWeight: 700,
                color: "var(--color-text-primary)",
                lineHeight: 1.3,
              }}
            >
              {bottle.name}
            </h2>
          </div>

          {/* Close button */}
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "6px",
              color: "var(--color-text-tertiary)",
              fontFamily: "var(--font-dm-sans)",
              fontSize: "18px",
              lineHeight: 1,
              width: "32px",
              height: "32px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              flexShrink: 0,
              marginLeft: "12px",
              transition: "color 150ms ease, border-color 150ms ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--color-text-primary)";
              e.currentTarget.style.borderColor = "rgba(255,255,255,0.25)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--color-text-tertiary)";
              e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)";
            }}
          >
            ×
          </button>
        </div>

        {/* Timeline / content */}
        <div
          style={{
            padding: "16px 20px",
            overflowY: "auto",
            flex: 1,
          }}
        >
          {recentDrops.length === 0 ? (
            /* Empty state */
            <div
              style={{
                padding: "32px 0",
                textAlign: "center",
              }}
            >
              <p
                style={{
                  fontFamily: "var(--font-dm-sans)",
                  fontSize: "14px",
                  color: "var(--color-text-secondary)",
                  marginBottom: "8px",
                }}
              >
                {hasPreferences ? "No drops in your preferred areas" : "No recent drops found"}
              </p>
              <p
                style={{
                  fontFamily: "var(--font-dm-sans)",
                  fontSize: "12px",
                  color: "var(--color-text-tertiary)",
                }}
              >
                Check back when new shipments arrive.
              </p>
            </div>
          ) : (
            /* Drop timeline */
            <div className="flex flex-col" style={{ gap: "10px" }}>
              {recentDrops.map((drop, i) => {
                const tierCfg = TIER_CONFIG[drop.rarity_tier] || TIER_CONFIG.limited;
                const storeName = getStoreName(drop);
                const location = getDropLocation(drop);
                const timeAgo = formatRelativeTime(drop.timestamp);

                return (
                  <div
                    key={`${drop.timestamp}-${i}`}
                    style={{
                      borderLeft: "2px solid var(--color-accent-amber)",
                      paddingLeft: "14px",
                      paddingTop: "10px",
                      paddingBottom: "10px",
                      paddingRight: "12px",
                      background: "rgba(255,255,255,0.02)",
                      borderRadius: "0 6px 6px 0",
                      position: "relative",
                    }}
                  >
                    {/* Amber dot on timeline */}
                    <span
                      style={{
                        position: "absolute",
                        left: "-5px",
                        top: "50%",
                        transform: "translateY(-50%)",
                        width: "8px",
                        height: "8px",
                        borderRadius: "50%",
                        background: "var(--color-accent-amber)",
                        border: "2px solid var(--color-bg-secondary)",
                        flexShrink: 0,
                      }}
                    />

                    <div className="flex items-start justify-between" style={{ gap: "8px" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {/* Store name */}
                        <p
                          style={{
                            fontFamily: "var(--font-dm-sans)",
                            fontSize: "13px",
                            fontWeight: 600,
                            color: "var(--color-text-primary)",
                            marginBottom: "2px",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {storeName}
                        </p>

                        {/* Location + time */}
                        <p
                          style={{
                            fontFamily: "var(--font-dm-sans)",
                            fontSize: "11px",
                            color: "var(--color-text-tertiary)",
                          }}
                        >
                          {location && `${location} · `}
                          {timeAgo}
                        </p>
                      </div>

                      {/* Tier badge */}
                      <span style={tierCfg.pillStyle}>
                        {tierCfg.label}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer hint */}
        <div
          style={{
            padding: "12px 20px",
            borderTop: "1px solid rgba(255,255,255,0.05)",
            flexShrink: 0,
          }}
        >
          {preferences.states.length === 0 ? (
            <p
              style={{
                fontFamily: "var(--font-dm-sans)",
                fontSize: "11px",
                color: "var(--color-text-tertiary)",
                textAlign: "center",
              }}
            >
              {/* TODO: Update this copy to link to the preferences settings page once it exists */}
              Tip: Set area preferences to filter results to your region
            </p>
          ) : (
            <p
              style={{
                fontFamily: "var(--font-dm-sans)",
                fontSize: "11px",
                color: "rgba(196,148,58,0.5)",
                textAlign: "center",
              }}
            >
              Filtered to your preferred areas
            </p>
          )}
        </div>
      </div>
    </div>
  );

  // createPortal renders at document.body, bypassing any parent transform/stacking context
  return typeof document !== "undefined"
    ? createPortal(modalContent, document.body)
    : null;
}
