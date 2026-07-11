import Link from "next/link";
import { ArrowRight, ChevronRight } from "lucide-react";
import { JsonLd, RadarCard, RadarMasthead, RadarNav } from "@/components/release-radar/RadarPrimitives";
import { getEntriesByKind, radarEntries, radarPath, stateGuides } from "@/lib/release-radar";

export default function ReleaseRadarPage() {
  const featured = radarEntries.filter((entry) => entry.featured);
  const calendar = radarEntries.filter((entry) => entry.calendar).sort((a, b) => a.startDate.localeCompare(b.startDate));
  const releases = getEntriesByKind("release");
  const lotteries = getEntriesByKind("lottery");
  const bottles = getEntriesByKind("bottle");

  return (
    <main className="radar-page">
      <JsonLd value={{
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: "Bourbon Signal Release Radar",
        description: "Source-backed bourbon release calendar, official whiskey lotteries, bottle intelligence, distillery events, and state hunting guides.",
        url: "https://www.bourbonsignal.com/release-radar",
        isPartOf: { "@type": "WebSite", name: "Bourbon Signal", url: "https://www.bourbonsignal.com" },
        hasPart: radarEntries.map((entry) => ({
          "@type": entry.occurrenceDates?.length ? "EventSeries" : entry.kind === "event" || entry.kind === "lottery" ? "Event" : "Article",
          name: entry.title,
          url: `https://www.bourbonsignal.com${radarPath(entry)}`,
        })),
      }} />
      <div className="radar-shell">
        <RadarMasthead />
        <RadarNav />

        <section className="radar-section" aria-labelledby="radar-now">
          <div className="radar-section__heading">
            <div><p className="radar-section__kicker">On the wire</p><h2 id="radar-now">What matters now</h2></div>
            <p>Official windows, scarce experiences, and releases entering the hunt. Each record separates confirmed source facts from availability context.</p>
          </div>
          <div className="radar-feature-grid">
            {featured[0] ? <RadarCard entry={featured[0]} featured index={0} /> : null}
            <div className="radar-feature-stack">
              {featured.slice(1, 3).map((entry, index) => <RadarCard key={entry.slug} entry={entry} index={index + 1} />)}
            </div>
          </div>
        </section>

        <section className="radar-section" id="calendar" aria-labelledby="calendar-title">
          <div className="radar-section__heading">
            <div><p className="radar-section__kicker">Release calendar</p><h2 id="calendar-title">The next watch windows</h2></div>
            <p>A clean chronology of official entry periods, release dates, event dates, and wider distribution windows.</p>
          </div>
          <div className="radar-calendar">
            {calendar.map((entry) => (
              <Link className="radar-calendar__row" href={radarPath(entry)} key={entry.slug}>
                <span className="radar-calendar__date">{entry.dateLabel}</span>
                <span className="radar-calendar__kind">{entry.eyebrow}</span>
                <span className="radar-calendar__title">{entry.title}</span>
                <span className="radar-calendar__place">{entry.location || entry.states.join(" · ")}</span>
                <ChevronRight size={16} color="rgba(232,201,122,.62)" />
              </Link>
            ))}
          </div>
        </section>

        <section className="radar-section" id="releases" aria-labelledby="release-title">
          <div className="radar-section__heading">
            <div><p className="radar-section__kicker">Release watch</p><h2 id="release-title">Announced. Releasing. Worth tracking.</h2></div>
            <p>National announcements become useful only when timing, distribution, and source precision are kept separate.</p>
          </div>
          <div className="radar-editorial-grid">{releases.map((entry, index) => <RadarCard key={entry.slug} entry={entry} index={index} />)}</div>
        </section>

        <section className="radar-section" id="lotteries" aria-labelledby="lottery-title">
          <div className="radar-section__heading">
            <div><p className="radar-section__kicker">Official lotteries</p><h2 id="lottery-title">Deadlines beat rumors.</h2></div>
            <p>Entry dates, eligibility context, bottle lists, and direct state-source links—without pretending an entry guarantees a bottle.</p>
          </div>
          <div className="radar-editorial-grid">{lotteries.map((entry, index) => <RadarCard key={entry.slug} entry={entry} index={index} />)}</div>
        </section>

        <section className="radar-section" id="states" aria-labelledby="state-title">
          <div className="radar-section__heading">
            <div><p className="radar-section__kicker">State field guides</p><h2 id="state-title">Learn the system before the hunt.</h2></div>
            <p>Control-state mechanics, official channels, local release patterns, and the difference between a broad lead and exact shelf evidence.</p>
          </div>
          <div className="radar-editorial-grid">
            {stateGuides.map((guide) => (
              <Link href={`/release-radar/states/${guide.slug}`} className="radar-state-card" key={guide.slug}>
                <span className="radar-state-card__abbr">{guide.abbreviation}</span>
                <span className="radar-state-card__model">{guide.model}</span>
                <h3>{guide.state}</h3>
                <p>{guide.dek}</p>
              </Link>
            ))}
          </div>
        </section>

        <section className="radar-section" id="bottles" aria-labelledby="bottle-title">
          <div className="radar-section__heading">
            <div><p className="radar-section__kicker">Bottle intelligence</p><h2 id="bottle-title">Price context without the theater.</h2></div>
            <p>Official bottle facts, release history, and honest market context. Asking prices are never treated as guaranteed value.</p>
          </div>
          <div className="radar-editorial-grid">{bottles.map((entry, index) => <RadarCard key={entry.slug} entry={entry} index={index} />)}</div>
        </section>

        <section className="radar-section">
          <div className="radar-cta">
            <div><h2>Release intelligence is the start. Signals make it actionable.</h2><p>Use Bottle Check for bottle context or open the live feed for current market evidence.</p></div>
            <Link href="/#drops">Open the live feed <ArrowRight size={14} style={{ display: "inline", marginLeft: 6 }} /></Link>
          </div>
        </section>
      </div>
    </main>
  );
}
