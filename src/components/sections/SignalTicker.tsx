"use client";

import "./signal-ticker.css";
import { formatRelativeTime } from "@/lib/drops";
import { useTickerStats } from "@/lib/useEngineData";

const tickerNumberFormatter = new Intl.NumberFormat("en-US");

function formatTickerNumber(value?: number) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return "—";
  return tickerNumberFormatter.format(value);
}

export default function SignalTicker({ currentObservations, feedUpdatedAt }: {
  currentObservations?: number;
  feedUpdatedAt?: string;
}) {
  const { stats, memberCount } = useTickerStats();
  const lastRefreshed = stats?.engineGeneratedAt || stats?.generatedAt || feedUpdatedAt;
  const refreshedText = lastRefreshed && Number.isFinite(Date.parse(lastRefreshed))
    ? formatRelativeTime(lastRefreshed)
    : "—";
  const items = [
    { label: "Observations processed", value: formatTickerNumber(stats?.historicalSignalCount ?? stats?.signalCount) },
    { label: "Current observations", value: formatTickerNumber(currentObservations ?? stats?.signalCount) },
    { label: "Stores monitored", value: formatTickerNumber(stats?.storeCount) },
    { label: "Member Count", value: formatTickerNumber(memberCount) },
    { label: "Last refreshed", value: refreshedText },
  ];
  const tapeItems = [...items, ...items];

  return (
    <div className="signal-ticker" role="region" tabIndex={0} aria-label="Bourbon Signal stats. Focus to pause scrolling.">
      <div className="signal-ticker-track">
        {tapeItems.map((item, index) => (
          <span className="signal-ticker-item" key={`${item.label}-${index}`} aria-hidden={index >= items.length}>
            <span className="signal-ticker-label">{item.label}</span>
            <span className="signal-ticker-value">{item.value}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
