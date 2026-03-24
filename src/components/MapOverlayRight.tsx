"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X, List } from "lucide-react";

interface RecentDrop {
  brand_name: string;
  rarity_tier: string;
  timestamp: string;
  store_address: string;
  county: string;
  storeId: string;
}

interface MapOverlayRightProps {
  recentDrops: RecentDrop[];
  isOpen: boolean;
  onToggle: () => void;
  onDropClick: (storeId: string) => void;
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

function DropList({
  recentDrops,
  onDropClick,
}: {
  recentDrops: RecentDrop[];
  onDropClick: (storeId: string) => void;
}) {
  return (
    <>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 16,
        }}
      >
        <h2
          style={{
            fontFamily: "var(--font-playfair)",
            fontSize: 18,
            fontWeight: 700,
            color: "var(--color-text-primary)",
            margin: 0,
          }}
        >
          Recent Drops
        </h2>
        <span
          style={{
            fontFamily: "var(--font-jetbrains)",
            fontSize: 11,
            color: "var(--color-text-tertiary)",
          }}
        >
          {recentDrops.length}
        </span>
      </div>

      {/* Drop list */}
      <div
        className="drop-feed-scroll"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 2,
          overflowY: "auto",
          maxHeight: "calc(100% - 50px)",
        }}
      >
        {recentDrops.map((drop, i) => (
          <button
            key={i}
            onClick={() => onDropClick(drop.storeId)}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              padding: "10px 12px",
              borderRadius: 8,
              background: "transparent",
              border: "none",
              borderLeft: `3px solid ${tierColor(drop.rarity_tier)}`,
              cursor: "pointer",
              textAlign: "left",
              width: "100%",
              transition: "background 200ms ease",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.background = "rgba(196, 148, 58, 0.08)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.background = "transparent")
            }
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontFamily: "var(--font-playfair)",
                  fontSize: 13,
                  color: "var(--color-text-primary)",
                  lineHeight: 1.3,
                  marginBottom: 3,
                }}
              >
                {drop.brand_name}
              </div>
              <div
                style={{
                  fontFamily: "var(--font-dm-sans)",
                  fontSize: 11,
                  color: "var(--color-text-tertiary)",
                }}
              >
                {drop.county}
              </div>
            </div>
            <span
              style={{
                fontFamily: "var(--font-jetbrains)",
                fontSize: 10,
                color: "var(--color-text-tertiary)",
                flexShrink: 0,
                marginTop: 2,
              }}
            >
              {timeAgo(drop.timestamp)}
            </span>
          </button>
        ))}
      </div>
    </>
  );
}

export default function MapOverlayRight({
  recentDrops,
  isOpen,
  onToggle,
  onDropClick,
}: MapOverlayRightProps) {
  return (
    <>
      {/* Mobile toggle button */}
      <button
        className="md:hidden"
        onClick={onToggle}
        style={{
          position: "absolute",
          top: 80,
          right: 16,
          zIndex: 1000,
          width: 40,
          height: 40,
          borderRadius: 8,
          background: "var(--color-glass)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          border: "1px solid var(--color-card-border)",
          color: "var(--color-accent-amber)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
        }}
      >
        <List size={18} />
      </button>

      {/* Desktop panel */}
      <div
        className="hidden md:flex"
        style={{
          position: "absolute",
          top: 80,
          right: 16,
          zIndex: 1000,
          width: 320,
          borderRadius: 12,
          background: "var(--color-glass)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          border: "1px solid var(--color-card-border)",
          padding: 20,
          maxHeight: "calc(100vh - 100px)",
          flexDirection: "column",
        }}
      >
        <DropList recentDrops={recentDrops} onDropClick={onDropClick} />
      </div>

      {/* Mobile bottom sheet */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onToggle}
              className="md:hidden"
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 1001,
                background: "rgba(0,0,0,0.4)",
              }}
            />
            {/* Bottom sheet */}
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="md:hidden"
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                zIndex: 1002,
                height: "50vh",
                borderTopLeftRadius: 16,
                borderTopRightRadius: 16,
                background: "var(--color-glass)",
                backdropFilter: "blur(16px)",
                WebkitBackdropFilter: "blur(16px)",
                borderTop: "1px solid var(--color-card-border)",
                padding: 20,
                display: "flex",
                flexDirection: "column",
              }}
            >
              {/* Handle bar */}
              <div
                style={{
                  width: 40,
                  height: 4,
                  borderRadius: 2,
                  background: "var(--color-text-tertiary)",
                  margin: "0 auto 12px",
                  opacity: 0.5,
                }}
              />
              <button
                onClick={onToggle}
                style={{
                  position: "absolute",
                  top: 16,
                  right: 16,
                  background: "none",
                  border: "none",
                  color: "var(--color-text-tertiary)",
                  cursor: "pointer",
                  padding: 4,
                }}
              >
                <X size={20} />
              </button>
              <DropList
                recentDrops={recentDrops}
                onDropClick={(storeId) => {
                  onToggle();
                  onDropClick(storeId);
                }}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
