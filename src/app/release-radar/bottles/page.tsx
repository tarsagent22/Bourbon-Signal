import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { RadarTabs } from "@/components/release-radar/RadarTabs";
import { getEntriesByKind, radarPath } from "@/lib/release-radar";

export const metadata: Metadata = {
  title: "Bourbon Bottle Guides",
  description: "Source-backed bottle guides covering limited bourbon releases, age statements, official facts, and availability context.",
  alternates: { canonical: "/release-radar/bottles" },
};

export default function RadarBottleGuidesPage() {
  const bottles = getEntriesByKind("bottle");
  return <main className="rr-page"><div className="rr-shell"><header className="rr-editorial-head"><span className="rr-kicker">Release Radar</span><h1>Bottle guides</h1><p>Release context, age statements, official facts, and evidence-aware availability guidance for bottles on the radar.</p></header><RadarTabs active="bottles"/><section className="rr-editorial-list" aria-label="Bottle guides">{bottles.map((entry) => <Link href={radarPath(entry)} key={entry.slug}><span><small>{entry.dateLabel} · {entry.status}</small><strong>{entry.bottle || entry.title}</strong><p>{entry.dek}</p></span><ArrowRight size={17}/></Link>)}</section></div></main>;
}
