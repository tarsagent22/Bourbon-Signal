"use client";

import { motion } from "framer-motion";
import { ReactNode, useState } from "react";

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  hoverable?: boolean;
  accent?: boolean;
  style?: React.CSSProperties;
}

export default function GlassCard({
  children,
  className = "",
  hoverable = true,
  accent = false,
  style: extraStyle,
}: GlassCardProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="relative"
      style={{
        borderRadius: "13px",
        padding: "1px",
        background: hovered && hoverable
          ? "linear-gradient(135deg, rgba(212, 146, 11, 0.4), rgba(212, 146, 11, 0.05))"
          : "transparent",
        transition: "background 0.3s ease",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <motion.div
        className={`relative p-6 ${className}`}
        style={{
          background: "var(--color-card-bg)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderRadius: "12px",
          border: hovered && hoverable ? "1px solid transparent" : "1px solid var(--color-card-border)",
          borderTop: accent
            ? "2px solid var(--color-accent-amber)"
            : hovered && hoverable ? "1px solid transparent" : "1px solid var(--color-card-border)",
          ...extraStyle,
        }}
        whileHover={
          hoverable
            ? {
                scale: 1.02,
                boxShadow: "0 8px 32px rgba(212, 146, 11, 0.08)",
                transition: { duration: 0.3 },
              }
            : undefined
        }
      >
        {children}
      </motion.div>
    </div>
  );
}
