"use client";

import { ReactNode } from "react";

interface BadgeProps {
  variant: "allocated" | "limited" | "common" | "live" | "alert";
  children: ReactNode;
  pulse?: boolean;
}

const variantStyles: Record<string, { bg: string; text: string }> = {
  allocated: { bg: "rgba(212, 146, 11, 0.9)", text: "#0D0B0E" },
  limited: { bg: "rgba(184, 115, 51, 0.9)", text: "#F5F0E8" },
  common: { bg: "rgba(107, 101, 96, 0.4)", text: "#9B9590" },
  live: { bg: "rgba(45, 106, 79, 0.9)", text: "#F5F0E8" },
  alert: { bg: "rgba(232, 93, 38, 0.9)", text: "#F5F0E8" },
};

export default function Badge({ variant, children, pulse = false }: BadgeProps) {
  const style = variantStyles[variant];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium uppercase tracking-wider"
      style={{
        backgroundColor: style.bg,
        color: style.text,
        animation: pulse ? "pulseGlow 2s ease-in-out infinite" : undefined,
        fontFamily: "var(--font-dm-sans)",
        fontSize: "12px",
        letterSpacing: "0.08em",
      }}
    >
      {variant === "live" && (
        <span
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{
            backgroundColor: "#4ade80",
            animation: "pulseDot 2s ease-in-out infinite",
          }}
        />
      )}
      {children}
    </span>
  );
}
