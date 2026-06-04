"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
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
  source_type?: string;
  source_type_label?: string;
  location_name?: string;
  store_name?: string;
  store_address?: string;
  city?: string;
  county?: string;
  event_date?: string;
  event_time?: string;
  observed_at?: string;
  event_status?: string;
  actionability?: "high" | "medium" | "watch" | string;
  detected_products?: string[];
  label?: string;
  caveat?: string;
  is_inventory?: boolean;
  is_watch?: boolean;
  price?: number;
  confidence?: number;
  sort_score?: number;
}

interface EventPayload {
  events?: EventRow[];
  total?: number;
  lastUpdated?: string;
  facets?: {
    states?: string[];
    categories?: string[];
    statuses?: string[];
    actionability?: string[];
  };
}

const CATEGORY_LABELS: Record<string, string> = {
  all: "All event types",
  scheduled_release: "Scheduled releases",
  lottery: "Lotteries / raffles",
  barrel_pick: "Barrel picks",
  tasting: "Tastings",
  release_watch: "Release watch",
  policy_or_program: "Policies / programs",
};

const STATUS_LABELS: Record<string, string> = {
  all: "Any timing",
  upcoming: "Upcoming soon",
  scheduled_future: "Scheduled later",
  watch_page: "Watch pages",
  recent_or_past: "Recent / past",
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

function statusLabel(status?: string) {
  return STATUS_LABELS[status || ""] || (status ? status.replace(/_/g, " ") : "Watch page");
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

function actionLabel(value?: string) {
  if (value === "high") return "High-signal";
  if (value === "medium") return "Actionable";
  return "Watch only";
}

function actionTone(value?: string) {
  if (value === "high") return { border: "rgba(80, 220, 150, 0.42)", color: "#7df0b2", bg: "rgba(80, 220, 150, 0.08)" };
  if (value === "medium") return { border: "rgba(196,148,58,0.42)", color: "var(--color-accent-amber)", bg: "rgba(196,148,58,0.08)" };
  return { border: "rgba(255,255,255,0.16)", color: "var(--color-text-muted)", bg: "rgba(255,255,255,0.04)" };
}

function eventReason(event: EventRow) {
  const bits = [event.source_type_label || "Release-watch source"];
  if (event.event_date) bits.push("dated");
  if (event.detected_products?.length) bits.push(`${event.detected_products.length} bottle match${event.detected_products.length === 1 ? "" : "es"}`);
  if (event.is_watch) bits.push("watch-alert candidate");
  return bits.join(" • ");
}

export default function EventsPage() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [facets, setFacets] = useState<EventPayload["facets"]>({});
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState("all");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [actionableOnly, setActionableOnly] = useState(true);
  const [query, setQuery] = useState("");
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      const params = new URLSearchParams({ limit: "500" });
      if (state !== "all") params.set("state", state);
      if (category !== "all") params.set("category", category);
      if (status !== "all") params.set("status", status);
      if (actionableOnly) params.set("actionable", "true");
      if (query.trim()) params.set("q", query.trim());
      const res = await fetch(`/api/events?${params.toString()}`, { signal: controller.signal });
      const payload = (await res.json()) as EventPayload;
      setEvents(Array.isArray(payload.events) ? payload.events : []);
      setFacets(payload.facets || {});
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
  }, [state, category, status, actionableOnly, query]);

  const states = useMemo(() => ["all", ...(facets?.states || [])], [facets?.states]);
  const categories = useMemo(() => ["all", ...(facets?.categories || ["scheduled_release", "lottery", "barrel_pick", "tasting", "release_watch", "policy_or_program"])], [facets?.categories]);
  const statuses = useMemo(() => ["all", ...(facets?.statuses || ["upcoming", "scheduled_future", "watch_page", "recent_or_past"])], [facets?.statuses]);
  const priorityEvents = useMemo(() => events.filter((event) => event.actionability === "high" || event.event_status === "upcoming").slice(0, 3), [events]);
  const counts = useMemo(() => {
    const byCategory: Record<string, number> = {};
    const byAction: Record<string, number> = {};
    for (const event of events) {
      byCategory[event.category] = (byCategory[event.category] || 0) + 1;
      byAction[event.actionability || "watch"] = (byAction[event.actionability || "watch"] || 0) + 1;
    }
    return { byCategory, byAction };
  }, [events]);

  return (
    <>
      <Navigation />
      <main style={{ minHeight: "100vh", paddingTop: 96, background: "var(--color-bg-primary)", color: "var(--color-text-primary)" }}>
        <section style={{ maxWidth: 1180, margin: "0 auto", padding: "48px 24px 24px" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 999, border: "1px solid rgba(196,148,58,0.28)", color: "var(--color-accent-amber)", fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Events & Release Watch
          </div>
          <h1 style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(38px, 6vw, 72px)", lineHeight: 0.95, margin: "18px 0 16px" }}>
            Bourbon opportunities worth watching.
          </h1>
          <p style={{ maxWidth: 790, color: "var(--color-text-secondary)", fontSize: 18, lineHeight: 1.7 }}>
            Official lotteries, scheduled drops, barrel picks, tastings, and source pages that changed or matter. Inventory stays separate; this page is for timely release intelligence and watch-alert candidates.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginTop: 28 }}>
            <Stat label={actionableOnly ? "Actionable matches" : "Visible events"} value={String(total || events.length)} />
            <Stat label="High-signal" value={String(counts.byAction.high || 0)} />
            <Stat label="Release watch" value={String((counts.byCategory.release_watch || 0) + (counts.byCategory.lottery || 0) + (counts.byCategory.barrel_pick || 0))} />
            <Stat label="Last updated" value={lastUpdated ? new Date(lastUpdated).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "—"} />
          </div>
        </section>

        {priorityEvents.length ? (
          <section style={{ maxWidth: 1180, margin: "0 auto", padding: "6px 24px 18px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
              {priorityEvents.map((event) => (
                <a key={`priority-${event.id}`} href={event.source_url || "#"} target={event.source_url ? "_blank" : undefined} rel="noreferrer" style={priorityCardStyle}>
                  <div style={{ color: "#7df0b2", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em" }}>{actionLabel(event.actionability)}</div>
                  <strong style={{ display: "block", marginTop: 8, fontSize: 18 }}>{event.bottle_name || event.title}</strong>
                  <span style={{ display: "block", marginTop: 8, color: "var(--color-text-secondary)", fontSize: 13 }}>{eventLocation(event)} • {formatDate(event.event_date || event.observed_at)}</span>
                </a>
              ))}
            </div>
          </section>
        ) : null}

        <section style={{ maxWidth: 1180, margin: "0 auto", padding: "8px 24px 72px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(175px, 1fr))", gap: 12, marginBottom: 24, padding: 16, border: "1px solid rgba(196,148,58,0.14)", borderRadius: 18, background: "rgba(255,255,255,0.035)", backdropFilter: "blur(12px)" }}>
            <select value={state} onChange={(e) => setState(e.target.value)} style={controlStyle} aria-label="Filter by state">
              {states.map((code) => <option key={code} value={code}>{code === "all" ? "All states" : stateLabel(code)}</option>)}
            </select>
            <select value={category} onChange={(e) => setCategory(e.target.value)} style={controlStyle} aria-label="Filter by event type">
              {categories.map((item) => <option key={item} value={item}>{categoryLabel(item)}</option>)}
            </select>
            <select value={status} onChange={(e) => setStatus(e.target.value)} style={controlStyle} aria-label="Filter by timing">
              {statuses.map((item) => <option key={item} value={item}>{statusLabel(item)}</option>)}
            </select>
            <label style={{ ...controlStyle, display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
              <input type="checkbox" checked={actionableOnly} onChange={(e) => setActionableOnly(e.target.checked)} />
              Actionable only
            </label>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search bottle, board, city…" style={{ ...controlStyle, minWidth: 260 }} />
          </div>

          {loading ? (
            <p style={{ color: "var(--color-text-secondary)" }}>Loading release watch…</p>
          ) : events.length === 0 ? (
            <div style={emptyStyle}>No events matched those filters yet. Try turning off “Actionable only” to see lower-priority watch pages.</div>
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
  const tone = actionTone(event.actionability);
  return (
    <article style={{ border: "1px solid rgba(196,148,58,0.14)", borderRadius: 18, padding: 18, background: "linear-gradient(180deg, rgba(255,255,255,0.055), rgba(255,255,255,0.025))", minHeight: 330 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
        <span style={{ color: "var(--color-accent-amber)", border: "1px solid rgba(196,148,58,0.25)", borderRadius: 999, padding: "5px 9px", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em" }}>{categoryLabel(event.category)}</span>
        <span style={{ color: "var(--color-text-muted)", fontSize: 12 }}>{stateLabel(event.state)}</span>
      </div>
      <h2 style={{ fontFamily: "var(--font-playfair)", fontSize: 25, lineHeight: 1.1, margin: "18px 0 10px" }}>{event.bottle_name || event.title}</h2>
      <p style={{ color: "var(--color-text-secondary)", lineHeight: 1.55, minHeight: 44 }}>{eventLocation(event)}</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "12px 0" }}>
        <Badge label={actionLabel(event.actionability)} tone={tone} />
        <Badge label={statusLabel(event.event_status)} />
        {event.source_type_label ? <Badge label={event.source_type_label} /> : null}
      </div>
      {event.detected_products?.length ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "12px 0" }}>
          {event.detected_products.slice(0, 4).map((product) => <span key={product} style={productPillStyle}>{product}</span>)}
        </div>
      ) : null}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, margin: "16px 0" }}>
        <Mini label="Date" value={formatDate(event.event_date || event.observed_at)} />
        <Mini label="Signal" value={event.is_inventory ? "Inventory/event" : "Watch only"} />
      </div>
      <p style={{ color: "var(--color-text-muted)", fontSize: 13, lineHeight: 1.55 }}>{eventReason(event)}</p>
      <p style={{ color: "var(--color-text-muted)", fontSize: 13, lineHeight: 1.55 }}>{event.caveat || "Verify source details before driving or entering."}</p>
      {event.source_url ? (
        <a href={event.source_url} target="_blank" rel="noreferrer" style={{ display: "inline-flex", marginTop: 12, color: "var(--color-accent-amber)", textDecoration: "none", fontWeight: 600 }}>
          View source →
        </a>
      ) : null}
    </article>
  );
}

function Badge({ label, tone }: { label: string; tone?: { border: string; color: string; bg: string } }) {
  return <span style={{ border: `1px solid ${tone?.border || "rgba(255,255,255,0.14)"}`, color: tone?.color || "var(--color-text-secondary)", background: tone?.bg || "rgba(255,255,255,0.035)", borderRadius: 999, padding: "5px 9px", fontSize: 11 }}>{label}</span>;
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ borderRadius: 12, background: "rgba(0,0,0,0.18)", padding: 10 }}>
      <div style={{ color: "var(--color-text-muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</div>
      <div style={{ color: "var(--color-text-primary)", fontSize: 13, marginTop: 3 }}>{value}</div>
    </div>
  );
}

const controlStyle: CSSProperties = {
  width: "100%",
  border: "1px solid rgba(196,148,58,0.22)",
  borderRadius: 12,
  background: "rgba(18,14,10,0.92)",
  color: "var(--color-text-primary)",
  padding: "12px 14px",
  outline: "none",
};

const priorityCardStyle: CSSProperties = {
  display: "block",
  border: "1px solid rgba(80,220,150,0.22)",
  borderRadius: 18,
  padding: 18,
  background: "linear-gradient(135deg, rgba(80,220,150,0.10), rgba(196,148,58,0.05))",
  color: "var(--color-text-primary)",
  textDecoration: "none",
};

const productPillStyle: CSSProperties = {
  border: "1px solid rgba(196,148,58,0.18)",
  borderRadius: 999,
  padding: "4px 8px",
  color: "var(--color-accent-amber)",
  fontSize: 11,
  background: "rgba(196,148,58,0.07)",
};

const emptyStyle: CSSProperties = {
  border: "1px dashed rgba(196,148,58,0.28)",
  borderRadius: 18,
  padding: 28,
  color: "var(--color-text-secondary)",
  textAlign: "center",
};
