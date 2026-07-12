import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, FlaskConical, ShieldCheck } from "lucide-react";
import { RadarTabs } from "@/components/release-radar/RadarTabs";
import { getEntriesByKind, radarPath } from "@/lib/release-radar";

export const metadata: Metadata = {
  title: "Bourbon Bottle Guides",
  description: "Source-backed bottle guides covering limited bourbon releases, age statements, official facts, and availability context.",
  alternates: { canonical: "/release-radar/bottles" },
};

export default function RadarBottleGuidesPage() {
  const bottles = getEntriesByKind("bottle");
  return <main className="rr-page"><div className="rr-shell">
    <header className="rr-editorial-head rr-editorial-head--bottles">
      <div><span className="rr-kicker"><FlaskConical size={12}/> Collector reference</span><h1>Bottle<br/><em>vault.</em></h1></div>
      <div className="rr-editorial-intro"><p>Official facts, release context, and evidence-aware hunting guidance for the bottles commanding attention now.</p><span className="rr-source-count"><ShieldCheck size={13}/><strong>{bottles.length}</strong> limited editions under watch</span></div>
    </header>
    <RadarTabs active="bottles"/>

    <section className="rr-bottle-vault" aria-label="Bottle guides">
      <header><span className="rr-kicker">The collection</span><h2>Scarce releases,<br/>without the mythology.</h2><p>Each dossier begins with first-party facts and ends where local inventory evidence must begin.</p></header>
      <div>{bottles.map((entry, index) => <article key={entry.slug}>
        <div className="rr-bottle-portrait" aria-hidden><span className={`rr-bottle-shape rr-bottle-shape--${index % 3}`}><i/><b>BS<br/>{String(index + 1).padStart(2, "0")}</b></span><em>{entry.dateLabel}</em></div>
        <div className="rr-bottle-copy"><small>{entry.status} · {entry.availability}</small><h3>{entry.bottle || entry.title}</h3><p>{entry.dek}</p>
          <dl>{entry.facts.slice(0, 3).map((fact) => <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}</dl>
          <footer><span><ShieldCheck size={12}/> {entry.sources[0]?.label}</span><Link href={radarPath(entry)}>Open dossier <ArrowUpRight size={14}/></Link></footer>
        </div>
      </article>)}</div>
    </section>

    <section className="rr-vault-principle"><span>01</span><div><small>Evidence standard</small><h2>A release is not<br/>a shelf sighting.</h2><p>Producer announcements establish the bottle and its broad release window. Bourbon Signal only calls out local availability when current state, retailer, or member evidence supports it.</p></div></section>
  </div></main>;
}
