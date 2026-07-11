import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { RadarTabs } from "@/components/release-radar/RadarTabs";
import { radarEntries, radarPath } from "@/lib/release-radar";

export const metadata: Metadata = {
  title: "Bourbon Release Briefings",
  description: "Source-backed briefings on upcoming bourbon releases, official whiskey lotteries, and distillery events.",
  alternates: { canonical: "/release-radar/briefings" },
};

export default function RadarBriefingsPage() {
  const entries = radarEntries.filter((entry) => entry.kind !== "bottle").sort((a, b) => b.startDate.localeCompare(a.startDate));
  return <main className="rr-page"><div className="rr-shell"><header className="rr-editorial-head"><span className="rr-kicker">Release Radar</span><h1>Briefings</h1><p>Source-backed reporting on bourbon releases, official lotteries, and events worth planning around.</p></header><RadarTabs active="briefings"/><section className="rr-editorial-list" aria-label="Release Radar briefings">{entries.map((entry) => <Link href={radarPath(entry)} key={entry.slug}><span><small>{entry.kind} · {entry.dateLabel}</small><strong>{entry.title}</strong><p>{entry.dek}</p></span><ArrowRight size={17}/></Link>)}</section></div></main>;
}
