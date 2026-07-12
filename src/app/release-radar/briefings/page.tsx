import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { RadarTabs } from "@/components/release-radar/RadarTabs";
import { radarEntries, radarPath } from "@/lib/release-radar";

export const metadata: Metadata = {
  title: "Bourbon Release Briefings",
  description: "Source-backed briefings on upcoming bourbon releases, official whiskey lotteries, and distillery events.",
  alternates: { canonical: "/release-radar/briefings" },
};

export default function RadarBriefingsPage() {
  const entries = radarEntries.filter((entry) => entry.kind !== "bottle").sort((a, b) => b.startDate.localeCompare(a.startDate));
  const [lead, ...rest] = entries;
  return <main className="rr-page"><div className="rr-shell">
    <header className="rr-editorial-head rr-editorial-head--briefings">
      <div><h1>Release briefings</h1></div>
      <div className="rr-editorial-intro"><p>What is confirmed, when it happens, and what remains unknown.</p></div>
    </header>
    <RadarTabs active="briefings"/>

    {lead && <section className="rr-briefing-lead" aria-label="Featured briefing">
      <div className="rr-briefing-lead-copy">
        <span>{lead.kind} · {lead.dateLabel}</span>
        <h2>{lead.title}</h2>
        <p>{lead.dek}</p>
        <div><small>Updated {lead.updatedAt}</small></div>
        <Link href={radarPath(lead)}>Read briefing <ArrowUpRight size={15}/></Link>
      </div>
    </section>}

    <section className="rr-briefing-ledger" aria-label="Release Radar briefings">
      <header><h2>More briefings</h2></header>
      <div>{rest.map((entry) => <article key={entry.slug}>
        <div><small>{entry.kind} · {entry.dateLabel}</small><h3><Link href={radarPath(entry)}>{entry.title}</Link></h3><p>{entry.dek}</p><footer><span>Updated {entry.updatedAt}</span></footer></div>
        <Link className="rr-round-link" href={radarPath(entry)} aria-label={`Read ${entry.title}`}><ArrowUpRight size={16}/></Link>
      </article>)}</div>
    </section>
  </div></main>;
}
