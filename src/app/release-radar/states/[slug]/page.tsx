import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { notFound } from "next/navigation";
import { JsonLd, RadarNav } from "@/components/release-radar/RadarPrimitives";
import { getStateGuide, stateGuides } from "@/lib/release-radar";

export function generateStaticParams() { return stateGuides.map((guide) => ({ slug: guide.slug })); }

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
  };
}

export default async function StateGuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const guide = getStateGuide(slug);
  if (!guide) notFound();
  const canonical = `https://www.bourbonsignal.com/release-radar/states/${guide.slug}`;
  return (
    <main className="radar-page">
      <JsonLd value={[{
        "@context": "https://schema.org", "@type": "Article", headline: guide.title, description: guide.dek,
        dateModified: guide.updatedAt, mainEntityOfPage: canonical, citation: guide.sources.map((source) => source.url),
        about: { "@type": "AdministrativeArea", name: guide.state },
        publisher: { "@type": "Organization", name: "Bourbon Signal", url: "https://www.bourbonsignal.com" },
      }, {
        "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
          { "@type": "ListItem", position: 1, name: "Release Radar", item: "https://www.bourbonsignal.com/release-radar" },
          { "@type": "ListItem", position: 2, name: "State guides", item: "https://www.bourbonsignal.com/release-radar/states" },
          { "@type": "ListItem", position: 3, name: guide.state, item: canonical },
        ],
      }]} />
      <div className="radar-shell">
        <RadarNav active="states" />
        <article className="radar-detail">
          <div className="radar-breadcrumbs"><Link href="/release-radar">Release Radar</Link><span>/</span><Link href="/release-radar/states">State guides</Link><span>/</span><span>{guide.state}</span></div>
          <div className="radar-detail__hero">
            <div>
              <p className="radar-detail__eyebrow">{guide.model}</p>
              <h1>{guide.title}</h1>
              <p className="radar-detail__dek">{guide.dek}</p>
              <p className="radar-detail__source-note">Policy and release mechanics, not guaranteed bottle availability · Updated {guide.updatedAt}</p>
            </div>
            <aside className="radar-fact-panel" aria-label={`${guide.state} quick facts`}>
              {guide.quickFacts.map((fact) => <div className="radar-fact" key={fact.label}><span>{fact.label}</span><strong>{fact.value}</strong></div>)}
            </aside>
          </div>
          <div className="radar-detail__content">
            <div className="radar-prose">{guide.sections.map((section) => <section key={section.heading}><h2>{section.heading}</h2><p>{section.body}</p></section>)}</div>
            <aside className="radar-source-rail">
              <h2>Official references</h2>
              {guide.sources.map((source) => <a className="radar-source-link" href={source.url} target="_blank" rel="noreferrer" key={source.url}><span>{source.label}</span><ArrowUpRight size={14} /></a>)}
              <p className="radar-updated">Guide updated {guide.updatedAt}</p>
            </aside>
          </div>
          <div className="radar-cta"><div><h2>State mechanics explain the hunt. Live evidence narrows it.</h2><p>Open Bourbon Signal to see current source-backed leads for covered markets.</p></div><Link href="/#drops">Open live signals <ArrowRight size={14} style={{ display: "inline", marginLeft: 6 }} /></Link></div>
        </article>
      </div>
    </main>
  );
}
