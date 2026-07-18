import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, CalendarDays, MapPin } from "lucide-react";
import { notFound } from "next/navigation";
import { JsonLd, RadarNav } from "@/components/release-radar/RadarPrimitives";
import { getStateGuide, radarEntries, radarPath, stateGuides } from "@/lib/release-radar";

export function generateStaticParams() {
  return stateGuides.map((guide) => ({ slug: guide.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const guide = getStateGuide(slug);
  if (!guide) return {};

  const canonical = `/release-radar/states/${guide.slug}`;
  return {
    title: guide.title,
    description: guide.dek,
    alternates: { canonical },
    openGraph: { title: guide.title, description: guide.dek, url: canonical, type: "article" },
    twitter: { card: "summary", title: guide.title, description: guide.dek },
    keywords: guide.abbreviation === "NC" ? [
      "North Carolina ABC bourbon",
      "NC ABC bourbon lottery",
      "allocated bourbon North Carolina",
      "North Carolina bourbon releases",
      "NC ABC inventory",
    ] : undefined,
  };
}

function formatUpdatedDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${value}T00:00:00Z`));
}

export default async function StateGuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const guide = getStateGuide(slug);
  if (!guide) notFound();

  const canonical = `https://www.bourbonsignal.com/release-radar/states/${guide.slug}`;
  const updatedLabel = formatUpdatedDate(guide.updatedAt);
  const stateEntries = radarEntries
    .filter((entry) => entry.states.includes(guide.state))
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  const hasDeepGuide = Boolean(guide.boardProfiles?.length || guide.huntingSteps?.length || guide.evidenceLevels?.length || guide.faqs?.length);
  const structuredData: object[] = [{
    "@context": "https://schema.org",
    "@type": "Article",
    headline: guide.title,
    description: guide.dek,
    dateModified: guide.updatedAt,
    mainEntityOfPage: canonical,
    citation: guide.sources.map((source) => source.url),
    about: { "@type": "AdministrativeArea", name: guide.state },
    publisher: { "@type": "Organization", name: "Bourbon Signal", url: "https://www.bourbonsignal.com" },
  }, {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Release Radar", item: "https://www.bourbonsignal.com/release-radar" },
      { "@type": "ListItem", position: 2, name: "State guides", item: "https://www.bourbonsignal.com/release-radar/states" },
      { "@type": "ListItem", position: 3, name: guide.state, item: canonical },
    ],
  }];

  if (guide.faqs?.length) {
    structuredData.push({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: guide.faqs.map((faq) => ({
        "@type": "Question",
        name: faq.question,
        acceptedAnswer: { "@type": "Answer", text: faq.answer },
      })),
    });
  }

  return (
    <main className="radar-page">
      <JsonLd value={structuredData} />
      <div className="radar-shell">
        <RadarNav active="states" />
        <article className={`radar-detail${hasDeepGuide ? " radar-detail--field-guide" : ""}`}>
          <div className="radar-breadcrumbs">
            <Link href="/release-radar">Release Radar</Link><span>/</span>
            <Link href="/release-radar/states">State guides</Link><span>/</span>
            <span>{guide.state}</span>
          </div>

          <div className="radar-detail__hero">
            <div>
              <p className="radar-detail__eyebrow">{guide.model}</p>
              <h1>{guide.title}</h1>
              <p className="radar-detail__dek">{guide.dek}</p>
              <p className="radar-detail__source-note">Policy and release mechanics, not guaranteed bottle availability · Updated {updatedLabel}</p>
            </div>
            <aside className="radar-fact-panel" aria-label={`${guide.state} quick facts`}>
              {guide.quickFacts.map((fact) => (
                <div className="radar-fact" key={fact.label}><span>{fact.label}</span><strong>{fact.value}</strong></div>
              ))}
            </aside>
          </div>

          {hasDeepGuide && (
            <nav className="radar-local-nav" aria-label={`Explore the ${guide.state} guide`}>
              <a href="#how-it-works">How it works</a>
              <a href="#local-boards">Local boards</a>
              <a href="#evidence">Read the signal</a>
              <a href="#radar-now">Radar now</a>
              <a href="#questions">Common questions</a>
            </nav>
          )}

          <div className="radar-detail__content" id="how-it-works">
            <div className="radar-prose">
              {guide.sections.map((section) => (
                <section key={section.heading}><h2>{section.heading}</h2><p>{section.body}</p></section>
              ))}
            </div>
            <aside className="radar-source-rail">
              <h2>Official references</h2>
              <p className="radar-source-rail__intro">State and local board pages used to verify this guide.</p>
              {guide.sources.map((source) => (
                <a className="radar-source-link" href={source.url} target="_blank" rel="noreferrer" key={source.url}>
                  <span>{source.label}</span><ArrowUpRight size={14} />
                </a>
              ))}
              <p className="radar-updated">Guide updated {updatedLabel}</p>
            </aside>
          </div>

          {guide.boardProfiles?.length ? (
            <section className="radar-board-desk" id="local-boards" aria-labelledby="local-boards-title">
              <header>
                <div><span>Local desk</span><h2 id="local-boards-title">The board changes the hunt</h2></div>
                <p>These are official channels, not interchangeable playbooks. Open the board you actually shop.</p>
              </header>
              <div className="radar-board-grid">
                {guide.boardProfiles.map((board) => (
                  <article key={board.name}>
                    <div className="radar-board-card__place"><MapPin size={13} /><span>{board.area}</span></div>
                    <h3>{board.name}</h3>
                    <div className="radar-board-card__methods">
                      {board.releaseMethods.map((method) => <span key={method}>{method}</span>)}
                    </div>
                    <p>{board.guidance}</p>
                    <a href={board.sourceUrl} target="_blank" rel="noreferrer">Open official board page <ArrowUpRight size={13} /></a>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {(guide.huntingSteps?.length || guide.evidenceLevels?.length) ? (
            <section className="radar-fieldwork" id="evidence">
              {guide.huntingSteps?.length ? (
                <div className="radar-fieldwork__steps">
                  <span>Field routine</span>
                  <h2>A {guide.state} hunt that wastes less gas</h2>
                  <ol>
                    {guide.huntingSteps.map((step) => (
                      <li key={step.title}><b>{step.title}</b><p>{step.body}</p></li>
                    ))}
                  </ol>
                </div>
              ) : null}
              {guide.evidenceLevels?.length ? (
                <div className="radar-evidence-ladder">
                  <span>Evidence ladder</span>
                  <h2>How close is the bottle?</h2>
                  <div>
                    {guide.evidenceLevels.map((level, index) => (
                      <article key={level.label}>
                        <small>{String(index + 1).padStart(2, "0")} · {level.strength}</small>
                        <h3>{level.label}</h3>
                        <p>{level.meaning}</p>
                      </article>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}

          <section className="radar-state-now" id="radar-now" aria-labelledby="radar-now-title">
            <header>
              <div><span>Release Radar</span><h2 id="radar-now-title">On the {guide.abbreviation} radar now</h2></div>
              <Link href={`/release-radar?state=${guide.abbreviation}`}>Open the {guide.abbreviation} calendar <CalendarDays size={14} /></Link>
            </header>
            {stateEntries.length ? (
              <div className="radar-state-now__entries">
                {stateEntries.map((entry) => (
                  <Link href={radarPath(entry)} key={entry.slug}>
                    <small>{entry.dateLabel} · {entry.kind}</small>
                    <strong>{entry.title}</strong>
                    <span>{entry.summary}</span>
                    <ArrowRight size={15} />
                  </Link>
                ))}
              </div>
            ) : (
              <div className="radar-state-now__empty">
                <strong>No exact {guide.abbreviation} release date is published on Radar right now.</strong>
                <p>That is an honest empty state, not a guess. Board lotteries and dated events will appear here when an official source supports the timing. Live board and store evidence remains available in the Drop Feed.</p>
              </div>
            )}
          </section>

          {guide.faqs?.length ? (
            <section className="radar-faq" id="questions" aria-labelledby="questions-title">
              <header><span>Quick answers</span><h2 id="questions-title">{guide.state} bourbon questions, answered plainly</h2></header>
              <div>
                {guide.faqs.map((faq) => (
                  <details key={faq.question}>
                    <summary>{faq.question}</summary>
                    <p>{faq.answer}</p>
                  </details>
                ))}
              </div>
            </section>
          ) : null}

          <div className="radar-cta">
            <div>
              <h2>State mechanics explain the hunt. Current evidence narrows it.</h2>
              <p>See source-backed {guide.state} leads without treating a board shipment like guaranteed shelf stock.</p>
            </div>
            <div className="radar-cta-links">
              <Link href={`/release-radar?state=${guide.abbreviation}`}>View {guide.abbreviation} Radar</Link>
              <Link href={`/?state=${guide.abbreviation}#drops`}>Open live signals <ArrowRight size={14} /></Link>
            </div>
          </div>
        </article>
      </div>
    </main>
  );
}
