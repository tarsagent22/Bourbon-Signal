"use client";

import { motion } from "framer-motion";
import { ReactNode } from "react";

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
  return (
    <motion.div
      className={`relative p-6 ${className}`}
      style={{
        background: "var(--color-card-bg)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderRadius: "12px",
        border: "1px solid var(--color-card-border)",
        borderTop: accent
          ? "2px solid var(--color-accent-amber)"
          : "1px solid var(--color-card-border)",
        ...extraStyle,
      }}
      whileHover={
        hoverable
          ? {
              scale: 1.02,
              borderColor: "var(--color-accent-amber-30)",
              boxShadow: "0 8px 32px var(--color-accent-amber-08)",
              transition: { duration: 0.3 },
            }
          : undefined
      }
    >
      {children}
    </motion.div>
  );
}
