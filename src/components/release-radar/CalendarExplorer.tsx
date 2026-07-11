"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight, SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { RadarEntry, RadarKind } from "@/lib/release-radar";
import { radarPath } from "@/lib/release-radar";
import { getCalendarOccurrences, isValidMonth } from "@/lib/release-radar-calendar";

const typeLabels: Record<RadarKind, string> = {
  release: "Release",
  lottery: "Lottery",
  event: "Event",
  bottle: "Bottle",
};

function addMonths(value: string, amount: number) {
  const [year, month] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + amount, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(value: string) {
  const [year, month] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function confidenceLabel(entry: RadarEntry) {
  if (entry.status === "watch") return "Editorial watch";
  if (/window|summer|spring|shipping|edition/i.test(entry.dateLabel)) return "Official window";
  return "Official date";
}

export function CalendarExplorer({ entries, initialMonth }: { entries: RadarEntry[]; initialMonth: string }) {
  const [month, setMonth] = useState(initialMonth);
  const [state, setState] = useState("all");
  const [kind, setKind] = useState("all");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedMonth = params.get("month");
    const requestedState = params.get("state");
    const requestedKind = params.get("type");
    if (requestedMonth && isValidMonth(requestedMonth)) setMonth(requestedMonth);
    if (requestedState) setState(requestedState);
    if (requestedKind && ["release", "lottery", "event"].includes(requestedKind)) setKind(requestedKind);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (month !== initialMonth) params.set("month", month);
    if (state !== "all") params.set("state", state);
    if (kind !== "all") params.set("type", kind);
    const query = params.toString();
    window.history.replaceState(null, "", query ? `${window.location.pathname}?${query}` : window.location.pathname);
  }, [initialMonth, kind, month, state]);

  const states = useMemo(() => [...new Set(entries.flatMap((entry) => entry.states))].sort(), [entries]);
  const filtered = useMemo(() => entries.flatMap((entry) => {
    const inState = state === "all" || entry.states.includes(state) || entry.states.includes("Nationwide");
    const isKind = kind === "all" || entry.kind === kind;
    if (!inState || !isKind) return [];
    return getCalendarOccurrences(entry, month).map((occurrence) => ({ entry, occurrence }));
  }).sort((a, b) => a.occurrence.date.localeCompare(b.occurrence.date)), [entries, kind, month, state]);

  const [year, monthNumber] = month.split("-").map(Number);
  const firstWeekday = new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const cells = Array.from({ length: Math.ceil((firstWeekday + daysInMonth) / 7) * 7 }, (_, index) => {
    const day = index - firstWeekday + 1;
    return day > 0 && day <= daysInMonth ? day : null;
  });

  const entriesForDay = (day: number) => filtered.filter(({ occurrence }) => Number(occurrence.date.slice(8, 10)) === day);

  return (
    <section className="rr-calendar" aria-labelledby="calendar-title">
      <div className="rr-calendar-bar">
        <div>
          <span className="rr-kicker">Chronological intelligence</span>
          <h2 id="calendar-title">{monthLabel(month)}</h2>
        </div>
        <div className="rr-month-controls">
          <button type="button" onClick={() => setMonth(addMonths(month, -1))} aria-label="Previous month"><ChevronLeft size={18} /></button>
          <button type="button" className="rr-month-today" onClick={() => setMonth(initialMonth)}>Latest month</button>
          <button type="button" onClick={() => setMonth(addMonths(month, 1))} aria-label="Next month"><ChevronRight size={18} /></button>
        </div>
      </div>

      <div className="rr-filters" aria-label="Calendar filters">
        <span><SlidersHorizontal size={14} /> Filter</span>
        <label><b>State</b><select value={state} onChange={(event) => setState(event.target.value)}><option value="all">All states</option>{states.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <label><b>Type</b><select value={kind} onChange={(event) => setKind(event.target.value)}><option value="all">All types</option><option value="release">Releases</option><option value="lottery">Lotteries</option><option value="event">Events</option></select></label>
        {(state !== "all" || kind !== "all") && <button type="button" className="rr-clear" onClick={() => { setState("all"); setKind("all"); }}>Clear filters</button>}
      </div>

      <div className="rr-calendar-grid" aria-label={`${monthLabel(month)} calendar`}>
        {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((day) => <div className="rr-weekday" key={day}>{day}</div>)}
        {cells.map((day, index) => <div className={day ? "rr-day" : "rr-day rr-day--empty"} key={`${month}-${index}`}>
          {day && <><span className="rr-day-number">{day}</span><div className="rr-day-events">{entriesForDay(day).map(({ entry, occurrence }) => <Link href={radarPath(entry)} className={`rr-day-event rr-day-event--${entry.kind}`} key={`${entry.kind}-${entry.slug}-${occurrence.date}`}><small>{typeLabels[entry.kind]} · {occurrence.label}</small><strong>{entry.title}</strong></Link>)}</div></>}
        </div>)}
      </div>

      <div className="rr-agenda">
        <div className="rr-agenda-heading"><span aria-live="polite">{filtered.length} calendar item{filtered.length === 1 ? "" : "s"}</span><strong>{monthLabel(month)}</strong></div>
        {filtered.length ? filtered.map(({ entry, occurrence }) => <Link className="rr-agenda-row" href={radarPath(entry)} key={`${entry.kind}-${entry.slug}-${occurrence.date}`}>
          <time dateTime={occurrence.date}><b>{occurrence.label}</b><span>{entry.states.join(" · ")}</span></time>
          <span className="rr-agenda-copy"><small>{typeLabels[entry.kind]} · {confidenceLabel(entry)}</small><strong>{entry.title}</strong><em>{entry.location || entry.facts[0]?.value}</em></span>
          <ChevronRight size={18} aria-hidden />
        </Link>) : <div className="rr-calendar-empty"><strong>No records match this month.</strong><p>Try another month or clear the active filters.</p></div>}
      </div>
    </section>
  );
}
