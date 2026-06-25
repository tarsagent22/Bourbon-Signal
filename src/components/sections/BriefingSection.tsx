"use client";

import { ArrowUpRight } from "lucide-react";

interface BriefingItem {
  tag: string;
  title: string;
  summary: string;
  impact: string;
  href: string;
  source: string;
}

const briefingItems: BriefingItem[] = [
  {
    tag: "NC · Board policy",
    title: "Durham ABC is changing allocated-drop flow",
    summary: "Weekly 100-bottle drops are being replaced with a new summer release process.",
    impact: "Board-policy monitoring matters as much as shelf inventory.",
    href: "https://www.durhamabc.com/drops",
    source: "Durham ABC",
  },
  {
    tag: "Release watch",
    title: "Late-June bourbon releases worth tracking",
    summary: "Breaking Bourbon's release calendar continues to surface near-term limited whiskey launches.",
    impact: "Good candidates for watchlist defaults and release-watch copy.",
    href: "https://www.breakingbourbon.com/release-calendar",
    source: "Breaking Bourbon",
  },
  {
    tag: "VA · Limited availability",
    title: "Virginia keeps high-demand bottles in structured release lanes",
    summary: "VA ABC's limited-availability program remains a clean source for lottery and online-order signals.",
    impact: "Keep VA positioned as a high-confidence structured-data state.",
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
          display: grid;
          grid-template-columns: minmax(0, 0.9fr) minmax(260px, 0.62fr);
          gap: clamp(18px, 4vw, 54px);
          align-items: end;
          padding-bottom: clamp(22px, 3vw, 34px);
          border-bottom: 1px solid rgba(245,237,214,0.1);
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
          min-height: 236px;
          padding-top: 18px;
          border-top: 1px solid rgba(196,148,58,0.24);
          transition: border-color 180ms ease, transform 180ms ease;
        }
        .daily-briefing-story::before {
          content: "";
          position: absolute;
          top: -1px;
          left: 0;
          width: 42px;
          height: 1px;
          background: rgba(232,201,122,0.9);
          box-shadow: 0 0 18px rgba(196,148,58,0.26);
          transition: width 180ms ease;
        }
        .daily-briefing-story:hover {
          border-color: rgba(232,201,122,0.46);
          transform: translateY(-2px);
        }
        .daily-briefing-story:hover::before { width: 72px; }
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
          color: rgba(232,201,122,0.92);
          font-weight: 800;
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
                <strong>Signal impact:</strong> {item.impact}
              </p>
              <span className="daily-briefing-source">
                {item.source}
                <ArrowUpRight size={12} />
              </span>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
