"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import styles from "./ReleaseRadarSection.module.css";

const c = (...names: string[]) => names.map((name) => styles[name]).join(" ");

export default function ReleaseRadarSection() {
  return (
    <section id="briefing" className={c("release-radar-promo-section")} aria-labelledby="release-radar-promo-title">
      <div className={c("release-radar-promo")}>
        <div className={c("release-radar-promo-copy")}>
          <span className={c("release-radar-promo-kicker")}>
            <i aria-hidden="true" /> Bourbon release intelligence
          </span>
          <h2 id="release-radar-promo-title">
            Know what&apos;s coming <em>before it lands.</em>
          </h2>
          <p className={c("release-radar-promo-intro")}>
            Release dates, lottery windows, distillery events, and state guides organized in one place and tied to official sources.
          </p>
          <div className={c("release-radar-promo-ledger")} aria-label="Release Radar coverage">
            <span>Release calendar</span>
            <span>Official-source briefings</span>
            <span>State guides</span>
          </div>
          <Link className={c("release-radar-promo-button")} href="/release-radar">
            Explore Release Radar <ArrowUpRight size={17} strokeWidth={1.8} />
          </Link>
          <small>Updated as credible release information becomes available.</small>
        </div>

        <div className={c("release-radar-promo-visual")} aria-hidden="true">
          <div className={c("release-radar-promo-status")}><span>Live</span><b>Release Radar</b></div>
          <div className={c("release-radar-promo-instrument")}>
            <span className={c("release-radar-promo-ring", "release-radar-promo-ring--outer")} />
            <span className={c("release-radar-promo-ring", "release-radar-promo-ring--inner")} />
            <span className={c("release-radar-promo-axis", "release-radar-promo-axis--horizontal")} />
            <span className={c("release-radar-promo-axis", "release-radar-promo-axis--vertical")} />
            <span className={c("release-radar-promo-sweep")} />
            <span className={c("release-radar-promo-blip", "release-radar-promo-blip--one")} />
            <span className={c("release-radar-promo-blip", "release-radar-promo-blip--two")} />
            <i />
          </div>
          <div className={c("release-radar-promo-index")}><span>Calendar</span><span>Briefings</span><span>States</span></div>
        </div>
      </div>
    </section>
  );
}
