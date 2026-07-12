import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
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
      <div><h1>Bottle guides</h1></div>
      <div className="rr-editorial-intro"><p>Official release facts and availability context for limited bottles.</p></div>
    </header>
    <RadarTabs active="bottles"/>

    <section className="rr-bottle-vault" aria-label="Bottle guides">
      <header><h2>Limited releases</h2><p>A release announcement does not confirm local shelf availability.</p></header>
      <div>{bottles.map((entry, index) => <article key={entry.slug}>
        <div className="rr-bottle-portrait" aria-hidden><span className={`rr-bottle-shape rr-bottle-shape--${index % 3}`}><i/></span><em>{entry.dateLabel}</em></div>
        <div className="rr-bottle-copy"><small>{entry.status} · {entry.availability}</small><h3>{entry.bottle || entry.title}</h3><p>{entry.dek}</p>
          <dl>{entry.facts.slice(0, 2).map((fact) => <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}</dl>
          <footer><span>{entry.sources[0]?.label}</span><Link href={radarPath(entry)}>Open guide <ArrowUpRight size={14}/></Link></footer>
        </div>
      </article>)}</div>
    </section>


  </div></main>;
}
