import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Landmark, Map, ShieldCheck } from "lucide-react";
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
      <div><span className="rr-kicker"><Map size={12}/> American release atlas</span><h1>State<br/><em>guides.</em></h1></div>
      <div className="rr-editorial-intro"><p>Allocation is local. Learn who controls the bottle, how scarce releases move, and which official sources deserve your attention.</p><span className="rr-source-count"><Landmark size={13}/><strong>{stateGuides.length}</strong> systems mapped in depth</span></div>
    </header>
    <RadarTabs active="states"/>

    <section className="rr-state-atlas" aria-label="State bourbon guides">
      <header><span className="rr-kicker">Control map</span><h2>Know the system before<br/>you hunt the shelf.</h2></header>
      <div className="rr-state-atlas-grid">{stateGuides.map((guide, index) => <article key={guide.slug} className={index === 0 ? "is-primary" : undefined}>
        <div className="rr-state-mark" aria-hidden><b>{guide.abbreviation}</b><i>{String(index + 1).padStart(2, "0")}</i></div>
        <div className="rr-state-copy"><small>{guide.model}</small><h3>{guide.state}</h3><p>{guide.dek}</p>
          <dl>{guide.quickFacts.slice(0, 2).map((fact) => <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}</dl>
          <footer><span><ShieldCheck size={12}/> Updated {guide.updatedAt}</span><Link href={`/release-radar/states/${guide.slug}`}>Open guide <ArrowUpRight size={14}/></Link></footer>
        </div>
      </article>)}</div>
    </section>

    <section className="rr-state-primer">
      <span className="rr-kicker">Why states matter</span>
      <div><h2>One bottle.<br/><em>Fifty release systems.</em></h2><div><p>Control states can route coveted whiskey through lotteries, state stores, local boards, or limited-release channels. Private markets depend on distributors and retailers, often with entirely different publication habits.</p><p>These guides explain the mechanics, identify first-party sources, and distinguish a statewide lead from current store-level evidence.</p></div></div>
    </section>
  </div></main>;
}
