"use client";

import { ExternalLink } from "lucide-react";

const visibleStories = [
  {
    source: "Lost Lantern Whiskey",
    title: "Lost Lantern turns all 50 states into one bourbon story",
    summary:
      "Lost Lantern's United States of Bourbon line blends straight bourbon from every state, with a limited 1776 Edition built for America's 250th.",
    href: "https://www.lostlanternwhiskey.com/united-states-of-bourbon/",
    tag: "Today · National blend",
  },
  {
    source: "Heaven Hill Distillery",
    title: "Old Fitzgerald joins July's allocation radar",
    summary:
      "Heaven Hill's Spring 2026 Old Fitzgerald Bottled-in-Bond release puts a 10-year decanter into the summer chase window.",
    href: "https://heavenhilldistillery.com/old-fitzgerald.php",
    tag: "Yesterday · Release watch",
  },
  {
    source: "Four Roses Distillery",
    title: "Four Roses opens a Mizunara-finished lane",
    summary:
      "Four Roses' new Experimental Series starts with No. 001, a limited Kentucky straight bourbon finished in Japanese Mizunara oak.",
    href: "https://www.prnewswire.com/news-releases/four-roses-distillery-enters-a-new-era-of-bourbon-innovation-with-launch-of-experimental-series-302807822.html",
    tag: "Yesterday · Experimental",
  },
];

const archivedStories = [
  {
    source: "Durham ABC",
    title: "Durham remains a board-level NC signal, not a guaranteed bottle alert",
    summary:
      "Durham-area NC rows should stay framed as board-level leads until a specific store-level source confirms bottle movement.",
  },
  {
    source: "Virginia ABC",
    title: "Virginia lottery and drop context still belongs behind state-level filtering",
    summary:
      "Virginia coverage is useful for official timing and statewide context, but customer-facing copy should avoid implying store inventory unless the source is store-level.",
  },
  {
    source: "Ohio OHLQ",
    title: "OHLQ stays useful for city/store checks when the bottle is actually worth chasing",
    summary:
      "Ohio store-level data is strongest when paired with the rarity filter and bottle watchlist instead of surfacing common shelf noise.",
  },
];

function StoryCard({ story }: { story: (typeof visibleStories)[number] | (typeof archivedStories)[number] }) {
  const body = (
    <article className="briefing-story-card">
      <div className="briefing-story-meta">
        <span>{story.source}</span>
        {"tag" in story ? <span>{story.tag}</span> : <span>Archived context</span>}
      </div>
      <h3>{story.title}</h3>
      <p>{story.summary}</p>
      {"href" in story ? (
        <span className="briefing-source-link">
          Official source <ExternalLink size={13} />
        </span>
      ) : null}
    </article>
  );

  if ("href" in story) {
    return (
      <a className="briefing-story-link" href={story.href} target="_blank" rel="noreferrer">
        {body}
      </a>
    );
  }

  return body;
}

export default function DailyBriefing() {
  return (
    <section id="briefing" className="daily-briefing-section" aria-labelledby="daily-briefing-title">
      <div className="briefing-shell">
        <div className="briefing-kicker">Daily Briefing</div>
        <div className="briefing-heading-row">
          <div>
            <h2 id="daily-briefing-title">Three signals worth checking before the weekend.</h2>
            <p>
              Compact bourbon intel from official sources and engine context. New stories stay visible; older briefing notes stay tucked behind the archive.
            </p>
          </div>
          <div className="briefing-date">Jun 26</div>
        </div>

        <div className="briefing-story-grid">
          {visibleStories.map((story) => (
            <StoryCard key={story.title} story={story} />
          ))}
        </div>

        <details className="briefing-more">
          <summary>
            <span className="briefing-more-open">See more stories</span>
            <span className="briefing-more-close">Show less</span>
          </summary>
          <div className="briefing-archive-grid">
            {archivedStories.map((story) => (
              <StoryCard key={story.title} story={story} />
            ))}
          </div>
        </details>
      </div>

      <style jsx>{`
        .daily-briefing-section {
          background:
            radial-gradient(circle at 18% 0%, rgba(196, 148, 58, 0.12), transparent 34%),
            linear-gradient(180deg, var(--color-bg-primary) 0%, #100c08 52%, var(--color-bg-primary) 100%);
          padding: clamp(48px, 8vw, 84px) 18px;
        }

        .briefing-shell {
          width: min(1120px, 100%);
          margin: 0 auto;
          border: 1px solid rgba(196, 148, 58, 0.18);
          border-radius: 32px;
          padding: clamp(22px, 4vw, 38px);
          background: linear-gradient(180deg, rgba(24, 18, 12, 0.86), rgba(11, 8, 6, 0.94));
          box-shadow: 0 24px 90px rgba(0, 0, 0, 0.34), inset 0 1px 0 rgba(255, 255, 255, 0.04);
          position: relative;
          overflow: hidden;
        }

        .briefing-shell::before {
          content: "";
          position: absolute;
          inset: 0;
          background-image: repeating-linear-gradient(90deg, rgba(196, 148, 58, 0.035) 0 1px, transparent 1px 56px);
          pointer-events: none;
        }

        .briefing-kicker,
        .briefing-date,
        .briefing-story-meta,
        .briefing-source-link,
        .briefing-more summary {
          font-family: var(--font-jetbrains);
          text-transform: uppercase;
          letter-spacing: 0.12em;
        }

        .briefing-kicker {
          color: var(--color-accent-amber);
          font-size: 11px;
          margin-bottom: 12px;
          position: relative;
        }

        .briefing-heading-row {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 20px;
          align-items: start;
          margin-bottom: 24px;
          position: relative;
        }

        .briefing-heading-row h2 {
          margin: 0;
          color: var(--color-cream);
          font-family: var(--font-playfair);
          font-size: clamp(34px, 6vw, 58px);
          line-height: 0.98;
          max-width: 780px;
        }

        .briefing-heading-row p {
          margin: 14px 0 0;
          color: var(--color-text-secondary);
          font-family: var(--font-dm-sans);
          line-height: 1.7;
          max-width: 700px;
        }

        .briefing-date {
          color: #0d0b07;
          background: linear-gradient(135deg, #c4943a, #e8c97a);
          border-radius: 999px;
          padding: 10px 13px;
          font-size: 10px;
          font-weight: 800;
          white-space: nowrap;
        }

        .briefing-story-grid,
        .briefing-archive-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 14px;
          position: relative;
        }

        .briefing-story-link {
          color: inherit;
          text-decoration: none;
        }

        .briefing-story-card {
          height: 100%;
          min-height: 236px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 22px;
          padding: 18px;
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.045), rgba(255, 255, 255, 0.018));
          display: flex;
          flex-direction: column;
          gap: 12px;
          transition: transform 180ms ease, border-color 180ms ease, background 180ms ease;
        }

        .briefing-story-link:hover .briefing-story-card,
        .briefing-story-link:focus-visible .briefing-story-card {
          transform: translateY(-3px);
          border-color: rgba(196, 148, 58, 0.34);
          background: linear-gradient(180deg, rgba(196, 148, 58, 0.10), rgba(255, 255, 255, 0.026));
        }

        .briefing-story-meta {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          color: var(--color-accent-amber);
          font-size: 9px;
        }

        .briefing-story-card h3 {
          margin: 0;
          color: var(--color-cream);
          font-family: var(--font-playfair);
          font-size: 24px;
          line-height: 1.05;
        }

        .briefing-story-card p {
          margin: 0;
          color: var(--color-text-secondary);
          font-family: var(--font-dm-sans);
          font-size: 14px;
          line-height: 1.65;
        }

        .briefing-source-link {
          margin-top: auto;
          color: var(--color-accent-amber);
          font-size: 10px;
          display: inline-flex;
          align-items: center;
          gap: 7px;
        }

        .briefing-more {
          margin-top: 18px;
          position: relative;
        }

        .briefing-more summary {
          width: fit-content;
          list-style: none;
          cursor: pointer;
          border: 1px solid rgba(196, 148, 58, 0.22);
          border-radius: 999px;
          padding: 11px 14px;
          color: var(--color-accent-amber);
          background: rgba(196, 148, 58, 0.07);
          font-size: 10px;
          font-weight: 800;
        }

        .briefing-more summary::-webkit-details-marker {
          display: none;
        }

        .briefing-more-close {
          display: none;
        }

        .briefing-more[open] .briefing-more-open {
          display: none;
        }

        .briefing-more[open] .briefing-more-close {
          display: inline;
        }

        .briefing-archive-grid {
          margin-top: 16px;
        }

        @media (max-width: 860px) {
          .briefing-story-grid,
          .briefing-archive-grid {
            grid-template-columns: 1fr;
          }

          .briefing-heading-row {
            grid-template-columns: 1fr;
          }

          .briefing-date {
            width: fit-content;
          }
        }
      `}</style>
    </section>
  );
}
