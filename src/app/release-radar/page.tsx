import Link from "next/link";
import { ArrowRight, Database, ShieldCheck } from "lucide-react";
import { ActionNow } from "@/components/release-radar/ActionNow";
import { BottleIndex } from "@/components/release-radar/BottleIndex";
import { LotteryBrief } from "@/components/release-radar/LotteryBrief";
import { ReleaseLedger } from "@/components/release-radar/ReleaseLedger";
import { ReleaseTimeline } from "@/components/release-radar/ReleaseTimeline";
import { StateGuideIndex } from "@/components/release-radar/StateGuideIndex";
import { JsonLd } from "@/components/release-radar/RadarPrimitives";
import { getEntriesByKind, radarEntries, radarPath, stateGuides } from "@/lib/release-radar";

export default function ReleaseRadarPage() {
  const calendar = radarEntries.filter(entry => entry.calendar && entry.kind !== "lottery").sort((a,b)=>a.startDate.localeCompare(b.startDate));
  const releases = getEntriesByKind("release");
  const lotteries = getEntriesByKind("lottery");
  const bottles = getEntriesByKind("bottle");
  const checked = radarEntries.map(entry => entry.updatedAt).sort().at(-1);

  return <main className="rr-page">
    <JsonLd value={{
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "Bourbon Signal Release Radar",
      url: "https://www.bourbonsignal.com/release-radar",
      hasPart: radarEntries.map(entry => ({
        "@type": entry.occurrenceDates?.length ? "EventSeries" : entry.kind === "event" || entry.kind === "lottery" ? "Event" : "Article",
        name: entry.title,
        url: `https://www.bourbonsignal.com${radarPath(entry)}`,
      })),
    }}/>
    <div className="rr-shell">
      <header className="rr-hero">
        <div className="rr-hero-top"><span><Database size={13}/> Bourbon intelligence desk</span><span className="rr-preview">Private preview</span></div>
        <h1>Release <em>Radar</em></h1>
        <p>Upcoming bourbon releases, exact deadlines and state intelligence—organized for action, not browsing.</p>
        <div className="rr-pulse"><span><ShieldCheck size={13}/> Official sources first</span><span>Last checked {checked}</span><span>{lotteries.length} active deadline</span></div>
      </header>

      <nav className="rr-jump" aria-label="Jump to Release Radar section">
        <span>Jump to</span><a href="#action">Now</a><a href="#calendar">Calendar</a><a href="#releases">Releases</a><a href="#states">States</a><a href="#bottles">Bottles</a>
      </nav>

      <ActionNow entries={lotteries} />
      <ReleaseTimeline entries={calendar} />
      <ReleaseLedger entries={releases} />
      <LotteryBrief entries={lotteries} />
      <StateGuideIndex guides={stateGuides} />
      <BottleIndex entries={bottles} />

      <footer className="rr-utility"><div><small>Radar plans the hunt.</small><strong>Live signals show what is happening now.</strong></div><div><Link href="/bottle-check">Check a bottle</Link><Link href="/#drops">View live signals <ArrowRight size={14}/></Link></div></footer>
    </div>
  </main>;
}
