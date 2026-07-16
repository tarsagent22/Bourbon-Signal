import Link from "next/link";
import { CalendarExplorer } from "@/components/release-radar/CalendarExplorer";
import { JsonLd } from "@/components/release-radar/RadarPrimitives";
import { RadarTabs } from "@/components/release-radar/RadarTabs";
import { RadarCalendarDownload } from "@/components/release-radar/RadarCalendarDownload";
import { radarEntries, radarPath, releaseRadarUpdatedAt } from "@/lib/release-radar";

export default function ReleaseRadarPage() {
  const calendarEntries = radarEntries.filter((entry) => entry.calendar === true || entry.kind === "bottle" || (entry.kind === "release" && entry.status === "watch")).sort((a, b) => a.startDate.localeCompare(b.startDate));
  const checked = releaseRadarUpdatedAt;
  const checkedLabel = checked ? new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${checked}T00:00:00Z`)) : "";
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
          <span className="rr-hero-label">Release Radar</span>
          <h1>Bourbon Release <em>Calendar</em></h1>
          <p>Confirmed release dates, lottery deadlines, and bourbon events—linked to official sources and separated from live shelf inventory.</p>
          <div className="rr-updated">Updated <time dateTime={checked}>{checkedLabel}</time></div>
        </div>
      </header>

      <RadarTabs active="calendar" />
      <CalendarExplorer entries={calendarEntries} initialMonth={initialMonth} />

      <footer className="rr-utility"><p>Release dates are not live shelf inventory.</p><div><RadarCalendarDownload /><Link href="/bottle-check">Check a bottle</Link><Link href="/#drops">View live signals</Link></div></footer>
    </div>
  </main>;
}
