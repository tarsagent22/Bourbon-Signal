"use client";

import { ArrowUpRight } from "lucide-react";
import { useAuth } from "@/lib/auth";

interface BriefingItem {
  title: string;
  summary: string;
  note: string;
  href: string;
  source: string;
}

const briefingItems: BriefingItem[] = [
  {
    title: "Elijah Craig 21 Year returns as a true trophy bottle",
    summary: "Heaven Hill is bringing back Elijah Craig 21-Year-Old Single Barrel as a limited 2026 release, with an initial distillery debut and select-market bottles later in the year.",
    note: "Best of the morning: scarce, official, high-intent, and exactly the kind of bottle hunters will want watched before retail sightings appear.",
    href: "https://heavenhill.com/news-and-notes/elijah-craig-expands-single-barrel-lineup-with-rare-21-year-old-release/",
    source: "Heaven Hill",
  },
  {
    title: "Lost Lantern turns all 50 states into one bourbon story",
    summary: "Lost Lantern's United States of Bourbon line blends straight bourbon from every state, with a limited 1776 Edition built for America's 250th.",
    note: "A clean national-interest release signal with strong collector and geography hooks.",
    href: "https://www.lostlanternwhiskey.com/united-states-of-bourbon/",
    source: "Lost Lantern Whiskey",
  },
  {
    title: "Old Fitzgerald joins July's allocation radar",
    summary: "Heaven Hill's Spring 2026 Old Fitzgerald Bottled-in-Bond release puts a 10-year decanter into the summer chase window.",
    note: "High-intent collector bottle. National release timing matters more than pretending store availability is confirmed.",
    href: "https://heavenhilldistillery.com/old-fitzgerald.php",
    source: "Heaven Hill Distillery",
  },
];

const additionalBriefingItems: BriefingItem[] = [
  {
    title: "Four Roses opens a Mizunara-finished lane",
    summary: "Four Roses' new Experimental Series starts with No. 001, a limited Kentucky straight bourbon finished in Japanese Mizunara oak.",
    note: "Useful for watchlist language and rarity scoring until store-level sightings appear.",
    href: "https://www.prnewswire.com/news-releases/four-roses-distillery-enters-a-new-era-of-bourbon-innovation-with-launch-of-experimental-series-302807822.html",
    source: "Four Roses Distillery",
  },
  {
    title: "Durham rewrites its drop cadence",
    summary: "Durham ABC is replacing weekly 100-bottle drops with a summer release process.",
    note: "Board policy can move faster than shelf inventory. This is a state worth watching at the source, not just at the store level.",
    href: "https://www.durhamabc.com/drops",
    source: "Durham ABC",
  },
  {
    title: "Heaven Hill Heritage enters the watch window",
    summary: "The 2026 Heritage Collection release is now official: a 22-year Kentucky straight bourbon at barrel proof.",
    note: "Collector-grade bottle and a strong candidate for release-watch coverage.",
    href: "https://heavenhilldistillery.com/heavenhill-heritage-collection.php",
    source: "Heaven Hill Distillery",
  },
  {
    title: "Virginia's limited-release system remains predictable",
    summary: "VA ABC continues to route high-demand bottles through structured limited-availability lanes.",
    note: "High-confidence state-source mechanics are useful when members are planning what to watch next.",
    href: "https://www.abc.virginia.gov/products/limited-availability",
    source: "Virginia ABC",
  },
];

function BriefingStory({ item, index }: { item: BriefingItem; index: number }) {
  return (
    <a className="daily-briefing-story" href={item.href} target="_blank" rel="noreferrer">
      <span className="daily-briefing-number">0{index + 1}</span>
      <h3 className="daily-briefing-story-title">{item.title}</h3>
      <p className="daily-briefing-summary">{item.summary}</p>
      <p className="daily-briefing-impact">{item.note}</p>
      <span className="daily-briefing-source">
        {item.source}
        <ArrowUpRight size={12} />
      </span>
    </a>
  );
}

export default function BriefingSection() {
  const { isPaidUser } = useAuth();

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
          position: relative;
        }
        .daily-briefing::before {
          content: "";
          position: absolute;
          inset: -18px -24px auto auto;
          width: 180px;
          height: 180px;
          pointer-events: none;
          border-radius: 999px;
          background: radial-gradient(circle, rgba(212,146,11,0.12), transparent 68%);
          filter: blur(6px);
        }
        .daily-briefing-header {
          position: relative;
          display: grid;
          grid-template-columns: minmax(0, 0.9fr) minmax(260px, 0.62fr);
          gap: clamp(18px, 4vw, 54px);
          align-items: end;
          padding-bottom: clamp(24px, 3vw, 36px);
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
          gap: clamp(18px, 2.5vw, 30px);
          padding-top: clamp(24px, 3.5vw, 42px);
        }
        .daily-briefing-story {
          position: relative;
          isolation: isolate;
          color: inherit;
          text-decoration: none;
          min-height: 244px;
          padding: clamp(20px, 2.4vw, 26px);
          border: 1px solid rgba(245,237,214,0.075);
          border-radius: 24px;
          background:
            linear-gradient(135deg, rgba(245,237,214,0.052), rgba(245,237,214,0.018) 48%, rgba(212,146,11,0.045)),
            radial-gradient(circle at 18% 0%, rgba(212,146,11,0.11), transparent 38%);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.035), 0 18px 60px rgba(0,0,0,0.16);
          overflow: hidden;
          transition: border-color 180ms ease, transform 180ms ease, box-shadow 180ms ease;
        }
        .daily-briefing-story:nth-child(2) {
          background:
            linear-gradient(135deg, rgba(245,237,214,0.044), rgba(245,237,214,0.016) 50%, rgba(184,115,51,0.05)),
            radial-gradient(circle at 86% 8%, rgba(184,115,51,0.11), transparent 40%);
        }
        .daily-briefing-story:nth-child(3) {
          background:
            linear-gradient(135deg, rgba(245,237,214,0.04), rgba(245,237,214,0.015) 54%, rgba(239,192,80,0.04)),
            radial-gradient(circle at 34% 100%, rgba(239,192,80,0.08), transparent 42%);
        }
        .daily-briefing-story:hover {
          border-color: rgba(232,201,122,0.25);
          transform: translateY(-2px);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.05), 0 24px 70px rgba(0,0,0,0.22);
        }
        .daily-briefing-story:focus-visible {
          outline: 2px solid rgba(232,201,122,0.75);
          outline-offset: 8px;
        }
        .daily-briefing-number {
          display: inline-flex;
          color: rgba(245,237,214,0.34);
          font-family: var(--font-jetbrains);
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.16em;
        }
        .daily-briefing-story-title {
          margin-top: 14px;
          color: rgba(232,201,122,0.92);
          font-family: var(--font-playfair);
          font-size: clamp(24px, 2.45vw, 32px);
          line-height: 1.03;
          letter-spacing: -0.035em;
        }
        .daily-briefing-summary {
          margin-top: 13px;
          color: rgba(245,237,214,0.64);
          font-family: var(--font-dm-sans);
          font-size: 13px;
          line-height: 1.58;
        }
        .daily-briefing-impact {
          margin-top: 18px;
          color: rgba(245,237,214,0.8);
          font-family: var(--font-dm-sans);
          font-size: 12px;
          line-height: 1.48;
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
          content: "Show fewer stories";
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
          .daily-briefing-list { grid-template-columns: 1fr; gap: 18px; }
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
          {briefingItems.map((item, index) => (
            <BriefingStory key={item.title} item={item} index={index} />
          ))}
        </div>

        {isPaidUser ? (
          <details className="daily-briefing-more">
            <summary className="daily-briefing-more-button">
              <span>Show 3 more stories</span>
            </summary>
            <div className="daily-briefing-list" aria-label="Additional daily briefing stories">
              {additionalBriefingItems.map((item, index) => (
                <BriefingStory key={item.title} item={item} index={index + briefingItems.length} />
              ))}
            </div>
          </details>
        ) : null}
      </div>
    </section>
  );
}
