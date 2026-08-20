"use client";

import Link from "next/link";
import { buildAlertEmptyState } from "@/lib/member-activation";
import styles from "./AlertEmptyState.module.css";

export function AlertEmptyState({
  tab,
  activationComplete,
  loadFailed,
}: {
  tab: "unread" | "all" | "archived";
  activationComplete: boolean | null;
  loadFailed: boolean;
}) {
  const state = buildAlertEmptyState({ tab, activationComplete, loadFailed });
  const kicker = loadFailed
    ? "Inbox unavailable"
    : activationComplete === null
      ? "Status unavailable"
      : activationComplete
        ? "Signal standing by"
        : "Setup needed";

  return (
    <section className={styles.empty} aria-live="polite">
      <p className={styles.kicker}>{kicker}</p>
      <h2>{state.title}</h2>
      <p className={styles.body}>{state.body}</p>
      {loadFailed ? (
        <a className={styles.action} href={state.actionHref}>
          {state.actionLabel} <span aria-hidden="true">→</span>
        </a>
      ) : (
        <Link className={styles.action} href={state.actionHref}>
          {state.actionLabel} <span aria-hidden="true">→</span>
        </Link>
      )}
    </section>
  );
}
