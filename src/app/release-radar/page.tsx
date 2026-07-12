import Link from "next/link";
import { ArrowRight, RadioTower, ShieldCheck } from "lucide-react";
import { CalendarExplorer } from "@/components/release-radar/CalendarExplorer";
import { JsonLd } from "@/components/release-radar/RadarPrimitives";
import { RadarTabs } from "@/components/release-radar/RadarTabs";
import { radarEntries, radarPath } from "@/lib/release-radar";

export default function ReleaseRadarPage() {
  const calendarEntries = radarEntries.filter((entry) => entry.kind !== "bottle").sort((a, b) => a.startDate.localeCompare(b.startDate));
  const checked = radarEntries.map((entry) => entry.updatedAt).sort().at(-1) || "";
  const initialMonth = checked.slice(0, 7);
  const officialSources = new Set(calendarEntries.flatMap((entry) => entry.sources.map((source) => source.url))).size;
  const datedRecords = calendarEntries.filter((entry) => entry.status !== "watch").length;

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
        <div className="rr-hero-copy">
          <div className="rr-hero-top"><span><ShieldCheck size={13}/> Official sources linked</span><span className="rr-preview">Private preview</span></div>
          <span className="rr-kicker rr-kicker--live"><i /> Bourbon intelligence desk</span>
          <h1>Release <em>Radar</em></h1>
          <p>Verified dates, open lotteries, and scarce bourbon events—sequenced for action, never padded with false precision.</p>
          <div className="rr-hero-metrics" aria-label="Release Radar coverage">
            <span><strong>{datedRecords}</strong><small>Dated records</small></span>
            <span><strong>{officialSources}</strong><small>Primary sources</small></span>
            <span><strong>{calendarEntries.filter((entry) => entry.status === "watch").length}</strong><small>Watch windows</small></span>
          </div>
          <div className="rr-updated"><RadioTower size={12}/> Radar checked {checked}</div>
        </div>
        <div className="rr-hero-instrument" aria-hidden>
          <span className="rr-orbit rr-orbit--one"/><span className="rr-orbit rr-orbit--two"/><span className="rr-sweep"/><i/><b>RADAR<br/>26</b>
        </div>
      </header>

      <RadarTabs active="calendar" />
      <CalendarExplorer entries={calendarEntries} initialMonth={initialMonth} />

      <section className="rr-calendar-note" aria-labelledby="reading-radar">
        <span className="rr-kicker">Signal discipline</span>
        <h2 id="reading-radar">Precision where it exists.<br/><em>Honesty where it doesn’t.</em></h2>
        <p>Confirmed dates live on the calendar. Broader producer windows remain in the watch deck until an official source gives us something exact.</p>
        <Link href="/release-radar/briefings">Read the intelligence briefings <ArrowRight size={14}/></Link>
      </section>

      <footer className="rr-utility"><div><small>Planning a hunt?</small><strong>Calendar intelligence is not live shelf inventory.</strong></div><div><Link href="/bottle-check">Check a bottle</Link><Link href="/#drops">View live signals <ArrowRight size={14}/></Link></div></footer>
    </div>
  </main>;
}
