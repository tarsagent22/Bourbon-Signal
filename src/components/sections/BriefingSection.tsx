"use client";

import { ArrowUpRight, Newspaper } from "lucide-react";

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
        background:
          "radial-gradient(circle at 18% 0%, rgba(196,148,58,0.13), transparent 32%), linear-gradient(180deg, var(--color-bg-warm) 0%, var(--color-bg-primary) 100%)",
        padding: "clamp(34px, 5vw, 68px) clamp(18px, 4vw, 60px)",
        scrollMarginTop: "88px",
      }}
    >
      <style>{`
        .briefing-shell {
          width: min(1120px, 100%);
          margin: 0 auto;
          border: 1px solid rgba(196,148,58,0.18);
          border-radius: 28px;
          background: linear-gradient(145deg, rgba(22,17,12,0.94), rgba(13,11,10,0.96));
          box-shadow: 0 24px 70px rgba(0,0,0,0.38), inset 0 1px 0 rgba(255,255,255,0.04);
          overflow: hidden;
          position: relative;
        }
        .briefing-shell::before {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          background: linear-gradient(90deg, rgba(196,148,58,0.18), transparent 22%, transparent 78%, rgba(196,148,58,0.08));
          opacity: 0.7;
        }
        .briefing-header {
          position: relative;
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 18px;
          align-items: end;
          padding: clamp(22px, 3.4vw, 34px) clamp(20px, 3.6vw, 38px) 0;
        }
        .briefing-eyebrow {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          width: fit-content;
          color: rgba(232,201,122,0.88);
          font-family: var(--font-jetbrains);
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.16em;
          text-transform: uppercase;
        }
        .briefing-title {
          margin-top: 8px;
          font-family: var(--font-playfair);
          font-size: clamp(30px, 4vw, 48px);
          line-height: 0.96;
          letter-spacing: -0.035em;
          color: var(--color-text-primary);
        }
        .briefing-subcopy {
          margin-top: 10px;
          max-width: 58ch;
          color: rgba(245,237,214,0.58);
          font-family: var(--font-dm-sans);
          font-size: 14px;
          line-height: 1.55;
        }
        .briefing-note {
          border: 1px solid rgba(245,237,214,0.09);
          border-radius: 999px;
          padding: 8px 12px;
          color: rgba(245,237,214,0.52);
          font-family: var(--font-jetbrains);
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          white-space: nowrap;
          background: rgba(245,237,214,0.035);
        }
        .briefing-list {
          position: relative;
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 1px;
          margin-top: clamp(20px, 3vw, 30px);
          background: rgba(245,237,214,0.08);
          border-top: 1px solid rgba(245,237,214,0.08);
        }
        .briefing-card {
          display: flex;
          flex-direction: column;
          min-height: 248px;
          padding: clamp(18px, 2.4vw, 26px);
          color: inherit;
          text-decoration: none;
          background: rgba(13,11,10,0.84);
          transition: background 180ms ease, transform 180ms ease;
        }
        .briefing-card:hover {
          background: rgba(30,22,14,0.94);
          transform: translateY(-2px);
        }
        .briefing-card:focus-visible {
          outline: 2px solid rgba(232,201,122,0.8);
          outline-offset: -4px;
        }
        .briefing-tag {
          color: rgba(232,201,122,0.82);
          font-family: var(--font-jetbrains);
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }
        .briefing-card-title {
          margin-top: 13px;
          color: var(--color-text-primary);
          font-family: var(--font-playfair);
          font-size: clamp(21px, 2.3vw, 27px);
          line-height: 1.04;
          letter-spacing: -0.025em;
        }
        .briefing-summary {
          margin-top: 12px;
          color: rgba(245,237,214,0.62);
          font-family: var(--font-dm-sans);
          font-size: 13px;
          line-height: 1.55;
        }
        .briefing-impact {
          margin-top: auto;
          padding-top: 18px;
          color: rgba(245,237,214,0.78);
          font-family: var(--font-dm-sans);
          font-size: 12px;
          line-height: 1.45;
        }
        .briefing-impact strong {
          color: rgba(232,201,122,0.92);
          font-weight: 800;
        }
        .briefing-source {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          margin-top: 14px;
          color: rgba(245,237,214,0.48);
          font-family: var(--font-jetbrains);
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        @media (max-width: 900px) {
          .briefing-header { grid-template-columns: 1fr; }
          .briefing-note { width: fit-content; }
          .briefing-list { grid-template-columns: 1fr; }
          .briefing-card { min-height: 0; }
        }
      `}</style>
      <div className="briefing-shell">
        <div className="briefing-header">
          <div>
            <div className="briefing-eyebrow">
              <Newspaper size={14} />
              <span>The Briefing</span>
            </div>
            <h2 id="briefing-title" className="briefing-title">
              Allocation intel, not bourbon filler.
            </h2>
            <p className="briefing-subcopy">
              A small source-backed feed for release notes, state drop changes, and bourbon signals worth watching.
            </p>
          </div>
          <div className="briefing-note">Updated from public sources</div>
        </div>

        <div className="briefing-list">
          {briefingItems.map((item) => (
            <a key={item.title} className="briefing-card" href={item.href} target="_blank" rel="noreferrer">
              <div className="briefing-tag">{item.tag}</div>
              <h3 className="briefing-card-title">{item.title}</h3>
              <p className="briefing-summary">{item.summary}</p>
              <p className="briefing-impact">
                <strong>Signal impact:</strong> {item.impact}
              </p>
              <span className="briefing-source">
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
