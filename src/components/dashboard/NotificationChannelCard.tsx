"use client";

import { LiquidToggle } from "@/components/LiquidToggle";
import styles from "./NotificationChannelCard.module.css";

interface NotificationChannelCardProps {
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}

export function NotificationChannelCard({
  title,
  description,
  checked,
  onCheckedChange,
  disabled = false,
}: NotificationChannelCardProps) {
  return (
    <section className={`${styles.card} ${checked ? styles.active : ""} ${disabled ? styles.disabled : ""}`}>
      <div className={styles.glow} aria-hidden="true" />
      <button
        type="button"
        className={styles.copy}
        onClick={() => onCheckedChange(!checked)}
        disabled={disabled}
        aria-pressed={checked}
      >
        <span className={styles.title}>{title}</span>
        <span className={styles.description}>{description}</span>
      </button>
      <div className={styles.toggle}>
        <LiquidToggle checked={checked} onCheckedChange={onCheckedChange} />
      </div>
    </section>
  );
}
