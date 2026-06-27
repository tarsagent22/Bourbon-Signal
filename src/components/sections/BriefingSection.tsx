"use client";

import { ArrowUpRight } from "lucide-react";

interface BriefingItem {
  tag: string;
  title: string;
  summary: string;
  noteLabel: string;
  note: string;
  href: string;
  source: string;
}

const briefingItems: BriefingItem[] = [
  {
    tag: "Today · National blend",
    title: "Lost Lantern turns all 50 states into one bourbon story",
    summary: "Lost Lantern's United States of Bourbon line blends straight bourbon from every state, with a limited 1776 Edition built for America's 250th.",
    noteLabel: "Market read",
    note: "Best story of the day: it is not a shelf drop, but it is a clean national-interest release signal with strong collector and geography hooks.",
    href: "https://www.lostlanternwhiskey.com/united-states-of-bourbon/",
    source: "Lost Lantern Whiskey",
  },
  {
    tag: "Yesterday · Release watch",
    title: "Old Fitzgerald joins July's allocation radar",
    summary: "Heaven Hill's Spring 2026 Old Fitzgerald Bottled-in-Bond release puts a 10-year decanter into the summer chase window.",
    noteLabel: "Release read",
    note: "High-intent collector bottle. Keep the copy sober: national release timing matters more than pretending store availability is confirmed.",
    href: "https://heavenhilldistillery.com/old-fitzgerald.php",
    source: "Heaven Hill Distillery",
  },
  {
    tag: "Yesterday · Experimental",
    title: "Four Roses opens a Mizunara-finished lane",
    summary: "Four Roses' new Experimental Series starts with No. 001, a limited Kentucky straight bourbon finished in Japanese Mizunara oak.",
    noteLabel: "Release read",
    note: "Useful for watchlist language and rarity scoring. Treat the launch as release-watch intelligence until store-level sightings appear.",
    href: "https://www.prnewswire.com/news-releases/four-roses-distillery-enters-a-new-era-of-bourbon-innovation-with-launch-of-experimental-series-302807822.html",
    source: "Four Roses Distillery",
  },
  {
    tag: "Yesterday · AL ABC release",
    title: "Alabama's annual limited release is already dated",
    summary: "Alabama ABC lists its 2026 Annual Limited Release Program for December 12 across selected ABC stores.",
    noteLabel: "State read",
    note: "Clean control-state event signal: dates, stores, and sweepstakes mechanics are more useful here than scrape-only shelf checks.",
    href: "https://alabcboard.gov/stores/events/limited-release-programs/annual",
    source: "Alabama ABC",
  },
];

const archivedBriefingItems: BriefingItem[] = [
  {
    tag: "NC · Board policy",
    title: "Durham rewrites its drop cadence",
    summary: "Durham ABC is replacing weekly 100-bottle drops with a summer release process.",
    noteLabel: "Market read",
    note: "Board policy can move faster than shelf inventory. This is a state worth watching at the source, not just at the store level.",
    href: "https://www.durhamabc.com/drops",
    source: "Durham ABC",
  },
  {
    tag: "Release watch",
    title: "Heaven Hill Heritage enters the watch window",
    summary: "The 2026 Heritage Collection release is now official: a 22-year Kentucky straight bourbon at barrel proof.",
    noteLabel: "Release read",
    note: "Collector-grade bottle. Good candidate for release-watch coverage and preference-alert language.",
    href: "https://heavenhilldistillery.com/heavenhill-heritage-collection.php",
    source: "Heaven Hill Distillery",
  },
  {
    tag: "VA · Limited availability",
    title: "Virginia's limited-release system remains predictable",
    summary: "VA ABC continues to route high-demand bottles through structured limited-availability lanes.",
    noteLabel: "State read",
    note: "High confidence, clean source, useful alerts.",
    href: "https://www.abc.virginia.gov/products/limited-availability",
    source: "Virginia ABC",
  },
];

export default function BriefingSection() {
  return (
    <section
      id="briefing"
      aria-labelledby="briefing-title"
      style={{
        background: "var(--color-bg-primary)",
        padding: "clamp(42px, 6vw, 78px) clamp(22px, 5vw, 64px)",
        scrollMarginTop: "88px",
      }}
    >
      <style>{`
        .daily-briefing {
          width: min(1120px, 100%);
          margin: 0 auto;
        }
        .daily-briefing-header {
          position: relative;
          display: grid;
          grid-template-columns: minmax(0, 0.9fr) minmax(260px, 0.62fr);
          gap: clamp(18px, 4vw, 54px);
          align-items: end;
          padding-bottom: clamp(28px, 3.4vw, 42px);
        }
        .daily-briefing-header::after {
          content: "";
          position: absolute;
          left: 0;
          bottom: 0;
          width: min(220px, 52vw);
          height: 1px;
          background: linear-gradient(90deg, rgba(232,201,122,0.9), rgba(196,148,58,0.18), transparent);
          box-shadow: 0 0 16px rgba(196,148,58,0.2);
        }
        .daily-briefing-title {
          font-family: var(--font-playfair);
          font-size: clamp(42px, 6.5vw, 72px);
          line-height: 0.9;
          letter-spacing: -0.05em;
          color: var(--color-text-primary);
        }
        .daily-briefing-subcopy {
          color: rgba(245,237,214,0.62);
          font-family: var(--font-dm-sans);
          font-size: clamp(14px, 1.35vw, 16px);
          line-height: 1.55;
        }
        .daily-briefing-list {
          display: grid;
          grid-template-columns: minmax(0, 1.04fr) minmax(0, 0.96fr) minmax(0, 0.96fr);
          gap: clamp(22px, 3vw, 42px);
          padding-top: clamp(24px, 3.5vw, 42px);
        }
        .daily-briefing-story {
          position: relative;
          color: inherit;
          text-decoration: none;
          min-height: 224px;
          padding: 2px 2px 0;
          transition: transform 180ms ease;
        }
        .daily-briefing-story:hover {
          transform: translateY(-2px);
        }
        .daily-briefing-story:focus-visible {
          outline: 2px solid rgba(232,201,122,0.75);
          outline-offset: 8px;
        }
        .daily-briefing-tag {
          color: rgba(232,201,122,0.82);
          font-family: var(--font-jetbrains);
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }
        .daily-briefing-story-title {
          margin-top: 14px;
          color: var(--color-text-primary);
          font-family: var(--font-playfair);
          font-size: clamp(23px, 2.5vw, 31px);
          line-height: 1.03;
          letter-spacing: -0.03em;
        }
        .daily-briefing-summary {
          margin-top: 13px;
          color: rgba(245,237,214,0.62);
          font-family: var(--font-dm-sans);
          font-size: 13px;
          line-height: 1.55;
        }
        .daily-briefing-impact {
          margin-top: 18px;
          color: rgba(245,237,214,0.8);
          font-family: var(--font-dm-sans);
          font-size: 12px;
          line-height: 1.45;
        }
        .daily-briefing-impact strong {
          display: block;
          margin-bottom: 5px;
          color: rgba(232,201,122,0.78);
          font-family: var(--font-jetbrains);
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 0.11em;
          text-transform: uppercase;
        }
        .daily-briefing-source {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          margin-top: 18px;
          color: rgba(245,237,214,0.48);
          font-family: var(--font-jetbrains);
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .daily-briefing-more {
          padding-top: clamp(24px, 3vw, 34px);
        }
        .daily-briefing-more[open] .daily-briefing-more-button::after {
          content: "Show less";
        }
        .daily-briefing-more[open] .daily-briefing-more-button span {
          display: none;
        }
        .daily-briefing-more-button {
          width: max-content;
          margin: 0 auto;
          border: 1px solid rgba(232,201,122,0.36);
          border-radius: 999px;
          background: linear-gradient(180deg, rgba(83,54,28,0.52), rgba(34,24,16,0.72));
          color: rgba(245,237,214,0.86);
          cursor: pointer;
          font-family: var(--font-jetbrains);
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.13em;
          list-style: none;
          padding: 12px 18px;
          text-align: center;
          text-transform: uppercase;
          transition: border-color 180ms ease, color 180ms ease, transform 180ms ease, background 180ms ease;
        }
        .daily-briefing-more-button::-webkit-details-marker {
          display: none;
        }
        .daily-briefing-more-button:hover {
          border-color: rgba(232,201,122,0.7);
          color: var(--color-text-primary);
          transform: translateY(-1px);
        }
        .daily-briefing-more-button:focus-visible {
          outline: 2px solid rgba(232,201,122,0.75);
          outline-offset: 4px;
        }
        .daily-briefing-more-button:active {
          transform: translateY(0);
        }
        @media (max-width: 900px) {
          .daily-briefing-header { grid-template-columns: 1fr; }
          .daily-briefing-list { grid-template-columns: 1fr; gap: 26px; }
          .daily-briefing-story { min-height: 0; }
        }
      `}</style>

      <div className="daily-briefing">
        <div className="daily-briefing-header">
          <h2 id="briefing-title" className="daily-briefing-title">
            Daily Briefing
          </h2>
          <p className="daily-briefing-subcopy">
            Release notes, upcoming lotteries, allocation changes, and other bourbon news stories — updated daily.
          </p>
        </div>

        <div className="daily-briefing-list">
          {briefingItems.map((item) => (
            <a key={item.title} className="daily-briefing-story" href={item.href} target="_blank" rel="noreferrer">
              <div className="daily-briefing-tag">{item.tag}</div>
              <h3 className="daily-briefing-story-title">{item.title}</h3>
              <p className="daily-briefing-summary">{item.summary}</p>
              <p className="daily-briefing-impact">
                <strong>{item.noteLabel}</strong>
                {item.note}
              </p>
              <span className="daily-briefing-source">
                {item.source}
                <ArrowUpRight size={12} />
              </span>
            </a>
          ))}
        </div>

        <details className="daily-briefing-more">
          <summary className="daily-briefing-more-button">
            <span>See more stories</span>
          </summary>
          <div className="daily-briefing-list" aria-label="Additional daily briefing stories">
            {archivedBriefingItems.map((item) => (
              <a key={item.title} className="daily-briefing-story" href={item.href} target="_blank" rel="noreferrer">
                <div className="daily-briefing-tag">{item.tag}</div>
                <h3 className="daily-briefing-story-title">{item.title}</h3>
                <p className="daily-briefing-summary">{item.summary}</p>
                <p className="daily-briefing-impact">
                  <strong>{item.noteLabel}</strong>
                  {item.note}
                </p>
                <span className="daily-briefing-source">
                  {item.source}
                  <ArrowUpRight size={12} />
                </span>
              </a>
            ))}
          </div>
        </details>
      </div>
    </section>
  );
}
