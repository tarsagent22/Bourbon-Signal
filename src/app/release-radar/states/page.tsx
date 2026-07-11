import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { RadarTabs } from "@/components/release-radar/RadarTabs";
import { stateGuides } from "@/lib/release-radar";

export const metadata: Metadata = {
  title: "State Bourbon Release Guides",
  description: "State-by-state guides to bourbon lotteries, control systems, local release mechanics, and official availability sources.",
  alternates: { canonical: "/release-radar/states" },
};

export default function RadarStateGuidesPage() {
  return <main className="rr-page"><div className="rr-shell"><header className="rr-editorial-head"><span className="rr-kicker">Release Radar</span><h1>State guides</h1><p>Understand the control systems, local release mechanics, and source signals that shape the bourbon hunt by market.</p></header><RadarTabs active="states"/><section className="rr-state-directory" aria-label="State bourbon guides">{stateGuides.map((guide) => <Link href={`/release-radar/states/${guide.slug}`} key={guide.slug}><b>{guide.abbreviation}</b><span><small>{guide.model}</small><strong>{guide.state}</strong><p>{guide.dek}</p></span><ArrowRight size={17}/></Link>)}</section></div></main>;
}
