import Link from "next/link";
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
        <div className="rr-hero-copy">
          <h1>Release <em>Radar</em></h1>
          <p>Confirmed bourbon release dates, lotteries, and events from official sources.</p>
          <div className="rr-updated">Updated {checked}</div>
        </div>
        <div className="rr-hero-instrument" aria-hidden>
          <span className="rr-orbit rr-orbit--one"/><span className="rr-orbit rr-orbit--two"/><span className="rr-sweep"/><i/><b>RADAR<br/>26</b>
        </div>
      </header>

      <RadarTabs active="calendar" />
      <CalendarExplorer entries={calendarEntries} initialMonth={initialMonth} />

      <footer className="rr-utility"><p>Release dates are not live shelf inventory.</p><div><Link href="/bottle-check">Check a bottle</Link><Link href="/#drops">View live signals</Link></div></footer>
    </div>
  </main>;
}
