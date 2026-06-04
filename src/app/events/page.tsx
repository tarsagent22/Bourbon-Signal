"use client";

import { useEffect, useMemo, useState } from "react";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";

interface EventRow {
  id: string;
  title: string;
  state: string;
  category: string;
  bottle_name?: string;
  raw_name?: string;
  source?: string;
  source_url?: string;
  location_name?: string;
  store_name?: string;
  store_address?: string;
  city?: string;
  county?: string;
  event_date?: string;
  event_time?: string;
  observed_at?: string;
  label?: string;
  caveat?: string;
  is_inventory?: boolean;
  is_watch?: boolean;
  price?: number;
  confidence?: number;
}

const CATEGORY_LABELS: Record<string, string> = {
  all: "All events",
  scheduled_release: "Scheduled releases",
  lottery: "Lotteries / raffles",
  barrel_pick: "Barrel picks",
  tasting: "Tastings",
  release_watch: "Release watch",
  policy_or_program: "Policies / programs",
};

const STATE_LABELS: Record<string, string> = {
  AL: "Alabama",
  NC: "North Carolina",
  IN: "Indiana",
  PA: "Pennsylvania",
  VA: "Virginia",
  ME: "Maine",
  WV: "West Virginia",
  UT: "Utah",
  "MD-MONTGOMERY": "Montgomery, MD",
};

function categoryLabel(category: string) {
  return CATEGORY_LABELS[category] || category.replace(/_/g, " ");
}

function stateLabel(state: string) {
  return STATE_LABELS[state] || state;
}

function formatDate(value?: string) {
  if (!value) return "Date not listed";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(parsed);
}

function eventLocation(event: EventRow) {
  return event.store_name || event.location_name || [event.city, event.county].filter(Boolean).join(", ") || stateLabel(event.state);
}

export default function EventsPage() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState("all");
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      const params = new URLSearchParams({ limit: "500" });
      if (state !== "all") params.set("state", state);
      if (category !== "all") params.set("category", category);
      if (query.trim()) params.set("q", query.trim());
      const res = await fetch(`/api/events?${params.toString()}`, { signal: controller.signal });
      const payload = await res.json();
      setEvents(Array.isArray(payload.events) ? payload.events : []);
      setTotal(Number(payload.total || 0));
      setLastUpdated(payload.lastUpdated || null);
      setLoading(false);
    }
    load().catch((error) => {
      if (error.name !== "AbortError") {
        console.error(error);
        setLoading(false);
      }
    });
    return () => controller.abort();
  }, [state, category, query]);

  const states = useMemo(() => ["all", ...Array.from(new Set(events.map((event) => event.state).filter(Boolean))).sort()], [events]);
  const categories = ["all", "scheduled_release", "lottery", "barrel_pick", "tasting", "release_watch", "policy_or_program"];
  const counts = useMemo(() => {
    const byCategory: Record<string, number> = {};
    for (const event of events) byCategory[event.category] = (byCategory[event.category] || 0) + 1;
    return byCategory;
  }, [events]);

  return (
    <>
      <Navigation />
      <main style={{ minHeight: "100vh", paddingTop: 96, background: "var(--color-bg-primary)", color: "var(--color-text-primary)" }}>
        <section style={{ maxWidth: 1180, margin: "0 auto", padding: "48px 24px 24px" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 999, border: "1px solid rgba(196,148,58,0.28)", color: "var(--color-accent-amber)", fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Release Watch
          </div>
          <h1 style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(38px, 6vw, 72px)", lineHeight: 0.95, margin: "18px 0 16px" }}>
            Bourbon events, lotteries, and scheduled drops.
          </h1>
          <p style={{ maxWidth: 760, color: "var(--color-text-secondary)", fontSize: 18, lineHeight: 1.7 }}>
            Official and retailer-sourced release intelligence lives here: ABC release days, lotteries, barrel picks, tastings, and board release pages. This is separate from live inventory so the signal stays honest.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginTop: 28 }}>
            <Stat label="Visible events" value={String(total || events.length)} />
            <Stat label="Scheduled releases" value={String(counts.scheduled_release || 0)} />
            <Stat label="Release watch" value={String((counts.release_watch || 0) + (counts.lottery || 0) + (counts.barrel_pick || 0))} />
            <Stat label="Last updated" value={lastUpdated ? new Date(lastUpdated).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "—"} />
          </div>
        </section>

        <section style={{ maxWidth: 1180, margin: "0 auto", padding: "8px 24px 72px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 24, padding: 16, border: "1px solid rgba(196,148,58,0.14)", borderRadius: 18, background: "rgba(255,255,255,0.035)", backdropFilter: "blur(12px)" }}>
            <select value={state} onChange={(e) => setState(e.target.value)} style={controlStyle} aria-label="Filter by state">
              {states.map((code) => <option key={code} value={code}>{code === "all" ? "All states" : stateLabel(code)}</option>)}
            </select>
            <select value={category} onChange={(e) => setCategory(e.target.value)} style={controlStyle} aria-label="Filter by event type">
              {categories.map((item) => <option key={item} value={item}>{categoryLabel(item)}</option>)}
            </select>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search bottle, board, city…" style={{ ...controlStyle, minWidth: 260 }} />
          </div>

          {loading ? (
            <p style={{ color: "var(--color-text-secondary)" }}>Loading release watch…</p>
          ) : events.length === 0 ? (
            <div style={emptyStyle}>No events matched those filters yet.</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(310px, 1fr))", gap: 16 }}>
              {events.map((event) => <EventCard key={event.id} event={event} />)}
            </div>
          )}
        </section>
      </main>
      <Footer />
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ border: "1px solid rgba(196,148,58,0.12)", background: "rgba(255,255,255,0.035)", borderRadius: 16, padding: 18 }}>
      <div style={{ color: "var(--color-accent-amber)", fontSize: 26, fontWeight: 700 }}>{value}</div>
      <div style={{ color: "var(--color-text-secondary)", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</div>
    </div>
  );
}

function EventCard({ event }: { event: EventRow }) {
  return (
    <article style={{ border: "1px solid rgba(196,148,58,0.14)", borderRadius: 18, padding: 18, background: "linear-gradient(180deg, rgba(255,255,255,0.055), rgba(255,255,255,0.025))", minHeight: 280 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
        <span style={{ color: "var(--color-accent-amber)", border: "1px solid rgba(196,148,58,0.25)", borderRadius: 999, padding: "5px 9px", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em" }}>{categoryLabel(event.category)}</span>
        <span style={{ color: "var(--color-text-muted)", fontSize: 12 }}>{stateLabel(event.state)}</span>
      </div>
      <h2 style={{ fontFamily: "var(--font-playfair)", fontSize: 25, lineHeight: 1.1, margin: "18px 0 10px" }}>{event.bottle_name || event.title}</h2>
      <p style={{ color: "var(--color-text-secondary)", lineHeight: 1.55, minHeight: 48 }}>{eventLocation(event)}</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, margin: "16px 0" }}>
        <Mini label="Date" value={formatDate(event.event_date || event.observed_at)} />
        <Mini label="Signal" value={event.is_inventory ? "Inventory/event" : "Watch only"} />
      </div>
      <p style={{ color: "var(--color-text-muted)", fontSize: 13, lineHeight: 1.55 }}>{event.caveat || "Verify source details before driving or entering."}</p>
      {event.source_url ? (
        <a href={event.source_url} target="_blank" rel="noreferrer" style={{ display: "inline-flex", marginTop: 16, color: "var(--color-accent-amber)", textDecoration: "none", fontWeight: 600 }}>
          View official source →
        </a>
      ) : null}
    </article>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ borderRadius: 12, background: "rgba(0,0,0,0.18)", padding: 10 }}>
      <div style={{ color: "var(--color-text-muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</div>
      <div style={{ color: "var(--color-text-primary)", fontSize: 13, marginTop: 3 }}>{value}</div>
    </div>
  );
}

const controlStyle: React.CSSProperties = {
  width: "100%",
  border: "1px solid rgba(196,148,58,0.22)",
  borderRadius: 12,
  background: "rgba(18,14,10,0.92)",
  color: "var(--color-text-primary)",
  padding: "12px 14px",
  outline: "none",
};

const emptyStyle: React.CSSProperties = {
  border: "1px dashed rgba(196,148,58,0.28)",
  borderRadius: 18,
  padding: 28,
  color: "var(--color-text-secondary)",
  textAlign: "center",
};
