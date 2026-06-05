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
  source_url?: string;
  source_type_label?: string;
  location_name?: string;
  store_name?: string;
  city?: string;
  county?: string;
  event_date?: string;
  observed_at?: string;
  actionability?: "high" | "medium" | "watch" | string;
  detected_products?: string[];
  caveat?: string;
}

interface EventPayload {
  events?: EventRow[];
  total?: number;
}

const CATEGORY_LABELS: Record<string, string> = {
  scheduled_release: "Scheduled release",
  lottery: "Lottery / raffle",
  barrel_pick: "Barrel pick",
  tasting: "Tasting",
  policy_or_program: "Program",
};

const STATE_LABELS: Record<string, string> = {
  AL: "Alabama",
  NC: "North Carolina",
  IN: "Indiana",
  PA: "Pennsylvania",
  VA: "Virginia",
  KY: "Kentucky",
  ME: "Maine",
  WV: "West Virginia",
  UT: "Utah",
  OH: "Ohio",
  IA: "Iowa",
  "MD-MONTGOMERY": "Montgomery, MD",
};

function categoryLabel(category: string) {
  return CATEGORY_LABELS[category] || category.replace(/_/g, " ");
}

function stateLabel(state: string) {
  return STATE_LABELS[state] || state;
}

function formatDate(value?: string) {
  if (!value) return "Date pending";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(parsed);
}

function eventLocation(event: EventRow) {
  return event.store_name || event.location_name || [event.city, event.county].filter(Boolean).join(", ") || stateLabel(event.state);
}

function actionLabel(value?: string) {
  if (value === "high") return "High priority";
  if (value === "medium") return "Actionable";
  return "Upcoming";
}

function actionClass(value?: string) {
  if (value === "high") return "high";
  if (value === "medium") return "medium";
  return "watch";
}

function eventDeck(event: EventRow) {
  const products = event.detected_products?.slice(0, 2).join(", ");
  const location = eventLocation(event);
  if (products) return `${products} · ${location}`;
  return location;
}

export default function EventsPage() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      const res = await fetch("/api/events?limit=100&actionable=true", { signal: controller.signal });
      const payload = (await res.json()) as EventPayload;
      setEvents(Array.isArray(payload.events) ? payload.events : []);
      setLoading(false);
    }
    load().catch((error) => {
      if (error.name !== "AbortError") {
        console.error(error);
        setLoading(false);
      }
    });
    return () => controller.abort();
  }, []);

  const leadEvents = useMemo(() => events.slice(0, 2), [events]);
  const listEvents = useMemo(() => events.slice(leadEvents.length), [events, leadEvents.length]);

  return (
    <>
      <Navigation />
      <main className="events-page">
        <style>{eventsCss}</style>

        <section className="events-hero">
          <div className="events-kicker">Events</div>
          <h1>Events, Lotteries, Raffles, and more</h1>
          <p>Upcoming events tracked by our system will be listed here with links when available</p>
        </section>

        <section className="events-board">
          {loading ? (
            <div className="events-empty">Loading upcoming events…</div>
          ) : events.length === 0 ? (
            <div className="events-empty">
              No upcoming actionable events with official links are available right now. When the system finds a dated event, lottery, raffle, tasting, or barrel pick with a useful signup/info link, it will appear here.
            </div>
          ) : (
            <>
              {leadEvents.length ? (
                <div className="events-leads">
                  {leadEvents.map((event) => <EventFeature key={`lead-${event.id}`} event={event} />)}
                </div>
              ) : null}
              {listEvents.length ? (
                <div className="events-list">
                  {listEvents.map((event) => <EventCard key={event.id} event={event} />)}
                </div>
              ) : null}
            </>
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
        <span>{categoryLabel(event.category)}</span>
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
      <div className="events-row-location">Official link →</div>
    </a>
  );
}

const eventsCss = `
.events-page { min-height: 100vh; padding-top: 96px; background: radial-gradient(circle at 50% 0%, rgba(196,148,58,0.10), transparent 34%), var(--color-bg-primary); color: var(--color-text-primary); }
.events-hero, .events-board { width: min(1180px, calc(100% - 40px)); margin: 0 auto; }
.events-hero { padding: 54px 0 28px; }
.events-kicker { display: inline-flex; border: 1px solid rgba(196,148,58,0.28); border-radius: 999px; color: var(--color-accent-amber); padding: 7px 11px; font: 800 11px/1 var(--font-dm-sans); letter-spacing: .13em; text-transform: uppercase; }
.events-hero h1 { max-width: 900px; font-family: var(--font-playfair); font-size: clamp(44px, 7vw, 80px); line-height: .94; letter-spacing: -.045em; margin: 20px 0 0; }
.events-hero p { max-width: 760px; margin-top: 20px; color: var(--color-text-secondary); font: 17px/1.7 var(--font-dm-sans); }
.events-board { padding: 10px 0 78px; }
.events-leads { display:grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap:14px; margin-top:18px; }
.events-feature { display:grid; grid-template-columns: minmax(0, 1fr) 170px; gap: 18px; padding:24px; min-height: 190px; border:1px solid rgba(196,148,58,.22); border-radius:28px; background: radial-gradient(circle at 12% 10%, rgba(196,148,58,.16), transparent 38%), rgba(255,255,255,.035); text-decoration:none; color:inherit; }
.events-feature h2 { margin:14px 0 0; font-family:var(--font-playfair); font-size:30px; line-height:1.02; }
.events-feature p { color:var(--color-text-secondary); font:14px/1.55 var(--font-dm-sans); }
.events-date-block { align-self:end; color:var(--color-text-secondary); font:13px/1.5 var(--font-dm-sans); text-align:right; }
.events-date-block strong { display:block; color:var(--color-text-primary); font-size:16px; }
.events-list { display:grid; gap:10px; margin-top:18px; }
.events-row { display:grid; grid-template-columns: 160px minmax(0, 1fr) 150px; gap: 18px; padding:18px; border:1px solid rgba(245,237,214,.075); border-radius:22px; background: rgba(255,255,255,.026); color:inherit; text-decoration:none; transition: border-color .18s ease, transform .18s ease, background .18s ease; }
.events-row:hover { transform: translateY(-1px); border-color: rgba(196,148,58,.30); background: rgba(255,255,255,.04); }
.events-row-date strong { display:block; color:var(--color-text-primary); font:700 14px/1.35 var(--font-dm-sans); }
.events-row-date span, .events-row-top, .events-row-location, .events-row-main p, .events-row-main small { color:var(--color-text-secondary); font:12px/1.5 var(--font-dm-sans); }
.events-row-top { display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:8px; }
.events-row-main h3 { margin:0; color:var(--color-text-primary); font:700 19px/1.2 var(--font-playfair); }
.events-row-main p { margin:6px 0 0; }
.events-row-main small { display:block; margin-top:6px; color: rgba(245,237,214,.45); }
.events-row-location { text-align:right; align-self:center; color: var(--color-accent-amber); }
.events-pill { display:inline-flex; width:fit-content; border-radius:999px; padding:6px 9px; font:800 10px/1 var(--font-dm-sans); letter-spacing:.10em; text-transform:uppercase; border:1px solid rgba(245,237,214,.14); color:var(--color-text-secondary); background:rgba(255,255,255,.04); }
.events-pill.high { border-color:rgba(110,231,183,.28); color:rgba(110,231,183,.96); background:rgba(110,231,183,.08); }
.events-pill.medium { border-color:rgba(196,148,58,.34); color:var(--color-accent-amber); background:rgba(196,148,58,.08); }
.events-empty { margin-top:18px; border:1px dashed rgba(245,237,214,.12); border-radius:22px; padding:28px; color:var(--color-text-secondary); font:14px/1.6 var(--font-dm-sans); }
@media (max-width: 900px) { .events-leads, .events-feature, .events-row { grid-template-columns: 1fr; } .events-date-block, .events-row-location { text-align:left; } }
`;
