import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { RadarEntry } from "@/lib/release-radar";
import { radarPath } from "@/lib/release-radar";

export function ReleaseTimeline({ entries }: { entries: RadarEntry[] }) {
  return <section className="rr-section" id="calendar" aria-labelledby="timeline-title">
    <div className="rr-heading"><div><span>Calendar</span><h2 id="timeline-title">On the horizon</h2></div><p>Confirmed dates and release windows.</p></div>
    <div className="rr-timeline">{entries.map((entry) => <Link href={radarPath(entry)} className="rr-timeline-row" key={entry.slug}>
      <time dateTime={entry.startDate}>{entry.dateLabel}</time><i aria-hidden/><span><small>{entry.kind}</small><strong>{entry.title}</strong><em>{entry.location || entry.states.join(" · ")}</em></span><ChevronRight size={16}/>
    </Link>)}</div>
  </section>;
}
