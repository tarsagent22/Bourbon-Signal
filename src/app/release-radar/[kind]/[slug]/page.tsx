import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { notFound } from "next/navigation";
import { JsonLd, RadarNav } from "@/components/release-radar/RadarPrimitives";
import { getRadarEntryByPath, radarEntries, radarPath, radarPathKinds } from "@/lib/release-radar";

export function generateStaticParams() {
  return radarEntries.map((entry) => {
    const [, , kind] = radarPath(entry).split("/");
    return { kind, slug: entry.slug };
  });
}

export async function generateMetadata({ params }: { params: Promise<{ kind: string; slug: string }> }): Promise<Metadata> {
  const { kind, slug } = await params;
  const entry = getRadarEntryByPath(kind, slug);
  if (!entry) return {};
  const path = radarPath(entry);
  return {
    title: entry.title,
    description: entry.summary,
    alternates: { canonical: path },
    openGraph: { title: entry.title, description: entry.dek, url: path, type: "article" },
  };
}

export default async function RadarDetailPage({ params }: { params: Promise<{ kind: string; slug: string }> }) {
  const { kind, slug } = await params;
  if (!radarPathKinds().includes(kind)) notFound();
  const entry = getRadarEntryByPath(kind, slug);
  if (!entry) notFound();
  const canonical = `https://www.bourbonsignal.com${radarPath(entry)}`;
  const isScheduled = entry.kind === "event" || entry.kind === "lottery";
  const eventBase = {
    name: entry.title,
    description: entry.summary,
    eventStatus: "https://schema.org/EventScheduled",
    url: canonical,
    organizer: { "@type": "Organization", name: entry.sources[0].label, url: entry.sources[0].url },
  };
  const schema: Record<string, unknown> = isScheduled ? entry.occurrenceDates?.length ? {
    "@context": "https://schema.org", "@type": "EventSeries", ...eventBase,
    subEvent: entry.occurrenceDates.map((date) => ({
      "@type": "Event", ...eventBase, startDate: date, endDate: date,
      eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
      location: entry.location ? { "@type": "Place", name: entry.location } : undefined,
    })),
  } : {
    "@context": "https://schema.org", "@type": "Event", ...eventBase,
    startDate: entry.schemaStartDate || entry.startDate,
    endDate: entry.schemaEndDate || entry.endDate || entry.startDate,
    eventAttendanceMode: entry.kind === "lottery" ? "https://schema.org/OnlineEventAttendanceMode" : "https://schema.org/OfflineEventAttendanceMode",
    location: entry.kind !== "lottery" && entry.location ? { "@type": "Place", name: entry.location } : undefined,
  } : {
    "@context": "https://schema.org", "@type": "Article", headline: entry.title, description: entry.summary,
    dateModified: entry.updatedAt, mainEntityOfPage: canonical,
    publisher: { "@type": "Organization", name: "Bourbon Signal", url: "https://www.bourbonsignal.com" },
    citation: entry.sources.map((source) => source.url),
  };

  return (
    <main className="radar-page">
      <JsonLd value={[schema, {
        "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
          { "@type": "ListItem", position: 1, name: "Bourbon Signal", item: "https://www.bourbonsignal.com" },
          { "@type": "ListItem", position: 2, name: "Release Radar", item: "https://www.bourbonsignal.com/release-radar" },
          { "@type": "ListItem", position: 3, name: entry.title, item: canonical },
        ],
      }]} />
      <div className="radar-shell">
        <RadarNav active={kind} />
        <article className="radar-detail">
          <div className="radar-breadcrumbs"><Link href="/">Bourbon Signal</Link><span>/</span><Link href="/release-radar">Release Radar</Link><span>/</span><span>{entry.eyebrow}</span></div>
          <div className="radar-detail__hero">
            <div>
              <p className="radar-detail__eyebrow"><span className={`radar-status radar-status--${entry.status}`}>{entry.status}</span> {entry.eyebrow}</p>
              <h1>{entry.title}</h1>
              <p className="radar-detail__dek">{entry.dek}</p>
              <p className="radar-detail__source-note">Source-backed intelligence · Availability can change · Last checked {entry.updatedAt}</p>
            </div>
            <aside className="radar-fact-panel" aria-label="Key details">
              {entry.facts.map((fact) => <div className="radar-fact" key={fact.label}><span>{fact.label}</span><strong>{fact.value}</strong></div>)}
            </aside>
          </div>
          <div className="radar-detail__content">
            <div className="radar-prose">
              <section><h2>Signal summary</h2><p>{entry.summary}</p></section>
              {entry.sections.map((section) => <section key={section.heading}><h2>{section.heading}</h2><p>{section.body}</p></section>)}
            </div>
            <aside className="radar-source-rail">
              <h2>Primary sources</h2>
              {entry.sources.map((source) => <a className="radar-source-link" href={source.url} target="_blank" rel="noreferrer" key={source.url}><span>{source.label}</span><ArrowUpRight size={14} /></a>)}
              <p className="radar-updated">Verified {entry.updatedAt}</p>
            </aside>
          </div>
          <div className="radar-cta">
            <div><h2>Turn release context into a live hunt.</h2><p>Check current signals, monitor your markets, and keep the official source close.</p></div>
            <Link href="/#drops">Open live signals <ArrowRight size={14} style={{ display: "inline", marginLeft: 6 }} /></Link>
          </div>
        </article>
      </div>
    </main>
  );
}
