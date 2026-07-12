import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { RadarTabs } from "@/components/release-radar/RadarTabs";
import { stateGuides } from "@/lib/release-radar";

export const metadata: Metadata = {
  title: "State Bourbon Release Guides",
  description: "State-by-state guides to bourbon lotteries, control systems, local release mechanics, and official availability sources.",
  alternates: { canonical: "/release-radar/states" },
};

export default function RadarStateGuidesPage() {
  return <main className="rr-page"><div className="rr-shell">
    <header className="rr-editorial-head rr-editorial-head--states">
      <div><h1>State guides</h1></div>
      <div className="rr-editorial-intro"><p>How limited bourbon releases move in each state and where to check official information.</p></div>
    </header>
    <RadarTabs active="states"/>

    <section className="rr-state-atlas" aria-label="State bourbon guides">
      <header><h2>Choose a state</h2></header>
      <div className="rr-state-atlas-grid">{stateGuides.map((guide, index) => <article key={guide.slug} className={index === 0 ? "is-primary" : undefined}>
        <div className="rr-state-mark" aria-hidden><b>{guide.abbreviation}</b></div>
        <div className="rr-state-copy"><small>{guide.model}</small><h3>{guide.state}</h3><p>{guide.dek}</p>
          <footer><span>Updated {guide.updatedAt}</span><Link href={`/release-radar/states/${guide.slug}`}>Open guide <ArrowUpRight size={14}/></Link></footer>
        </div>
      </article>)}</div>
    </section>
  </div></main>;
}
