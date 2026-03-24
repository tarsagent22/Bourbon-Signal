"use client";

import type { Store } from "@/data/stores";
import { cleanBrandName } from "@/lib/drops";
import BottleLink from "@/components/BottleLink";

interface DropEntry {
  brand_name: string;
  rarity_tier: string;
  timestamp: string;
}

interface StorePopupProps {
  store: Store;
  drops: DropEntry[];
  status: "hot" | "warm" | "cold";
}

function tierColor(tier: string): string {
  switch (tier) {
    case "unicorn":
      return "#E8B04B";
    case "allocated":
      return "var(--color-accent-amber)";
    case "limited":
      return "var(--color-accent-copper)";
    default:
      return "var(--color-text-tertiary)";
  }
}

function timeAgo(ts: string): string {
  const now = new Date();
  const then = new Date(ts);
  const diffMs = now.getTime() - then.getTime();
  const diffH = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffH < 1) return "Just now";
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  return `${diffD}d ago`;
}

export default function StorePopup({ store, drops, status }: StorePopupProps) {
  return (
    <div
      style={{
        minWidth: 220,
        maxWidth: 280,
        fontFamily: "var(--font-dm-sans)",
      }}
    >
      {/* Address */}
      <div
        style={{
          fontSize: 13,
          color: "var(--color-text-primary)",
          fontWeight: 500,
          marginBottom: 2,
        }}
      >
        {store.address}
      </div>
      {/* County */}
      <div
        style={{
          fontSize: 11,
          color: "var(--color-text-tertiary)",
          marginBottom: 10,
        }}
      >
        {store.county}
      </div>

      {/* Status indicator */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 10,
          fontSize: 11,
          fontFamily: "var(--font-dm-sans)",
        }}
      >
        {status === "hot" ? (
          <>
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "var(--color-accent-amber)",
                display: "inline-block",
                animation: "popupPulseDot 2s ease-in-out infinite",
              }}
            />
            <span style={{ color: "var(--color-accent-amber)", fontWeight: 600 }}>
              Active — drop today
            </span>
          </>
        ) : status === "warm" ? (
          <span style={{ color: "var(--color-text-secondary)" }}>
            Drop this week
          </span>
        ) : (
          <span style={{ color: "var(--color-text-tertiary)" }}>
            No recent activity
          </span>
        )}
      </div>

      {/* Divider */}
      <div
        style={{
          height: 1,
          background: "var(--color-card-border)",
          marginBottom: 8,
        }}
      />

      {/* Recent drops */}
      {drops.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {drops.slice(0, 5).map((drop, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: "50%",
                  background: tierColor(drop.rarity_tier),
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontFamily: "var(--font-playfair)",
                  fontSize: 13,
                  color: "var(--color-text-primary)",
                  flex: 1,
                  lineHeight: 1.3,
                }}
              >
                <BottleLink name={cleanBrandName(drop.brand_name)}>{cleanBrandName(drop.brand_name)}</BottleLink>
              </span>
              <span
                style={{
                  fontFamily: "var(--font-jetbrains)",
                  fontSize: 10,
                  color: "var(--color-text-tertiary)",
                  flexShrink: 0,
                }}
              >
                {timeAgo(drop.timestamp)}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div
          style={{
            fontSize: 11,
            color: "var(--color-text-tertiary)",
            fontStyle: "italic",
          }}
        >
          No recent activity
        </div>
      )}
    </div>
  );
}
