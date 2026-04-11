"use client";

import { motion } from "framer-motion";
import { staggerContainer, fadeUpVariant } from "@/lib/animations";

interface AlertNotification {
  emoji: string;
  bottleName: string;
  storeName: string;
  bottles: number;
  timeAgo: string;
  tier: "unicorn" | "allocated" | "limited";
}

const alerts: AlertNotification[] = [
  {
    emoji: "🦄",
    bottleName: "Pappy Van Winkle 15yr",
    storeName: "ABC Store #112, Charlotte",
    bottles: 2,
    timeAgo: "4 min ago",
    tier: "unicorn",
  },
  {
    emoji: "🥃",
    bottleName: "Blanton's Original",
    storeName: "ABC Store #247, Raleigh",
    bottles: 6,
    timeAgo: "12 min ago",
    tier: "allocated",
  },
  {
    emoji: "📦",
    bottleName: "Weller Special Reserve",
    storeName: "ABC Store #391, Durham",
    bottles: 12,
    timeAgo: "31 min ago",
    tier: "limited",
  },
];

const tierStyles: Record<AlertNotification["tier"], { dot: string; label: string; labelColor: string }> = {
  unicorn: {
    dot: "var(--color-accent-gold)",
    label: "UNICORN",
    labelColor: "var(--color-accent-gold)",
  },
  allocated: {
    dot: "var(--color-accent-amber)",
    label: "ALLOCATED",
    labelColor: "var(--color-accent-amber)",
  },
  limited: {
    dot: "var(--color-accent-copper)",
    label: "LIMITED",
    labelColor: "var(--color-accent-copper)",
  },
};

function NotificationCard({ alert, index }: { alert: AlertNotification; index: number }) {
  const tier = tierStyles[alert.tier];

  return (
    <motion.div
      variants={fadeUpVariant}
      style={{
        background: "var(--color-card-bg)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(16px)",
        border: "1px solid var(--color-card-border)",
        borderLeft: `3px solid ${tier.dot}`,
        borderRadius: "12px",
        padding: "14px 16px",
        display: "flex",
        alignItems: "center",
        gap: "12px",
        position: "relative",
        boxShadow: "0 4px 24px rgba(0, 0, 0, 0.3)",
      }}
    >
      {/* App icon area */}
      <div
        style={{
          width: "36px",
          height: "36px",
          borderRadius: "8px",
          background: "rgba(196, 148, 58, 0.12)",
          border: "1px solid rgba(196, 148, 58, 0.2)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          fontSize: "18px",
        }}
      >
        {alert.emoji}
      </div>

      {/* Text content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            marginBottom: "3px",
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-dm-sans)",
              fontSize: "11px",
              fontWeight: 700,
              color: tier.labelColor,
              letterSpacing: "0.08em",
            }}
          >
            {tier.label}
          </span>
          <span
            style={{
              fontFamily: "var(--font-dm-sans)",
              fontSize: "11px",
              color: "var(--color-text-tertiary)",
            }}
          >
            CaskSignal
          </span>
        </div>

        <p
          style={{
            fontFamily: "var(--font-dm-sans)",
            fontSize: "13px",
            fontWeight: 500,
            color: "var(--color-text-primary)",
            lineHeight: 1.4,
            margin: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
          } as React.CSSProperties}
        >
          <strong style={{ fontFamily: "var(--font-jetbrains)", fontSize: "12px" }}>
            {alert.bottleName}
          </strong>{" "}
          just hit {alert.storeName}
        </p>

        <p
          style={{
            fontFamily: "var(--font-dm-sans)",
            fontSize: "12px",
            color: "var(--color-text-tertiary)",
            margin: "2px 0 0",
          }}
        >
          {alert.bottles} bottle{alert.bottles !== 1 ? "s" : ""} · {alert.timeAgo}
        </p>
      </div>

      {/* Live pulse dot */}
      <div
        style={{
          width: "7px",
          height: "7px",
          borderRadius: "50%",
          background: tier.dot,
          flexShrink: 0,
          boxShadow: `0 0 6px ${tier.dot}`,
          animation: "pulseDot 2s ease-in-out infinite",
        }}
      />
    </motion.div>
  );
}

export default function AlertPreview() {
  return (
    <section
      style={{
        backgroundColor: "var(--color-bg-primary)",
        paddingTop: "0px",
        paddingBottom: "56px",
        width: "100%",
      }}
    >
      <div
        style={{
          maxWidth: "480px",
          margin: "0 auto",
          padding: "0 clamp(20px, 5vw, 40px)",
        }}
      >
        {/* Subtle label */}
        <p
          style={{
            fontFamily: "var(--font-dm-sans)",
            fontSize: "11px",
            color: "var(--color-text-tertiary)",
            textAlign: "center",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            marginBottom: "16px",
          }}
        >
          What your alerts look like
        </p>

        {/* Notification stack */}
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-40px" }}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "8px",
          }}
        >
          {alerts.map((alert, i) => (
            <NotificationCard key={i} alert={alert} index={i} />
          ))}
        </motion.div>
      </div>
    </section>
  );
}
