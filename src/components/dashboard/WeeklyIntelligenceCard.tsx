"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { MemberWeeklyIntelligence } from "@/lib/member-weekly-intelligence";
import styles from "./WeeklyIntelligenceCard.module.css";

interface WeeklyPreviewResponse {
  report: MemberWeeklyIntelligence;
  dryRun: {
    status: string;
    liveSendSupported: false;
  };
}

export function WeeklyIntelligenceCard({ isSignedIn }: { isSignedIn: boolean }) {
  const [preview, setPreview] = useState<WeeklyPreviewResponse | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!isSignedIn) return;
    let cancelled = false;
    fetch("/api/member-weekly-intelligence/preview", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Weekly intelligence preview unavailable");
        return await response.json() as WeeklyPreviewResponse;
      })
      .then((data) => {
        if (!cancelled) setPreview(data);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => { cancelled = true; };
  }, [isSignedIn]);

  if (!isSignedIn) return null;
  if (error) {
    return (
      <section className={styles.shell} aria-label="Weekly member intelligence">
        <p className={styles.eyebrow}>Weekly intelligence</p>
        <h2>Preview temporarily unavailable</h2>
        <p className={styles.body}>Your saved signal is intact. This brief can be checked again later.</p>
      </section>
    );
  }
  if (!preview) {
    return (
      <section className={`${styles.shell} ${styles.loading}`} aria-label="Loading weekly member intelligence" aria-busy="true">
        <span className={styles.loadingLine} />
        <span className={styles.loadingTitle} />
        <span className={styles.loadingBody} />
      </section>
    );
  }

  const { report } = preview;
  return (
    <section className={styles.shell} aria-label="Weekly member intelligence">
      <div className={styles.topline}>
        <div>
          <p className={styles.eyebrow}>{report.eyebrow}</p>
          <p className={styles.week}>Week of {report.weekKey}</p>
        </div>
        {!report.isEmpty ? (
          <a className={styles.previewLink} href="/api/member-weekly-intelligence/preview?format=email" target="_blank" rel="noreferrer">
            Email preview
          </a>
        ) : null}
      </div>

      <h2>{report.headline}</h2>
      <p className={styles.body}>{report.isEmpty ? "No new signal this week. Empty briefs stay quiet." : report.introduction}</p>

      {report.sections.map((section) => (
        <div className={styles.section} key={section.kind}>
          <h3>{section.title}</h3>
          <div className={styles.items}>
            {section.items.map((item) => (
              <article className={styles.item} key={item.id}>
                <p className={styles.meta}>{item.meta}</p>
                <h4>{item.title}</h4>
                <p>{item.summary}</p>
              </article>
            ))}
          </div>
        </div>
      ))}

      {report.primaryAction ? (
        <Link className={styles.action} href={report.primaryAction.href}>{report.primaryAction.label}</Link>
      ) : null}
      <p className={styles.dryRun}>Email is preview-only. Live weekly sending is disabled.</p>
    </section>
  );
}
