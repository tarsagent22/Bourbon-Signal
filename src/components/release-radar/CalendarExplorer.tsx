"use client";

import Link from "next/link";
import {
  ArrowUpRight,

  ChevronLeft,
  ChevronRight,
  Clock3,
  MapPin,

} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { RadarEntry, RadarKind } from "@/lib/release-radar";
import { radarPath } from "@/lib/release-radar";
import { getAgendaOccurrences, getCalendarOccurrences, isValidMonth } from "@/lib/release-radar-calendar";
import { recordGrowthMilestone } from "@/lib/growth-client";
import { useAuth } from "@/lib/auth";

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

function dateParts(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return {
    month: new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(date),
    day: String(day).padStart(2, "0"),
    weekday: new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(date),
  };
}

function statusLabel(entry: RadarEntry) {
  if (entry.status === "open") return "Open now";
  if (entry.status === "releasing") return "Releasing now";
  if (entry.status === "watch") return "Watch window";
  if (entry.kind === "lottery") return "Entry window";
  return entry.status === "upcoming" ? "Upcoming" : "Announced";
}

function sourceType(entry: RadarEntry) {
  if (entry.sources[0]?.type === "state") return "State source";
  if (entry.sources[0]?.type === "press") return "Press source";
  return "Official source";
}

function watchMatchesMonth(entry: RadarEntry, month: string) {
  if (/^\d{4}$/.test(entry.startDate)) return entry.startDate === month.slice(0, 4);
  return entry.startDate.slice(0, 7) === month;
}

export function CalendarExplorer({ entries, initialMonth, today }: { entries: RadarEntry[]; initialMonth: string; today: string }) {
  const { isSignedIn, entitlements } = useAuth();
  const [month, setMonth] = useState(initialMonth);
  const [state, setState] = useState("all");
  const [kind, setKind] = useState("all");
  const explorationRecorded = useRef(false);

  const recordExploration = (interaction: "calendar_filter" | "calendar_navigation") => {
    if (!isSignedIn || entitlements.tier !== "free" || explorationRecorded.current) return;
    explorationRecorded.current = true;
    recordGrowthMilestone("free_value_reached", {
      surface: "release_radar",
      kind: interaction,
    });
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedMonth = params.get("month");
    const requestedState = params.get("state");
    const requestedKind = params.get("type");
    if (requestedMonth && isValidMonth(requestedMonth)) setMonth(requestedMonth);
    if (requestedState) setState(requestedState);
    if (requestedKind && ["release", "lottery", "event", "bottle"].includes(requestedKind)) setKind(requestedKind);
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
  const matchingEntries = useMemo(() => entries.filter((entry) => {
    const inState = state === "all" || entry.states.includes(state) || entry.states.includes("Nationwide");
    const inKind = kind === "all" || (kind === "bottle" ? Boolean(entry.bottle) : entry.kind === kind);
    return inState && inKind;
  }), [entries, kind, state]);

  const gridOccurrences = useMemo(() => matchingEntries
    .filter((entry) => entry.calendar === true)
    .flatMap((entry) => getCalendarOccurrences(entry, month).map((occurrence) => ({ entry, occurrence })))
    .sort((a, b) => a.occurrence.date.localeCompare(b.occurrence.date)), [matchingEntries, month]);

  const agendaOccurrences = useMemo(() => matchingEntries
    .filter((entry) => entry.calendar === true)
    .flatMap((entry) => getAgendaOccurrences(entry, month).map((occurrence) => ({ entry, occurrence })))
    .filter(({ occurrence }) => month !== today.slice(0, 7) || (occurrence.rangeEnd || occurrence.date) >= today)
    .map(({ entry, occurrence }) => occurrence.rangeEnd && occurrence.date < today && occurrence.rangeEnd >= today
      ? { entry, occurrence: { ...occurrence, date: today, label: `Open through ${dateParts(occurrence.rangeEnd).month} ${Number(occurrence.rangeEnd.slice(8, 10))}` } }
      : { entry, occurrence })
    .sort((a, b) => {
      const aOngoing = a.entry.startDate < today ? 1 : 0;
      const bOngoing = b.entry.startDate < today ? 1 : 0;
      return aOngoing - bOngoing || a.occurrence.date.localeCompare(b.occurrence.date);
    }), [matchingEntries, month, today]);

  const watchEntries = useMemo(() => matchingEntries
    .filter((entry) => entry.calendar !== true && (entry.kind === "release" || entry.kind === "bottle" || entry.kind === "lottery") && watchMatchesMonth(entry, month)), [matchingEntries, month]);

  const [year, monthNumber] = month.split("-").map(Number);
  const firstWeekday = new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const cells = Array.from({ length: Math.ceil((firstWeekday + daysInMonth) / 7) * 7 }, (_, index) => {
    const day = index - firstWeekday + 1;
    return day > 0 && day <= daysInMonth ? day : null;
  });
  const entriesForDay = (day: number) => gridOccurrences.filter(({ occurrence }) => Number(occurrence.date.slice(8, 10)) === day);
  const filtersActive = state !== "all" || kind !== "all";

  return (
    <section className="rr-calendar" aria-labelledby="calendar-title">
      <div className="rr-command-bar">
        <div className="rr-calendar-bar">
          <div>
            <h2 id="calendar-title">{monthLabel(month)}</h2>
          </div>
          <div className="rr-month-controls">
            <button type="button" onClick={() => { setMonth(addMonths(month, -1)); recordExploration("calendar_navigation"); }} aria-label="Previous month"><ChevronLeft size={18} /></button>
            <button type="button" className="rr-month-today" onClick={() => { setMonth(initialMonth); recordExploration("calendar_navigation"); }}>Latest</button>
            <button type="button" onClick={() => { setMonth(addMonths(month, 1)); recordExploration("calendar_navigation"); }} aria-label="Next month"><ChevronRight size={18} /></button>
          </div>
        </div>

        <div className="rr-filters" aria-label="Calendar filters">
          <label><b>State</b><select value={state} onChange={(event) => { setState(event.target.value); recordExploration("calendar_filter"); }}><option value="all">All states</option>{states.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <label><b>Type</b><select value={kind} onChange={(event) => { setKind(event.target.value); recordExploration("calendar_filter"); }}><option value="all">All types</option><option value="bottle">Bottle releases</option><option value="lottery">Lotteries</option><option value="event">Events</option></select></label>
          {filtersActive && <button type="button" className="rr-clear" onClick={() => { setState("all"); setKind("all"); recordExploration("calendar_filter"); }}>Clear</button>}
        </div>
      </div>

      <div className="rr-calendar-grid" aria-label={`${monthLabel(month)} calendar`}>
        {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((day) => <div className="rr-weekday" key={day}>{day}</div>)}
        {cells.map((day, index) => <div className={day ? "rr-day" : "rr-day rr-day--empty"} key={`${month}-${index}`}>
          {day && <><span className="rr-day-number">{day}</span><div className="rr-day-events">{entriesForDay(day).map(({ entry, occurrence }) => <Link href={radarPath(entry)} onClick={() => recordExploration("calendar_navigation")} className={`rr-day-event rr-day-event--${entry.kind}`} key={`${entry.kind}-${entry.slug}-${occurrence.date}`}><small>{occurrence.label}</small><strong>{entry.title}</strong></Link>)}</div></>}
        </div>)}
      </div>

      <section className="rr-timeline" aria-labelledby="timeline-title">
        <header className="rr-timeline-head">
          <h3 id="timeline-title">Upcoming dates</h3>
        </header>

        {agendaOccurrences.length ? <div className="rr-timeline-track">
          {agendaOccurrences.map(({ entry, occurrence }, index) => {
            const date = dateParts(occurrence.date);
            const leadFact = entry.facts.find((fact) => /opens|closes|dates|release/i.test(fact.label)) || entry.facts[0];
            return <article className={`rr-timeline-item rr-timeline-item--${entry.kind}${entry.featured ? " is-featured" : ""}`} key={`${entry.kind}-${entry.slug}-${occurrence.date}`} style={{ "--rr-order": index } as CSSProperties}>
              <div className="rr-timeline-date" aria-label={`${date.month} ${date.day}, ${date.weekday}`}><span>{date.month}</span><strong>{date.day}</strong><small>{date.weekday}</small></div>
              <div className="rr-timeline-node" aria-hidden><i /></div>
              <div className="rr-timeline-card">
                <div className="rr-card-signal"><span>{entry.bottle ? "Bottle release" : typeLabels[entry.kind]}</span><b>{statusLabel(entry)}</b></div>
                <Link className="rr-card-title" href={radarPath(entry)} onClick={() => recordExploration("calendar_navigation")}><h4>{entry.title}</h4><ArrowUpRight size={19} aria-hidden /></Link>
                <p>{entry.dek}</p>
                <div className="rr-card-facts">
                  {entry.location && <span><MapPin size={13} /> {entry.location}</span>}
                  {(entry.occurrences?.length || leadFact) && <span><Clock3 size={13} /> {entry.occurrences?.length ? occurrence.label : leadFact?.value}</span>}
                </div>
                <footer className="rr-card-proof">
                  <span>{sourceType(entry)} · Updated {entry.updatedAt}</span>
                  <a href={entry.sources[0]?.url} target="_blank" rel="noreferrer">{sourceType(entry)} <ArrowUpRight size={12} /></a>
                </footer>
              </div>
            </article>;
          })}
        </div> : <div className="rr-calendar-empty"><strong>No dated records match this month.</strong><p>Try another month or clear the active filters.</p></div>}
      </section>

      {watchEntries.length > 0 && <section className="rr-watch-deck" aria-labelledby="watch-title">
        <header><div><h3 id="watch-title">Watch windows</h3></div><p>Announced without an exact date.</p></header>
        <div>{watchEntries.map((entry) => <Link href={radarPath(entry)} onClick={() => recordExploration("calendar_navigation")} key={entry.slug} className="rr-watch-card"><span>{entry.dateLabel}</span><strong>{entry.title}</strong><p>{entry.availability}</p><small>{sourceType(entry)} · {entry.sources[0]?.label}</small><ArrowUpRight size={16}/></Link>)}</div>
      </section>}
    </section>
  );
}
