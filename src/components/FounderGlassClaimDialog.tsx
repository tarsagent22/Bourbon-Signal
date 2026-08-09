"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import styles from "./FounderGlassClaimDialog.module.css";

type FounderGlassClaimDialogProps = {
  onDismiss: () => void;
};

export default function FounderGlassClaimDialog({ onDismiss }: FounderGlassClaimDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const claimLinkRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    claimLinkRef.current?.focus();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      role="dialog"
      aria-modal="true"
      aria-labelledby="founder-glass-title"
      aria-describedby="founder-glass-description"
      onCancel={(event) => {
        event.preventDefault();
        onDismiss();
      }}
    >
      <button className={styles.closeButton} type="button" aria-label="Close and set up alerts instead" onClick={onDismiss}>
        ×
      </button>
      <p className={styles.eyebrow}>Your Founder benefit</p>
      <div className={styles.glassMark} aria-hidden="true">
        <svg viewBox="0 0 64 64" focusable="false">
          <path d="M20 17c7-7 17-7 24 0" />
          <path d="M25 22c4-4 10-4 14 0" />
          <path className={styles.glassOutline} d="M15 27h34l-4 27H19l-4-27Z" />
          <path className={styles.bourbonFill} d="m18 41 2 10h24l2-10H18Z" />
        </svg>
      </div>
      <h2 id="founder-glass-title">Want to claim your one-of-a-kind Founder&apos;s glass?</h2>
      <p id="founder-glass-description" className={styles.description}>
        Enter your shipping information so we know where to send your numbered Bourbon Signal glass.
      </p>
      <Link ref={claimLinkRef} className={styles.primaryAction} href="/settings#shipping">
        Enter shipping information
      </Link>
      <button className={styles.secondaryAction} type="button" onClick={onDismiss}>
        Set up alerts instead
      </button>
      <p className={styles.note}>United States shipping only. A phone number is required for delivery.</p>
    </dialog>
  );
}
