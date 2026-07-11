import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { CalendarExplorer } from "@/components/release-radar/CalendarExplorer";
import { JsonLd } from "@/components/release-radar/RadarPrimitives";
import { RadarTabs } from "@/components/release-radar/RadarTabs";
import { radarEntries, radarPath } from "@/lib/release-radar";

export default function ReleaseRadarPage() {
  const calendarEntries = radarEntries.filter((entry) => entry.kind !== "bottle").sort((a, b) => a.startDate.localeCompare(b.startDate));
  const checked = radarEntries.map((entry) => entry.updatedAt).sort().at(-1) || "";
  const initialMonth = checked.slice(0, 7);

  return <main className="rr-page">
    <JsonLd value={{
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "Bourbon Signal Release Radar",
      description: "A chronological bourbon release calendar covering official release dates, lotteries, distillery events, and state guides.",
      url: "https://www.bourbonsignal.com/release-radar",
      mainEntity: {
        "@type": "ItemList",
        itemListElement: radarEntries.map((entry, index) => ({
          "@type": "ListItem",
          position: index + 1,
          name: entry.title,
          url: `https://www.bourbonsignal.com${radarPath(entry)}`,
        })),
      },
    }}/>
    <div className="rr-shell">
      <header className="rr-hero rr-hero--calendar">
        <div className="rr-hero-top"><span><ShieldCheck size={13}/> Official sources linked</span><span className="rr-preview">Private preview</span></div>
        <h1>Release <em>Radar</em></h1>
        <p>Bourbon release dates, open lotteries, and distillery events—compiled in one chronological calendar.</p>
        <div className="rr-updated">Updated {checked} <i/> Exact dates, official windows, and editorial watches are labeled separately.</div>
      </header>

      <RadarTabs active="calendar" />
      <CalendarExplorer entries={calendarEntries} initialMonth={initialMonth} />

      <section className="rr-calendar-note" aria-labelledby="reading-radar">
        <span className="rr-kicker">Reading the radar</span>
        <h2 id="reading-radar">Dates without false precision.</h2>
        <p>Official dates appear as fixed calendar records. Broader release windows and Bourbon Signal watch periods remain clearly labeled until a source confirms something more exact.</p>
      </section>

      <footer className="rr-utility"><div><small>Planning a hunt?</small><strong>Calendar intelligence is not live shelf inventory.</strong></div><div><Link href="/bottle-check">Check a bottle</Link><Link href="/#drops">View live signals <ArrowRight size={14}/></Link></div></footer>
    </div>
  </main>;
}
