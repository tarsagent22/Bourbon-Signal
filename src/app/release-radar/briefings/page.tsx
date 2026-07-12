import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, BookOpen, Clock3, ShieldCheck } from "lucide-react";
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
  const sourceCount = new Set(entries.flatMap((entry) => entry.sources.map((source) => source.url))).size;

  return <main className="rr-page"><div className="rr-shell">
    <header className="rr-editorial-head rr-editorial-head--briefings">
      <div><span className="rr-kicker"><BookOpen size={12}/> Intelligence journal</span><h1>Release<br/><em>briefings.</em></h1></div>
      <div className="rr-editorial-intro"><p>Original, source-backed reporting for hunters who want the facts behind a date—not another recycled announcement.</p><span className="rr-source-count"><ShieldCheck size={13}/><strong>{sourceCount}</strong> primary sources across this desk</span></div>
    </header>
    <RadarTabs active="briefings"/>

    {lead && <section className="rr-briefing-lead" aria-label="Featured briefing">
      <div className="rr-briefing-issue" aria-hidden><span>FIELD NOTE</span><strong>01</strong><i/></div>
      <div className="rr-briefing-lead-copy">
        <span>{lead.kind} · {lead.dateLabel}</span>
        <h2>{lead.title}</h2>
        <p>{lead.dek}</p>
        <div><small><Clock3 size={12}/> Updated {lead.updatedAt}</small><small><ShieldCheck size={12}/> {lead.sources.length} official source{lead.sources.length === 1 ? "" : "s"}</small></div>
        <Link href={radarPath(lead)}>Read field briefing <ArrowUpRight size={15}/></Link>
      </div>
    </section>}

    <section className="rr-briefing-ledger" aria-label="Release Radar briefings">
      <header><span className="rr-kicker">The ledger</span><h2>Recent intelligence</h2><p>Release facts, deadline context, and what remains unconfirmed.</p></header>
      <div>{rest.map((entry, index) => <article key={entry.slug}>
        <span className="rr-briefing-number">{String(index + 2).padStart(2, "0")}</span>
        <div><small>{entry.kind} · {entry.dateLabel}</small><h3><Link href={radarPath(entry)}>{entry.title}</Link></h3><p>{entry.dek}</p><footer><span>Updated {entry.updatedAt}</span><span>{entry.sources.length} sourced record{entry.sources.length === 1 ? "" : "s"}</span></footer></div>
        <Link className="rr-round-link" href={radarPath(entry)} aria-label={`Read ${entry.title}`}><ArrowUpRight size={16}/></Link>
      </article>)}</div>
    </section>

    <section className="rr-index-manifesto"><span className="rr-kicker">Editorial standard</span><h2>Official first.<br/>Interpretation second.</h2><p>Every briefing separates what a producer or agency has confirmed from what hunters still need to verify locally. Release announcements explain the hunt; they never masquerade as shelf inventory.</p></section>
  </div></main>;
}
