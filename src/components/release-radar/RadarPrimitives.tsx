import Link from "next/link";
import { ArrowUpRight, CalendarDays, MapPinned, Radar, ShieldCheck } from "lucide-react";
import type { RadarEntry } from "@/lib/release-radar";
import { radarPath } from "@/lib/release-radar";

export function RadarMasthead({ compact = false }: { compact?: boolean }) {
  return (
    <header className={compact ? "radar-masthead radar-masthead--compact" : "radar-masthead"}>
      <div className="radar-masthead__orb" aria-hidden />
      <div className="radar-kicker"><Radar size={14} /> Bourbon intelligence desk</div>
      <h1>{compact ? "Release Radar" : <>Know what&apos;s <em>coming.</em></>}</h1>
      {!compact ? (
        <p className="radar-masthead__dek">A source-backed calendar of limited releases, official lotteries, bottle intelligence, and the state systems that shape the hunt.</p>
      ) : null}
      <div className="radar-trustline">
        <span><ShieldCheck size={13} /> Official sources first</span>
        <span><CalendarDays size={13} /> Deadline-aware</span>
        <span><MapPinned size={13} /> State context preserved</span>
      </div>
    </header>
  );
}

export function RadarNav({ active = "calendar" }: { active?: string }) {
  const normalized = active === "states" ? "states" : active === "bottles" || active === "bottle" ? "bottles" : active === "overview" || active === "calendar" ? "calendar" : "briefings";
  const links = [
    ["calendar", "Calendar", "/release-radar"],
    ["briefings", "Briefings", "/release-radar/briefings"],
    ["states", "State guides", "/release-radar/states"],
    ["bottles", "Bottle guides", "/release-radar/bottles"],
  ];
  return (
    <nav className="radar-subnav" aria-label="Release Radar sections">
      {links.map(([id, label, href]) => <Link key={id} className={normalized === id ? "is-active" : ""} href={href}>{label}</Link>)}
    </nav>
  );
}

export function RadarCard({ entry, index, featured = false }: { entry: RadarEntry; index?: number; featured?: boolean }) {
  return (
    <Link href={radarPath(entry)} className={featured ? "radar-card radar-card--featured" : "radar-card"}>
      <div className="radar-card__top">
        <span className={`radar-status radar-status--${entry.status}`}>{entry.status}</span>
        <span className="radar-card__date">{entry.dateLabel}</span>
      </div>
      <div className="radar-card__body">
        {typeof index === "number" ? <span className="radar-card__index">{String(index + 1).padStart(2, "0")}</span> : null}
        <p className="radar-card__eyebrow">{entry.eyebrow}</p>
        <h3>{entry.title}</h3>
        <p>{entry.dek}</p>
      </div>
      <div className="radar-card__footer">
        <span>{entry.states.join(" · ")}</span>
        <span className="radar-card__open">Open intelligence <ArrowUpRight size={14} /></span>
      </div>
    </Link>
  );
}

export function JsonLd({ value }: { value: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(value).replace(/</g, "\\u003c") }} />;
}
