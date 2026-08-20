"use client";

import Link from "next/link";
import { buildActivationChecklist } from "@/lib/member-activation";
import styles from "./ActivationChecklist.module.css";

export function ActivationChecklist({ remaining, complete }: { remaining: string[]; complete: boolean }) {
  const checklist = buildActivationChecklist(remaining, complete);

  return (
    <section aria-label="Alert setup" className={`${styles.card} ${checklist.complete ? styles.ready : ""}`}>
      <div className={styles.header}>
        <div>
          <p className={styles.kicker}>Alert setup</p>
          <h2>{checklist.complete ? "Your signal is ready." : `${checklist.completedCount} of ${checklist.total} choices saved.`}</h2>
          <p className={styles.summary}>
            {checklist.complete
              ? "Your area, bottle mode, and notification channel are active."
              : "Finish the remaining choices so fresh matches can reach you."}
          </p>
        </div>
        <span className={styles.count}>{checklist.completedCount}/{checklist.total}</span>
      </div>

      <progress
        className={styles.progress}
        aria-label="Alert setup progress"
        max={checklist.total}
        value={checklist.completedCount}
      />

      <ul className={styles.steps}>
        {checklist.items.map((item) => (
          <li key={item.key} className={item.complete ? styles.complete : styles.remaining}>
            <span aria-hidden="true">{item.complete ? "✓" : "○"}</span>
            <span>{item.label}</span>
            <span className={styles.srOnly}>{item.complete ? "Complete" : "Needs attention"}</span>
          </li>
        ))}
      </ul>

      <Link className={styles.action} href={checklist.nextHref}>
        {checklist.complete ? "Review alert setup" : "Finish alert setup"} <span aria-hidden="true">→</span>
      </Link>
    </section>
  );
}
