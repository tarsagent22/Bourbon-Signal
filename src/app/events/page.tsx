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
  source_url?: string;
  source_type_label?: string;
  location_name?: string;
  store_name?: string;
  city?: string;
  county?: string;
  event_date?: string;
  observed_at?: string;
  event_status?: string;
  actionability?: "high" | "medium" | "watch" | string;
  detected_products?: string[];
  caveat?: string;
}

interface EventPayload {
  events?: EventRow[];
  total?: number;
  lastUpdated?: string;
  facets?: {
    states?: string[];
    categories?: string[];
    statuses?: string[];
  };
}

const CATEGORY_LABELS: Record<string, string> = {
  all: "All types",
  scheduled_release: "Scheduled releases",
  lottery: "Lotteries",
  barrel_pick: "Barrel picks",
  tasting: "Tastings",
  release_watch: "Release watch",
  policy_or_program: "Programs",
};

const STATUS_LABELS: Record<string, string> = {
  all: "Any timing",
  upcoming: "Upcoming",
  scheduled_future: "Later",
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
  if (value === "high") return "High priority";
  if (value === "medium") return "Worth tracking";
  return "Watch page";
}

function actionClass(value?: string) {
  if (value === "high") return "high";
  if (value === "medium") return "medium";
  return "watch";
}

function eventDeck(event: EventRow) {
  const source = event.source_type_label || "Official source";
  const products = event.detected_products?.slice(0, 2).join(", ");
  if (products) return `${products} · ${source}`;
  return source;
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
  const leadEvents = useMemo(() => events.filter((event) => event.actionability === "high" || event.event_status === "upcoming").slice(0, 2), [events]);

  return (
    <>
      <Navigation />
      <main className="events-page">
        <style>{eventsCss}</style>

        <section className="events-hero">
          <div className="events-kicker">Events & release watch</div>
          <div className="events-hero-grid">
            <div>
              <h1>Bourbon releases, without the noise.</h1>
              <p>
                A cleaner watchlist for official lotteries, scheduled releases, barrel picks, tastings, and source pages worth checking. Inventory signals stay in the drop feed; this page is for release timing and source links.
              </p>
            </div>
            <div className="events-note-card">
              <span>Current lens</span>
              <strong>{actionableOnly ? total || events.length : events.length}</strong>
              <p>{actionableOnly ? "actionable or source-backed items" : "items in the current filter"}</p>
              <small>{lastUpdated ? `Updated ${new Date(lastUpdated).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "Waiting for export"}</small>
            </div>
          </div>
        </section>

        <section className="events-board">
          <div className="events-filters">
            <select value={state} onChange={(e) => setState(e.target.value)} style={controlStyle} aria-label="Filter by state">
              {states.map((code) => <option key={code} value={code}>{code === "all" ? "All states" : stateLabel(code)}</option>)}
            </select>
            <select value={category} onChange={(e) => setCategory(e.target.value)} style={controlStyle} aria-label="Filter by event type">
              {categories.map((item) => <option key={item} value={item}>{categoryLabel(item)}</option>)}
            </select>
            <select value={status} onChange={(e) => setStatus(e.target.value)} style={controlStyle} aria-label="Filter by timing">
              {statuses.map((item) => <option key={item} value={item}>{statusLabel(item)}</option>)}
            </select>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search bottle, city, source…" style={controlStyle} />
            <label className="events-toggle">
              <input type="checkbox" checked={actionableOnly} onChange={(e) => setActionableOnly(e.target.checked)} />
              Actionable only
            </label>
          </div>

          {leadEvents.length ? (
            <div className="events-leads">
              {leadEvents.map((event) => <EventFeature key={`lead-${event.id}`} event={event} />)}
            </div>
          ) : null}

          {loading ? (
            <div className="events-empty">Loading release watch…</div>
          ) : events.length === 0 ? (
            <div className="events-empty">No matching events. Try a broader state, timing, or search filter.</div>
          ) : (
            <div className="events-list">
              {events.map((event) => <EventCard key={event.id} event={event} />)}
            </div>
          )}
        </section>
      </main>
      <Footer />
    </>
  );
}

function EventFeature({ event }: { event: EventRow }) {
  return (
    <a className="events-feature" href={event.source_url || "#"} target={event.source_url ? "_blank" : undefined} rel="noreferrer">
      <div>
        <span className={`events-pill ${actionClass(event.actionability)}`}>{actionLabel(event.actionability)}</span>
        <h2>{event.bottle_name || event.title}</h2>
        <p>{eventDeck(event)}</p>
      </div>
      <div className="events-date-block">
        <strong>{formatDate(event.event_date || event.observed_at)}</strong>
        <span>{eventLocation(event)}</span>
      </div>
    </a>
  );
}

function EventCard({ event }: { event: EventRow }) {
  return (
    <a className="events-row" href={event.source_url || "#"} target={event.source_url ? "_blank" : undefined} rel="noreferrer">
      <div className="events-row-date">
        <strong>{formatDate(event.event_date || event.observed_at)}</strong>
        <span>{stateLabel(event.state)}</span>
      </div>
      <div className="events-row-main">
        <div className="events-row-top">
          <span className={`events-pill ${actionClass(event.actionability)}`}>{actionLabel(event.actionability)}</span>
          <span>{categoryLabel(event.category)}</span>
        </div>
        <h3>{event.bottle_name || event.title}</h3>
        <p>{eventDeck(event)}</p>
        {event.caveat ? <small>{event.caveat}</small> : null}
      </div>
      <div className="events-row-location">{eventLocation(event)}</div>
    </a>
  );
}

const controlStyle: CSSProperties = {
  minHeight: 48,
  borderRadius: 14,
  border: "1px solid rgba(245,237,214,0.11)",
  background: "rgba(255,255,255,0.045)",
  color: "var(--color-text-primary)",
  padding: "0 14px",
  fontFamily: "var(--font-dm-sans)",
  fontSize: 14,
  outline: "none",
};

const eventsCss = `
.events-page { min-height: 100vh; padding-top: 96px; background: radial-gradient(circle at 50% 0%, rgba(196,148,58,0.10), transparent 34%), var(--color-bg-primary); color: var(--color-text-primary); }
.events-hero, .events-board { width: min(1180px, calc(100% - 40px)); margin: 0 auto; }
.events-hero { padding: 48px 0 26px; }
.events-kicker { display: inline-flex; border: 1px solid rgba(196,148,58,0.28); border-radius: 999px; color: var(--color-accent-amber); padding: 7px 11px; font: 800 11px/1 var(--font-dm-sans); letter-spacing: .13em; text-transform: uppercase; }
.events-hero-grid { display: grid; grid-template-columns: minmax(0, 1fr) 280px; gap: 28px; align-items: end; margin-top: 18px; }
.events-hero h1 { max-width: 11ch; font-family: var(--font-playfair); font-size: clamp(46px, 8vw, 86px); line-height: .88; letter-spacing: -.045em; margin: 0; }
.events-hero p { max-width: 760px; margin-top: 22px; color: var(--color-text-secondary); font: 16px/1.75 var(--font-dm-sans); }
.events-note-card { border: 1px solid rgba(245,237,214,0.09); border-radius: 28px; padding: 22px; background: linear-gradient(180deg, rgba(255,255,255,.055), rgba(255,255,255,.02)); box-shadow: 0 18px 50px rgba(0,0,0,.24); }
.events-note-card span, .events-note-card small { color: var(--color-text-tertiary); font: 800 11px/1.2 var(--font-dm-sans); letter-spacing: .12em; text-transform: uppercase; }
.events-note-card strong { display:block; margin-top: 12px; color: var(--color-accent-amber); font: 700 48px/1 var(--font-playfair); }
.events-note-card p { margin: 8px 0 14px; font-size: 13px; line-height: 1.5; }
.events-board { padding: 10px 0 78px; }
.events-filters { position: sticky; top: 76px; z-index: 20; display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; padding: 12px; border: 1px solid rgba(245,237,214,0.10); border-radius: 22px; background: rgba(13,11,7,.82); backdrop-filter: blur(18px); }
.events-toggle { min-height:48px; display:flex; align-items:center; gap:9px; border:1px solid rgba(245,237,214,.11); border-radius:14px; padding:0 14px; color: var(--color-text-secondary); font: 700 13px var(--font-dm-sans); }
.events-leads { display:grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap:14px; margin-top:18px; }
.events-feature { display:grid; grid-template-columns: minmax(0, 1fr) 170px; gap: 18px; padding:24px; min-height: 190px; border:1px solid rgba(196,148,58,.22); border-radius:28px; background: radial-gradient(circle at 12% 10%, rgba(196,148,58,.16), transparent 38%), rgba(255,255,255,.035); text-decoration:none; color:inherit; }
.events-feature h2 { margin:14px 0 0; font-family:var(--font-playfair); font-size:30px; line-height:1.02; }
.events-feature p { color:var(--color-text-secondary); font:14px/1.55 var(--font-dm-sans); }
.events-date-block { align-self:end; color:var(--color-text-secondary); font:13px/1.5 var(--font-dm-sans); text-align:right; }
.events-date-block strong { display:block; color:var(--color-text-primary); font-size:16px; }
.events-list { display:grid; gap:10px; margin-top:18px; }
.events-row { display:grid; grid-template-columns: 160px minmax(0, 1fr) 220px; gap: 18px; padding:18px; border:1px solid rgba(245,237,214,.075); border-radius:22px; background: rgba(255,255,255,.026); color:inherit; text-decoration:none; transition: border-color .18s ease, transform .18s ease, background .18s ease; }
.events-row:hover { transform: translateY(-1px); border-color: rgba(196,148,58,.30); background: rgba(255,255,255,.04); }
.events-row-date strong { display:block; color:var(--color-text-primary); font:700 14px/1.35 var(--font-dm-sans); }
.events-row-date span, .events-row-top, .events-row-location, .events-row-main p, .events-row-main small { color:var(--color-text-secondary); font:12px/1.5 var(--font-dm-sans); }
.events-row-top { display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:8px; }
.events-row-main h3 { margin:0; color:var(--color-text-primary); font:700 19px/1.2 var(--font-playfair); }
.events-row-main p { margin:6px 0 0; }
.events-row-main small { display:block; margin-top:6px; color: rgba(245,237,214,.45); }
.events-row-location { text-align:right; align-self:center; }
.events-pill { display:inline-flex; width:fit-content; border-radius:999px; padding:6px 9px; font:800 10px/1 var(--font-dm-sans); letter-spacing:.10em; text-transform:uppercase; border:1px solid rgba(245,237,214,.14); color:var(--color-text-secondary); background:rgba(255,255,255,.04); }
.events-pill.high { border-color:rgba(110,231,183,.28); color:rgba(110,231,183,.96); background:rgba(110,231,183,.08); }
.events-pill.medium { border-color:rgba(196,148,58,.34); color:var(--color-accent-amber); background:rgba(196,148,58,.08); }
.events-empty { margin-top:18px; border:1px dashed rgba(245,237,214,.12); border-radius:22px; padding:28px; color:var(--color-text-secondary); font:14px/1.6 var(--font-dm-sans); }
@media (max-width: 900px) { .events-hero-grid, .events-leads, .events-feature, .events-row { grid-template-columns: 1fr; } .events-filters { position:relative; top:auto; grid-template-columns:1fr; } .events-date-block, .events-row-location { text-align:left; } .events-hero h1 { max-width: 13ch; } }
`;
