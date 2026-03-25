"use client";

import { useState, useEffect } from "react";

interface DataFreshnessProps {
  lastUpdated: string;
}

function formatRelativeTime(timestamp: string): string {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay === 1) return "1d ago";
  return `${diffDay}d ago`;
}

export default function DataFreshness({ lastUpdated }: DataFreshnessProps) {
  const [timeLabel, setTimeLabel] = useState("");

  useEffect(() => {
    setTimeLabel(formatRelativeTime(lastUpdated));
    const interval = setInterval(() => {
      setTimeLabel(formatRelativeTime(lastUpdated));
    }, 60000);
    return () => clearInterval(interval);
  }, [lastUpdated]);

  if (!timeLabel) return null;

  return (
    <div
      className="flex items-center gap-2"
      style={{ userSelect: "none" }}
    >
      <span
        style={{
          width: "6px",
          height: "6px",
          borderRadius: "50%",
          background: "var(--color-success)",
          display: "inline-block",
          flexShrink: 0,
          animation: "freshnessPulse 2s ease-in-out infinite",
        }}
      />
      <span
        style={{
          fontFamily: "var(--font-jetbrains)",
          fontSize: "11px",
          color: "var(--color-text-tertiary)",
        }}
      >
        Data as of {timeLabel}
      </span>
    </div>
  );
}
